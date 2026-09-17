# 铺路总清单：MCP/x402 目录提交作战表（2026-09-17 版）

> 依据：CorpusIQ 提交指南（2026-08-13 实测）+ MentionAgent 实测（2026-09-13，30 站点逐一核实）+ RoxyAPI Registry 指南。
> 铁律：**官方 Registry 先发，下游目录自动同步**——一次发布多处生效。每条提交记进下方日志表（URL/日期），季度复查防衰减。

## 第 0 步：官方 MCP Registry（P0，一切之源）

- 地址：`registry.modelcontextprotocol.io`
- 方式：`mcp-publisher` CLI 推 `server.json`（模板已备好：`agent-rail/server.json`）
- 命名空间二选一：
  - GitHub 登录 → `io.github.xka0085-byte/agenttoll-receipts`（个人项目适用，最快）
  - DNS TXT 记录 → 反向域名命名（公司感更强，等有域名再升级）
- **描述 ≤100 字符、能力优先**（这串字就是 agent 排序依据）；每个工具配「名称+标题+富描述」（干什么/返回什么/何时用）
- 发布前自检：向 endpoint 发 JSON-RPC `initialize` 握手，确认回显 protocolVersion + capabilities
- ⏳ 前置：endpoint 上线。文件已就绪。

## 第 1 层：自动同步（发布 Registry 后零工作量）

| 目录 | 机制 | 状态 |
|---|---|---|
| mcpservers.org | 镜像官方 Registry（也可 PR） | ⏳ 等 Registry |
| LobeHub（97k+） | 从 Registry/GitHub 自动拉 | ⏳ 自动 |
| PulseMCP | 提交暂停（2026-08 起），自动拉 Registry | ⏳ 自动 |
| 多语言聚合镜像站 | 自动 | ⏳ 自动 |

## 第 2 层：免费表单（endpoint 上线后一次性提交）

| 目录 | 方式 | 要点 | 状态 |
|---|---|---|---|
| **Glama.ai**（86k+，DR 最高） | Add Server 按钮，需账号；认领要 well-known 文件 | 会跑健康检查——**endpoint 必须活着** | ⬜ |
| **Smithery.ai**（715 精选） | CLI：`smithery mcp publish <url> -n agenttoll/receipts` | 有 vendor checklist 验证 | ⬜ |
| **MCP.Directory** | 表单贴 GitHub repo URL | 自动生成 Cursor/Claude/VS Code 安装配置；~24h 审核 | ⬜ |
| **FutureTools.io**（~3M 月访问） | 表单 + Cloudflare Turnstile | 真浏览器填表可自动过 | ⬜ |
| **Stork.AI** | 表单贴 repo 或远程端点 | **会真实跑 MCP 握手测试**——endpoint 死了会被打回 | ⬜ |
| **AgenticSkills.io** | 表单 | 安全审计向，~48h | ⬜ |
| **Cursor Directory** | GitHub PR 或网页 | Cursor 用户群 | ⬜ |
| **MCPHub** | GitHub | 开发者向 | ⬜ |

## 第 3 层：付费（暂缓，有收入再说）

- mcp.so：$39 一次（立即上+认证徽章+dofollow）
- mcpservers.org 加急：$39
- 判断：免费路径已够铺，**有第一笔外部收入后再买**

## 第 4 层：x402 生态目录（和 MCP 目录并行，别忘了这半边）

| 渠道 | 方式 | 状态 |
|---|---|---|
| **x402scan.com** | 提交服务收录（生态最大浏览器+市场） | ⬜ |
| **usdc.org/x402** | USDC 官方注册表，官网提交入口 | ⬜ |
| **AgentCash** | 商家列表流程（3200+ API 目录，Coinbase Wallet 在用） | ⬜ |
| **x402list.fun** | 提交表单 | ⬜ |
| **PayanAgent 聚合目录** | ⭐ 思路反转：它中继全生态 2.4 万服务、钱直达卖家——**把回执服务也挂上去**，蹭它的 agent 流量（它卖它的签名回执，我们卖链上回执，并存） | ⬜ |
| T3N listing page | 它有 startup program + listing page（9/20 开奖后跟进一步谈） | ⬜ |

## 第 5 层：GitHub / 内容检索面

- ✅ spec 已在库（检索词：x402 receipt, escrow, delivery verification, Solana）
- ⬜ `awesome-x402` 类 awesome list：搜 GitHub 上相关 list 提 PR（注意 awesome-mcp-servers 不收 PR，走 mcpservers.org/submit）
- ⬜ **Claude 官方 Connectors Directory**（claude.ai 内置）：独立于公共 Registry，有合规审核——最强卡位，MCP server 稳定运行后申请
- ⬜ ERC-8004 身份注册（2026-01-29 主网）：等部署后评估，agentutility 等已挂 agentId

## 提交日志（每次提交填一行）

| 日期 | 目录 | 用到的凭证/URL | 结果 |
|---|---|---|---|
| | | | |

## 通过审核的硬条件（CorpusIQ/MentionAgent 实测总结）

1. **真实可用的远程 endpoint**（Stork 类目录会跑活握手，死链直接拒）
2. 工具标注 `readOnlyHint`（只读工具更好过审、更被推荐）——issue_receipt 涉及写链上，标注里如实说明
3. README 含安装说明（多数目录直接抓 README）
4. 类目选窄不选宽（Finance/Payments 类竞争远小于 dev-tools）
5. 更新要 bump 版本号（Registry 更新按版本走）
