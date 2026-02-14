/**
 * ClickUp API v2 client. Token from env (CLICKUP_TOKEN). No token in logs or responses.
 */
const CLICKUP_API_BASE = 'https://api.clickup.com/api/v2';

export class ClickUpApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'ClickUpApiError';
  }
}

function getToken(): string {
  const t = process.env.CLICKUP_TOKEN?.trim();
  if (!t) throw new ClickUpApiError('CLICKUP_TOKEN is not set', 0, 'NO_TOKEN');
  return t;
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const url = `${CLICKUP_API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    let message = `ClickUp API error: ${res.status} ${res.statusText}`;
    if (res.status === 401) message = 'ClickUp token invalid or expired';
    else if (res.status === 403) message = 'No access to this resource';
    else if (res.status === 429) message = 'Rate limited; retry later';
    else if (body) message += ` - ${body.slice(0, 200)}`;
    throw new ClickUpApiError(message, res.status);
  }

  if (res.headers.get('content-length') === '0' || res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

// Types (minimal, enough for MCP tools)
export interface ClickUpTeam {
  id: string;
  name?: string;
}
export interface ClickUpSpace {
  id: string;
  name?: string;
}
export interface ClickUpFolder {
  id: string;
  name?: string;
}
export interface ClickUpList {
  id: string;
  name?: string;
}
export interface ClickUpTask {
  id: string;
  name?: string;
  status?: { status?: string };
  description?: string;
  text_content?: string;
  assignees?: unknown[];
  due_date?: string;
  /** Present when getTask(..., { include_subtasks: true }) */
  subtasks?: ClickUpTask[];
  list?: { id?: string | number; name?: string };
  [key: string]: unknown;
}

export interface ClickUpTasksResponse {
  tasks: ClickUpTask[];
}

/** GET /team - returns teams (workspaces) */
export async function getTeams(): Promise<{ teams: ClickUpTeam[] }> {
  return request<{ teams: ClickUpTeam[] }>('/team');
}

/** GET /team/{team_id}/space */
export async function getSpaces(teamId: string): Promise<{ spaces: ClickUpSpace[] }> {
  return request<{ spaces: ClickUpSpace[] }>(`/team/${encodeURIComponent(teamId)}/space`);
}

/** GET /space/{space_id}/folder */
export async function getFolders(spaceId: string): Promise<{ folders: ClickUpFolder[] }> {
  return request<{ folders: ClickUpFolder[] }>(`/space/${encodeURIComponent(spaceId)}/folder`);
}

/** GET /folder/{folder_id}/list */
export async function getLists(folderId: string): Promise<{ lists: ClickUpList[] }> {
  return request<{ lists: ClickUpList[] }>(`/folder/${encodeURIComponent(folderId)}/list`);
}

/** GET /space/{space_id}/list - folderless lists (e.g. "Automatisierungen" directly in space) */
export async function getFolderlessLists(spaceId: string): Promise<{ lists: ClickUpList[] }> {
  return request<{ lists: ClickUpList[] }>(`/space/${encodeURIComponent(spaceId)}/list`);
}

/** GET /list/{list_id}/task - optional page (default 0), status filter */
export async function getTasks(
  listId: string,
  opts?: { page?: number; status?: string }
): Promise<ClickUpTasksResponse> {
  const params = new URLSearchParams();
  if (opts?.page != null) params.set('page', String(opts.page));
  if (opts?.status) params.set('status', opts.status);
  const q = params.toString();
  const path = `/list/${encodeURIComponent(listId)}/task${q ? `?${q}` : ''}`;
  return request<ClickUpTasksResponse>(path);
}

/** GET /task/{task_id} - single task by ID. Optionally include subtasks and markdown description. */
export async function getTask(
  taskId: string,
  opts?: { include_subtasks?: boolean; include_markdown_description?: boolean }
): Promise<ClickUpTask> {
  const tid = String(taskId ?? '').trim();
  if (!tid) throw new ClickUpApiError('task_id is required and must be non-empty', 400, 'INVALID_INPUT');
  const params = new URLSearchParams();
  if (opts?.include_subtasks) params.set('include_subtasks', 'true');
  if (opts?.include_markdown_description) params.set('include_markdown_description', 'true');
  const q = params.toString();
  const path = `/task/${encodeURIComponent(tid)}${q ? `?${q}` : ''}`;
  return request<ClickUpTask>(path);
}

/** GET /task/{task_id}/comment - task comments (newest first). Pagination: start (ms), start_id from previous response. */
export interface ClickUpComment {
  id: string;
  comment_text?: string;
  user?: { id?: number; username?: string };
  date?: number;
  [key: string]: unknown;
}
export async function getTaskComments(
  taskId: string,
  opts?: { start?: number; start_id?: string }
): Promise<{ comments: ClickUpComment[] }> {
  const params = new URLSearchParams();
  if (opts?.start != null) params.set('start', String(opts.start));
  if (opts?.start_id) params.set('start_id', opts.start_id);
  const q = params.toString();
  const path = `/task/${encodeURIComponent(taskId)}/comment${q ? `?${q}` : ''}`;
  return request<{ comments: ClickUpComment[] }>(path);
}

/** POST /task/{task_id}/comment - add comment. */
export async function createTaskComment(
  taskId: string,
  commentText: string
): Promise<ClickUpComment> {
  return request<ClickUpComment>(`/task/${encodeURIComponent(taskId)}/comment`, {
    method: 'POST',
    body: JSON.stringify({ comment_text: commentText }),
  });
}

/** PUT /comment/{comment_id} - update comment content. */
export async function updateComment(
  commentId: string,
  commentText: string
): Promise<ClickUpComment> {
  return request<ClickUpComment>(`/comment/${encodeURIComponent(commentId)}`, {
    method: 'PUT',
    body: JSON.stringify({ comment_text: commentText }),
  });
}

/** DELETE /comment/{comment_id} - delete comment. */
export async function deleteComment(commentId: string): Promise<void> {
  await request<void>(`/comment/${encodeURIComponent(commentId)}`, { method: 'DELETE' });
}

/** POST /list/{list_id}/task - create task (or subtask if parent set). */
export interface CreateTaskBody {
  name: string;
  description?: string;
  parent?: string;
  assignees?: number[];
  status?: string;
  priority?: number;
  due_date?: number;
  [key: string]: unknown;
}
export async function createTask(listId: string, body: CreateTaskBody): Promise<ClickUpTask> {
  return request<ClickUpTask>(`/list/${encodeURIComponent(listId)}/task`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** PUT /task/{task_id} - update task (partial). */
export interface UpdateTaskBody {
  name?: string;
  description?: string;
  status?: string;
  priority?: number;
  due_date?: number;
  [key: string]: unknown;
}
export async function updateTask(taskId: string, body: UpdateTaskBody): Promise<ClickUpTask> {
  return request<ClickUpTask>(`/task/${encodeURIComponent(taskId)}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

/** DELETE /task/{task_id} - delete task (or subtask). */
export async function deleteTask(taskId: string): Promise<void> {
  await request<void>(`/task/${encodeURIComponent(taskId)}`, { method: 'DELETE' });
}

/** Create a subtask under a parent task (resolves list_id from parent). Robust: list_id and parent coerced to string. */
export async function createSubtask(
  parentTaskId: string,
  name: string,
  description?: string
): Promise<ClickUpTask> {
  const parentId = String(parentTaskId ?? '').trim();
  if (!parentId) throw new ClickUpApiError('parent_task_id is required and must be non-empty', 400, 'INVALID_INPUT');
  const taskName = String(name ?? '').trim();
  if (!taskName) throw new ClickUpApiError('name is required and must be non-empty', 400, 'INVALID_INPUT');
  const parent = await getTask(parentId);
  const rawListId = parent.list?.id;
  if (rawListId === undefined || rawListId === null)
    throw new ClickUpApiError(`Parent task has no list context (task_id=${parentId}). Cannot create subtask.`, 400, 'NO_LIST');
  const listId = String(rawListId);
  const body: CreateTaskBody = { name: taskName, parent: parentId };
  if (description !== undefined && description !== null) body.description = String(description);
  return createTask(listId, body);
}

/** Normalized task context for the agent: task meta, description, Unteraufgaben only. No comments/activities. */
export interface TaskContextSummary {
  task: { id: string; name: string; status: string; list_id: string; list_name: string };
  beschreibung: string;
  unteraufgaben: Array<{ id: string; name: string; status: string }>;
  hinweis?: string;
}

/** Build a stable context object from a raw task. Safe against missing/undefined fields. */
export function buildTaskContext(task: ClickUpTask): TaskContextSummary {
  const list = task.list;
  const listId = list?.id != null ? String(list.id) : '';
  const listName = typeof list?.name === 'string' ? list.name : '';
  const statusObj = task.status;
  const statusStr =
    statusObj && typeof statusObj === 'object' && typeof (statusObj as { status?: string }).status === 'string'
      ? (statusObj as { status: string }).status
      : '';
  const subs = Array.isArray(task.subtasks) ? task.subtasks : [];
  const unteraufgaben = subs.map((s) => ({
    id: String(s?.id ?? ''),
    name: typeof s?.name === 'string' ? s.name : '',
    status:
      s?.status && typeof s.status === 'object' && typeof (s.status as { status?: string }).status === 'string'
        ? (s.status as { status: string }).status
        : '',
  }));

  const raw = task as Record<string, unknown>;
  const beschreibung =
    typeof task.description === 'string'
      ? task.description
      : typeof raw.text_content === 'string'
        ? raw.text_content
        : typeof raw.markdown_description === 'string'
          ? raw.markdown_description
          : '';

  return {
    task: {
      id: String(task?.id ?? ''),
      name: typeof task?.name === 'string' ? task.name : '',
      status: statusStr,
      list_id: listId,
      list_name: listName,
    },
    beschreibung,
    unteraufgaben,
    hinweis:
      'Für Kommentare: get_clickup_task_comments. Activity-Log ist über die API nicht verfügbar.',
  };
}

/** All lists in a space (folders + folderless lists). Use to find a list by name (e.g. "Automatisierungen"). */
export interface ListInSpace {
  list_id: string;
  list_name: string;
  folder_id: string;
  folder_name: string;
}
export async function getAllListsInSpace(spaceId: string): Promise<ListInSpace[]> {
  const out: ListInSpace[] = [];
  const folderless = { folder_id: '', folder_name: '(folderless)' };
  const { lists: folderlessLists } = await getFolderlessLists(spaceId);
  for (const list of folderlessLists ?? []) {
    out.push({
      list_id: list.id,
      list_name: list.name ?? '(unnamed)',
      folder_id: folderless.folder_id,
      folder_name: folderless.folder_name,
    });
  }
  const { folders } = await getFolders(spaceId);
  for (const folder of folders ?? []) {
    const { lists } = await getLists(folder.id);
    for (const list of lists ?? []) {
      out.push({
        list_id: list.id,
        list_name: list.name ?? '(unnamed)',
        folder_id: folder.id,
        folder_name: folder.name ?? '(unnamed)',
      });
    }
  }
  return out;
}
