#!/usr/bin/env node
// E2E: buyer agent pays AgentToll Receipts Service (live URL) and mints the first receipt.
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../verifier/package.json', import.meta.url));
const {
  Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction,
} = require('@solana/web3.js');
const {
  getAssociatedTokenAddress, getAccount, createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction, TOKEN_PROGRAM_ID,
} = require('@solana/spl-token');

const SERVICE_URL = 'https://agenttoll-receipts.app.workbuddy.host';
const MINT = new PublicKey('3N32t78oS3p3sP7qkYydUmg7Fmy2UBAx2bLNqzQh1PKi');
const AMOUNT = 1000n; // 0.001 USDC
const PAYMENT_REF = 'e2e-first-receipt-' + Date.now();
const DELIVERABLE = 'AgentToll first live receipt — e2e verification payload 2026-09-17';
const { createHash } = await import('node:crypto');
const digest = createHash('sha256').update(DELIVERABLE).digest('hex');

const buyer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(await readFile(new URL('../demo/buyer-keypair.json', import.meta.url), 'utf8'))));
const service = new PublicKey('81kFpYpyGmsaWt5zLENmeCz1LTrL6VJdxdQjwKc6bd2v');
const conn = new Connection('https://api.devnet.solana.com', 'confirmed');

// 1. hit the live endpoint for a challenge (also proves the flow)
const challengeRes = await fetch(`${SERVICE_URL}/v1/receipt`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ x402_payment_ref: PAYMENT_REF, deliverable_digest: digest }),
});
const challenge = await challengeRes.json();
console.log('402 challenge received:', challengeRes.status, '| amount:', challenge.challenge?.amount, '| mint ok:', challenge.challenge?.mint === MINT.toBase58());
if (challengeRes.status !== 402) throw new Error('expected 402 challenge');

// 2. build payment tx: create service ATA if missing + transferChecked 1000 units
const buyerAta = await getAssociatedTokenAddress(MINT, buyer.publicKey);
const serviceAta = await getAssociatedTokenAddress(MINT, service);
const buyerAccount = await getAccount(conn, buyerAta);
if (buyerAccount.amount < AMOUNT) throw new Error(`buyer USDC too low: ${buyerAccount.amount}`);

const tx = new Transaction();
let serviceAtaExists = true;
try { await getAccount(conn, serviceAta); } catch { serviceAtaExists = false; }
if (!serviceAtaExists) {
  console.log('creating service ATA (buyer pays rent)...');
  tx.add(createAssociatedTokenAccountInstruction(buyer.publicKey, serviceAta, service, MINT));
}
tx.add(createTransferCheckedInstruction(
  buyerAta, MINT, serviceAta, buyer.publicKey, AMOUNT, 6,
));
const paymentSig = await sendAndConfirmTransaction(conn, tx, [buyer]);
console.log('payment tx:', `https://explorer.solana.com/tx/${paymentSig}?cluster=devnet`);

// 3. retry with payment signature → service verifies + anchors receipt
const receiptRes = await fetch(`${SERVICE_URL}/v1/receipt`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'X-Payment-Signature': paymentSig },
  body: JSON.stringify({
    x402_payment_ref: PAYMENT_REF,
    deliverable_digest: digest,
    buyer: buyer.publicKey.toBase58(),
    seller: service.toBase58(),
  }),
});
const receipt = await receiptRes.json();
console.log('receipt response:', receiptRes.status);
console.log(JSON.stringify(receipt, null, 2));
if (receiptRes.status !== 202) throw new Error('expected 202 pending receipt');
if (receipt.outcome !== 'pending') throw new Error('unexpected receipt outcome');

// 4. poll until the anchor settles on-chain (async anchoring protocol)
let settled = null;
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 4000));
  const back = await (await fetch(`${SERVICE_URL}/v1/receipt/${receipt.receipt_id}`)).json();
  console.log(`poll ${i + 1}: ${back.outcome}`);
  if (back.outcome === 'settled') { settled = back; break; }
  if (back.outcome === 'failed') throw new Error(`anchor failed: ${back.error}`);
}
if (!settled) throw new Error('receipt did not settle within 240s');
console.log('read-back ok:', settled.receipt_id === receipt.receipt_id, '| pda:', settled.pda);
console.log('\n=== FIRST LIVE RECEIPT ===');
console.log('payment tx:', `https://explorer.solana.com/tx/${settled.payment_signature}?cluster=devnet`);
console.log('anchor tx:', `https://explorer.solana.com/tx/${settled.receipt_uri.replace('solana:', '')}?cluster=devnet`);
console.log('PDA:', settled.pda);
console.log('digest:', settled.deliverable_digest);
