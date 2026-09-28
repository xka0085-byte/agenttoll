#!/usr/bin/env node
// x402 official offer-receipt extension verifier — ReceiptRail implementation.
// Verifies receipts in the format defined by @x402/extensions (docs.x402.org/extensions/offer-receipt):
//   { format: "jws", signature: "<JWS Compact>" }  where payload = {version, network, resourceUrl, payer, issuedAt, transaction?}
// Supported algorithms: EdDSA (Ed25519 — Solana-native), ES256 (P-256). Zero deps beyond node:crypto.
// JWS signing input and payload canonicalization match the official implementation
// (canonicalize → base64url → "header.payload" ASCII; jose compactVerify semantics).
import { createPublicKey, verify as cryptoVerify } from 'node:crypto';

const B64URL = (buf) => Buffer.from(buf).toString('base64url');
const DEB64URL = (str) => Buffer.from(str, 'base64url');

const REQUIRED_PAYLOAD_FIELDS = ['version', 'network', 'resourceUrl', 'payer', 'issuedAt'];
const SUPPORTED_ALGS = ['EdDSA', 'ES256'];

function parseJws(jws) {
  const parts = String(jws).split('.');
  if (parts.length !== 3) throw new Error('invalid JWS compact serialization (expected 3 dot-separated parts)');
  const header = JSON.parse(DEB64URL(parts[0]).toString('utf8'));
  const payloadBuf = DEB64URL(parts[1]);
  const sigBuf = DEB64URL(parts[2]);
  return { header, payloadBuf, sigBuf, parts, signingInput: Buffer.from(`${parts[0]}.${parts[1]}`, 'ascii') };
}

// did:key:z<base58btc(0xed01 || ed25519-pubkey)> → JWK (per official extractKeyFromDidKey)

const B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58Decode(str) {
  const bytes = [0];
  for (const ch of str) {
    const val = B58_ALPHABET.indexOf(ch);
    if (val < 0) throw new Error(`invalid base58 character "${ch}"`);
    let carry = val;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) { bytes.push(carry & 0xff); carry >>= 8; }
  }
  // leading zeros
  for (let i = 0; i < str.length && str[i] === '1'; i++) bytes.push(0);
  return Buffer.from(bytes.reverse());
}

function jwkFromDidKey(kid) {
  const [did, fragment] = kid.split('#');
  const parts = did.split(':');
  if (parts.length < 3 || parts[0] !== 'did' || parts[1] !== 'key') return null;
  let ident = parts.slice(2).join(':');
  // multibase prefix: 'z' = base58btc (did:key spec) — strip before decoding
  if (ident.startsWith('z')) ident = ident.slice(1);
  const data = base58Decode(ident);
  // multicodec: 0xed 0x01 prefixed 32-byte Ed25519 public key
  if (data.length === 34 && data[0] === 0xed && data[1] === 0x01) {
    return { kty: 'OKP', crv: 'Ed25519', x: B64URL(data.subarray(2)) };
  }
  throw new Error(`unsupported did:key multicodec (only ed25519-pub 0xed01 supported), got ${data.length} bytes`);
}

// did:web:<domain[:port][/path]> → fetch /.well-known/did.json, pick verificationMethod matching fragment
async function jwkFromDidWeb(kid) {
  const [did, fragment] = kid.split('#');
  const parts = did.split(':');
  if (parts.length < 3 || parts[0] !== 'did' || parts[1] !== 'web') return null;
  const identity = parts.slice(2).join(':');
  const [host, ...rest] = identity.split(':'); // port keeps its own colon: did:web:example.com:8443 → host:port split is implicit
  // Official convention: did:web:example.com → https://example.com/.well-known/did.json
  // With a port: did:web:localhost%3A4021 (URL-encoded). With a path: did:web:example.com:user → /user/.well-known/did.json
  let hostPart = identity;
  let pathPart = '';
  const firstSlash = identity.indexOf('/');
  if (firstSlash >= 0) {
    hostPart = identity.slice(0, firstSlash);
    pathPart = identity.slice(firstSlash);
  }
  const decodedHost = decodeURIComponent(hostPart);
  const url = `https://${decodedHost}${pathPart}/.well-known/did.json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`did:web resolution failed: ${url} → HTTP ${res.status}`);
  const doc = await res.json();
  const methods = doc.verificationMethod ?? [];
  const match = methods.find((m) => (fragment ? m.id === `${did}#${fragment}` : m.id === did))
    ?? methods.find((m) => m.publicKeyJwk);
  if (!match?.publicKeyJwk) throw new Error(`did:web document has no publicKeyJwk (kid=${kid})`);
  return match.publicKeyJwk;
}

function didJwkToJwk(kid) {
  const [did] = kid.split('#');
  const parts = did.split(':');
  if (parts.length < 3 || parts[0] !== 'did' || parts[1] !== 'jwk') return null;
  return JSON.parse(DEB64URL(parts[2]).toString('utf8'));
}

async function resolvePublicKey(jws, header, providedJwk) {
  if (providedJwk) return providedJwk;
  const kid = header.kid;
  if (!kid) throw new Error('no public key provided and JWS header has no kid');
  return (await jwkFromDidKey(kid)) ?? (await jwkFromDidWeb(kid)) ?? didJwkToJwk(kid)
    ?? (() => { throw new Error(`unsupported kid "${kid}" (supported: did:key Ed25519, did:web, did:jwk); pass public_key_jwk instead`); })();
}

// JWS ES256 signatures are raw r||s (64 bytes); node crypto wants DER for EC keys.
function rawToDerSignature(raw64) {
  if (raw64.length !== 64) return raw64; // already DER? let node error out with a clear message
  let r = raw64.subarray(0, 32);
  let s = raw64.subarray(32, 64);
  while (r.length > 1 && r[0] === 0) r = r.subarray(1);
  while (s.length > 1 && s[0] === 0) s = s.subarray(1);
  if (r[0] & 0x80) r = Buffer.concat([Buffer.from([0]), r]);
  if (s[0] & 0x80) s = Buffer.concat([Buffer.from([0]), s]);
  const body = Buffer.concat([Buffer.from([0x02, r.length]), r, Buffer.from([0x02, s.length])]);
  return Buffer.concat([Buffer.from([0x30, body.length]), body]);
}

function verifySignature(alg, signingInput, sigBuf, jwk) {
  const key = createPublicKey({ key: jwk, format: 'jwk' });
  if (alg === 'EdDSA') {
    if (jwk.crv !== 'Ed25519') throw new Error(`EdDSA requires an Ed25519 JWK, got crv=${jwk.crv}`);
    return cryptoVerify(null, signingInput, key, sigBuf);
  }
  if (alg === 'ES256') {
    if (jwk.crv !== 'P-256') throw new Error(`ES256 requires a P-256 JWK, got crv=${jwk.crv}`);
    return cryptoVerify('sha256', signingInput, key, rawToDerSignature(sigBuf));
  }
  throw new Error(`unsupported algorithm "${alg}" (supported: ${SUPPORTED_ALGS.join(', ')})`);
}

function checkPayloadShape(payload) {
  const missing = REQUIRED_PAYLOAD_FIELDS.filter((f) => payload[f] === undefined || payload[f] === null);
  if (missing.length) throw new Error(`receipt payload missing required fields: ${missing.join(', ')}`);
  if (typeof payload.version !== 'number') throw new Error('payload.version must be a number');
  if (typeof payload.issuedAt !== 'number') throw new Error('payload.issuedAt must be a unix-seconds number');
  if (typeof payload.resourceUrl !== 'string' || !/^https?:\/\//.test(payload.resourceUrl)) {
    throw new Error('payload.resourceUrl must be an http(s) URL');
  }
  if (typeof payload.network !== 'string' || !payload.network.includes(':')) {
    throw new Error('payload.network must be a CAIP-2 identifier (e.g. "solana:5eykt..." or "eip155:8453")');
  }
}

/**
 * Verify an x402 official-format signed receipt.
 * @param {object} args
 *   receipt: {format:"jws", signature} — the signed artifact (official @x402/extensions shape)
 *   public_key_jwk: optional JWK to verify with (skips kid resolution; required for non-did kids)
 *   max_age_seconds: optional freshness window (default 3600, aligned with official verifyReceiptMatchesOffer)
 *   expect: optional {resourceUrl?, payer?, network?} — assert payload matches expected values
 * @returns {verified: boolean, ...checks, payload, error?}
 */
export async function verifyX402Receipt(args) {
  const checks = { structure: false, fields: false, signature: false, freshness: false, expectations: true };
  try {
    const receipt = args?.receipt;
    if (!receipt || receipt.format !== 'jws' || typeof receipt.signature !== 'string') {
      throw new Error('receipt must be {format:"jws", signature:"<JWS compact>"} — eip712 format not supported by this verifier');
    }
    const { header, payloadBuf, sigBuf, signingInput } = parseJws(receipt.signature);
    checks.structure = true;

    const payload = JSON.parse(payloadBuf.toString('utf8'));
    checkPayloadShape(payload);
    checks.fields = true;

    const alg = header.alg;
    if (!SUPPORTED_ALGS.includes(alg)) {
      throw new Error(`unsupported alg "${alg}" (supported: ${SUPPORTED_ALGS.join(', ')})`);
    }
    const jwk = await resolvePublicKey(receipt.signature, header, args?.public_key_jwk);
    const signatureOk = verifySignature(alg, signingInput, sigBuf, jwk);
    if (!signatureOk) throw new Error('signature verification failed (payload does not match signature under the resolved public key)');
    checks.signature = true;

    const maxAge = Number.isFinite(args?.max_age_seconds) ? args.max_age_seconds : 3600;
    const now = Math.floor(Date.now() / 1000);
    checks.freshness = now - payload.issuedAt <= maxAge && payload.issuedAt - now <= 300; // 5min future skew tolerance

    const expected = args?.expect ?? {};
    const mismatches = Object.entries(expected)
      .filter(([k, v]) => payload[k] !== undefined && payload[k] !== v)
      .map(([k]) => k);
    checks.expectations = mismatches.length === 0;

    const verified = checks.signature && checks.fields && checks.structure
      && (checks.freshness || args?.max_age_seconds === 0) && checks.expectations;
    return { verified, checks, algorithm: alg, kid: header.kid ?? null, payload, warnings: checks.freshness ? [] : [`receipt issuedAt (${payload.issuedAt}) is older than ${maxAge}s or in the future`] };
  } catch (error) {
    return { verified: false, checks, payload: null, error: error.message };
  }
}

// CLI: node x402-receipt-verify.mjs <vector.json>   (vector = {vector:{format,signature}, public_key_jwk, payload})
if (process.argv[1] && process.argv[1].endsWith('x402-receipt-verify.mjs') && process.argv[2]) {
  const input = JSON.parse((await import('node:fs')).readFileSync(process.argv[2], 'utf8'));
  const result = await verifyX402Receipt({
    receipt: input.vector ?? input.receipt,
    public_key_jwk: input.public_key_jwk,
    max_age_seconds: 0, // vectors may carry old timestamps; freshness checked separately
    expect: input.payload,
  });
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.verified ? 0 : 1;
}
