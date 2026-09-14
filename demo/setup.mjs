#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../verifier/package.json', import.meta.url));
const {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} = require('@solana/web3.js');
const {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createMint,
  createMintToInstruction,
  getAccount,
  getAssociatedTokenAddress,
} = require('@solana/spl-token');

const DECIMALS = 6;
const INITIAL_SUPPLY = 100_000_000;
const BUYER_SOL = 50_000_000;
const CONFIG_PATH = new URL('./config.json', import.meta.url);
const BUYER_PATH = new URL('./buyer-keypair.json', import.meta.url);

async function keypairFromPath(path) {
  const values = JSON.parse(await readFile(path, 'utf8'));
  return Keypair.fromSecretKey(Uint8Array.from(values));
}

async function loadBuyer() {
  const path = process.env.AGENTTOLL_BUYER_KEYPAIR;
  if (path) return keypairFromPath(path);
  try { return await keypairFromPath(BUYER_PATH); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const buyer = Keypair.generate();
    await writeFile(BUYER_PATH, JSON.stringify(Array.from(buyer.secretKey)) + '\n', { mode: 0o600 });
    return buyer;
  }
}

function requireEnv(name) {
  if (!process.env[name]) throw new Error(`${name} is required`);
  return process.env[name];
}

async function main() {
  const rpcUrl = requireEnv('AGENTTOLL_RPC_URL');
  const vendor = await keypairFromPath(requireEnv('AGENTTOLL_KEYPAIR'));
  const buyer = await loadBuyer();
  const connection = new Connection(rpcUrl, 'confirmed');
  let config = null;
  try { config = JSON.parse(await readFile(CONFIG_PATH, 'utf8')); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (config?.vendor && config.vendor !== vendor.publicKey.toBase58()) {
    throw new Error('existing config vendor does not match AGENTTOLL_KEYPAIR');
  }
  let mint;
  if (config?.mint) {
    mint = new PublicKey(config.mint);
  } else {
    mint = await createMint(connection, vendor, vendor.publicKey, null, DECIMALS);
  }
  const vendorAta = await getAssociatedTokenAddress(mint, vendor.publicKey);
  const buyerAta = await getAssociatedTokenAddress(mint, buyer.publicKey);
  const ataIx = [
    createAssociatedTokenAccountIdempotentInstruction(vendor.publicKey, vendorAta, vendor.publicKey, mint, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID),
    createAssociatedTokenAccountIdempotentInstruction(vendor.publicKey, buyerAta, buyer.publicKey, mint, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID),
  ];
  const vendorAccount = await connection.getAccountInfo(vendorAta);
  const buyerAccount = await connection.getAccountInfo(buyerAta);
  const instructions = [];
  if (!vendorAccount) instructions.push(ataIx[0]);
  if (!buyerAccount) instructions.push(ataIx[1]);
  const tokenAccount = buyerAccount ? await getAccount(connection, buyerAta) : null;
  const currentSupply = tokenAccount?.amount ?? 0n;
  if (currentSupply < BigInt(INITIAL_SUPPLY)) {
    instructions.push(createMintToInstruction(mint, buyerAta, vendor.publicKey, BigInt(INITIAL_SUPPLY) - currentSupply));
  }
  const buyerSol = await connection.getBalance(buyer.publicKey);
  if (buyerSol < BUYER_SOL) {
    instructions.push(SystemProgram.transfer({ fromPubkey: vendor.publicKey, toPubkey: buyer.publicKey, lamports: BUYER_SOL - buyerSol }));
  }
  if (instructions.length) await sendAndConfirmTransaction(connection, new Transaction().add(...instructions), [vendor]);
  const result = { mint: mint.toBase58(), vendor: vendor.publicKey.toBase58(), buyer: buyer.publicKey.toBase58() };
  await writeFile(CONFIG_PATH, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => { console.error(`ERROR: ${error.message}`); process.exitCode = 2; });
