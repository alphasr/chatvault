---
description: Search your backed-up AI conversations
allowed-tools: Bash(node:*)
argument-hint: "<words>"
---

Run `node "${CLAUDE_PLUGIN_ROOT}/bin/chatvault.js" search $ARGUMENTS --limit 8`. Summarize the most relevant hits with date, source and id. Offer to open one with `show <id>`.
