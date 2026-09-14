#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, sendAndConfirmTransaction } from '@solana/web3.js';

const PROGRAM_ID = new PublicKey('8ACN1KNEFXM2N2FMzxTfAzB1c3g5n47ZuhbPoUXPnCTp');
const REPORT_ID = process.env.AGENTTOLL_REPORT_ID ?? 'example-report-v1';
const RPC_URL = process.env.AGENTTOLL_RPC_URL;
const REPORT_PATH = new URL('../verifier/example-report.json', import.meta.url);

function readKeypairPath() {
  if (!process.env.AGENTTOLL_KEYPAIR) throw new Error('AGENTTOLL_KEYPAIR must point to a Solana keypair JSON file');
  return process.env.AGENTTOLL_KEYPAIR;
}

function encodeString(value) {
  const bytes = Buffer.from(value, 'utf8');
  const length = Buffer.alloc(4);
  length.writeUInt32LE(bytes.length);
  return Buffer.concat([length, bytes]);
}

async function main() {
  if (!RPC_URL) throw new Error('AGENTTOLL_RPC_URL must contain the devnet RPC URL');
  const secret = JSON.parse(await readFile(readKeypairPath(), 'utf8'));
  if (!Array.isArray(secret) || secret.some((item) => !Number.isInteger(item) || item < 0 || item > 255)) throw new Error('keypair file must contain a Solana secret-key JSON array');
  const vendor = Keypair.fromSecretKey(Uint8Array.from(secret));
  const report = await readFile(REPORT_PATH);
  const digest = createHash('sha256').update(report).digest();
  const reportIdBytes = Buffer.from(REPORT_ID, 'utf8');
  if (reportIdBytes.length === 0 || reportIdBytes.length > 32) throw new Error('AGENTTOLL_REPORT_ID must be 1-32 UTF-8 bytes');
  const [pda] = PublicKey.findProgramAddressSync([Buffer.from('receipt'), vendor.publicKey.toBuffer(), reportIdBytes], PROGRAM_ID);
  const instructionDiscriminator = createHash('sha256').update('global:create_receipt').digest().subarray(0, 8);
  const data = Buffer.concat([instructionDiscriminator, encodeString(REPORT_ID), digest]);
  const instruction = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: vendor.publicKey, isSigner: true, isWritable: true },
      { pubkey: pda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
  const connection = new Connection(RPC_URL, 'confirmed');
  const tx = await sendAndConfirmTransaction(connection, new Transaction().add(instruction), [vendor]);
  const result = { tx, pda: pda.toBase58(), digest: digest.toString('hex') };
  await writeFile(new URL('../verifier/last-receipt.json', import.meta.url), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  console.error(`ERROR: ${error.message}`);
  process.exitCode = 2;
});
