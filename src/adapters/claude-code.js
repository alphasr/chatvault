'use strict';
// Claude Code: ~/.claude/projects/<encoded-cwd>/<session-id>.jsonl
// Subagents:   ~/.claude/projects/<encoded-cwd>/<session-id>/subagents/agent-*.jsonl
const path = require('path');
const { expandHome, walk, readJSONL, toISO } = require('../util');
const S = require('../schema');

const name = 'claude-code';

function discover(srcCfg, cfg) {
  const root = expandHome(srcCfg.dir);
  return walk(root, (f) => f.endsWith('.jsonl') && (cfg.include.subagents || !f.includes(`${path.sep}subagents${path.sep}`)));
}

function blocks(content, include) {
  if (typeof content === 'string') return [S.text(content)];
  if (!Array.isArray(content)) return [];
  return content.map((b) => {
    switch (b.type) {
      case 'text':
        return S.text(b.text);
      case 'thinking':
        return include.thinking ? S.thinking(b.thinking) : null;
      case 'tool_use':
        return include.toolCalls ? S.toolCall(b.id, b.name, b.input) : null;
      case 'tool_result':
        return include.toolCalls ? S.toolResult(b.tool_use_id, b.content, b.is_error) : null;
      case 'image':
        return S.attachment(null, b.source?.media_type, 'image omitted');
      case 'document':
        return S.attachment(b.title || null, b.source?.media_type, 'document omitted');
      default:
        return null;
    }
  });
}

function parse(file, cfg) {
  const isSub = file.includes(`${path.sep}subagents${path.sep}`);
  const nativeId = isSub
    ? `${path.basename(path.dirname(path.dirname(file)))}/${path.basename(file, '.jsonl')}`
    : path.basename(file, '.jsonl');

  let title = null;
  let aiTitle = null;
  let project = null;
  let model = null;
  let branch = null;
  const messages = [];

  for (const e of readJSONL(file)) {
    if (e.type === 'custom-title' && e.customTitle) title = e.customTitle;
    if (e.type === 'ai-title' && e.aiTitle) aiTitle = e.aiTitle;
    if (e.type === 'summary' && e.summary && !aiTitle) aiTitle = e.summary;
    if (e.type !== 'user' && e.type !== 'assistant') continue;
    if (e.isMeta) continue;
    project = project || e.cwd || null;
    branch = branch || e.gitBranch || null;

    const msg = e.message || {};
    if (msg.model && msg.model !== '<synthetic>') model = msg.model;
    const content = blocks(msg.content, cfg.include).filter(Boolean);
    if (!content.length) continue;

    // A user entry made only of tool results is the tool talking, not the person.
    const onlyResults = content.every((c) => c.type === 'tool_result');
    const role = e.type === 'user' ? (onlyResults ? 'tool' : 'user') : 'assistant';

    // Claude Code writes one line per content block; fold them back into one message.
    const prev = messages.at(-1);
    if (role === 'assistant' && prev && prev.role === 'assistant' && msg.id && prev._mid === msg.id) {
      prev.content.push(...content);
      continue;
    }
    const m = S.message({
      id: e.uuid,
      role,
      timestamp: toISO(e.timestamp),
      content,
      model: role === 'assistant' ? msg.model : null,
      sidechain: e.isSidechain && !isSub,
    });
    Object.defineProperty(m, '_mid', { value: msg.id, enumerable: false });
    messages.push(m);
  }

  if (!messages.length) return [];
  return [
    S.conversation({
      source: name,
      nativeId,
      title: title || aiTitle,
      project,
      model,
      meta: { ...(branch ? { git_branch: branch } : {}), ...(isSub ? { subagent: true } : {}), file },
      messages,
    }),
  ];
}

module.exports = { name, kind: 'local', discover, parse };
