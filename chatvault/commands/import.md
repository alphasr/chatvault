---
description: Import a ChatGPT or claude.ai data export zip into ChatVault
allowed-tools: Bash(node:*), Bash(ls:*)
argument-hint: "<path-to-export.zip>"
---

If `$ARGUMENTS` is a path, run `node "${CLAUDE_PLUGIN_ROOT}/bin/chatvault.js" import $ARGUMENTS`. Otherwise list recent `.zip` files in `~/Downloads` that look like exports (`data-*.zip` for claude.ai, `<hash>-YYYY-MM-DD-*.zip` for ChatGPT) and ask which to import. If there are none, explain how to request an export from each vendor.
