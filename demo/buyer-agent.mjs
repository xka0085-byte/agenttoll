#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../verifier/package.json', import.meta.url));
const { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } = require('@solana/web3.js');
const { createTransferCheckedInstruction, getAssociatedTokenAddress } = require('@solana/spl-token');

const REPORT_ID = 'x402-demo-001';
const CONFIG_PATH = new URL('./config.json', import.meta.url);
const DEFAULT_BUYER_PATH = new URL('./buyer-keypair.json', import.meta.url);
const REPORT_OUTPUT_PATH = new URL('./buyer-report.json', import.meta.url);
const VERIFIER_PATH = fileURLToPath(new URL('../verifier/verify.mjs', import.meta.url));

function requireEnv(name) {
  if (!process.env[name]) throw new Error(`${name} is required`);
  return process.env[name];
}

async function keypairFromPath(path) {
  const values = JSON.parse(await readFile(path, 'utf8'));
  return Keypair.fromSecretKey(Uint8Array.from(values));
}

function runVerifier(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [VERIFIER_PATH, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      try {
        resolve({ code, output: JSON.parse(stdout), stderr });
      } catch (error) {
        reject(new Error(`verifier returned invalid JSON: ${error.message}; ${stderr}`));
      }
    });
  });
}

async function main() {
  const rpcUrl = requireEnv('AGENTTOLL_RPC_URL');
  const buyerPath = process.env.AGENTTOLL_BUYER_KEYPAIR ?? DEFAULT_BUYER_PATH;
  const buyer = await keypairFromPath(buyerPath);
  const config = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
  if (config.buyer !== buyer.publicKey.toBase58()) throw new Error('config buyer does not match AGENTTOLL_BUYER_KEYPAIR');
  const port = Number(process.env.PORT ?? '8787');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535');
  const endpoint = `http://127.0.0.1:${port}/report/${REPORT_ID}`;

  const challengeResponse = await fetch(endpoint);
  if (challengeResponse.status !== 402) throw new Error(`expected HTTP 402 challenge, received ${challengeResponse.status}`);
  const header = challengeResponse.headers.get('x-payment-required');
  if (!header) throw new Error('X-Payment-Required header is missing');
  const challenge = JSON.parse(header);
  if (challenge.report_id !== REPORT_ID) throw new Error('challenge report_id does not match request');
  if (challenge.decimals !== 6) throw new Error('challenge decimals must be 6');
  if (!/^\d+$/.test(challenge.amount) || BigInt(challenge.amount) <= 0n) throw new Error('challenge amount must be positive base units');
  if (challenge.vendor !== config.vendor || challenge.mint !== config.mint) throw new Error('challenge does not match local demo config');

  const connection = new Connection(rpcUrl, 'confirmed');
  const mint = new PublicKey(challenge.mint);
  const vendor = new PublicKey(challenge.vendor);
  const buyerAta = await getAssociatedTokenAddress(mint, buyer.publicKey);
  const vendorAta = await getAssociatedTokenAddress(mint, vendor);
  const transfer = createTransferCheckedInstruction(
    buyerAta,
    mint,
    vendorAta,
    buyer.publicKey,
    BigInt(challenge.amount),
    challenge.decimals,
  );
  const paymentSig = await sendAndConfirmTransaction(connection, new Transaction().add(transfer), [buyer]);
  const deliveryResponse = await fetch(endpoint, {
    method: 'POST',
    headers: { 'X-Payment-Signature': paymentSig },
  });
  const delivery = await deliveryResponse.json();
  if (!deliveryResponse.ok) throw new Error(`vendor rejected delivery (${deliveryResponse.status}): ${delivery.reason ?? delivery.error ?? 'unknown reason'}`);
  if (typeof delivery.report !== 'string' || !delivery.receipt) throw new Error('vendor response is missing report or receipt');
  await writeFile(REPORT_OUTPUT_PATH, delivery.report, 'utf8');

  const verifier = await runVerifier([
    '--url', rpcUrl,
    '--vendor', challenge.vendor,
    '--report-id', REPORT_ID,
    '--file', fileURLToPath(REPORT_OUTPUT_PATH),
  ]);
  const result = {
    payment_sig: paymentSig,
    receipt_tx: delivery.receipt.tx,
    pda: delivery.receipt.pda,
    verifier_verdict: verifier.output.verdict,
    checks: verifier.output.checks,
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = verifier.code === 0 && verifier.output.verdict === 'PASS' ? 0 : 1;
}

main().catch((error) => { console.error(`ERROR: ${error.message}`); process.exitCode = 2; });
