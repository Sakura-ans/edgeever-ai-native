# EdgeEver Mind (personal Windows preview)

[简体中文](personal-mind.zh-CN.md)

This fork's personal product uses the existing React/Vite renderer stack, AntV X6 and
DiagramDocument IR. It starts through a dedicated Electron entry point and does
not initialize the original login, sidecar account, cloud sync, updater, plugin or
ACP auto-install services. No server is required for the local workspace. The
original EdgeEver application remains available through its original commands.

## Run and package

```sh
bun install --frozen-lockfile
# Terminal 1
bun run dev:web
# Terminal 2 (PowerShell)
$env:EDGEEVER_MIND_DEV_URL='http://127.0.0.1:5173/personal.html'
bun run --cwd apps/desktop dev:mind
```

For production on Windows:

```powershell
$env:EDGE_EVER_DESKTOP_BUILD='1'
bun run build:web
bun run --cwd apps/desktop dist:mind
```

The unsigned x64 NSIS installer is written to `release/mind`. The personal CI
workflow builds a repository Actions artifact; it does not publish a
Release or deploy anything. `electron-builder.mind.yml` uses a distinct app ID,
executable name and data directory, with no update feed. Upstream synchronization
is disabled for this repository in the upstream sync workflow **once that change
is on the default branch**. Merely pushing this feature branch cannot change a
scheduled workflow that still runs from main.

## Local data and recovery

Windows data lives in `%APPDATA%/EdgeEverMind/maps/workspace.json`. Existing
EdgeEver accounts and SQLite databases are not migrated or read. This first
personal workspace uses a small validated JSON repository, deliberately isolated
from the account-bound Rust SQLite repository. Writes are serialized, flushed to
a temporary file and atomically renamed; `workspace.previous.json` retains the
previous successful state. A failed read does not silently create a new workspace.
There is no claim of cross-version SQLite migration compatibility.

The workspace supports create/rename/delete, node edits and subtree deletion,
canvas dragging, outline selection, autosave, persistent undo/redo (50 document
states per map) and portable JSON backups. Import adds independent copies rather
than overwriting maps. Limits: 500 maps, 2,000 nodes per map, tree depth 100 and an
8 MB workspace/backup envelope. Typing generates individual undo steps. Map
rename/delete are not document undo steps; export a backup before deleting a map.
To recover from a damaged file, close the application and preserve the damaged
file, then restore an exported backup or the previous state as `workspace.json`.

## AI authority boundary

DeepSeek uses `https://api.deepseek.com/anthropic`. The user supplies the model ID;
none is assumed. Keys are stored only by Electron main using OS `safeStorage`.
Plaintext/basic-text fallback is rejected. The renderer can see only whether a
key exists; a blank key preserves the existing one and a separate action removes
it. No startup model request is made.

The official Claude Agent SDK is pinned to 0.3.300, including its native CLI. It
owns the agent loop and streaming. This personal entry uses the SDK directly,
not the existing ACP host: the latter automatically permits tools and exposes
note mutations, which is incompatible with this product's confirmation boundary.
No replacement agent engine is implemented. The SDK receives an isolated temporary
working/config directory, no filesystem settings, no skills/plugins, no built-in
tools, strict MCP configuration, and a deny-by-default permission callback.
Only two in-process MCP tools exist: `read_map` and `propose_map`. There is no
apply, database, shell or file tool. Proposals are validated and retained in main
process memory; they do not write workspace data. Only a trusted renderer IPC
confirmation can consume a proposal and perform a revision-checked save. A stale
proposal fails, refusal writes nothing, and an approved edit enters undo history.
Pending proposals expire on restart. These are SDK capability restrictions, not
an OS sandbox for an untrusted SDK binary.

Both complete assistant messages and streaming text deltas are supported. Only
an explicit send transmits the current map through the MCP read tool; no actual
provider requests or real keys were used during implementation validation.

## Verification and outstanding acceptance

```sh
bun test apps/desktop/src/main/personal-store.test.mjs apps/desktop/src/main/personal-ai.test.mjs apps/web/src/lib/diagram-*.test.mjs
bun run typecheck
bun run typecheck:mobile
EDGE_EVER_DESKTOP_BUILD=1 bun run build:web
# With dev:web already running (Chromium override is optional):
CHROMIUM_PATH=/usr/bin/chromium node scripts/verify-personal-mind.mjs
```

The browser check uses the real local repository behind a mocked Electron bridge
and synthetic data. It covers create/edit, outline/canvas, reload, undo/redo,
proposal refusal/approval/rollback and browser errors. It is not an Electron IPC,
Windows DPAPI, installer or first-offline-launch test. A separate
`scripts/verify-personal-package.mjs <unpacked executable>` smoke check exercises
the real Electron bridge, create/save/reload and the bundled SDK binary without
provider requests; it passed locally on Linux with a virtual display.
Required Windows acceptance:
install the generated EXE on a clean account; disconnect networking before first
launch; create/edit/restart/backup/restore; test credential encryption and SDK
native executable resolution in the installed package; then test DeepSeek with
an explicitly authorized key. Original-to-personal upgrade/migration is neither
implemented nor validated; the apps install side by side. Power-loss durability,
accessibility, and long-running large-map performance remain unverified.
