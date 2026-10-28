'use strict';
// Minimal MCP server (stdio, newline-delimited JSON-RPC 2.0) with no SDK
// dependency. Lets any MCP-capable agent — Claude Code, Codex, Cursor,
// Gemini CLI, Claude Desktop — search and read the vault.
const readline = require('readline');
const config = require('./config');
const backup = require('./backup');
const { Vault } = require('./store');
const { list, search, stats } = require('./search');
const { toMarkdown } = require('./render');
const pkg = require('../package.json');

const TOOLS = [
  {
    name: 'search_history',
    description:
      'Full-text search across all backed-up AI conversations (Claude Code, Codex, Gemini CLI, ChatGPT, claude.ai). Use to recall past decisions, code, or discussions.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Words that must all appear in a message' },
        source: { type: 'string', description: 'Optional: claude-code, codex, gemini-cli, chatgpt, claude-ai' },
        project: { type: 'string', description: 'Optional substring of the project path' },
        since: { type: 'string', description: 'Optional ISO date; only conversations updated after it' },
        limit: { type: 'number', description: 'Max results (default 10)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_conversations',
    description: 'List backed-up conversations, most recent first.',
    inputSchema: {
      type: 'object',
      properties: {
        source: { type: 'string' },
        project: { type: 'string' },
        since: { type: 'string' },
        limit: { type: 'number', description: 'Default 20' },
      },
    },
  },
  {
    name: 'get_conversation',
    description: 'Read one conversation by id (from search/list results) as Markdown.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        max_chars: { type: 'number', description: 'Truncate output (default 40000)' },
      },
      required: ['id'],
    },
  },
  {
    name: 'backup_now',
    description: 'Run a backup immediately and report what changed.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'vault_status',
    description: 'Show vault location, schedule, last backup time and counts per source.',
    inputSchema: { type: 'object', properties: {} },
  },
];

function callTool(name, args = {}) {
  const cfg = config.load();
  const vault = new Vault(cfg.vaultDir).init();
  switch (name) {
    case 'search_history':
      return search(vault, args.query, { ...args, limit: args.limit || 10 });
    case 'list_conversations':
      return list(vault, { ...args, limit: args.limit || 20 });
    case 'get_conversation': {
      const conv = vault.read(args.id);
      if (!conv) throw new Error(`No conversation with id ${args.id}`);
      const md = toMarkdown(conv);
      const max = args.max_chars || 40000;
      return md.length > max ? md.slice(0, max) + `\n\n… truncated (${md.length} chars total)` : md;
    }
    case 'backup_now':
      return backup.run(cfg);
    case 'vault_status':
      return { vault: cfg.vaultDir, schedule: cfg.schedule, ...vault.loadState().lastRun, ...stats(vault) };
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function handle(msg) {
  const { id, method, params } = msg;
  switch (method) {
    case 'initialize':
      return {
        protocolVersion: params?.protocolVersion || '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'chatvault', version: pkg.version },
      };
    case 'tools/list':
      return { tools: TOOLS };
    case 'tools/call': {
      try {
        const out = callTool(params.name, params.arguments);
        return { content: [{ type: 'text', text: typeof out === 'string' ? out : JSON.stringify(out, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text', text: e.message }], isError: true };
      }
    }
    case 'ping':
      return {};
    default:
      if (id === undefined) return undefined; // notification
      throw Object.assign(new Error(`Method not found: ${method}`), { code: -32601 });
  }
}

function serve() {
  const rl = readline.createInterface({ input: process.stdin });
  const send = (o) => process.stdout.write(JSON.stringify(o) + '\n');
  rl.on('line', (line) => {
    if (!line.trim()) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    }
    if (msg.id === undefined) return; // notifications need no reply
    try {
      send({ jsonrpc: '2.0', id: msg.id, result: handle(msg) });
    } catch (e) {
      send({ jsonrpc: '2.0', id: msg.id, error: { code: e.code || -32603, message: e.message } });
    }
  });
}

module.exports = { serve, handle, TOOLS };
