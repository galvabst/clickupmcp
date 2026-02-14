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
  getTaskComments,
  createTaskComment,
  updateComment,
  deleteComment,
  createTask,
  updateTask,
  deleteTask,
  createSubtask,
  getAllListsInSpace,
  buildTaskContext,
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
        'Get full task by task_id: name, status, description/text_content, list, assignees, custom fields, attachments. Set include_subtasks=true for Unteraufgaben. Enthält keine Kommentare (dafür get_clickup_task_comments); Activity-Log ist über die API nicht verfügbar. Für klaren Kontext (nur Task + Beschreibung + Unteraufgaben) get_clickup_task_context nutzen.',
      inputSchema: {
        task_id: z.string().min(1).describe('ClickUp task ID (e.g. from URL .../t/86c6p1ach)'),
        include_subtasks: z.boolean().optional().describe('If true, response includes Unteraufgaben (subtasks) array'),
      },
    },
    async (args) => {
      try {
        const task = await getTask(args.task_id, { include_subtasks: args.include_subtasks });
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
    'get_clickup_task_context',
    {
      description:
        'Task-Kontext für den Agent: strukturiert task (id, name, status, list), beschreibung (description/text_content/markdown), unteraufgaben (id, name, status). Enthält bewusst keine Kommentare und keine Activities; für Kommentare get_clickup_task_comments nutzen.',
      inputSchema: {
        task_id: z.string().min(1).describe('ClickUp task ID'),
        include_subtasks: z.boolean().optional().describe('Include Unteraufgaben (default true)'),
      },
    },
    async (args) => {
      try {
        const includeSubtasks = args.include_subtasks !== false;
        const task = await getTask(args.task_id, {
          include_subtasks: includeSubtasks,
          include_markdown_description: true,
        });
        const ctx = buildTaskContext(task);
        return toolResultText(JSON.stringify(ctx, null, 2));
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
    'get_clickup_task_comments',
    {
      description: 'Get comments for a task (newest first). Optional pagination: start (timestamp ms), start_id from last comment.',
      inputSchema: {
        task_id: z.string().describe('ClickUp task ID'),
        start: z.number().optional().describe('Pagination: timestamp in ms'),
        start_id: z.string().optional().describe('Pagination: id of last comment from previous page'),
      },
    },
    async (args) => {
      try {
        const data = await getTaskComments(args.task_id, {
          start: args.start,
          start_id: args.start_id,
        });
        return toolResultText(JSON.stringify(data.comments ?? [], null, 2));
      } catch (err) {
        if (err instanceof ClickUpApiError) {
          return toolResultError(err.message);
        }
        return toolResultError(String(err));
      }
    }
  );

  server.registerTool(
    'create_clickup_comment',
    {
      description: 'Add a comment to a task.',
      inputSchema: {
        task_id: z.string().describe('ClickUp task ID'),
        comment_text: z.string().describe('Comment content (plain text)'),
      },
    },
    async (args) => {
      try {
        const comment = await createTaskComment(args.task_id, args.comment_text);
        return toolResultText(JSON.stringify(comment, null, 2));
      } catch (err) {
        if (err instanceof ClickUpApiError) {
          return toolResultError(err.message);
        }
        return toolResultError(String(err));
      }
    }
  );

  server.registerTool(
    'update_clickup_comment',
    {
      description: 'Update an existing comment by comment_id (from get_clickup_task_comments).',
      inputSchema: {
        comment_id: z.string().describe('ClickUp comment ID'),
        comment_text: z.string().describe('New comment content'),
      },
    },
    async (args) => {
      try {
        const comment = await updateComment(args.comment_id, args.comment_text);
        return toolResultText(JSON.stringify(comment, null, 2));
      } catch (err) {
        if (err instanceof ClickUpApiError) {
          return toolResultError(err.message);
        }
        return toolResultError(String(err));
      }
    }
  );

  server.registerTool(
    'delete_clickup_comment',
    {
      description: 'Delete a comment by comment_id.',
      inputSchema: {
        comment_id: z.string().describe('ClickUp comment ID'),
      },
    },
    async (args) => {
      try {
        await deleteComment(args.comment_id);
        return toolResultText('Comment deleted.');
      } catch (err) {
        if (err instanceof ClickUpApiError) {
          return toolResultError(err.message);
        }
        return toolResultError(String(err));
      }
    }
  );

  server.registerTool(
    'get_clickup_subtasks',
    {
      description:
        'Unteraufgaben eines Tasks abrufen. Liefert den Parent-Task inkl. subtasks-Array (id, name, status, …). Enthält keine Kommentare/Activities.',
      inputSchema: {
        task_id: z.string().min(1).describe('Parent task ID'),
      },
    },
    async (args) => {
      try {
        const task = await getTask(args.task_id, { include_subtasks: true });
        return toolResultText(JSON.stringify(task, null, 2));
      } catch (err) {
        if (err instanceof ClickUpApiError) {
          return toolResultError(err.message);
        }
        return toolResultError(String(err));
      }
    }
  );

  server.registerTool(
    'create_clickup_task',
    {
      description: 'Create a new task in a list. Für Unteraufgabe create_clickup_subtask verwenden.',
      inputSchema: {
        list_id: z.string().describe('ClickUp list ID'),
        name: z.string().describe('Task name'),
        description: z.string().optional().describe('Task description'),
        status: z.string().optional().describe('Status name'),
        priority: z.number().optional().describe('1=Urgent, 2=High, 3=Normal, 4=Low'),
      },
    },
    async (args) => {
      try {
        const task = await createTask(args.list_id, {
          name: args.name,
          description: args.description,
          status: args.status,
          priority: args.priority,
        });
        return toolResultText(JSON.stringify(task, null, 2));
      } catch (err) {
        if (err instanceof ClickUpApiError) {
          return toolResultError(err.message);
        }
        return toolResultError(String(err));
      }
    }
  );

  server.registerTool(
    'create_clickup_subtask',
    {
      description: 'Unteraufgabe unter einem Parent-Task anlegen. Nur name nötig; Liste wird vom Parent übernommen.',
      inputSchema: {
        parent_task_id: z.string().describe('Parent task ID'),
        name: z.string().describe('Name der Unteraufgabe'),
        description: z.string().optional().describe('Beschreibung der Unteraufgabe'),
      },
    },
    async (args) => {
      try {
        const task = await createSubtask(
          args.parent_task_id,
          args.name,
          args.description
        );
        return toolResultText(JSON.stringify(task, null, 2));
      } catch (err) {
        if (err instanceof ClickUpApiError) {
          return toolResultError(err.message);
        }
        return toolResultError(String(err));
      }
    }
  );

  server.registerTool(
    'update_clickup_task',
    {
      description: 'Update a task: name, description, status, priority. Only send fields to change.',
      inputSchema: {
        task_id: z.string().describe('ClickUp task ID'),
        name: z.string().optional().describe('New task name'),
        description: z.string().optional().describe('New description'),
        status: z.string().optional().describe('Status name'),
        priority: z.number().optional().describe('1=Urgent, 2=High, 3=Normal, 4=Low'),
      },
    },
    async (args) => {
      try {
        const body: Record<string, unknown> = {};
        if (args.name !== undefined) body.name = args.name;
        if (args.description !== undefined) body.description = args.description;
        if (args.status !== undefined) body.status = args.status;
        if (args.priority !== undefined) body.priority = args.priority;
        const task = await updateTask(args.task_id, body);
        return toolResultText(JSON.stringify(task, null, 2));
      } catch (err) {
        if (err instanceof ClickUpApiError) {
          return toolResultError(err.message);
        }
        return toolResultError(String(err));
      }
    }
  );

  server.registerTool(
    'delete_clickup_task',
    {
      description: 'Task oder Unteraufgabe löschen. Irreversible.',
      inputSchema: {
        task_id: z.string().describe('ClickUp task ID (oder Unteraufgabe-ID)'),
      },
    },
    async (args) => {
      try {
        await deleteTask(args.task_id);
        return toolResultText('Task deleted.');
      } catch (err) {
        if (err instanceof ClickUpApiError) {
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
