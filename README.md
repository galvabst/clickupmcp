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
6. **MCP-Tools (optional)** – Mit einem MCP-Client gegen `http://localhost:3000/mcp` verbinden, z.B. `list_clickup_teams` und `get_clickup_tasks` mit derselben List-ID aufrufen.

## Endpoints

- `GET /health` – Health check (for Railway).
- `GET /test-tasks` – Tasks der in `src/config.ts` hinterlegten Liste (nur lokales Testen).
- **MCP** at `/mcp`:
  - **Streamable HTTP**: `GET` and `POST` to `/mcp` (recommended).
  - **Legacy SSE**: `GET /mcp/sse` to establish stream, then `POST /mcp/message?sessionId=<id>` for messages.

## Lovable

- **Server URL**: `https://<your-railway-app>.up.railway.app/mcp`
- **Authentication**: No authentication (ClickUp token is configured on the server via `CLICKUP_TOKEN`).

## Tools

- `list_clickup_teams` – List teams (workspaces).
- `list_clickup_spaces` – List spaces in a team.
- `list_clickup_folders` – List folders in a space.
- `list_clickup_lists` – List lists in a folder.
- **`list_clickup_lists_in_space`** – All lists in a space (one call). Use to find a list by name (e.g. „Automatisierungen“) and get `list_id` for `get_clickup_tasks`.
- `get_clickup_tasks` – Get tasks in a list (optional: `page`, `status`).

## Railway

Set `CLICKUP_TOKEN` in the project variables. Deploy from GitHub or CLI; healthcheck uses `/health`.
