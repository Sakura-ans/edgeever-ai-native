# Ten repair items and verification boundaries

## Independent-review repairs

| Item | Behavior | Regression evidence |
| --- | --- | --- |
| F1 Reliability | Recoverable drafts remain separate from committed workspace; reload synchronizes buffers/title without claiming a save; explicit retry/discard | Injected disk failures, conflict, reload, restart and retry using real storage/IPC |
| F2 IME | Composition, isComposing, Windows 229 and composition-end boundaries do not blur or modify structure | Synthetic composition events; physical Windows IME remains unverified |
| F3 AI errors | Separate safe Chinese configuration, stop, timeout, auth, rate, model, network and provider reasons/actions | Mock coordinator and structured SDK error tests |
| F4 Structure | Siblings, reparenting, Enter/Tab/Delete; editing/IME excluded; cycles rejected | Buttons, keyboard, invalid parents and undo |
| F5 History | Consecutive same-node typing groups undo while each save still reaches disk; blur, selection and pauses split transactions | Ten characters, blur/selection/timeout, redo and restart |
| F6 Narrow windows | Collapsible bottom panel and mutually exclusive drawers keep editing controls reachable | 640x700, normal clicks and hit testing, no forced clicks |
| F7 Names | Create/rename share a 200 Unicode-code-point limit and inline unsubmitted-state validation | Blank, 201 Chinese characters, 200 supplementary-plane characters |
| F8 Long text | Two-line outline labels with selectable full-text access | 400+ characters, bounded row height and full text |
| F9 Dialogs | Escape cancels create and restores trigger focus; Escape explicitly rejects AI proposal | Focus and zero-write dismissal |
| F10 Chinese errors | Stable codes across main/IPC/UI/AI; safe Chinese fallback; diagnostic logs contain only operation/code | Parameterized IO, permission, backup, crypto, HTTP, tool and unknown-error redaction |

Run `bun run test`, `bun run typecheck`, `bun run build:web`; with the renderer running, run `node scripts/verify-personal-repairs.mjs`. Windows CI upgrades the cb001477 NSIS package, runs existing and repair suites, and produces real screenshots, logs and byte comparisons against that baseline.

Drafts use separate local application storage; they never count as committed workspace data. If draft storage also fails, the UI warns that the draft remains in memory only. Backups contain committed workspace only; drafts can be viewed/copied separately. Grouping tokens are process-local; persistent undo/redo retains the existing backup schema.

All data and credentials are synthetic in isolated test profiles. Only mock SDK/local mock providers are used, with no paid calls. CI virtual Windows acceptance does not certify every physical device or actual Windows IME. The originating independent-review session must reassess the final result; self-regression is not independent acceptance.

## SDK HTTP / native dialog follow-up

F3: The real Claude SDK calls a local mock provider for HTTP 400/401/403/422/429/503. api_error_status takes precedence, followed by known structured types; raw error bodies are never displayed. Tests explicitly disable SDK retries to exercise each terminal error boundary without extending assertion timeouts. F10: Startup and runtime dialogs use an explicit Chinese close-app button with safe default/cancel indices; import/export titles, action labels and file filters are also Chinese.
