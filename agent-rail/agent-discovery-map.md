> ⚠️ **2026-09-17 深度研究后修正**（见 agent-discovery-research.html）：llms.txt 实测被主流爬虫冷落（采用率~10%），降为 P2 顺手项；**新增最高杠杆项：Schema.org JSON-LD 结构化数据**；MCP Registry（官方 REST API `GET /v0.1/servers?search=`）上升为 P0。下文原排序保留作参考，以研究报告优先级为准。

# Agent 用户轨：让 AI 工作时检索到我们（发现机制全图）

> 核心认知：人类用 Google 搜索 → 看到广告和排名。
> Agent 检索服务走的是**另一套通道**，全部可以主动铺设，没有任何一条需要「求人转发」。

## 六条发现通道（按 agent 实际命中概率排序）

### 1. SKILL.md —— agent 的「能力自述文件」⭐ 已建
- 类似 robots.txt 的行业惯例：把 `SKILL.md` 放在服务域名根目录，任何 agent（Claude Code、OpenClaw、各种框架）读到它就**立刻知道你能干什么、怎么付钱买你**。
- PayanAgent 的原话：「Point any agent at it, feed the output to any LLM agent and it can buy immediately」。
- 我们的版本：`https://receipts域名/SKILL.md`（文件已写好，见 agent-rail/SKILL.md）。

### 2. MCP Server —— 装进 agent 的「工具箱」⭐ 下一个要建
- MCP（Model Context Protocol）是 agent 连接外部工具的标准协议。写一个 npm 包 `@agenttoll/receipts-mcp`，用户一条 `npx` 命令接入，之后 agent 在对话里就能直接「开回执 / 验回执」。
- 关键：**npm 包本身会被 AI 检索**——包名、README 关键词写好，agent 找「x402 receipt」时能命中。
- 前置：回执 endpoint 部署上线后接真实 API，骨架代码可先写。

### 3. Agent Card（A2A 协议）⭐ 已建
- 新兴标准：服务在 `/.well-known/agent-card.json` 公布自己的身份、技能、端点、计费方式。Agent 之间互相发现走这个（OnchainExpat 就是这么被 aifimap 收录的）。
- 我们的版本：agent-rail/agent-card.json，部署时放域名 `/.well-known/` 下。

### 4. x402 生态目录收录 —— 「摆摊」主战场 ⭐ 清单已建
| 目录 | 性质 | 提交方式 |
|---|---|---|
| **x402scan.com** | 生态最大的浏览器+市场 | 提交服务收录（被「Featured」= 最大流量口） |
| **AgentCash** | 3200+ API 的 agent 采购目录 | 商家列表流程，端点进目录后 agent 可直接检索购买 |
| **usdc.org/x402** | USDC 官方 x402 注册表 | 官网提交入口 |
| **x402list.fun** | 按链/类目筛选的目录 | 提交表单 |
| **Glama / PulseMCP / mcp.so** | MCP server 目录 | npm 包发布后自动/提交收录 |

### 5. llms.txt —— 给 AI 读的网站说明书 ⭐ 已建
- 新标准：域名根目录放 `llms.txt`，用 AI 易解析的格式描述站点。会读它的 agent 一步到位拿到全部信息。

### 6. GitHub / spec 的检索红利
- GitHub 是 AI 训练和检索权重最高的代码源。我们的 spec、SDK、README（英文关键词：x402 receipt, escrow, delivery verification, Solana）都会被 agent 检索命中。spec 已在库 ✅。

## 部署依赖说明

SKILL.md / agent-card.json / llms.txt 都是**静态文件**，等回执服务上线时放到域名根目录即可生效（占位域名 receipts.agenttoll.io，部署时可改）。MCP server 代码在 endpoint 定型后 1-2 天可出。

## 顺序

```
现在      四件套文件就位（本文 + SKILL.md + agent-card.json + llms.txt）
上线时    静态文件挂根目录 → 提交 5 个目录
+1 周     MCP server 上 npm → 收录 MCP 目录
持续      每次 spec 更新推 GitHub（检索红利）
```
