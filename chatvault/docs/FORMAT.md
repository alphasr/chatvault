# Open Chat Archive (OCA) v1

The OCA format is a simple, vendor-neutral format for AI conversations. Every ChatVault
adapter produces it, and anything can read it. It has no dependencies and no
binary parts. When in doubt, the format keeps data rather than dropping it.

## Layout of a vault

```
<vault>/
  README.md
  index.json                                   # catalog of all conversations
  conversations/<source>/<YYYY-MM>/<id>.json   # one OCA conversation
  conversations/<source>/<YYYY-MM>/<id>.md     # rendering for humans
  conversations/<source>/<YYYY-MM>/<id>.<timestamp>.json   # older, longer versions
  exports/<source>/*.zip                       # raw vendor exports, untouched
  .chatvault/state.json                        # incremental-backup bookkeeping
```

## Conversation

```jsonc
{
  "schema": "https://github.com/nilaybaranwal/chatvault/blob/main/docs/FORMAT.md#v1",
  "id": "claude-code:9ce6cbb1-…",       // "<source>:<native_id>", globally unique
  "source": "claude-code",              // claude-code | codex | gemini-cli | chatgpt | claude-ai | …
  "native_id": "9ce6cbb1-…",            // the vendor's own id
  "title": "Uploader retry logic",
  "created_at": "2026-01-02T10:00:00.000Z",   // ISO 8601 UTC, or null
  "updated_at": "2026-01-02T10:05:00.000Z",
  "project": "/Users/me/app",           // working directory for coding agents, else null
  "model": "claude-opus-5-5",           // last model seen, or null
  "meta": {},                           // source-specific extras (git_branch, subagent, …)
  "messages": [Message, …]              // chronological, main branch only
}
```

## Message

```jsonc
{
  "id": "u1",                 // vendor id or null
  "role": "user",             // user | assistant | system | tool
  "timestamp": "…",           // ISO 8601 or null
  "model": "…",               // optional, assistant messages
  "sidechain": true,          // optional, subagent turn inlined in a parent session
  "content": [Block, …]
}
```

`tool` is the role for messages that only carry tool output back to the model.

## Blocks

| `type` | Fields |
|---|---|
| `text` | `text` |
| `thinking` | `text` (reasoning or a reasoning summary, when the vendor exposes it) |
| `tool_call` | `id`, `name`, `input` (any JSON) |
| `tool_result` | `id` (matches `tool_call.id`), `output` (string), `is_error?` |
| `attachment` | `name`, `mime`, `note` (binary content is not embedded) |

Readers must ignore block types and fields they don't recognize.

## index.json

```jsonc
{
  "schema": "…#v1",
  "generated_at": "…",
  "conversations": {
    "<id>": { "id", "source", "title", "created_at", "updated_at", "project", "messages": 12, "path": "conversations/…/<id>", "hash": "<sha256 of messages>" }
  }
}
```

`path` has no extension. Add `.json` or `.md` to it.

## Bundles

`chatvault export --out all.jsonl` writes one conversation per line. This is the
easiest way to hand your whole history to another tool.
