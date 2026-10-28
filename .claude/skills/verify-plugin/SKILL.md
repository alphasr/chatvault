---
name: verify-plugin
description: Test, validate and smoke-test the ChatVault plugin before reporting any change to it as done or before a release.
---

# Verify ChatVault

Work in `chatvault/`. Paste failures verbatim; don't summarise them away.

1. `npm test` must pass.
2. `claude plugin validate . --profile directory` must pass (directory-submission rules).
3. Real-data smoke test. **Never** write to `~/ChatVault` or `~/.config/chatvault`; use the scratchpad:
   ```bash
   echo '{"vaultDir":"<scratchpad>/vault","autoImport":{"enabled":false}}' > <scratchpad>/cfg.json
   CHATVAULT_CONFIG=<scratchpad>/cfg.json node bin/chatvault.js backup   # 2nd run must report 0 new / 0 updated
   CHATVAULT_CONFIG=<scratchpad>/cfg.json node bin/chatvault.js status
   ```
4. If hooks, `.mcp.json` or the skill changed: load the plugin headless and call a tool:
   `CHATVAULT_CONFIG=… claude --plugin-dir . -p "Call the chatvault vault_status tool" --allowedTools mcp__plugin_chatvault_chatvault__vault_status`
   Confirm `lastRun.at` in the scratch vault's `.chatvault/state.json` moved (hooks fired).
5. Version bump? Keep `package.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `.codex-plugin/plugin.json`, `.cursor-plugin/plugin.json` and `gemini-extension.json` in sync, then `claude plugin tag .`.
6. Never commit real conversations as fixtures; fixtures are synthetic only.

Report what ran, the results, and anything you skipped.
