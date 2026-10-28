'use strict';
// Gemini CLI: ~/.gemini/tmp/<project-hash>/chats/session-*.json
// { sessionId, projectHash, startTime, lastUpdated, messages: [{ id, timestamp, type, content, thoughts?, toolCalls? }] }
const path = require('path');
const { expandHome, walk, readJSON, toISO } = require('../util');
const S = require('../schema');

const name = 'gemini-cli';

function discover(srcCfg) {
  return walk(expandHome(srcCfg.dir), (f) => f.endsWith('.json') && path.basename(path.dirname(f)) === 'chats');
}

function contentText(c) {
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map((p) => (typeof p === 'string' ? p : p?.text || '')).join('');
  return c?.text || '';
}

function parse(file, cfg) {
  const doc = readJSON(file, null);
  if (!doc || !Array.isArray(doc.messages)) return [];
  const messages = [];

  for (const m of doc.messages) {
    const ts = toISO(m.timestamp);
    if (m.type === 'user') {
      messages.push(S.message({ id: m.id, role: 'user', timestamp: ts, content: [S.text(contentText(m.content))] }));
    } else if (m.type === 'gemini' || m.type === 'model') {
      const content = [];
      if (cfg.include.thinking) {
        for (const t of m.thoughts || []) content.push(S.thinking([t.subject, t.description].filter(Boolean).join(': ')));
      }
      content.push(S.text(contentText(m.content)));
      if (cfg.include.toolCalls) {
        for (const tc of m.toolCalls || []) {
          content.push(S.toolCall(tc.id, tc.name, tc.args));
          if (tc.result !== undefined) content.push(S.toolResult(tc.id, tc.resultDisplay ?? tc.result, tc.status === 'error'));
        }
      }
      messages.push(S.message({ id: m.id, role: 'assistant', timestamp: ts, content, model: m.model }));
    }
  }

  if (!messages.length) return [];
  return [
    S.conversation({
      source: name,
      nativeId: doc.sessionId || path.basename(file, '.json'),
      createdAt: toISO(doc.startTime),
      updatedAt: toISO(doc.lastUpdated),
      meta: { project_hash: doc.projectHash || path.basename(path.dirname(path.dirname(file))), file },
      messages,
    }),
  ];
}

module.exports = { name, kind: 'local', discover, parse };
