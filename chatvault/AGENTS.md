# ChatVault

This extension backs up the user's AI conversations into a local vault
(default `~/ChatVault`) in the open OCA format, and exposes it over MCP.

When the user asks about past conversations ("what did we decide about…",
"find that chat where…"), use the `chatvault` MCP tools: `search_history`, then
`get_conversation`. To back up now, use `backup_now`. For settings, run
`node <extension-root>/bin/chatvault.js config set <key> <value>` (see
skills/chatvault/SKILL.md).
