'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chatvault-test-'));
const dirs = {
  claude: path.join(tmp, 'claude', 'projects'),
  codex: path.join(tmp, 'codex', 'sessions'),
  gemini: path.join(tmp, 'gemini', 'tmp'),
  downloads: path.join(tmp, 'Downloads'),
  vault: path.join(tmp, 'vault'),
};
process.env.CHATVAULT_CONFIG = path.join(tmp, 'config.json');
fs.writeFileSync(
  process.env.CHATVAULT_CONFIG,
  JSON.stringify({
    vaultDir: dirs.vault,
    sources: {
      'claude-code': { dir: dirs.claude },
      codex: { dir: dirs.codex },
      'gemini-cli': { dir: dirs.gemini },
    },
    autoImport: { dir: dirs.downloads },
  })
);

const config = require('../src/config');
const backup = require('../src/backup');
const { Vault } = require('../src/store');
const { search } = require('../src/search');
const mcp = require('../src/mcp');

const jsonl = (rows) => rows.map((r) => JSON.stringify(r)).join('\n') + '\n';
const put = (file, data) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
};

// ---- fixtures -------------------------------------------------------------
const ccFile = path.join(dirs.claude, '-Users-me-app', 'sess-1.jsonl');
put(
  ccFile,
  jsonl([
    { type: 'permission-mode', permissionMode: 'default' },
    { type: 'user', uuid: 'u1', timestamp: '2026-01-02T10:00:00Z', cwd: '/Users/me/app', gitBranch: 'main', message: { role: 'user', content: 'Add a retry to the uploader. My key is sk-ant-abcdefghijklmnopqrstuvwxyz123' } },
    { type: 'assistant', uuid: 'a1', timestamp: '2026-01-02T10:00:05Z', message: { id: 'msg_1', model: 'claude-opus-5-5', role: 'assistant', content: [{ type: 'thinking', thinking: 'Plan: exponential backoff' }] } },
    { type: 'assistant', uuid: 'a2', timestamp: '2026-01-02T10:00:06Z', message: { id: 'msg_1', model: 'claude-opus-5-5', role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'Read', input: { file_path: 'up.js' } }] } },
    { type: 'user', uuid: 'u2', timestamp: '2026-01-02T10:00:07Z', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'function upload(){}' }] } },
    { type: 'assistant', uuid: 'a3', timestamp: '2026-01-02T10:00:09Z', message: { id: 'msg_2', model: 'claude-opus-5-5', role: 'assistant', content: [{ type: 'text', text: 'Added exponential backoff retry.' }] } },
    { type: 'ai-title', aiTitle: 'Uploader retry logic', sessionId: 'sess-1' },
  ])
);

put(
  path.join(dirs.codex, '2026', '02', '01', 'rollout-2026-02-01T09-00-00-abc.jsonl'),
  jsonl([
    { timestamp: '2026-02-01T09:00:00Z', type: 'session_meta', payload: { id: 'codex-abc', cwd: '/Users/me/api', timestamp: '2026-02-01T09:00:00Z' } },
    { timestamp: '2026-02-01T09:00:00Z', type: 'turn_context', payload: { model: 'gpt-5-codex', cwd: '/Users/me/api' } },
    { timestamp: '2026-02-01T09:00:00Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '<environment_context>cwd</environment_context>' }] } },
    { timestamp: '2026-02-01T09:00:01Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Why is the rate limiter flaky?' }] } },
    { timestamp: '2026-02-01T09:00:02Z', type: 'response_item', payload: { type: 'function_call', name: 'shell', arguments: '{"command":["rg","limiter"]}', call_id: 'c1' } },
    { timestamp: '2026-02-01T09:00:03Z', type: 'response_item', payload: { type: 'function_call_output', call_id: 'c1', output: '{"output":"limiter.ts"}' } },
    { timestamp: '2026-02-01T09:00:04Z', type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'The token bucket uses wall-clock time.' }] } },
  ])
);

put(
  path.join(dirs.gemini, 'hash123', 'chats', 'session-1.json'),
  JSON.stringify({
    sessionId: 'gem-1',
    projectHash: 'hash123',
    startTime: '2026-03-01T08:00:00Z',
    lastUpdated: '2026-03-01T08:05:00Z',
    messages: [
      { id: 'm1', timestamp: '2026-03-01T08:00:00Z', type: 'user', content: 'Explain the kafka consumer lag' },
      { id: 'm2', timestamp: '2026-03-01T08:00:10Z', type: 'gemini', content: 'Lag is the offset gap.', thoughts: [{ subject: 'Lag', description: 'offsets' }], model: 'gemini-3-pro' },
    ],
  })
);

const chatgptExport = [
  {
    id: 'gpt-1',
    title: 'Sourdough starter',
    create_time: 1767225600,
    update_time: 1767229200,
    current_node: 'n3',
    mapping: {
      root: { id: 'root', message: null, parent: null, children: ['n1'] },
      n1: { id: 'n1', parent: 'root', children: ['n2', 'n2b'], message: { id: 'n1', author: { role: 'user' }, create_time: 1767225600, content: { content_type: 'text', parts: ['How do I feed a sourdough starter?'] } } },
      n2b: { id: 'n2b', parent: 'n1', children: [], message: { id: 'n2b', author: { role: 'assistant' }, create_time: 1767225601, content: { content_type: 'text', parts: ['ABANDONED BRANCH'] } } },
      n2: { id: 'n2', parent: 'n1', children: ['n3'], message: { id: 'n2', author: { role: 'assistant' }, create_time: 1767225602, metadata: { model_slug: 'gpt-5' }, content: { content_type: 'text', parts: ['Feed 1:1:1 flour and water daily.'] } } },
      n3: { id: 'n3', parent: 'n2', children: [], message: { id: 'n3', author: { role: 'user' }, create_time: 1767225700, content: { content_type: 'text', parts: ['Thanks!'] } } },
    },
  },
];

const claudeAiExport = [
  {
    uuid: 'cai-1',
    name: 'Trip to Lisbon',
    created_at: '2026-04-01T12:00:00Z',
    updated_at: '2026-04-01T12:10:00Z',
    chat_messages: [
      { uuid: 'x1', sender: 'human', text: 'Plan 3 days in Lisbon', created_at: '2026-04-01T12:00:00Z', attachments: [], files: [] },
      { uuid: 'x2', sender: 'assistant', text: '', content: [{ type: 'text', text: 'Day 1: Alfama and the tram 28.' }], created_at: '2026-04-01T12:00:30Z' },
    ],
  },
];

// ---- tests ----------------------------------------------------------------
test('backs up all local sources into OCA json + markdown', () => {
  const r = backup.run(config.load());
  assert.deepStrictEqual(r.errors, []);
  assert.strictEqual(r.new, 3);
  const idx = new Vault(dirs.vault).loadIndex().conversations;
  assert.deepStrictEqual(Object.keys(idx).sort(), ['claude-code:sess-1', 'codex:codex-abc', 'gemini-cli:gem-1']);
  for (const e of Object.values(idx)) {
    assert.ok(fs.existsSync(path.join(dirs.vault, e.path + '.json')));
    assert.ok(fs.existsSync(path.join(dirs.vault, e.path + '.md')));
  }
});

test('claude-code: titles, merged blocks, tool roles, redaction', () => {
  const c = new Vault(dirs.vault).read('claude-code:sess-1');
  assert.strictEqual(c.title, 'Uploader retry logic');
  assert.strictEqual(c.project, '/Users/me/app');
  assert.deepStrictEqual(c.messages.map((m) => m.role), ['user', 'assistant', 'tool', 'assistant']);
  assert.deepStrictEqual(c.messages[1].content.map((b) => b.type), ['thinking', 'tool_call']);
  assert.match(c.messages[0].content[0].text, /\[REDACTED\]/);
  assert.doesNotMatch(JSON.stringify(c), /sk-ant-abc/);
});

test('codex: environment context becomes system, tool calls parsed', () => {
  const c = new Vault(dirs.vault).read('codex:codex-abc');
  assert.strictEqual(c.messages[0].role, 'system');
  assert.strictEqual(c.title, 'Why is the rate limiter flaky?');
  assert.deepStrictEqual(c.messages[2].content[0].input, { command: ['rg', 'limiter'] });
  assert.strictEqual(c.model, 'gpt-5-codex');
});

test('incremental: unchanged files are skipped, appended files update', () => {
  assert.strictEqual(backup.run(config.load()).new + backup.run(config.load()).updated, 0);
  fs.appendFileSync(ccFile, jsonl([{ type: 'user', uuid: 'u3', timestamp: '2026-01-02T11:00:00Z', message: { role: 'user', content: 'and add jitter' } }]));
  const r = backup.run(config.load(), { files: [ccFile] });
  assert.strictEqual(r.updated, 1);
  assert.strictEqual(new Vault(dirs.vault).read('claude-code:sess-1').messages.length, 5);
});

test('never loses data: shrunk upstream keeps the old version', () => {
  const lines = fs.readFileSync(ccFile, 'utf8').trim().split('\n');
  fs.writeFileSync(ccFile, lines.slice(0, 3).join('\n') + '\n');
  backup.run(config.load());
  const dir = path.dirname(path.join(dirs.vault, new Vault(dirs.vault).loadIndex().conversations['claude-code:sess-1'].path));
  assert.ok(fs.readdirSync(dir).some((f) => /^sess-1\.\d{4}-.*\.json$/.test(f)), 'versioned copy kept');
});

test('imports ChatGPT export (main branch only) and claude.ai export', () => {
  const gptDir = path.join(tmp, 'gpt-export');
  put(path.join(gptDir, 'conversations.json'), JSON.stringify(chatgptExport));
  const r1 = backup.importExport(config.load(), gptDir);
  assert.strictEqual(r1.source, 'chatgpt');
  const g = new Vault(dirs.vault).read('chatgpt:gpt-1');
  assert.strictEqual(g.messages.length, 3);
  assert.doesNotMatch(JSON.stringify(g), /ABANDONED/);
  assert.strictEqual(g.model, 'gpt-5');

  const caiFile = path.join(tmp, 'cai', 'conversations.json');
  put(caiFile, JSON.stringify(claudeAiExport));
  assert.strictEqual(backup.importExport(config.load(), caiFile).source, 'claude-ai');
  assert.strictEqual(new Vault(dirs.vault).read('claude-ai:cai-1').messages[1].content[0].text, 'Day 1: Alfama and the tram 28.');
});

test('auto-imports export zips dropped in the downloads folder', { skip: !hasUnzip() }, () => {
  const src = path.join(tmp, 'zipsrc');
  put(path.join(src, 'conversations.json'), JSON.stringify([{ ...claudeAiExport[0], uuid: 'cai-zip' }]));
  fs.mkdirSync(dirs.downloads, { recursive: true });
  const zip = path.join(dirs.downloads, 'data-2026-05-01-10-00-00-batch-0000.zip');
  execFileSync('zip', ['-q', '-j', zip, path.join(src, 'conversations.json')]);
  const r = backup.run(config.load());
  assert.deepStrictEqual(r.errors, []);
  assert.ok(new Vault(dirs.vault).read('claude-ai:cai-zip'));
  assert.ok(fs.existsSync(path.join(dirs.vault, 'exports', 'claude-ai', path.basename(zip))));
  assert.strictEqual(backup.run(config.load()).new, 0, 'same zip not re-imported');
});

test('schedule: isDue respects intervals and manual', () => {
  const now = Date.parse('2026-06-02T00:00:00Z');
  const st = { lastBackupAt: '2026-06-01T12:00:00Z' };
  assert.strictEqual(backup.isDue({ schedule: 'daily' }, st, now), false);
  assert.strictEqual(backup.isDue({ schedule: 'hourly' }, st, now), true);
  assert.strictEqual(backup.isDue({ schedule: 'manual' }, st, now), false);
  assert.strictEqual(backup.isDue({ schedule: 'session-end' }, st, now), true);
  assert.strictEqual(backup.isDue({ schedule: 'daily' }, {}, now), true);
});

test('search finds across sources', () => {
  const v = new Vault(dirs.vault);
  assert.strictEqual(search(v, 'token bucket')[0].id, 'codex:codex-abc');
  assert.strictEqual(search(v, 'lisbon tram')[0].id, 'claude-ai:cai-1');
  assert.strictEqual(search(v, 'sourdough', { source: 'codex' }).length, 0);
});

test('MCP server answers initialize, tools/list, tools/call', () => {
  const bin = path.join(__dirname, '..', 'bin', 'chatvault.js');
  const input = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'search_history', arguments: { query: 'kafka' } } },
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'get_conversation', arguments: { id: 'gemini-cli:gem-1' } } },
  ]
    .map((m) => JSON.stringify(m))
    .join('\n');
  const out = execFileSync(process.execPath, [bin, 'mcp'], { input, env: process.env, encoding: 'utf8' })
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));
  assert.strictEqual(out.length, 4);
  assert.strictEqual(out[0].result.serverInfo.name, 'chatvault');
  assert.ok(out[1].result.tools.some((t) => t.name === 'search_history'));
  assert.match(out[2].result.content[0].text, /gemini-cli:gem-1/);
  assert.match(out[3].result.content[0].text, /Lag is the offset gap/);
  assert.strictEqual(mcp.TOOLS.length, 5);
});

test('hook never fails, even with garbage stdin', () => {
  const bin = path.join(__dirname, '..', 'bin', 'chatvault.js');
  execFileSync(process.execPath, [bin, 'hook', 'session-end'], { input: 'not json', env: process.env });
  execFileSync(process.execPath, [bin, 'hook', 'session-end'], { input: JSON.stringify({ transcript_path: ccFile }), env: process.env });
});

test('redaction keeps ordinary words, still catches keys', () => {
  const { redactString } = require('../src/redact');
  const plain = 'run task-update-readme-and-changelog-now on disk-0123456789abcdefghijk';
  assert.strictEqual(redactString(plain), plain);
  assert.strictEqual(redactString('key=sk-proj-abcdefghijklmnopqrstuvwxyz'), 'key=[REDACTED]');
  assert.strictEqual(redactString('"sk-ant-abcdefghijklmnopqrstuvwxyz123"'), '"[REDACTED]"');
});

test('default source dirs honour CLAUDE_CONFIG_DIR and CODEX_HOME', () => {
  const out = execFileSync(process.execPath, ['-e', 'console.log(JSON.stringify(require("./src/config").defaults().sources))'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, CLAUDE_CONFIG_DIR: '/x/claude', CODEX_HOME: '/y/codex' },
    encoding: 'utf8',
  });
  const s = JSON.parse(out);
  assert.strictEqual(s['claude-code'].dir, path.join('/x/claude', 'projects'));
  assert.strictEqual(s.codex.dir, path.join('/y/codex', 'sessions'));
});

test('images inside tool results are not stored as base64', () => {
  const { toolResult } = require('../src/schema');
  const r = toolResult('t', [{ type: 'text', text: 'shot taken' }, { type: 'image', source: { type: 'base64', data: 'iVBORw0KGgo' } }]);
  assert.strictEqual(r.output, 'shot taken\n[image omitted]');
});

test('a lock left by a dead process does not block backups', () => {
  const lock = path.join(dirs.vault, '.chatvault', 'lock');
  fs.writeFileSync(lock, '999999'); // no such pid
  assert.ok(!backup.run(config.load()).skipped);
  fs.writeFileSync(lock, String(process.pid)); // live holder
  assert.match(backup.run(config.load()).skipped, /another backup/);
  fs.rmSync(lock);
});

test('config set keeps commas in paths; formats is still a list', () => {
  const saved = fs.readFileSync(process.env.CHATVAULT_CONFIG, 'utf8');
  config.set('autoImport.dir', '~/Backups/chats,old');
  config.set('formats', 'json,md');
  const raw = config.loadRaw();
  assert.strictEqual(raw.autoImport.dir, '~/Backups/chats,old');
  assert.deepStrictEqual(raw.formats, ['json', 'md']);
  fs.writeFileSync(process.env.CHATVAULT_CONFIG, saved);
});

test('export writes every conversation without re-reading the index each time', () => {
  const v = new Vault(dirs.vault);
  const n = Object.keys(v.loadIndex().conversations).length;
  const orig = v.loadIndex.bind(v);
  let loads = 0;
  v.loadIndex = () => (loads++, orig());
  const { list } = require('../src/search');
  const rows = list(v, { limit: Infinity });
  const convs = rows.map((r) => v.readEntry(r)).filter(Boolean);
  assert.strictEqual(convs.length, n);
  assert.strictEqual(loads, 1);

  const out = path.join(tmp, 'all.jsonl');
  execFileSync(process.execPath, [path.join(__dirname, '..', 'bin', 'chatvault.js'), 'export', '--out', out], { env: process.env });
  assert.strictEqual(fs.readFileSync(out, 'utf8').trim().split('\n').length, n);
});

test('git: a failed push still reports the local commit', () => {
  const git = require('../src/git');
  const repo = path.join(tmp, 'gitvault');
  fs.mkdirSync(repo, { recursive: true });
  fs.writeFileSync(path.join(repo, 'a.json'), '{}');
  execFileSync('git', ['init', '-q'], { cwd: repo });
  execFileSync('git', ['remote', 'add', 'origin', path.join(tmp, 'no-such-remote.git')], { cwd: repo });
  const r = git.commit(repo, { push: true, remote: 'origin' }, 'test');
  assert.strictEqual(r.committed, true);
  assert.strictEqual(r.pushed, false);
  assert.match(r.error, /^push failed/);
});

test('vault and exports are owner-only, even for a vault made world-readable', { skip: process.platform === 'win32' }, () => {
  const vault = path.join(tmp, 'private-vault');
  fs.mkdirSync(vault, { mode: 0o755 });
  fs.chmodSync(vault, 0o755);
  const cfg = path.join(tmp, 'private-config.json');
  fs.writeFileSync(cfg, JSON.stringify({ ...JSON.parse(fs.readFileSync(process.env.CHATVAULT_CONFIG, 'utf8')), vaultDir: vault }));
  const env = { ...process.env, CHATVAULT_CONFIG: cfg };
  const bin = path.join(__dirname, '..', 'bin', 'chatvault.js');
  execFileSync(process.execPath, [bin, 'backup'], { env });
  const out = path.join(tmp, 'private-export.jsonl');
  execFileSync(process.execPath, [bin, 'export', '--out', out], { env });

  const mode = (p) => fs.statSync(p).mode & 0o777;
  assert.strictEqual(mode(vault), 0o700);
  const files = [out, path.join(vault, 'index.json'), ...walkFiles(vault).filter((f) => f.endsWith('.json'))];
  assert.ok(files.length > 2);
  for (const f of files) assert.strictEqual(mode(f), 0o600, f);
});

function walkFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walkFiles(path.join(dir, e.name)) : [path.join(dir, e.name)]
  );
}

test('scheduler files survive &, quotes and % in paths', () => {
  const { plistFor, cronLineFor } = require('../src/schedule');
  const weird = path.join(tmp, "R&D <it's> 100%", 'chatvault.js');
  const plist = path.join(tmp, 'job.plist');
  fs.writeFileSync(plist, plistFor(['/usr/bin/node', weird], 3600, '/tmp/l&g.log'));
  if (process.platform === 'darwin') {
    const args = JSON.parse(execFileSync('plutil', ['-extract', 'ProgramArguments', 'json', '-o', '-', plist], { encoding: 'utf8' }));
    assert.deepStrictEqual(args, ['/usr/bin/node', weird]);
  }
  // Run the cron command part through sh the way cron would (cron turns \% back into %).
  const line = cronLineFor(['printf', '%s\\n', weird], 3600);
  const cmd = line.replace(/^(\S+\s+){5}/, '').replace(/ # .*$/, '').replace(/\\%/g, '%');
  assert.strictEqual(execFileSync('sh', ['-c', cmd], { encoding: 'utf8' }), weird + '\n');
  assert.doesNotMatch(line.replace(/\\%/g, ''), /%/, 'every % escaped for cron');
});

function hasUnzip() {
  try {
    execFileSync('which', ['zip']);
    execFileSync('which', ['unzip']);
    return true;
  } catch {
    return false;
  }
}

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
