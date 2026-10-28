# Contributing

The most valuable contribution is a **new source adapter** (Cursor, Windsurf,
Copilot Chat, Cline, OpenCode, Aider, Perplexity/Gemini web exports, …).

1. Add `src/adapters/<name>.js`:
   - Local history: export `{ name, kind: 'local', discover(srcCfg, cfg) → files[], parse(file, cfg) → Conversation[] }`
   - Export files: export `{ name, kind: 'export', detect(json) → bool, parse(json, cfg) → Conversation[] }`
   - Build output with the helpers in `src/schema.js` so it conforms to [OCA v1](docs/FORMAT.md).
   - Respect `cfg.include.thinking` and `cfg.include.toolCalls`.
2. Register it in `src/adapters/index.js`. For local sources, add a default under `sources` in `src/config.js`.
3. Add a small, **synthetic** fixture and a test to `test/chatvault.test.js`. Never commit real conversations.
4. `npm test`

Keep the zero-dependency rule. Everything must run on stock Node ≥ 18.
