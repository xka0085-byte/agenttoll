# AgentToll W2 verifier

离线验证器只依赖公开 Solana RPC、本地报告文件和 Node.js 内置 `crypto`，不连接 AgentToll 服务，也不依赖 Anchor 客户端或 npm borsh 包。

## 安装

```bash
cd verifier
npm install
```

运行环境要求 Node.js 22 或更高版本。运行时依赖只有 `@solana/web3.js`。

## 验证报告

```bash
node verifier/verify.mjs \
  --url https://api.devnet.solana.com \
  --vendor <VENDOR_PUBKEY> \
  --report-id <ID> \
  --file verifier/example-report.json \
  --out receipt-pass.json
```

不绑定文件内容时省略 `--file`：

```bash
node verifier/verify.mjs --url https://api.devnet.solana.com --vendor <VENDOR_PUBKEY> --report-id <ID>
```

也可以额外要求链上 vendor 与预期公钥一致：

```bash
node verifier/verify.mjs --url https://api.devnet.solana.com --vendor <VENDOR_PUBKEY> --vendor-expected <VENDOR_PUBKEY> --report-id <ID>
```

`stdout` 输出固定 JSON 回执。全部 C1-C5 通过时退出码为 0；任意检查失败时退出码为 1；参数、RPC 或文件读取异常时退出码为 2。

C3 的 schema 判定：账户数据长度必须恰好为 **117 字节**（W1 程序按 `8 + Receipt::INIT_SPACE` 固定预分配，report_id 短于 32 字节时尾部为未使用的零字节），同时 Anchor discriminator 与字段布局解析通过。

## 五项检查

- C1：账户存在且 owner 是 AgentToll 程序。
- C2：用 `receipt`、vendor 和 report ID 重算 PDA，并核对账户内 bump。
- C3：现算 Anchor `Receipt` discriminator，手写解析 Borsh 布局，并拒绝多余尾部字节。
- C4：可选地对报告原始字节计算 SHA-256，并与链上 digest 比对。
- C5：检查 `created_at <= 当前 UTC 时间 + 120 秒`；提供 `--vendor-expected` 时同时核对 vendor。

能力复现命令：

```bash
node verifier/verify.mjs --url <RPC_URL> --vendor <VK> --report-id <ID> --file verifier/example-report.json
printf 'tampered' >> verifier/example-report.json
node verifier/verify.mjs --url <RPC_URL> --vendor <VK> --report-id <ID> --file verifier/example-report.json
```

第二条命令应使 C4 失败并返回退出码 1。不要在共享仓库中保留篡改后的示例文件；验证后恢复它：

```bash
git checkout -- verifier/example-report.json
```

## 安全边界

验证器不读取私钥。创建演示回执的脚本只从 `AGENTTOLL_KEYPAIR` 环境变量读取 keypair 文件路径，keypair 文件不得加入 git。
