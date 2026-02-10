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
  assignees?: unknown[];
  due_date?: string;
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

/** GET /task/{task_id} - single task by ID (e.g. from task URL). */
export async function getTask(taskId: string): Promise<ClickUpTask> {
  return request<ClickUpTask>(`/task/${encodeURIComponent(taskId)}`);
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
