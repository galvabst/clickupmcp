import 'dotenv/config';
import express from 'express';
import { mcpRouter } from './mcp/router.js';
import { getTasks, getTask, getAllListsInSpace } from './clickup/client.js';
import { ClickUpApiError } from './clickup/client.js';
import { TEST_LIST_ID } from './config.js';

/** Process Automation space (for local testing of list-by-name). */
const TEST_SPACE_ID = '90153503821';

const PORT = Number(process.env.PORT) || 3000;

// Token nicht beim Start erzwingen: Healthcheck soll immer 200 liefern (Railway).
// Fehlender Token führt bei /test-tasks und MCP-Tools zu klarer Fehlermeldung.
if (!process.env.CLICKUP_TOKEN?.trim()) {
  console.warn('CLICKUP_TOKEN not set – /health OK, ClickUp tools will fail until set.');
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

/** Local testing: single task by ID. GET /test-task/86c6p1ach */
app.get('/test-task/:taskId', async (req, res) => {
  const taskId = req.params.taskId?.trim();
  if (!taskId) {
    res.status(400).json({ error: 'taskId required (e.g. /test-task/86c6p1ach)' });
    return;
  }
  try {
    const task = await getTask(taskId);
    res.status(200).json(task);
  } catch (err) {
    if (err instanceof ClickUpApiError) {
      if (err.statusCode === 401) res.status(401).json({ error: err.message });
      else if (err.statusCode === 404 || err.statusCode === 400) res.status(404).json({ error: err.message });
      else res.status(502).json({ error: err.message });
      return;
    }
    res.status(502).json({ error: err instanceof Error ? err.message : 'ClickUp API error' });
  }
});

/** Local testing: tasks from a list by name in a space. GET /test-tasks-by-list?list_name=Automatisierungen (space_id defaults to Process Automation). */
app.get('/test-tasks-by-list', async (req, res) => {
  const spaceId = (req.query.space_id as string)?.trim() || TEST_SPACE_ID;
  const listName = (req.query.list_name as string)?.trim();
  if (!listName) {
    res.status(400).json({
      error: 'Query param list_name required (e.g. ?list_name=Automatisierungen)',
      example: '/test-tasks-by-list?list_name=Automatisierungen',
    });
    return;
  }
  try {
    const lists = await getAllListsInSpace(spaceId);
    const nameLower = listName.toLowerCase();
    const found = lists.find((l) => (l.list_name ?? '').toLowerCase() === nameLower);
    if (!found) {
      res.status(404).json({
        error: `List "${listName}" not found in space ${spaceId}`,
        available: lists.map((l) => l.list_name),
      });
      return;
    }
    const data = await getTasks(found.list_id);
    res.status(200).json({ list_id: found.list_id, list_name: found.list_name, tasks: data.tasks ?? [] });
  } catch (err) {
    if (err instanceof ClickUpApiError) {
      if (err.statusCode === 401) res.status(401).json({ error: err.message });
      else if (err.statusCode === 404 || err.statusCode === 400) res.status(404).json({ error: err.message });
      else res.status(502).json({ error: err.message });
      return;
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
  console.log('  GET /test-tasks-by-list?list_name=... - tasks by list name in Process Automation space');
  console.log('  GET /test-task/:taskId - single task by ID (e.g. /test-task/86c6p1ach)');
  console.log('  MCP: Streamable HTTP at /mcp, legacy SSE at /mcp/sse and /mcp/message');
});
