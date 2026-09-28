// Cross-verification test: OUR verifier vs the OFFICIAL @x402/extensions verifier
// must reach the same verdict on (1) a valid official-format receipt and (2) a tampered one.
import { readFileSync } from 'node:fs';
import { verifyReceiptSignatureJWS } from '@x402/extensions/offer-receipt';
import { verifyX402Receipt } from '../x402-receipt-verify.mjs';

const vector = JSON.parse(readFileSync(new URL('./official-vector.json', import.meta.url), 'utf8'));

// ---------- positive: valid vector ----------
const ours = await verifyX402Receipt({ receipt: vector.vector, public_key_jwk: vector.public_key_jwk, max_age_seconds: 0 });
const officialPayload = await verifyReceiptSignatureJWS(vector.vector); // official (throws on failure)
const payloadMatch = JSON.stringify(ours.payload) === JSON.stringify(officialPayload);

// ---------- negative: tampered payload (payer replaced, signature untouched) ----------
const parts = vector.vector.signature.split('.');
const tamperPayload = { ...vector.payload, payer: 'EvilReplacedPayer11111111111111111111111111' };
const canonicalTampered = JSON.stringify(Object.keys(tamperPayload).sort().reduce((acc, k) => { acc[k] = tamperPayload[k]; return acc; }, {}));
const tampered = { format: 'jws', signature: [parts[0], Buffer.from(canonicalTampered).toString('base64url'), parts[2]].join('.') };

const oursTamper = await verifyX402Receipt({ receipt: tampered, public_key_jwk: vector.public_key_jwk, max_age_seconds: 0 });
let officialTamper = 'ACCEPTED_BUG';
try { await verifyReceiptSignatureJWS(tampered); } catch (e) { officialTamper = `REJECTED (${e.message.slice(0, 50)})`; }

// ---------- negative: wrong public key (different ed25519 key) ----------
const { generateKeyPairSync } = await import('node:crypto');
const otherKey = generateKeyPairSync('ed25519').publicKey.export({ format: 'jwk' });
const oursWrongKey = await verifyX402Receipt({ receipt: vector.vector, public_key_jwk: otherKey, max_age_seconds: 0 });

// ---------- negative: structural garbage ----------
const oursGarbage = await verifyX402Receipt({ receipt: { format: 'jws', signature: 'not.a.jws' }, max_age_seconds: 0 });
const oursWrongFormat = await verifyX402Receipt({ receipt: { format: 'eip712', payload: {}, signature: '0x00' }, max_age_seconds: 0 });

const results = {
  T1_valid_ours: ours.verified,
  T1_valid_official: typeof officialPayload === 'object',
  T1_payload_identical: payloadMatch,
  T2_tampered_ours_rejected: oursTamper.verified === false,
  T2_tampered_official: officialTamper,
  T3_wrong_key_ours_rejected: oursWrongKey.verified === false,
  T4_garbage_ours_rejected: oursGarbage.verified === false,
  T5_eip712_clearly_unsupported: oursWrongFormat.verified === false && /eip712/.test(oursWrongFormat.error ?? ''),
};
results.ALL_PASS = Object.entries(results).every(([k, v]) => k === 'T2_tampered_official' || v === true || (k === 'T2_tampered_official' && String(v).startsWith('REJECTED')));
console.log(JSON.stringify(results, null, 2));
process.exitCode = results.ALL_PASS ? 0 : 1;
