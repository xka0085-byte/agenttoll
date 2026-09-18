# 社媒帖中文对照版 — 对应 buildinpublic-001.md

> 英文是发出去的版本，中文仅供你核对每一句说了什么。

## 主帖（英文长帖）逐段对照

**Building in public:**
（公开构建：）

**I'm a solo builder. I built AgentToll — escrow + delivery receipts for the x402 agent economy — almost entirely with AI agents as my dev team.**
（我是一个 solo 开发者。我造了 AgentToll——x402 agent 经济的托管 + 交付回执——开发几乎全由 AI agents 组成的「我的开发团队」完成。）

**The gap: x402 settles payments, but it's pay-first. After the money moves, nobody guarantees delivery. Buyers only risk big money on sellers they already trust, so high-value deals between unknown agents never happen.**
（缺口：x402 负责结算付款，但它是先付模式。钱转出去之后，没人保证交付。买方只敢向已信任的卖家冒大额风险，所以陌生 agent 之间的高价值交易永远不会发生。）

**AgentToll fixes this:**
（AgentToll 这样解决：）

**→ buyer's payment locked in an on-chain escrow (Solana PDA)**
（→ 买方的付款锁定在链上托管账户里（Solana PDA））

**→ seller submits a SHA-256 digest of the deliverable**
（→ 卖家提交交付物的 SHA-256 指纹）

**→ on-chain verifier runs 5 checks, funds release only on match, auto-refund otherwise**
（→ 链上验证器执行 5 项检查，指纹全部匹配才放款，否则自动退款）

**→ every completed trade mints a permanent on-chain receipt — the raw data layer for agent reputation**
（→ 每笔完成的交易铸一张永久链上回执——agent 信誉的原始数据层）

**Rules are hash-locked too. Arbitration is math, not a company.**
（规则本身也用哈希锁死。裁决是数学，不是某家公司。）

**Just published the first draft of an open spec — x402-receipts-draft — proposing this as a standard extension to x402. If you build facilitators, wallets, or reputation systems on x402, I want your feedback: [draft link]**
（刚发布了开放规范的首版草案——x402-receipts-draft——提议将此作为 x402 的标准扩展。如果你在 x402 上构建清算商、钱包或信誉系统，我想要你的反馈：[链接]）

**Submitting to Colosseum's Crypto World's Fair this month.**
（本月将提交 Colosseum 的 Crypto World's Fair。）

**Telegram: @EidonZe**

## 短版对照

> x402 moves the money. Nobody guarantees the delivery.
> （x402 负责挪钱。没人保证交付。）
>
> I built AgentToll: on-chain escrow (Solana PDA) + SHA-256 delivery verification + permanent receipts for every agent trade. Just published the first open spec draft — x402-receipts-draft. Feedback wanted.
> （我造了 AgentToll：链上托管（Solana PDA）+ SHA-256 交付验证 + 每笔 agent 交易的永久回执。刚发布开放规范首版草案 x402-receipts-draft，征集反馈。）
>
> Arbitration is math, not a company.
> （裁决是数学，不是公司。）

## 发布 checklist（照抄执行）

1. spec 链接已可用：`https://github.com/xka0085-byte/agenttoll/blob/master/docs/specs/x402-receipts-draft.md`，把主帖里的 [draft link] 替换为这个链接
2. 建议发布时间：北京时间 **21:00–23:00**（欧美上午，x402 开发者活跃时段）
3. 先发长版主帖，2–4 小时后用短版自转评一条（增加曝光）
4. 发出后把链接发我，我把它登记进 Colosseum 表单的 evidence 链接池（评审看到 spec + 实现都在，含金量翻倍）
