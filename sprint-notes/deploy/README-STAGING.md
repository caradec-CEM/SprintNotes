# Sprint Notes — Staging deploy (Windows + IIS)

Runs the existing Vite server as a Windows service on `127.0.0.1:5173`, fronted by
an IIS reverse proxy. No app-logic changes — the server-side JIRA/Anthropic proxies
and the notes/team JSON persistence all keep working exactly as in local dev.

> Fill in before you start:
> - **Install path:** `C:\apps\SprintNotes` *(anywhere; used below as `%APP%`)*
> - **App dir (Vite root):** `%APP%\sprint-notes`
> - **Hostname:** e.g. `sprintnotes.internal` (or a path under an existing site)
> - **Port for Node:** `5173` (must match `vite.config.ts` staging block)

---

## 1. Prerequisites (install once)

| Component | Check | If missing |
|---|---|---|
| **Node.js LTS** (≥ 20) | `node -v` | install the LTS MSI from nodejs.org |
| **Git** | `git --version` | install Git for Windows |
| **nssm** (service wrapper) | `nssm version` | download from nssm.cc, put `nssm.exe` on PATH |
| **IIS: URL Rewrite** | IIS Manager shows "URL Rewrite" | install URL Rewrite module |
| **IIS: ARR** | IIS Manager ▸ server ▸ "Application Request Routing Cache" | install Application Request Routing |
| **IIS: WebSocket Protocol** (optional, HMR) | Server Manager ▸ features | add "WebSocket Protocol" role feature |

After installing ARR: IIS Manager ▸ **server node** ▸ *Application Request Routing Cache* ▸
**Server Proxy Settings** ▸ tick **Enable proxy** ▸ Apply. (One-time, server-wide.)

## 2. Get the code + dependencies

```powershell
git clone https://github.com/caradec-CEM/SprintNotes.git C:\apps\SprintNotes
cd C:\apps\SprintNotes\sprint-notes
npm ci
```

## 3. Secrets — create `%APP%\sprint-notes\.env`

```
VITE_JIRA_EMAIL=<service-account email>
VITE_JIRA_API_TOKEN=<jira api token>
VITE_JIRA_CLOUD_ID=0d22a5f5-682a-42f5-890e-ab43691f0307
VITE_ANTHROPIC_API_KEY=<key or leave blank>
```
These stay on the server and are read by the dev server's proxies — they are **never**
sent to the browser. (Anthropic is still out of credits, so the demo-deck AI text will
use its deterministic fallback until that's topped up — expected on staging.)

The notes/team data files live in `%APP%\sprint-notes\data\` (`notes.json`, `team.json`).
Make sure the service's run-as identity can **write** to that folder.

## 4. Install the Windows service (nssm)

Runs Vite directly via Node, with `STAGING=1` so it binds `127.0.0.1:5173` and accepts
the proxied host. Run in an **elevated** PowerShell:

```powershell
$app = "C:\apps\SprintNotes\sprint-notes"
$node = (Get-Command node).Source
nssm install SprintNotes "$node" "node_modules\vite\bin\vite.js"
nssm set SprintNotes AppDirectory "$app"
nssm set SprintNotes AppEnvironmentExtra "STAGING=1"
nssm set SprintNotes AppStdout "$app\logs\service.out.log"
nssm set SprintNotes AppStderr "$app\logs\service.err.log"
nssm set SprintNotes Start SERVICE_AUTO_START
mkdir "$app\logs" -Force
nssm start SprintNotes
```

Verify it's up locally:
```powershell
curl http://127.0.0.1:5173/api/team    # should return JSON
```

## 5. IIS reverse proxy

1. Create a site (or application) bound to your hostname — e.g. site **SprintNotes**,
   binding `http` host `sprintnotes.internal`, pointing at an empty physical folder
   (e.g. `%APP%\iis-root`).
2. Copy **`deploy/web.config`** (in this repo) into that physical folder. It rewrites
   all requests to `http://127.0.0.1:5173`.
3. Browse to `http://sprintnotes.internal` — the app should load and pull JIRA data.

> If you'd rather expose it as a **sub-path** of an existing site instead of its own
> hostname, tell me — the rewrite rule needs a small tweak (strip the path prefix).

## 6. Operations

- **Restart:** `nssm restart SprintNotes`
- **Stop / start:** `nssm stop SprintNotes` / `nssm start SprintNotes`
- **Logs:** `%APP%\sprint-notes\logs\service.*.log`
- **Update to latest:**
  ```powershell
  cd C:\apps\SprintNotes ; git pull
  cd sprint-notes ; npm ci
  nssm restart SprintNotes
  ```
- **Uninstall:** `nssm stop SprintNotes ; nssm remove SprintNotes confirm`

## Notes / caveats

- This runs Vite's **dev** server (unminified, HMR on) in a staging role — intentional
  for Path A (zero app changes). If HMR websocket errors show in the browser console
  they're harmless; ask and I'll disable HMR in the staging config block.
- Bind stays on `127.0.0.1` so the dev server is only reachable **through IIS**, never
  directly on the network.
- The `STAGING=1` gate in `vite.config.ts` is what switches on the fixed host/port +
  `allowedHosts`; without it (normal local dev) nothing changes.
