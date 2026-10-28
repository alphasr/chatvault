---
name: chatvault
description: Use when the user asks to back up, export, import, or search their AI chat history; asks "what did we discuss/decide before about X"; wants to recall a past conversation from Claude Code, Codex, Gemini CLI, ChatGPT or claude.ai; or wants to change how often their chats are backed up.
---

# ChatVault

ChatVault keeps a local, open-format copy of the user's AI conversations in a
folder they control (default `~/ChatVault`). It runs on its own through hooks.
Use this skill to recall past conversations or to change settings.

## Recall past conversations

Prefer the `chatvault` MCP tools when they are available:

1. `search_history` with 2–4 distinctive words (all must appear in a message).
   Narrow with `source`, `project` (path substring) or `since` (ISO date).
2. `get_conversation` with an `id` from the results to read the full thread.
3. Quote what the user actually said or decided, with the date and source.
   Don't present a past conversation as current fact without saying when it was.

If the MCP tools aren't available, use the CLI (CHATVAULT is the plugin root):

```bash
node "$CHATVAULT/bin/chatvault.js" search "auth refresh token" --limit 5
node "$CHATVAULT/bin/chatvault.js" show "claude-code:<session-id>"
```

The vault is also plain files: `index.json` plus
`conversations/<source>/<YYYY-MM>/<id>.{json,md}`. `grep -ril` over the `.md`
files works anywhere.

## Settings

| Want | Command |
|---|---|
| Back up now | `chatvault backup` |
| See status | `chatvault status` |
| Change frequency | `chatvault config set schedule <session-end\|hourly\|daily\|weekly\|manual>` |
| Back up even when no agent is open | `chatvault schedule install` |
| Move the vault | `chatvault config set vaultDir ~/Dropbox/ChatVault` |
| Version with git / push to a private remote | `chatvault config set git.enabled true`, `chatvault config set git.push true` |
| Skip tool calls or thinking | `chatvault config set include.toolCalls false` |
| Turn a source off | `chatvault config set sources.codex.enabled false` |

## ChatGPT and claude.ai (web)

These have no history API. Walk the user through the vendor's official export:

- ChatGPT: Settings → Data controls → Export data → download zip from email
- claude.ai: Settings → Privacy → Export data → download zip from email

If the zip lands in `~/Downloads`, the next backup imports it automatically.
Otherwise run `chatvault import <path-to-zip>`. Suggest a recurring reminder
(e.g. monthly) since these can't be fully automated.

## Rules

- Never delete files in the vault, and never push it to a public remote.
  Conversations often contain secrets and personal data.
- Redaction of common API key formats is on by default. Don't promise it's complete.
