# ReceiptRail Skill (x402 Delivery Receipts on Solana)

ReceiptRail (formerly "AgentToll Receipts") is an on-chain delivery-receipt
service for the x402 ecosystem on Solana.

## When to use this skill

Use this skill when an AI agent (you) needs **proof of delivery** for an x402
transaction on Solana — for example:

- You just paid a seller via x402 and want a **verifiable receipt** of what
  was delivered before you close out the task.
- You are a **seller agent** and want to give your buyers tamper-evident,
  on-chain delivery receipts (builds buyer trust, prevents post-hoc disputes).
- You need to **verify** a receipt someone gave you — check it on-chain,
  offline, without trusting the issuer.

## What ReceiptRail receipts are

A receipt is a permanent Solana record containing:

- `contract_digest` — SHA-256 of the agreed transaction terms
- `deliverable_digest` — SHA-256 of what was actually delivered
- `checks` — C1–C5 verification results (contract match, deliverable match,
  tamper detection, timing, amount)
- `outcome` — settled / pending / failed
- amount, buyer, seller, timestamp

Receipts are hash-locked and independently verifiable by anyone, offline,
forever. This is stronger than app-layer signed receipts: verification
requires no trust in the issuer.

## Fastest path: MCP (recommended for agents)

MCP endpoint (streamable-http, no auth needed):

```
https://agenttoll-receipts.app.workbuddy.host/mcp
```

Tools: `issue_receipt` (returns an x402 payment challenge if you have not
paid yet), `verify_receipt`, `get_receipt` (look up by receipt_id or
x402_payment_ref — receipts are recoverable on-chain via payment_ref).

Official registry entry: `io.github.xka0085-byte/receiptrail`

## REST path (no MCP client)

Step 1 — request a challenge:

```
POST https://agenttoll-receipts.app.workbuddy.host/v1/receipt
Content-Type: application/json

{ "x402_payment_ref": "<unique ref>", "deliverable_digest": "<sha256-hex>" }

→ 402 { "challenge": { "vendor": "<service wallet>", "amount": "1000",
         "mint": "<USDC mint>", "decimals": 6 } }
```

Step 2 — pay 0.001 USDC (1000 units, 6 decimals) to the vendor wallet, then
call again with the payment tx signature:

```
POST .../v1/receipt
X-Payment-Signature: <payment tx signature>

→ 202 { "receipt_id": "r_...", "outcome": "pending", "pda": "<PDA address>" }
```

Step 3 — poll until settled:

```
GET https://agenttoll-receipts.app.workbuddy.host/v1/receipt/<receipt_id>
→ 200 { "outcome": "settled", "receipt_uri": "solana:<tx>", "pda": "<PDA>" }
```

Founding sellers (first 10): free for 30 days — contact @EidonZe first.

## How to verify a receipt (buyer agents)

Call `verify_receipt` via MCP, or verify fully offline: fetch the PDA account
(its owner must be the ReceiptRail program `8ACN1KNEFXM2N2FMzxTfAzB1c3g5n47ZuhbPoUXPnCTp`)
and re-derive the digests yourself. No trust in ReceiptRail required.

## Pricing

- Founding sellers (first 10): free, 30 days, white-glove setup
- Pay-per-receipt: 0.001 USDC via x402
- Volume (>1,000/mo): 0.0005 USDC, weekly settlement

## Reference

- Open spec: https://github.com/xka0085-byte/agenttoll/blob/master/docs/specs/x402-receipts-draft.md
- Pricing page: https://agenttoll-receipts.app.workbuddy.host/
- Human contact: Telegram @EidonZe
