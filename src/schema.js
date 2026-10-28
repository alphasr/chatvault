'use strict';
// Open Chat Archive (OCA) v1 — the portable format every adapter produces.
// Spec: docs/FORMAT.md

const SCHEMA = 'https://github.com/alphasr/chatvault/blob/main/docs/FORMAT.md#v1';

const ROLES = new Set(['user', 'assistant', 'system', 'tool']);

function conversation({ source, nativeId, title, createdAt, updatedAt, project, model, meta, messages }) {
  const msgs = (messages || []).filter((m) => m && m.content && m.content.length);
  const times = msgs.map((m) => m.timestamp).filter(Boolean).sort();
  return {
    schema: SCHEMA,
    id: `${source}:${nativeId}`,
    source,
    native_id: String(nativeId),
    title: (title || firstUserText(msgs) || 'Untitled').replace(/\s+/g, ' ').trim().slice(0, 200),
    created_at: createdAt || times[0] || null,
    updated_at: updatedAt || times.at(-1) || createdAt || null,
    project: project || null,
    model: model || null,
    meta: meta || {},
    messages: msgs,
  };
}

function message({ id, role, timestamp, content, model, sidechain }) {
  const m = {
    id: id ? String(id) : null,
    role: ROLES.has(role) ? role : 'assistant',
    timestamp: timestamp || null,
    content: (content || []).filter(Boolean),
  };
  if (model) m.model = model;
  if (sidechain) m.sidechain = true;
  return m;
}

const text = (t) => (t && String(t).trim() ? { type: 'text', text: String(t) } : null);
const thinking = (t) => (t && String(t).trim() ? { type: 'thinking', text: String(t) } : null);
const toolCall = (id, name, input) => ({ type: 'tool_call', id: id || null, name: name || 'tool', input: input ?? null });
const toolResult = (id, output, isError) => ({
  type: 'tool_result',
  id: id || null,
  output: stringify(output),
  ...(isError ? { is_error: true } : {}),
});
const attachment = (name, mime, note) => ({ type: 'attachment', name: name || null, mime: mime || null, note: note || null });

function stringify(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map(stringifyPart).join('\n');
  return JSON.stringify(v);
}

// Binary parts (screenshots, PDFs) would otherwise land in the vault as base64.
function stringifyPart(x) {
  if (typeof x === 'string') return x;
  if (x?.type === 'image' || x?.type === 'document') return `[${x.type} omitted]`;
  return x?.text ?? JSON.stringify(x);
}

function firstUserText(msgs) {
  for (const m of msgs) {
    if (m.role !== 'user') continue;
    const t = m.content.find((c) => c.type === 'text');
    if (t) return t.text.slice(0, 120);
  }
  return null;
}

module.exports = { SCHEMA, conversation, message, text, thinking, toolCall, toolResult, attachment, stringify };
