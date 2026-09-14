#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../verifier/package.json', import.meta.url));
const {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} = require('@solana/web3.js');
const { getAssociatedTokenAddress } = require('@solana/spl-token');

const PROGRAM_ID = new PublicKey('8ACN1KNEFXM2N2FMzxTfAzB1c3g5n47ZuhbPoUXPnCTp');
const REPORT_ID = 'x402-demo-001';
const AMOUNT = '10000';
const DECIMALS = 6;
const CONFIG_PATH = new URL('./config.json', import.meta.url);
const REPORT_PATH = new URL('./report-402.json', import.meta.url);
const processedPayments = new Set();

function requireEnv(name) {
  if (!process.env[name]) throw new Error(`${name} is required`);
  return process.env[name];
}

async function keypairFromPath(path) {
  const values = JSON.parse(await readFile(path, 'utf8'));
  return Keypair.fromSecretKey(Uint8Array.from(values));
}

function jsonResponse(response, status, body, headers = {}) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers });
  response.end(`${JSON.stringify(body)}\n`);
}

function paymentChallenge(config, reason = 'payment required') {
  return {
    challenge: {
      vendor: config.vendor,
      amount: AMOUNT,
      mint: config.mint,
      report_id: REPORT_ID,
      decimals: DECIMALS,
    },
    reason,
  };
}

function allParsedInstructions(transaction) {
  const topLevel = transaction.transaction.message.instructions;
  const inner = (transaction.meta?.innerInstructions ?? []).flatMap((entry) => entry.instructions);
  return [...topLevel, ...inner].filter((instruction) => instruction && 'parsed' in instruction);
}

async function verifyPayment(connection, signature, config, vendorAta) {
  let transaction;
  try {
    transaction = await connection.getParsedTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });
  } catch (error) {
    throw new Error(`payment transaction lookup failed: ${error.message}`);
  }
  if (!transaction) throw new Error('payment transaction not found or not confirmed');
  if (transaction.meta?.err) throw new Error(`payment transaction failed: ${JSON.stringify(transaction.meta.err)}`);
  const transfer = allParsedInstructions(transaction).find((instruction) => {
    const parsed = instruction.parsed;
    const info = parsed?.info;
    return instruction.program === 'spl-token'
      && parsed?.type === 'transferChecked'
      && info?.destination === vendorAta.toBase58()
      && info?.mint === config.mint
      && info?.tokenAmount?.amount === AMOUNT;
  });
  if (!transfer) throw new Error('payment must contain a successful SPL transferChecked to the vendor ATA with the exact amount and mint');
}

function encodeString(value) {
  const bytes = Buffer.from(value, 'utf8');
  const length = Buffer.alloc(4);
  length.writeUInt32LE(bytes.length);
  return Buffer.concat([length, bytes]);
}

async function createReceipt(connection, vendor, reportBytes) {
  const reportIdBytes = Buffer.from(REPORT_ID, 'utf8');
  const digest = createHash('sha256').update(reportBytes).digest();
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('receipt'), vendor.publicKey.toBuffer(), reportIdBytes],
    PROGRAM_ID,
  );
  const discriminator = createHash('sha256').update('global:create_receipt').digest().subarray(0, 8);
  const instruction = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: vendor.publicKey, isSigner: true, isWritable: true },
      { pubkey: pda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([discriminator, encodeString(REPORT_ID), digest]),
  });
  const tx = await sendAndConfirmTransaction(connection, new Transaction().add(instruction), [vendor]);
  return { tx, pda: pda.toBase58(), digest: digest.toString('hex') };
}

async function main() {
  const rpcUrl = requireEnv('AGENTTOLL_RPC_URL');
  const vendor = await keypairFromPath(requireEnv('AGENTTOLL_KEYPAIR'));
  const config = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
  if (config.vendor !== vendor.publicKey.toBase58()) throw new Error('config vendor does not match AGENTTOLL_KEYPAIR');
  const mint = new PublicKey(config.mint);
  const vendorAta = await getAssociatedTokenAddress(mint, vendor.publicKey);
  const connection = new Connection(rpcUrl, 'confirmed');
  const port = Number(process.env.PORT ?? '8787');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535');
  const challenge = paymentChallenge(config);

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (url.pathname !== `/report/${REPORT_ID}`) {
      jsonResponse(response, 404, { error: 'not found' });
      return;
    }
    if (request.method === 'GET') {
      jsonResponse(response, 402, challenge, { 'X-Payment-Required': JSON.stringify(challenge.challenge) });
      return;
    }
    if (request.method !== 'POST') {
      jsonResponse(response, 405, { error: 'method not allowed' }, { allow: 'GET, POST' });
      return;
    }
    const signature = request.headers['x-payment-signature'];
    if (typeof signature !== 'string' || !signature) {
      jsonResponse(response, 402, paymentChallenge(config, 'missing X-Payment-Signature'), { 'X-Payment-Required': JSON.stringify(challenge.challenge) });
      return;
    }
    try {
      await verifyPayment(connection, signature, config, vendorAta);
    } catch (error) {
      jsonResponse(response, 402, paymentChallenge(config, error.message), { 'X-Payment-Required': JSON.stringify(challenge.challenge) });
      return;
    }
    let reportBytes;
    try {
      reportBytes = await readFile(REPORT_PATH);
    } catch (error) {
      jsonResponse(response, 500, { error: `report unavailable: ${error.message}` });
      return;
    }
    try {
      const idempotent = processedPayments.has(signature);
      const receipt = await createReceipt(connection, vendor, reportBytes);
      processedPayments.add(signature);
      jsonResponse(response, 200, {
        report: reportBytes.toString('utf8'),
        receipt: { ...receipt, payment_sig: signature, idempotent },
      });
    } catch (error) {
      jsonResponse(response, 500, { error: `receipt creation failed: ${error.message}` });
    }
  });

  server.listen(port, '127.0.0.1', () => {
    console.error(`AgentToll vendor listening on http://127.0.0.1:${port}`);
  });
}

main().catch((error) => { console.error(`ERROR: ${error.message}`); process.exitCode = 2; });
