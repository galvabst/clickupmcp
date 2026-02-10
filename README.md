# ClickUp MCP Server

MCP (Model Context Protocol) server that bridges the Lovable Agent to the ClickUp API. Deploy to Railway and add the server URL in Lovable (Settings → Connectors → New MCP server).

## Setup

1. Copy `.env.example` to `.env` and set `CLICKUP_TOKEN` (generate in ClickUp: Settings → Apps → API Token).
2. `npm install && npm run build && npm start` (or `npm run dev` for development).

## Lokal testen (Step-by-Step)

1. **.env** – `.env` aus `.env.example` kopieren, `CLICKUP_TOKEN` mit deinem Token setzen.
2. **List-ID eintragen** – In `src/config.ts` die Konstante `TEST_LIST_ID` setzen. List-ID aus dem ClickUp-Link: `https://app.clickup.com/.../v/li/<LIST_ID>` (die Zahl nach `li/`).
3. **Server starten** – `npm run dev` (oder `npm run build && npm start`). Log: „listening on port 3000“.
4. **Health** – `GET http://localhost:3000/health` (Browser oder curl). Erwartung: 200, `{"status":"healthy",...}`.
5. **ClickUp-Zugriff auf die Liste** – `GET http://localhost:3000/test-tasks`. Erwartung: 200 und JSON mit `tasks` der hinterlegten Liste, oder klare Fehlermeldung (Token/Liste ungültig).
6. **Tasks nach Listenname (Space Process Automation)** – `GET http://localhost:3000/test-tasks-by-list?list_name=Generelle%20Prozesse`. Listennamen müssen exakt mit ClickUp übereinstimmen (z.B. „Generelle Prozesse“, „Process Management“).
7. **MCP-Tools (optional)** – Mit einem MCP-Client gegen `http://localhost:3000/mcp` verbinden, z.B. `list_clickup_teams` und `get_clickup_tasks` oder `get_clickup_tasks_by_list_name(space_id, list_name)`.

## Endpoints

- `GET /health` – Health check (for Railway).
- `GET /test-tasks` – Tasks der in `src/config.ts` hinterlegten Liste (nur lokales Testen).
- `GET /test-tasks-by-list?list_name=...&space_id=...` – Tasks einer Liste nach Namen (inkl. folderlose Listen wie „Automatisierungen“).
- `GET /test-task/:taskId` – Einzelner Task per ID (z.B. `/test-task/86c6p1ach`).
- **MCP** at `/mcp`:
  - **Streamable HTTP**: `GET` and `POST` to `/mcp` (recommended).
  - **Legacy SSE**: `GET /mcp/sse` to establish stream, then `POST /mcp/message?sessionId=<id>` for messages.

## Lovable

- **Server URL**: `https://<your-railway-app>.up.railway.app/mcp`
- **Authentication**: No authentication (ClickUp token is configured on the server via `CLICKUP_TOKEN`).

## Tools

- **`get_clickup_task`** – Einzelnen Task per `task_id` (inkl. Beschreibung, Status, Liste, Assignees, Custom Fields, Attachments). Optional `include_subtasks=true` für Unteraufgaben.
- **`get_clickup_tasks_by_list_name`** – Alle Tasks einer Liste nach Namen im Space (inkl. folderlose Listen).
- **`list_clickup_lists_in_space`** – Alle Listen im Space (folderlos + in Foldern).
- `get_clickup_tasks` – Tasks einer Liste per `list_id` (optional: `page`, `status`).

**Comments**
- `get_clickup_task_comments` – Kommentare eines Tasks (newest first, optional Pagination).
- `create_clickup_comment` – Kommentar zu einem Task hinzufügen.
- `update_clickup_comment` – Kommentar bearbeiten (comment_id, comment_text).
- `delete_clickup_comment` – Kommentar löschen.

**Subtasks**
- `get_clickup_subtasks` – Unteraufgaben eines Tasks (Task inkl. `subtasks`-Array).
- `create_clickup_subtask` – Unteraufgabe anlegen (parent_task_id, name, description optional). List wird aus Parent übernommen.

**Task CRUD**
- `create_clickup_task` – Task in einer Liste anlegen (list_id, name, description, status, priority optional).
- `update_clickup_task` – Task bearbeiten (name, description, status, priority – nur geänderte Felder mitsenden).
- `delete_clickup_task` – Task oder Unteraufgabe löschen (endgültig).

**Navigation**
- `list_clickup_teams` – Teams (Workspaces).
- `list_clickup_spaces` – Spaces in einem Team.
- `list_clickup_folders` – Folders in einem Space. **Parameter: `space_id`**.
- `list_clickup_lists` – Listen in einem Folder. Parameter: `folder_id`.

### Empfohlener Ablauf für den Agent

1. **User hat Task-URL oder Task-ID** → `get_clickup_task(task_id)` (z.B. aus URL `.../t/86c6p1ach` → task_id `86c6p1ach`).
2. **User will Tasks aus einer Liste (z.B. „Automatisierungen“)** → `get_clickup_tasks_by_list_name(space_id: "90153503821", list_name: "Automatisierungen")`.
3. **Listen-Namen unbekannt** → `list_clickup_lists_in_space(space_id: "90153503821")`, dann Liste wählen und `get_clickup_tasks(list_id)` oder `get_clickup_tasks_by_list_name`.

## Railway

Set `CLICKUP_TOKEN` in the project variables. Deploy from GitHub or CLI; healthcheck uses `/health`.
