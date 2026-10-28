---
description: Configure ChatVault — vault location, backup schedule, git sync, sources
allowed-tools: Bash(node:*)
argument-hint: "[schedule] e.g. daily"
---

Help the user configure ChatVault. CLI: `node "${CLAUDE_PLUGIN_ROOT}/bin/chatvault.js"`.

1. Show the current config (`config`) and status (`status`) briefly.
2. If `$ARGUMENTS` names a schedule, apply it with `config set schedule $ARGUMENTS`. Otherwise ask the user (one question at a time, with the default in brackets):
   - Backup schedule: session-end [default], hourly, daily, weekly, manual
   - Vault folder [~/ChatVault]. Suggest a synced folder (iCloud/Dropbox) or git for an off-machine copy
   - Version the vault with git? Push to a **private** remote? (run `init --remote <url>` if yes)
   - Also back up while no agent is running? (`schedule install`)
3. Apply each choice with `config set KEY VALUE`, run `backup`, and summarize.
4. Remind them that ChatGPT/claude.ai web history needs an official export zip (see the chatvault skill).
