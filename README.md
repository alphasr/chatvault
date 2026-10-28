# ChatVault

**Own your AI conversation history.** If your OpenAI or Anthropic account were closed tomorrow, would you still have your chats?

ChatVault backs up your conversations from your coding agents and chat apps into a folder you control. It runs on its own, on a schedule you choose. The format is open, so any agent, script or person can read it. You can search it from any agent that supports MCP.

```
Claude Code ─┐                                      ┌─▶ any MCP agent (search_history, get_conversation)
Codex CLI   ─┤                                      ├─▶ grep / Obsidian / your editor (.md)
Gemini CLI  ─┼─▶  ~/ChatVault  (OCA v1 JSON + MD) ──┼─▶ scripts / other tools (.json, export .jsonl)
ChatGPT zip ─┤      index.json, git history         └─▶ off-machine: private git remote, iCloud, Dropbox
claude.ai zip┘
```

- **Automatic.** Plugin hooks back up when a session ends or starts. An optional OS scheduler (launchd, cron or Task Scheduler) covers the time when no agent is open.
- **Your schedule.** `session-end` (default), `hourly`, `daily`, `weekly` or `manual`.
- **Portable.** It writes one open format ([OCA v1](docs/FORMAT.md)) for every source: `.json` for machines and `.md` for people.
- **Never loses data.** Nothing is deleted from the vault. If an upstream conversation shrinks, the fuller copy is kept as a version.
- **Private by default.** Everything stays local, and nothing is sent anywhere unless you set up a git remote. Common API key formats are redacted.
- **No dependencies.** Plain Node ≥ 18, and no `npm install` needed.

## Install

### Claude Code (plugin)

```
/plugin marketplace add alphasr/chatvault
/plugin install chatvault@chatvault
```

That's it. Backups start with your next session and go to `~/ChatVault`. Run `/chatvault:setup` to change the schedule, the folder or git sync.

The plugin adds:

| Piece | What it does |
|---|---|
| `SessionStart` / `SessionEnd` hooks | Back up according to your schedule; silent and non-blocking |
| `chatvault` MCP server | `search_history`, `list_conversations`, `get_conversation`, `backup_now`, `vault_status` |
| `chatvault` skill | Teaches the agent to recall past conversations and change settings |
| `/chatvault:backup`, `/chatvault:setup`, `/chatvault:import`, `/chatvault:search` | Slash commands |

### Codex, Cursor, Gemini CLI and other agents

The repo has a manifest for each agent: `.codex-plugin/`, `.cursor-plugin/` and `gemini-extension.json`. Each one gives that agent the skill and the MCP server.

```bash
gemini extensions install https://github.com/alphasr/chatvault
```

For any other MCP client, add this to its MCP config:

```json
{ "mcpServers": { "chatvault": { "command": "npx", "args": ["-y", "chatvault", "mcp"] } } }
```

### Standalone CLI

```bash
npx chatvault init                 # create config + vault, first backup
npx chatvault schedule install     # back up even when no agent is running
```

## Usage

```bash
chatvault backup                   # back up now (incremental, fast)
chatvault status                   # last backup, counts, size
chatvault search rate limiter      # full-text search across every source
chatvault show claude-code:<id>    # read one conversation
chatvault list --source chatgpt
chatvault export --out all.jsonl   # one portable file of everything
chatvault export --out md/ --format md
```

### Choose how often to back up

```bash
chatvault config set schedule daily     # session-end | hourly | daily | weekly | manual
chatvault schedule install              # optional OS-level job, honours the schedule
```

### Keep a copy off your machine

```bash
chatvault init --remote git@github.com:you/my-chats-private.git   # PRIVATE repo!
# or point the vault at a synced folder:
chatvault config set vaultDir "~/Library/Mobile Documents/com~apple~CloudDocs/ChatVault"
```

Each backup that changes something makes a git commit, so you get full history and can restore anything.

### ChatGPT and claude.ai (web chats)

Web chat history has no public API, so ChatVault uses each vendor's **official data export**, which is reliable and within their terms:

1. **ChatGPT:** Settings → Data controls → Export data. **claude.ai:** Settings → Privacy → Export data.
2. Download the zip from the email to `~/Downloads`.
3. The next backup finds and imports it, and keeps the raw zip in `vault/exports/`. You can also run `chatvault import <zip>`.

Do this monthly. Re-importing is idempotent, so only new and changed conversations are written.

## Configuration

`~/.config/chatvault/config.json` (run `chatvault config path` to see where it is):

```jsonc
{
  "vaultDir": "~/ChatVault",
  "schedule": "session-end",
  "sources": {
    "claude-code": { "enabled": true, "dir": "~/.claude/projects" },
    "codex":       { "enabled": true, "dir": "~/.codex/sessions" },
    "gemini-cli":  { "enabled": true, "dir": "~/.gemini/tmp" }
  },
  "autoImport": { "enabled": true, "dir": "~/Downloads", "keepRaw": true },
  "formats": ["json", "md"],
  "include": { "thinking": true, "toolCalls": true, "subagents": true },
  "redactSecrets": true,
  "git": { "enabled": false, "push": false, "remote": "origin" }
}
```

If you set `CLAUDE_CONFIG_DIR` or `CODEX_HOME`, the default source folders follow them.

Tool calls and results take up most of the space. To keep only the conversation, run `chatvault config set include.toolCalls false`.

## Supported sources

| Source | How | Status |
|---|---|---|
| Claude Code | `~/.claude/projects/**.jsonl`, incl. subagents | ✅ tested on real data |
| OpenAI Codex CLI | `~/.codex/sessions/**/rollout-*.jsonl` | ✅ fixture-tested |
| Gemini CLI | `~/.gemini/tmp/*/chats/*.json` | ✅ fixture-tested |
| ChatGPT | Official export zip (`conversations.json`) | ✅ fixture-tested |
| claude.ai | Official export zip (`conversations.json`) | ✅ fixture-tested |
| Cursor, Windsurf, Copilot Chat, Cline, OpenCode, Aider… | — | 🙋 [adapter PRs welcome](CONTRIBUTING.md) |

## Notes

- On macOS, the launchd job may be blocked from reading `~/Downloads` (privacy protection). Hook-based backups still pick up export zips. You can also set `autoImport.dir` to a folder that isn't protected.
- Secret redaction catches common key formats (Anthropic, OpenAI, GitHub, AWS, Google, Slack, PEM private keys). It is not a guarantee, so **only push the vault to private remotes.**

## License

MIT
