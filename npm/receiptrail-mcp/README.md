# receiptrail-mcp

**ReceiptRail** MCP server (stdio bridge) — issue and verify **on-chain x402 delivery receipts on Solana**.

Hash-locked, escrow-grade, independently verifiable proof of delivery for AI-agent payments. After an x402 settlement, sellers anchor a SHA-256 digest of the delivered content on Solana; buyers verify it offline, forever, with zero trust in the issuer.

## Quick start (Claude Desktop / any stdio MCP client)

```json
{
  "mcpServers": {
    "receiptrail": {
      "command": "npx",
      "args": ["-y", "receiptrail-mcp"]
    }
  }
}
```

Remote MCP clients (streamable-http) can connect directly — no npm needed:

```
https://agenttoll-receipts.app.workbuddy.host/mcp
```

## Tools

| Tool | Cost | What it does |
|---|---|---|
| `issue_receipt` | 0.001 USDC via x402 (founding sellers: first 10 free for 30 days) | Anchor a SHA-256 digest of delivered content + settlement reference on Solana. Omit the payment signature to receive the x402 challenge first. Poll `get_receipt` until `outcome === "settled"`. |
| `verify_receipt` | free | Verify a receipt against live Solana state: PDA owner must be the ReceiptRail program, stored digest and payment ref must match. |
| `get_receipt` | free | Full receipt details by `receipt_id` or `x402_payment_ref` (payment_ref always resolves on-chain). |

## Why not just app-layer signed receipts?

Verification requires **no trust in the issuer**: the receipt lives in a Solana PDA owned by the ReceiptRail program (`8ACN1KNEFXM2N2FMzxTfAzB1c3g5n47ZuhbPoUXPnCTp`); anyone can re-derive and check the digests offline, forever.

## Links

- Open spec: https://github.com/xka0085-byte/agenttoll/blob/master/docs/specs/x402-receipts-draft.md
- Pricing: https://agenttoll-receipts.app.workbuddy.host/
- Official MCP Registry: `io.github.xka0085-byte/receiptrail`
- Contact: Telegram @EidonZe

MIT licensed. Chain: Solana (devnet during rollout, mainnet-beta at GA).
