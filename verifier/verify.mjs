#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { Connection, PublicKey } from '@solana/web3.js';

const PROGRAM_ID = new PublicKey('8ACN1KNEFXM2N2FMzxTfAzB1c3g5n47ZuhbPoUXPnCTp');
const MAX_REPORT_ID_BYTES = 32;
// W1 按 8 + Receipt::INIT_SPACE 分配固定空间。INIT_SPACE 由 anchor-lang 1.2.0 计算，
// 实测为 141（IDL 未声明 space，以链上 `solana account` 实测为准）→ 账户总长恒 149，
// 与 report_id 实际长度无关；report_id < 32 时尾部为未使用零字节。
const EXPECTED_ACCOUNT_LENGTH = 149;

function usage() {
  console.error('Usage: node verify.mjs --url <RPC_URL> --vendor <PUBKEY> --report-id <ID> [--file <PATH>] [--vendor-expected <PUBKEY>] [--out <PATH>]');
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) throw new Error(`unexpected argument: ${token}`);
    const key = token.slice(2);
    if (key === 'file' || key === 'out' || key === 'url' || key === 'vendor' || key === 'report-id' || key === 'vendor-expected') {
      if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) throw new Error(`missing value for --${key}`);
      args[key] = argv[++i];
    } else {
      throw new Error(`unknown option: --${key}`);
    }
  }
  return args;
}

function check(id, name, pass, detail) {
  return { id, name, pass, detail };
}

function parseReceipt(data) {
  const discriminator = createHash('sha256').update('account:Receipt').digest().subarray(0, 8);
  if (data.length < 8) throw new Error('account data is shorter than discriminator');
  if (!data.subarray(0, 8).equals(discriminator)) throw new Error('Receipt discriminator mismatch');
  if (data.length < 44) throw new Error('account data is shorter than Receipt header');
  const vendor = new PublicKey(data.subarray(8, 40));
  const reportLength = data.readUInt32LE(40);
  const digestStart = 44 + reportLength;
  if (digestStart + 41 > data.length) throw new Error('report_id length exceeds account data');
  const reportBytes = data.subarray(44, digestStart);
  const reportId = new TextDecoder('utf-8', { fatal: true }).decode(reportBytes);
  const digest = data.subarray(digestStart, digestStart + 32).toString('hex');
  const createdAt = Number(data.readBigInt64LE(digestStart + 32));
  const bump = data[digestStart + 40];
  return { vendor, reportId, reportLength, digest, createdAt, bump };
}

function failedReceipt() {
  return { pda: null, vendor: null, report_id: null, digest: null, created_at: null, bump: null };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.url || !args.vendor || !args['report-id']) {
    usage();
    process.exitCode = 2;
    return;
  }
  const reportBytes = new TextEncoder().encode(args['report-id']);
  if (reportBytes.length === 0 || reportBytes.length > MAX_REPORT_ID_BYTES) throw new Error(`report-id must be 1-${MAX_REPORT_ID_BYTES} UTF-8 bytes`);
  const vendor = new PublicKey(args.vendor);
  const expectedVendor = args['vendor-expected'] ? new PublicKey(args['vendor-expected']) : null;
  const [pda, derivedBump] = PublicKey.findProgramAddressSync([Buffer.from('receipt'), vendor.toBuffer(), reportBytes], PROGRAM_ID);
  const connection = new Connection(args.url, 'confirmed');
  const info = await connection.getAccountInfo(pda);
  const now = Math.floor(Date.now() / 1000);
  const checks = [];
  let parsed = null;

  checks.push(check('C1', 'ownership', Boolean(info && info.owner.equals(PROGRAM_ID)), info ? `owner ${info.owner.toBase58()}` : 'receipt account not found'));
  if (info) {
    try { parsed = parseReceipt(info.data); } catch (error) { parsed = { parseError: error.message }; }
  }
  checks.push(check('C2', 'pda_derivation', Boolean(info && parsed && !parsed.parseError && parsed.vendor.equals(vendor) && parsed.bump === derivedBump), `derived ${pda.toBase58()}, bump ${derivedBump}${parsed && !parsed.parseError ? `, account bump ${parsed.bump}` : ''}`));
  const schemaPass = Boolean(info && parsed && !parsed.parseError && info.data.length === EXPECTED_ACCOUNT_LENGTH && parsed.reportLength === reportBytes.length && parsed.reportId === args['report-id']);
  checks.push(check('C3', 'schema', schemaPass, parsed?.parseError ?? `account bytes ${info?.data.length ?? 0}, expected ${EXPECTED_ACCOUNT_LENGTH}`));

  let contentPass = true;
  let contentDetail = 'not requested';
  if (args.file) {
    const bytes = await readFile(args.file);
    const localDigest = createHash('sha256').update(bytes).digest('hex');
    contentPass = Boolean(parsed && !parsed.parseError && localDigest === parsed.digest);
    contentDetail = `sha256:${localDigest} == onchain:${parsed?.digest ?? 'unavailable'}`;
  }
  checks.push(check('C4', 'content_binding', contentPass, contentDetail));
  const freshnessPass = Boolean(parsed && !parsed.parseError && parsed.createdAt <= now + 120 && (!expectedVendor || parsed.vendor.equals(expectedVendor)));
  const freshnessDetail = parsed && !parsed.parseError ? `created_at ${parsed.createdAt} <= now ${now}${expectedVendor ? `; vendor_expected ${expectedVendor.toBase58()}` : ''}` : 'Receipt schema unavailable';
  checks.push(check('C5', 'freshness', freshnessPass, freshnessDetail));

  const receipt = parsed && !parsed.parseError ? { pda: pda.toBase58(), vendor: parsed.vendor.toBase58(), report_id: parsed.reportId, digest: parsed.digest, created_at: parsed.createdAt, bump: parsed.bump } : failedReceipt();
  if (!receipt.pda) receipt.pda = pda.toBase58();
  const output = { verdict: checks.every((item) => item.pass) ? 'PASS' : 'FAIL', checks, receipt, rpc: args.url, verified_at: new Date().toISOString() };
  const json = `${JSON.stringify(output, null, 2)}\n`;
  process.stdout.write(json);
  if (args.out) await writeFile(args.out, json, 'utf8');
  process.exitCode = output.verdict === 'PASS' ? 0 : 1;
}

main().catch((error) => {
  console.error(`ERROR: ${error.message}`);
  process.exitCode = 2;
});
