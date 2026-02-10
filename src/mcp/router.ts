/**
 * Express router for MCP: Streamable HTTP at /mcp, legacy SSE at /sse and /message.
 * Mount at /mcp so Server URL in Lovable = https://your-app.up.railway.app/mcp
 */
import type { IncomingMessage } from 'node:http';
import { Router, Request, Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createMcpServer } from './server.js';

const router = Router();

// Session store for SSE (legacy) transport
const sseTransports: Record<string, SSEServerTransport> = {};

// Express Request extends IncomingMessage; SDK expects IncomingMessage & { auth?: AuthInfo }
function toNodeReq(req: Request): IncomingMessage {
  return req as unknown as IncomingMessage;
}

// ----- Streamable HTTP (stateless): POST and GET /mcp -----
async function handleStreamableRequest(req: Request, res: Response): Promise<void> {
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  try {
    await server.connect(transport);
    res.on('close', () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });
    await transport.handleRequest(toNodeReq(req), res, req.body);
  } catch (err) {
    console.error('MCP Streamable request error:', err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      });
    }
  }
}

router.get('/', handleStreamableRequest);
router.post('/', handleStreamableRequest);

// ----- Legacy SSE: GET /sse establishes stream, POST /message sends messages -----
// Full path for SSE message endpoint (router is mounted at /mcp)
const sseMessagePath = '/mcp/message';

router.get('/sse', async (_req: Request, res: Response) => {
  const transport = new SSEServerTransport(sseMessagePath, res);
  sseTransports[transport.sessionId] = transport;
  res.on('close', () => {
    delete sseTransports[transport.sessionId];
    transport.close().catch(() => {});
  });
  const server = createMcpServer();
  await server.connect(transport);
  await transport.start();
});

router.post('/message', async (req: Request, res: Response) => {
  const sessionId = req.query.sessionId as string | undefined;
  const transport = sessionId ? sseTransports[sessionId] : undefined;
  if (!transport) {
    res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'No transport found for sessionId' },
      id: null,
    });
    return;
  }
  await transport.handlePostMessage(toNodeReq(req), res, req.body);
});

export { router as mcpRouter };
