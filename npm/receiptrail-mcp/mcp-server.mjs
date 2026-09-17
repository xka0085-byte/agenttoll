#!/usr/bin/env node
// ReceiptRail MCP stdio wrapper — bridges stdio JSON-RPC to the remote ReceiptRail MCP endpoint.
// Lets MCP clients that only support stdio (e.g. older Claude Desktop configs) use ReceiptRail.
// Zero dependencies (Node 18+).
import { createInterface } from 'node:readline';

const REMOTE = process.env.RECEIPTRAIL_URL ?? 'https://agenttoll-receipts.app.workbuddy.host/mcp';

async function callRemote(method, params) {
  const res = await fetch(REMOTE, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(60000),
  });
  return res.json();
}

const rl = createInterface({ input: process.stdin });
const write = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);

rl.on('line', async (line) => {
  let rpc;
  try { rpc = JSON.parse(line); } catch { return; }
  if (rpc.method?.startsWith('notifications/')) return; // stateless remote; drop notifications
  try {
    const back = await callRemote(rpc.method, rpc.params);
    write({ jsonrpc: '2.0', id: rpc.id, ...(back.result ? { result: back.result } : { error: back.error ?? { code: -32603, message: 'remote error' } }) });
  } catch (error) {
    write({ jsonrpc: '2.0', id: rpc.id, error: { code: -32603, message: `receiptrail bridge error: ${error.message}` } });
  }
});
