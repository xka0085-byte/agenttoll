# x402 Delivery Receipts & Escrow Extension (Draft)

- **Draft ID:** x402-receipts-draft-0
- **Author:** Eidon (@EidonZe), AgentToll
- **Status:** Draft — open for community feedback
- **Target:** x402 protocol extension (settlement/verification layer)
- **Date:** 2026-09-17

---

## 1. Abstract

This draft proposes an optional extension to the x402 protocol that adds
**delivery receipts with on-chain escrow and verification** to agent
transactions. x402 solves the declaration and settlement of payment; it
deliberately does not guarantee that the seller delivers what was promised.
This extension fills that gap: payments are held in escrow, delivery is
verified against content digests, and every completed transaction produces a
**permanent, tamper-evident on-chain receipt**.

## 2. Motivation

x402 is pay-first: the agent pays, then retries the request. This creates an
asymmetry — the buyer bears all delivery risk. Consequences today:

1. **Value ceiling.** Buyers only risk large amounts on sellers they already
   trust. High-value deals with unknown counterparties cannot happen.
2. **No dispute resolution.** Agents transact at machine speed and volume;
   humans cannot arbitrate. There is no neutral record of *what was agreed*
   and *what was delivered*.
3. **No reputation substrate.** Credit/reputation systems emerging in the
   ecosystem need a raw data layer of verified transactions. Nothing
   standardized provides one.

This extension is **opt-in and additive**: transactions that don't need it
continue exactly as today.

## 3. Terminology

| Term | Meaning |
|---|---|
| **Escrow** | A neutral holding account. Funds are locked until verification passes or the transaction is refunded. |
| **Contract digest** | `SHA-256` over the canonical transaction terms (what, price, deliverable spec). Locked before payment. |
| **Deliverable digest** | `SHA-256` over the delivered content, submitted by the seller at delivery time. |
| **Verifier** | On-chain program that compares digests and releases or refunds escrow. |
| **Receipt** | The permanent on-chain record of a completed transaction. |
| **DigestConflict** | Error raised when any digest check fails — the signal that terms were altered or delivery does not match. |

## 4. Transaction Lifecycle

```
INTENT     buyer + seller agree on terms; contract digest locked on-chain
ESCROW     buyer pays into escrow (not to seller)
DELIVER    seller delivers content off-chain; submits deliverable digest on-chain
VERIFY     verifier runs checks C1–C5
SETTLE     all pass → funds released to seller; receipt minted
           any fail → automatic refund; failure recorded
```

## 5. Verification Checks (C1–C5)

| Check | Question it answers |
|---|---|
| C1 contract match | Does the live agreement still hash to the locked contract digest? |
| C2 deliverable match | Does the delivered content hash to the promised deliverable digest? |
| C3 tamper detection | Were the terms altered after escrow? (violation raises `DigestConflict`) |
| C4 timing | Did delivery occur within the agreed deadline? |
| C5 amount | Does the settled amount match the agreed price? |

Note the scope: digest verification proves **identity and integrity** — the
delivered bytes are exactly what both parties agreed to. It does not judge
subjective quality; quality assurance belongs to the application layer, and
the receipt records it as such. This keeps the verifier minimal, cheap, and
unopinionated.

## 6. Receipt Schema (v0)

```json
{
  "receipt_version": 1,
  "x402_payment_ref": "<x402 settlement reference>",
  "buyer": "<wallet address>",
  "seller": "<wallet address>",
  "contract_digest": "<sha256-hex>",
  "deliverable_digest": "<sha256-hex>",
  "checks": { "C1": true, "C2": true, "C3": true, "C4": true, "C5": true },
  "outcome": "settled | refunded | expired",
  "amount": { "value": "0.001", "asset": "USDC", "chain": "solana" },
  "timestamp": "<unix>",
  "uri": "<optional pointer to full terms>"
}
```

Receipts are content-addressed and immutable. They are designed to be the
**raw data layer** for ecosystem reputation/credit systems — any scorer can
build on receipts without trusting any single facilitator.

## 7. Relationship to x402

- **No changes to the core protocol.** The 402 flow is untouched.
- The extension hooks in at the settlement layer, analogous to existing
  facilitator extension points: a buyer agent signals escrow support in its
  payment intent; a seller that accepts settles through the escrow verifier
  instead of direct settlement.
- Sellers need zero integration to receive escrowed payments — settlement
  arrives as a normal transfer, plus a receipt.

## 8. Security Considerations

- Escrow accounts must be program-controlled (no human key can withdraw).
- Digest pre-image resistance prevents forging deliverables to match a locked
  digest; canonicalization of terms must be specified to avoid
  serialization ambiguity (see open question Q1).
- Refund paths must be time-bounded to prevent escrow lock-up griefing.

## 9. Reference Implementation

AgentToll implements this draft on **Solana**, using Program Derived
Accounts (PDAs) for escrow and an on-chain verifier for C1–C5. It is live
and tested as a Colosseum Crypto World's Fair submission:
repo `xka0085-byte/agenttoll`.

## 10. Open Questions

- **Q1:** Canonical serialization of contract terms for digesting (JSON
  canonical form? CBOR?).
- **Q2:** Should partial delivery (multi-item orders) mint partial receipts?
- **Q3:** Receipt privacy — should digests be salted for sensitive payloads?
- **Q4:** Cross-chain receipts: one receipt per chain, or a bridged registry?

## 11. Call for Feedback

This draft is deliberately early. If you build facilitators, agent wallets,
marketplaces, or reputation systems on x402: **what would you need from a
receipt layer?** Open an issue or reach me on Telegram `@EidonZe`.

---

*AgentToll — delivery receipts for the agent economy. Escrow wins the first
sale; receipts win every sale after.*
