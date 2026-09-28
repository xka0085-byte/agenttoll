// Generate an official-format x402 receipt test vector using the OFFICIAL @x402/extensions package.
// This vector is the authority: our own verifier must agree with the official verifier on it.
import { generateKeyPairSync, sign as nodeSign } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58Encode(bytes) {
  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) { digits.push(carry % 58); carry = (carry / 58) | 0; }
  }
  let out = '';
  for (const d of digits) out = B58_ALPHABET[d] + out;
  for (const byte of bytes) { if (byte === 0) out = '1' + out; else break; }
  return out;
}

const b58 = { encode: base58Encode };

// official package imports
import { createJWS, verifyReceiptSignatureJWS, extractJWSPayload } from '@x402/extensions/offer-receipt';

// 1. Ed25519 keypair
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const rawPub = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32); // last 32 bytes = raw ed25519 pubkey

// 2. did:key for Ed25519: multibase 'z' + base58btc(multicodec 0xed01 || raw32)
const multicodecPub = Buffer.concat([Buffer.from([0xed, 0x01]), Buffer.from(rawPub)]);
const kid = `did:key:z${b58.encode(multicodecPub)}#key-1`;

// 3. official receipt payload (§5.2 required fields)
const payload = {
  version: 1,
  network: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
  resourceUrl: 'https://agenttoll-receipts.app.workbuddy.host/v1/receipt',
  payer: '81kFqcxzLisbnD8czVXS3EbQYCwKQW6dS1Djb3XKbd2v',
  issuedAt: Math.floor(Date.now() / 1000),
  transaction: '5VERiZ8Ffzc9pFf8RJgWoL9tGovkuwsqGVhJHHXUKvhZMtGjT9DPdVMMPeRZ8CLfKe4YfPTZhYStswYlp8rLcGNN',
};

// 4. official createJWS with an Ed25519 signer
const jwsSigner = {
  algorithm: 'EdDSA',
  kid,
  sign: async (data) => {
    const sig = nodeSign(null, data, privateKey); // ed25519: algorithm param must be null
    return Buffer.from(sig).toString('base64url');
  },
};
const jws = await createJWS(payload, jwsSigner);
const signedReceipt = { format: 'jws', signature: jws };

// 5. OFFICIAL verifier must accept it (this proves the vector is valid per the official spec)
let officialOk = null;
let officialPayload = null;
try {
  officialPayload = await verifyReceiptSignatureJWS(signedReceipt); // no key → resolves via did:key kid
  officialOk = JSON.stringify(officialPayload) === JSON.stringify(payload);
} catch (e) {
  officialOk = `OFFICIAL_VERIFY_FAILED: ${e.message}`;
}

// 6. tamper: flip payer in the payload (re-encode, keep signature) → official verifier must reject
const tampered = JSON.parse(JSON.stringify(signedReceipt));
const parts = tampered.signature.split('.');
const tamperPayload = { ...payload, payer: 'EvilReplacedPayer11111111111111111111111111' };
const canonicalTampered = JSON.stringify(Object.keys(tamperPayload).sort().reduce((acc, k) => { acc[k] = tamperPayload[k]; return acc; }, {}));
parts[1] = Buffer.from(canonicalTampered).toString('base64url');
tampered.signature = parts.join('.');
let tamperRejected = null;
try {
  await verifyReceiptSignatureJWS(tampered);
  tamperRejected = 'BUG: official verifier accepted tampered payload';
} catch (e) {
  tamperRejected = `REJECTED_OK (${e.message.slice(0, 60)})`;
}

const out = {
  kid,
  public_key_jwk: publicKey.export({ format: 'jwk' }),
  vector: signedReceipt,
  payload,
  official_verify_ok: officialOk,
  official_verify_payload: officialPayload,
  tamper_check: tamperRejected,
};
writeFileSync('receipts-service/test/official-vector.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify({ kid, official_verify_ok: officialOk, tamper_check: tamperRejected, jws_len: jws.length }, null, 2));
