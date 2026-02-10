/**
 * MCP server with ClickUp tools. One instance per connection (stateless Streamable or per SSE session).
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  getTeams,
  getSpaces,
  getFolders,
  getLists,
  getTasks,
  getTask,
  getAllListsInSpace,
  ClickUpApiError,
} from '../clickup/client.js';

function toolResultText(content: string) {
  return { content: [{ type: 'text' as const, text: content }] };
}

function toolResultError(message: string) {
  return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
}

export function createMcpServer(): McpServer {
  const server = new McpServer(
    { name: 'clickup-mcp-server', version: '1.0.0' },
    { capabilities: {} }
  );

  server.registerTool(
    'get_clickup_task',
    {
      description:
        'FASTEST: Get one task by task_id. Use whenever the user has a task link (e.g. https://app.clickup.com/t/86c6p1ach → task_id 86c6p1ach) or task ID. One API call, no list_id or space_id needed. Returns full task (name, status, description, list context). Prefer this over list-based search when a task ID is available.',
      inputSchema: {
        task_id: z.string().describe('ClickUp task ID: from URL path after /t/ (e.g. 86c6p1ach) or from API'),
      },
    },
    async (args) => {
      try {
        const task = await getTask(args.task_id);
        return toolResultText(JSON.stringify(task, null, 2));
      } catch (err) {
        if (err instanceof ClickUpApiError) {
          if (err.statusCode === 404 || err.statusCode === 400) {
            return toolResultError('Task not found or invalid task_id');
          }
          return toolResultError(err.message);
        }
        return toolResultError(String(err));
      }
    }
  );

  server.registerTool(
    'get_clickup_tasks',
    {
      description: 'Get tasks from a ClickUp list. Optionally filter by status or page.',
      inputSchema: {
        list_id: z.string().describe('ClickUp list ID'),
        page: z.number().optional().describe('Page number (0-based, for pagination)'),
        status: z.string().optional().describe('Filter by status name'),
      },
    },
    async (args) => {
      try {
        const data = await getTasks(args.list_id, {
          page: args.page,
          status: args.status,
        });
        return toolResultText(JSON.stringify(data.tasks ?? [], null, 2));
      } catch (err) {
        if (err instanceof ClickUpApiError) {
          return toolResultError(err.message);
        }
        return toolResultError(String(err));
      }
    }
  );

  server.registerTool(
    'get_clickup_tasks_by_list_name',
    {
      description:
        'Get all tasks from a list by list name in a space. Includes folderless lists (e.g. "Automatisierungen" in Process Automation space_id 90153503821). One call; no need to walk folders or know list_id.',
      inputSchema: {
        space_id: z.string().describe('ClickUp space ID (e.g. 90153503821 for Process Automation)'),
        list_name: z.string().describe('Exact list name: e.g. "Automatisierungen", "Generelle Prozesse"'),
        page: z.number().optional().describe('Page number (0-based)'),
        status: z.string().optional().describe('Filter by status name'),
      },
    },
    async (args) => {
      try {
        const lists = await getAllListsInSpace(args.space_id);
        const nameLower = args.list_name.trim().toLowerCase();
        const found = lists.find((l) => (l.list_name ?? '').toLowerCase() === nameLower);
        if (!found) {
          const names = lists.map((l) => l.list_name).join(', ');
          return toolResultError(
            `List "${args.list_name}" not found in space. Available lists: ${names || '(none)'}`
          );
        }
        const data = await getTasks(found.list_id, {
          page: args.page,
          status: args.status,
        });
        return toolResultText(
          JSON.stringify({ list_id: found.list_id, list_name: found.list_name, tasks: data.tasks ?? [] }, null, 2)
        );
      } catch (err) {
        if (err instanceof ClickUpApiError) {
          return toolResultError(err.message);
        }
        return toolResultError(String(err));
      }
    }
  );

  server.registerTool(
    'list_clickup_lists_in_space',
    {
      description:
        'List ALL lists in a space: folderless lists (e.g. "Automatisierungen") plus lists inside folders. Returns list_id, list_name, folder_name (or "folderless"). Use to find list_id by name or to see available list names for get_clickup_tasks_by_list_name.',
      inputSchema: {
        space_id: z.string().describe('ClickUp space ID (e.g. 90153503821 for Process Automation)'),
      },
    },
    async (args) => {
      try {
        const lists = await getAllListsInSpace(args.space_id);
        return toolResultText(JSON.stringify(lists, null, 2));
      } catch (err) {
        if (err instanceof ClickUpApiError) {
          if (err.statusCode === 404 || err.statusCode === 400) {
            return toolResultError('Space not found or invalid space_id');
          }
          return toolResultError(err.message);
        }
        return toolResultError(String(err));
      }
    }
  );

  server.registerTool(
    'list_clickup_lists',
    {
      description: 'List all lists in a ClickUp folder (project).',
      inputSchema: {
        folder_id: z.string().describe('ClickUp folder ID'),
      },
    },
    async (args) => {
      try {
        const data = await getLists(args.folder_id);
        return toolResultText(JSON.stringify(data.lists ?? [], null, 2));
      } catch (err) {
        if (err instanceof ClickUpApiError) {
          if (err.statusCode === 404 || err.statusCode === 400) {
            return toolResultError('Folder not found or invalid folder_id');
          }
          return toolResultError(err.message);
        }
        return toolResultError(String(err));
      }
    }
  );

  server.registerTool(
    'list_clickup_folders',
    {
      description:
        'List all folders in a ClickUp space. Parameter is space_id (not folder_id). Use list_clickup_spaces to get space IDs.',
      inputSchema: {
        space_id: z.string().describe('ClickUp space ID (from list_clickup_spaces)'),
      },
    },
    async (args) => {
      try {
        const data = await getFolders(args.space_id);
        return toolResultText(JSON.stringify(data.folders ?? [], null, 2));
      } catch (err) {
        if (err instanceof ClickUpApiError) {
          if (err.statusCode === 404 || err.statusCode === 400) {
            return toolResultError('Space not found or invalid space_id');
          }
          return toolResultError(err.message);
        }
        return toolResultError(String(err));
      }
    }
  );

  server.registerTool(
    'list_clickup_spaces',
    {
      description: 'List all spaces in a ClickUp team (workspace).',
      inputSchema: {
        team_id: z.string().describe('ClickUp team ID (workspace). Use list_clickup_teams to get team IDs.'),
      },
    },
    async (args) => {
      try {
        const data = await getSpaces(args.team_id);
        return toolResultText(JSON.stringify(data.spaces ?? [], null, 2));
      } catch (err) {
        if (err instanceof ClickUpApiError) {
          if (err.statusCode === 404 || err.statusCode === 400) {
            return toolResultError('Team not found or invalid team_id');
          }
          return toolResultError(err.message);
        }
        return toolResultError(String(err));
      }
    }
  );

  server.registerTool(
    'list_clickup_teams',
    {
      description: 'List ClickUp teams (workspaces) the token has access to. Use the first team id for list_clickup_spaces if you have one workspace.',
      inputSchema: {},
    },
    async () => {
      try {
        const data = await getTeams();
        return toolResultText(JSON.stringify(data.teams ?? [], null, 2));
      } catch (err) {
        if (err instanceof ClickUpApiError) {
          return toolResultError(err.message);
        }
        return toolResultError(String(err));
      }
    }
  );

  return server;
}
