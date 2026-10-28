'use strict';
// OpenAI Codex CLI: ~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl
// Each line is { timestamp, type, payload } where type is session_meta,
// response_item, event_msg or turn_context.
const path = require('path');
const { expandHome, walk, readJSONL, toISO } = require('../util');
const S = require('../schema');

const name = 'codex';

function discover(srcCfg) {
  return walk(expandHome(srcCfg.dir), (f) => /\.jsonl$/.test(f));
}

function parseArgs(a) {
  if (typeof a !== 'string') return a;
  try {
    return JSON.parse(a);
  } catch {
    return a;
  }
}

function parse(file, cfg) {
  let nativeId = path.basename(file, '.jsonl').replace(/^rollout-/, '');
  let project = null;
  let model = null;
  let createdAt = null;
  const messages = [];

  for (const e of readJSONL(file)) {
    const p = e.payload || {};
    const ts = toISO(e.timestamp);
    if (e.type === 'session_meta') {
      if (p.id) nativeId = p.id;
      project = p.cwd || project;
      createdAt = toISO(p.timestamp) || ts;
      continue;
    }
    if (e.type === 'turn_context') {
      model = p.model || model;
      project = project || p.cwd || null;
      continue;
    }
    if (e.type !== 'response_item') continue;

    if (p.type === 'message') {
      // Codex injects environment/instructions as user messages; keep them but mark as system.
      const content = (p.content || []).map((c) =>
        c.type === 'input_image' ? S.attachment(null, 'image', 'image omitted') : S.text(c.text)
      );
      let role = p.role === 'developer' ? 'system' : p.role;
      const first = content.find((c) => c?.type === 'text')?.text || '';
      if (role === 'user' && /^\s*<(environment_context|user_instructions)>/.test(first)) role = 'system';
      messages.push(S.message({ id: p.id, role, timestamp: ts, content, model: role === 'assistant' ? model : null }));
    } else if (p.type === 'reasoning' && cfg.include.thinking) {
      const t = (p.summary || []).map((s) => s.text).join('\n');
      messages.push(S.message({ id: p.id, role: 'assistant', timestamp: ts, content: [S.thinking(t)] }));
    } else if ((p.type === 'function_call' || p.type === 'custom_tool_call' || p.type === 'local_shell_call') && cfg.include.toolCalls) {
      const input = p.arguments !== undefined ? parseArgs(p.arguments) : p.input ?? p.action;
      messages.push(S.message({ role: 'assistant', timestamp: ts, content: [S.toolCall(p.call_id, p.name || p.type, input)] }));
    } else if ((p.type === 'function_call_output' || p.type === 'custom_tool_call_output') && cfg.include.toolCalls) {
      const out = typeof p.output === 'object' && p.output ? p.output.content ?? p.output : p.output;
      messages.push(S.message({ role: 'tool', timestamp: ts, content: [S.toolResult(p.call_id, out)] }));
    }
  }

  if (!messages.some((m) => m.role === 'user' || m.role === 'assistant')) return [];
  return [S.conversation({ source: name, nativeId, createdAt, project, model, meta: { file }, messages })];
}

module.exports = { name, kind: 'local', discover, parse };
