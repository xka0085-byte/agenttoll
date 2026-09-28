# Glama.ai Dockerfile — runs the ReceiptRail stdio MCP bridge.
# The bridge (npm: receiptrail-mcp) proxies MCP calls to the hosted
# streamable-HTTP endpoint https://agenttoll-receipts.app.workbuddy.host/mcp
# Tools: issue_receipt · verify_receipt · get_receipt · verify_x402_receipt
FROM node:20-slim

WORKDIR /app

RUN npm install -g receiptrail-mcp@0.3.0

# stdio MCP server (Glama attaches stdio automatically)
ENTRYPOINT ["receiptrail-mcp"]
