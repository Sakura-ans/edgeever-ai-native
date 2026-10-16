# Personal Mind development instructions

This feature branch is the offline personal desktop product. See README.md for scope and commands. Keep Chinese/English docs synchronized; update all root README variants together.

Before changing storage, installation or migration, explain impact, worst-case failure, rollback and unverified limits. Verify actual old-to-new installation, not only a fresh build. Preserve existing user data and stable preset IDs. Roll back source with git revert; never remove a user's workspace.

Required checks: `bun run test`, `bun run typecheck`, `bun run build:web`, and the Windows NSIS installation/upgrade acceptance workflow when desktop behavior changes. Mobile typechecks no longer apply: mobile source and workspaces are intentionally removed from this personal branch.

Reuse the shared diagram model, presets and layouts. Shell changes and palette changes must preserve geometry; relayout requires confirmation and undo. Preview cancellation must not save. AI proposals preserve diagram style. Keep local JSON import/export, history and safeStorage protections. Tests must use mock AI and synthetic credentials; no real keys or paid requests.

No network fonts, CDN, account or synchronization requirements. Preserve upstream licensing and font notices. Full upstream font partitions must be shipped without app-text subsetting. Keep keyboard focus visible and status text readable without color alone.

Work only on the authorized feature branch. Do not push main, merge, deploy, or publish a Release without explicit authorization. Restrict this fork's CI to Sakura-ans/edgeever-ai-native. Match the language of GitHub discussions; use proper multiline bodies. Native CI results do not imply physical hardware certification.
