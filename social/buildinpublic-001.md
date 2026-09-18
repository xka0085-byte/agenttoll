# Build-in-public 帖子（X 用）— 给 Eidon 审

## 主帖（英文，X 长帖格式）

---

Building in public:

I'm a solo builder. I built **AgentToll** — escrow + delivery receipts for the x402 agent economy — almost entirely with AI agents as my dev team.

The gap: x402 settles payments, but it's pay-first. After the money moves, nobody guarantees delivery. Buyers only risk big money on sellers they already trust, so high-value deals between unknown agents never happen.

AgentToll fixes this:

→ buyer's payment locked in an on-chain escrow (Solana PDA)
→ seller submits a SHA-256 digest of the deliverable
→ on-chain verifier runs 5 checks, funds release only on match, auto-refund otherwise
→ every completed trade mints a permanent on-chain receipt — the raw data layer for agent reputation

Rules are hash-locked too. Arbitration is math, not a company.

Just published the first draft of an open spec — `x402-receipts-draft` — proposing this as a standard extension to x402. If you build facilitators, wallets, or reputation systems on x402, I want your feedback:

[draft link]

Submitting to Colosseum's Crypto World's Fair this month.

Telegram: @EidonZe

---

## 短版（普通推文格式， repost 用）

x402 moves the money. Nobody guarantees the delivery.

I built AgentToll: on-chain escrow (Solana PDA) + SHA-256 delivery verification + permanent receipts for every agent trade. Just published the first open spec draft — `x402-receipts-draft`. Feedback wanted.

Arbitration is math, not a company.

---

## 中文备忘（不用发，给你自己核对用）

- 核心卖点顺序：缺口（pay-first 没人管交付）→ 机制（托管/指纹/五查/回执）→ 诚实叙事（solo + AI dev team，这是我们一贯的诚实牌）→ CTA（征集 spec 反馈，inbound 触达）
- 「almost entirely with AI agents as my dev team」是加分叙事不丢人，别删
- 发之前把 [draft link] 换成 spec 的 GitHub 链接（需要先把 spec 推到仓库）
- 建议发布时间：欧美上午 = 北京时间 21:00-24:00，或北美早晨 = 北京 21-23 点左右效果最好
