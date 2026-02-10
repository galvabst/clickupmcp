import 'dotenv/config';
import express from 'express';
import { mcpRouter } from './mcp/router.js';
import { getTasks } from './clickup/client.js';
import { ClickUpApiError } from './clickup/client.js';
import { TEST_LIST_ID } from './config.js';

const PORT = Number(process.env.PORT) || 3000;

if (!process.env.CLICKUP_TOKEN?.trim()) {
  console.error('CLICKUP_TOKEN is required. Set it in .env or environment.');
  process.exit(1);
}

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'clickup-mcp-server',
  });
});

/** Local testing: GET tasks from the list ID in src/config.ts (TEST_LIST_ID) */
app.get('/test-tasks', async (_req, res) => {
  if (!TEST_LIST_ID.trim()) {
    res.status(400).json({
      error: 'Set TEST_LIST_ID in src/config.ts (List ID from ClickUp URL: .../v/li/<id>)',
    });
    return;
  }
  try {
    const data = await getTasks(TEST_LIST_ID);
    res.status(200).json({ tasks: data.tasks ?? [] });
  } catch (err) {
    if (err instanceof ClickUpApiError) {
      if (err.statusCode === 401) {
        res.status(401).json({ error: err.message });
        return;
      }
      if (err.statusCode === 403 || err.statusCode === 404) {
        res.status(404).json({ error: err.message });
        return;
      }
      if (err.statusCode === 429) {
        res.status(429).json({ error: err.message });
        return;
      }
    }
    res.status(502).json({ error: err instanceof Error ? err.message : 'ClickUp API error' });
  }
});

app.use('/mcp', mcpRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err: Error, _req: express.Request, res: express.Response) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`ClickUp MCP Server listening on port ${PORT}`);
  console.log('  GET /health - health check');
  console.log('  GET /test-tasks - fetch tasks from TEST_LIST_ID (local testing)');
  console.log('  MCP: Streamable HTTP at /mcp, legacy SSE at /mcp/sse and /mcp/message');
});
