# EdgeEver Mind

An offline, login-free personal mind-map workspace built on EdgeEver's shared diagram engine. Local JSON storage, paper and studio application shells, all 11 legacy palettes and 13 structures, plus parchment/studio palettes. Shells never replace map styling or geometry.

## Development

Use the Bun version pinned in package.json:

```sh
bun install --frozen-lockfile
bun run test
bun run typecheck
bun run build:web
bun run dev:web
bun run dev:desktop
```

Build Windows NSIS with `bun run build:desktop`; outputs are under `release/mind`. Feature-branch CI installs the previous NSIS package, upgrades the same installation, and verifies a fresh offline profile, persistence, history, imports/exports and mock AI. It does not deploy or publish releases.

## Scope and compatibility

The retained workspaces are the personal renderer, Electron local storage/security/Claude Agent SDK, and shared diagram model/layout. Account sync, server, notes/media editors, marketing site, mobile apps and browser extensions were removed from this personal branch. Git history preserves the original source. Existing JSON workspaces remain compatible; never delete user data during an upgrade.

The default AI model identifier is `deepseek-flash`. Only an explicitly configured, user-initiated request may call a provider. Tests use mocks and synthetic credentials, with zero paid calls. Readable Chinese previews show additions, removals, renames and moves; approval writes changes, while AI cannot replace existing diagram style.

## Fonts and licensing

Pinned `@fontsource-variable/noto-sans-sc@5.3.0` is self-hosted with all 101 unchanged WOFF2 partitions referenced by upstream index.css. No application-text subsetting, online fonts or CDN. Weights 100–900 are available; system fallback handles characters outside the font repertoire. OFL-1.1 font licensing, project AGPL-3.0 and third-party notices ship with the app; see LICENSE and NOTICE.

## Evidence and size accounting

`.github/workflows/personal-mind.yml` produces the installer, real Windows screenshots and HTML report. `scripts/personal-size-audit.mjs` compares actual NSIS executable bytes and recursive installed-file byte sums under matching packaging settings, including font cost. Artifact ZIP size is a different metric. CI desktop acceptance does not certify every physical device.

Repair notes, reproducible checks and IME/mock boundaries: [ten-item repair checklist](docs/personal-repairs.md).
