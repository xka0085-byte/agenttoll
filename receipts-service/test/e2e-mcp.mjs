// E2E: call the local MCP endpoint's verify_x402_receipt with the OFFICIAL-format vector.
import { readFileSync } from 'node:fs';
const vector = JSON.parse(readFileSync(new URL('./official-vector.json', import.meta.url), 'utf8'));
const BASE = process.env.BASE ?? 'http://127.0.0.1:8789';

async function callTool(name, args) {
  const res = await fetch(`${BASE}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  });
  return res.json();
}

// T1: valid official vector (freshness gate off)
const t1 = await callTool('verify_x402_receipt', { receipt: vector.vector, public_key_jwk: vector.public_key_jwk, max_age_seconds: 0 });
const t1Text = JSON.parse(t1.result.content[0].text);

// T2: auto-resolve key from did:key kid (no public_key_jwk provided) — official kid resolution path
const t2 = await callTool('verify_x402_receipt', { receipt: vector.vector, max_age_seconds: 0 });
const t2Text = JSON.parse(t2.result.content[0].text);

// T3: tampered payload → must fail
const parts = vector.vector.signature.split('.');
const tamperPayload = { ...vector.payload, payer: 'EvilReplacedPayer11111111111111111111111111' };
const canonicalTampered = JSON.stringify(Object.keys(tamperPayload).sort().reduce((acc, k) => { acc[k] = tamperPayload[k]; return acc; }, {}));
const tampered = { format: 'jws', signature: [parts[0], Buffer.from(canonicalTampered).toString('base64url'), parts[2]].join('.') };
const t3 = await callTool('verify_x402_receipt', { receipt: tampered, public_key_jwk: vector.public_key_jwk, max_age_seconds: 0 });
const t3Text = JSON.parse(t3.result.content[0].text);

// T4: freshness gate enforced — a 60s window on a ~minutes-old vector must fail verification
const t4 = await callTool('verify_x402_receipt', { receipt: vector.vector, public_key_jwk: vector.public_key_jwk, max_age_seconds: 60 });
const t4Text = JSON.parse(t4.result.content[0].text);
const t4b = await callTool('verify_x402_receipt', { receipt: vector.vector, public_key_jwk: vector.public_key_jwk, max_age_seconds: 86400 });
const t4bText = JSON.parse(t4b.result.content[0].text);

const results = {
  T1_valid_via_mcp: t1Text.verified === true && t1Text.payload?.payer === vector.payload.payer,
  T2_kid_autoresolve: t2Text.verified === true && t2Text.kid?.startsWith('did:key:z'),
  T3_tampered_rejected: t3Text.verified === false && /signature/.test(t3Text.error ?? ''),
  T4_freshness_enforced: t4Text.verified === false && (t4Text.warnings?.length ?? 0) > 0,
  T4b_same_vector_passes_wide_window: t4bText.verified === true,
};
results.ALL_PASS = Object.values(results).every(Boolean);
console.log(JSON.stringify(results, null, 2));
process.exitCode = results.ALL_PASS ? 0 : 1;
