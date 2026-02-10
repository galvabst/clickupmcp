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
    'list_clickup_lists_in_space',
    {
      description:
        'List ALL lists in a ClickUp space (all folders combined). Use this to find a list by name (e.g. "Automatisierungen") and get its list_id for get_clickup_tasks. Returns list_id, list_name, folder_name for each list.',
      inputSchema: {
        space_id: z.string().describe('ClickUp space ID (e.g. from list_clickup_spaces)'),
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
      description: 'List all folders in a ClickUp space.',
      inputSchema: {
        space_id: z.string().describe('ClickUp space ID'),
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
