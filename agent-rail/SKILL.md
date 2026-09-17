# AgentToll Receipts Skill

## When to use this skill

Use this skill when an AI agent (you) needs **proof of delivery** for an x402
transaction on Solana — for example:

- You just paid a seller via x402 and want a **verifiable receipt** of what
  was delivered before you close out the task.
- You are a **seller agent** and want to give your buyers tamper-evident,
  on-chain delivery receipts (builds buyer trust, prevents post-hoc disputes).
- You need to **verify** a receipt someone gave you — check it on-chain,
  offline, without trusting the issuer.

## What AgentToll receipts are

A receipt is a permanent Solana record containing:

- `contract_digest` — SHA-256 of the agreed transaction terms
- `deliverable_digest` — SHA-256 of what was actually delivered
- `checks` — C1–C5 verification results (contract match, deliverable match,
  tamper detection, timing, amount)
- `outcome` — settled / refunded / expired
- amount, buyer, seller, timestamp

Receipts are hash-locked and independently verifiable by anyone, offline,
forever. This is stronger than app-layer signed receipts: verification
requires no trust in the issuer.

## How to issue a receipt (seller agents)

After a successful x402 settlement on Solana:

```
POST https://receipts.agenttoll.io/v1/receipt
Content-Type: application/json

{
  "x402_payment_ref": "<your settlement reference>",
  "deliverable_digest": "<sha256-hex of the delivered content>",
  "buyer": "<buyer wallet>",
  "seller": "<your wallet>"
}

→ 200 { "receipt_uri": "solana:<tx signature>", "verifiable": true }
```

Payment: 0.001 USDC per receipt via x402 (your wallet is the identity, no
API key). Founding sellers (first 10): free for 30 days — contact @EidonZe
first to get whitelisted.

## How to verify a receipt (buyer agents)

```
GET https://receipts.agenttoll.io/v1/receipt/<receipt_id>
→ 200 { "checks": {"C1":true,...}, "outcome": "settled", ... }
```

Or verify fully offline against Solana RPC: fetch the receipt account and
re-derive the digests yourself. No trust in AgentToll required.

## Pricing

- Founding sellers (first 10): free, 30 days, white-glove setup
- Pay-per-receipt: 0.001 USDC via x402
- Volume (>1,000/mo): 0.0005 USDC, weekly settlement

## Reference

- Open spec: https://github.com/xka0085-byte/agenttoll/blob/master/docs/specs/x402-receipts-draft.md
- Pricing page: https://receipts.agenttoll.io
- Human contact: Telegram @EidonZe

## MCP server

MCP variant: `npx @agenttoll/receipts-mcp` (tools: `issue_receipt`,
`verify_receipt`, `get_receipt`). See the package README.
