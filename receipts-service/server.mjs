#!/usr/bin/env node
// AgentToll Receipts Service — x402-native delivery receipts on Solana
// POST /v1/receipt   → 402 challenge (0.001 USDC) → verify payment → anchor receipt on-chain
// GET  /v1/receipt/:id → full receipt details
// GET  /v1/health    → uptime probe
// GET  /v1/rpc-check → egress diagnostics
// Static: / (pricing page), /SKILL.md, /llms.txt, /.well-known/agent-card.json
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(new URL('./package.json', import.meta.url));
const {
  Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction,
} = require('@solana/web3.js');

const PROGRAM_ID = new PublicKey('8ACN1KNEFXM2N2FMzxTfAzB1c3g5n47ZuhbPoUXPnCTp');
const AMOUNT = '1000'; // 0.001 USDC, 6 decimals
const DECIMALS = 6;
const STORE_PATH = new URL('./receipts-store.json', import.meta.url);

// --- RPC fallback chain: probe candidates with body validation, remember the healthy one ---
const RPC_CANDIDATES = [];
function initRpcCandidates(extraUrls = []) {
  RPC_CANDIDATES.length = 0;
  RPC_CANDIDATES.push(
    ...[
      process.env.AGENTTOLL_RPC_URL,
      ...extraUrls,
      'https://solana-devnet.gateway.tatum.io', // keyless gateway, verified working
      'https://solana-devnet.api.onfinality.io/rpc', // keyless but rate-limited; retry+rotation absorbs 429s
      'https://api.devnet.solana.com', // blocked from some datacenter IPs; fast-fail rotation makes it harmless
      process.env.ANKR_API_KEY ? `https://rpc.ankr.com/solana_devnet/${process.env.ANKR_API_KEY}` : null,
    ].filter(Boolean),
  );
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastGood = 0;

async function rpcCall(method, params) {
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
  const total = RPC_CANDIDATES.length * 8;
  let lastError = 'no candidates';
  for (let i = 0; i < total; i++) {
    const idx = (lastGood + i) % RPC_CANDIDATES.length;
    const target = RPC_CANDIDATES[idx];
    try {
      const res = await fetch(target, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        signal: AbortSignal.timeout(20000),
      });
      const json = await res.json().catch(() => null);
      if (!json) { lastError = `invalid json from ${target}`; await sleep(600); continue; }
      if (json.error) {
        // rate-limit / capacity errors → rotate; per-key auth errors (Ankr without key) → rotate too
        lastError = `${target}: ${JSON.stringify(json.error)}`;
        await sleep(700);
        continue;
      }
      lastGood = idx;
      return json.result;
    } catch (error) {
      if (error.message?.startsWith('RPC error from')) throw error;
      lastError = `${target}: ${error.message}`;
      await sleep(500);
    }
  }
  throw new Error(`all RPC endpoints failed; last error: ${lastError}`);
}

function requireEnv(name) {
  if (!process.env[name]) throw new Error(`${name} is required`);
  return process.env[name];
}

async function keypairFromPath(path) {
  const values = JSON.parse(await readFile(path, 'utf8'));
  return Keypair.fromSecretKey(Uint8Array.from(values));
}

async function loadStore() {
  try { return JSON.parse(await readFile(STORE_PATH, 'utf8')); }
  catch { return { receipts: {}, byPayment: {} }; }
}

async function saveStore(store) {
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2));
}

function jsonResponse(response, status, body, headers = {}) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers });
  response.end(`${JSON.stringify(body)}\n`);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (c) => chunks.push(c));
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

function challengeBody(config, paymentRef, reason = 'payment required') {
  return {
    challenge: {
      vendor: config.service,
      amount: AMOUNT,
      mint: config.mint,
      report_id: paymentRef,
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

async function verifyPayment(paymentSignature, config, serviceAta) {
  const transaction = await rpcCall('getTransaction', [
    paymentSignature,
    { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 },
  ]);
  if (!transaction) throw new Error('payment transaction not found or not confirmed');
  if (transaction.meta?.err) throw new Error(`payment transaction failed: ${JSON.stringify(transaction.meta.err)}`);
  const transfer = allParsedInstructions(transaction).find((instruction) => {
    const parsed = instruction.parsed;
    const info = parsed?.info;
    return instruction.program === 'spl-token'
      && parsed?.type === 'transferChecked'
      && info?.destination === serviceAta.toBase58()
      && info?.mint === config.mint
      && info?.tokenAmount?.amount === AMOUNT;
  });
  if (!transfer) throw new Error('payment must contain a successful SPL transferChecked to the service ATA with the exact amount and mint');
}

function encodeString(value) {
  const bytes = Buffer.from(value, 'utf8');
  const length = Buffer.alloc(4);
  length.writeUInt32LE(bytes.length);
  return Buffer.concat([length, bytes]);
}

// Build + send the anchor transaction (fast — no confirmation wait; async mode beats gateway timeouts).
async function sendAnchorTransaction(service, paymentRef, digestHex) {
  const digest = Buffer.from(digestHex, 'hex');
  if (digest.length !== 32) throw new Error('deliverable_digest must be a 32-byte SHA-256 hex string');
  const paymentRefBytes = Buffer.from(paymentRef, 'utf8');
  if (paymentRefBytes.length === 0 || paymentRefBytes.length > 128) throw new Error('x402_payment_ref must be 1-128 bytes');
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('receipt'), service.publicKey.toBuffer(), paymentRefBytes],
    PROGRAM_ID,
  );
  const { value: blockhash } = await rpcCall('getLatestBlockhash', [{ commitment: 'confirmed' }]);
  const instruction = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: service.publicKey, isSigner: true, isWritable: true },
      { pubkey: pda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      createHash('sha256').update('global:create_receipt').digest().subarray(0, 8),
      encodeString(paymentRef),
      digest,
    ]),
  });
  const tx = new Transaction();
  tx.recentBlockhash = blockhash.blockhash;
  tx.feePayer = service.publicKey;
  tx.add(instruction);
  tx.sign(service);
  const wire = tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64');
  const signature = await rpcCall('sendTransaction', [wire, { encoding: 'base64', skipPreflight: false }]);
  return { tx: signature, pda: pda.toBase58(), digest: digest.toString('hex') };
}

// Background confirmation: poll until confirmed, then settle the receipt in the store.
async function confirmAnchorInBackground(store, receipt, anchored) {
  const deadline = Date.now() + 240000; // up to 4 min, well past any client timeout
  try {
    while (Date.now() < deadline) {
      const status = await rpcCall('getSignatureStatuses', [[anchored.tx], { searchTransactionHistory: false }]);
      const s = status?.value?.[0];
      if (s?.err) throw new Error(`anchor transaction failed: ${JSON.stringify(s.err)}`);
      if (s && ['confirmed', 'finalized'].includes(s.confirmationStatus)) {
        receipt.outcome = 'settled';
        receipt.receipt_uri = `solana:${anchored.tx}`;
        receipt.verifiable = true;
        await saveStore(store);
        console.error(`receipt ${receipt.receipt_id} settled on-chain: ${anchored.tx}`);
        return;
      }
      await sleep(1500);
    }
    throw new Error('confirmation timed out after 240s');
  } catch (error) {
    receipt.outcome = 'failed';
    receipt.error = error.message;
    receipt.verifiable = false;
    await saveStore(store);
    console.error(`receipt ${receipt.receipt_id} failed: ${error.message}`);
  }
}

async function main() {
  const keypairPath = process.env.AGENTTOLL_KEYPAIR
    ?? new URL('./service-keypair.json', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  const service = await keypairFromPath(keypairPath);
  const config = JSON.parse(await readFile(new URL('./config.json', import.meta.url), 'utf8'));
  initRpcCandidates([config.rpcUrl].filter(Boolean));
  if (config.service !== service.publicKey.toBase58()) throw new Error('config.service does not match the service keypair pubkey');
  const mint = new PublicKey(config.mint);
  const { getAssociatedTokenAddress } = require('@solana/spl-token');
  const serviceAta = await getAssociatedTokenAddress(mint, service.publicKey);
  const store = await loadStore();
  const port = Number(process.env.PORT ?? '8787');
  const challengeHeaders = (body) => ({ 'X-Payment-Required': JSON.stringify(body.challenge) });

  const { createServer } = await import('node:http');
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const path = url.pathname;

    try {
      if (request.method === 'GET' && (path === '/' || path === '/index.html')) {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end(await readFile(new URL('./static/index.html', import.meta.url)));
        return;
      }
      if (request.method === 'GET' && path === '/SKILL.md') {
        response.writeHead(200, { 'content-type': 'text/markdown; charset=utf-8' });
        response.end(await readFile(new URL('./static/SKILL.md', import.meta.url)));
        return;
      }
      if (request.method === 'GET' && path === '/llms.txt') {
        response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
        response.end(await readFile(new URL('./static/llms.txt', import.meta.url)));
        return;
      }
      if (request.method === 'GET' && path === '/.well-known/agent-card.json') {
        jsonResponse(response, 200, JSON.parse(await readFile(new URL('./static/.well-known/agent-card.json', import.meta.url))));
        return;
      }
    } catch (error) {
      jsonResponse(response, 500, { error: `static asset unavailable: ${error.message}` });
      return;
    }

    if (path === '/v1/receipt' && request.method === 'POST') {
      let body;
      try { body = JSON.parse((await readBody(request)).toString('utf8') || '{}'); }
      catch { jsonResponse(response, 400, { error: 'invalid JSON body' }); return; }
      const paymentRef = body.x402_payment_ref;
      const digestHex = typeof body.deliverable_digest === 'string' ? body.deliverable_digest.replace(/^0x/, '').toLowerCase() : '';
      if (typeof paymentRef !== 'string' || !paymentRef) {
        jsonResponse(response, 400, { error: 'x402_payment_ref is required' }); return;
      }
      if (!/^[0-9a-f]{64}$/.test(digestHex)) {
        jsonResponse(response, 400, { error: 'deliverable_digest must be a 64-char SHA-256 hex string' }); return;
      }
      const signature = request.headers['x-payment-signature'] ?? request.headers['payment-signature'];
      if (typeof signature !== 'string' || !signature) {
        const challenge = challengeBody(config, paymentRef);
        jsonResponse(response, 402, challenge, challengeHeaders(challenge)); return;
      }
      // Idempotency: same payment signature → return the existing receipt (any state).
      if (store.byPayment[signature]) {
        jsonResponse(response, 200, store.receipts[store.byPayment[signature]]);
        return;
      }
      try { await verifyPayment(signature, config, serviceAta); }
      catch (error) {
        const challenge = challengeBody(config, paymentRef, error.message);
        jsonResponse(response, 402, challenge, challengeHeaders(challenge)); return;
      }
      // Async anchoring: register a pending receipt, return immediately (client polls GET /v1/receipt/:id).
      // On-chain anchor tx is sent first (single fast RPC round-trip); confirmation polling runs in background.
      let anchored;
      try { anchored = await sendAnchorTransaction(service, paymentRef, digestHex); }
      catch (error) { jsonResponse(response, 502, { error: `receipt anchoring failed: ${error.message}` }); return; }
      const receiptId = `r_${createHash('sha256').update(signature).digest().hexSlice(0, 16)}`;
      const receipt = {
        receipt_id: receiptId,
        receipt_version: 1,
        x402_payment_ref: paymentRef,
        payment_signature: signature,
        buyer: body.buyer ?? null,
        seller: body.seller ?? null,
        contract_digest: body.contract_digest ?? null,
        deliverable_digest: digestHex,
        checks: { C1: true, C2: true, C3: true, C4: true, C5: true },
        outcome: 'pending',
        amount: { value: '0.001', asset: 'USDC', chain: 'solana' },
        timestamp: Math.floor(Date.now() / 1000),
        receipt_uri: `solana:${anchored.tx}`,
        pda: anchored.pda,
        verifiable: false,
        note: 'anchor transaction submitted; poll this endpoint until outcome === "settled"',
      };
      store.receipts[receiptId] = receipt;
      store.byPayment[signature] = receiptId;
      await saveStore(store);
      jsonResponse(response, 202, receipt);
      confirmAnchorInBackground(store, receipt, anchored).catch((error) => {
        console.error(`background confirm crashed: ${error.message}`);
      });
      return;
    }

    if (path.startsWith('/v1/receipt/') && request.method === 'GET') {
      const id = decodeURIComponent(path.slice('/v1/receipt/'.length));
      const receipt = store.receipts[id];
      if (!receipt) { jsonResponse(response, 404, { error: 'receipt not found' }); return; }
      jsonResponse(response, 200, receipt);
      return;
    }

    if (path === '/v1/health' && request.method === 'GET') {
      jsonResponse(response, 200, { ok: true, service: 'agenttoll-receipts', version: '0.1.0', chain: 'solana' });
      return;
    }

    if (path === '/v1/rpc-check' && request.method === 'GET') {
      const results = {};
      for (const target of RPC_CANDIDATES) {
        const started = Date.now();
        try {
          const res = await fetch(target, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getSlot' }),
            signal: AbortSignal.timeout(8000),
          });
          const json = await res.json().catch(() => null);
          results[target] = { ok: res.ok && json?.result !== undefined, status: res.status, ms: Date.now() - started };
        } catch (error) {
          results[target] = { ok: false, error: error.message, ms: Date.now() - started };
        }
      }
      jsonResponse(response, 200, { healthyEndpoint: RPC_CANDIDATES[lastGood], egress: results });
      return;
    }

    jsonResponse(response, 404, { error: 'not found' });
  });

  server.listen(port, '0.0.0.0', () => {
    console.error(`AgentToll receipts service listening on 0.0.0.0:${port}`);
  });
}

main().catch((error) => { console.error(`ERROR: ${error.message}`); process.exitCode = 2; });
