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

- **`get_clickup_task`** – **Schnellster Weg:** Einzelnen Task per `task_id`. Wenn der User einen Task-Link (z.B. `https://app.clickup.com/t/86c6p1ach`) oder eine Task-ID hat → sofort `get_clickup_task(task_id: "86c6p1ach")` aufrufen. Keine list_id nötig, eine API-Anfrage.
- **`get_clickup_tasks_by_list_name`** – Alle Tasks einer Liste nach Namen im Space (inkl. folderlose Listen wie „Automatisierungen“). Parameter: `space_id`, `list_name` (z.B. space_id `90153503821`, list_name `Automatisierungen`).
- **`list_clickup_lists_in_space`** – Alle Listen im Space (folderlos + in Foldern). Liefert `list_id` und Namen für `get_clickup_tasks` oder zur Auswahl der richtigen Liste.
- `get_clickup_tasks` – Tasks einer Liste per `list_id` (optional: `page`, `status`).
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
