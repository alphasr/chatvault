'use strict';
// claude.ai data export (Settings → Privacy → Export data).
// conversations.json is an array of { uuid, name, created_at, updated_at,
// chat_messages: [{ uuid, sender: human|assistant, text, content?, created_at, attachments, files }] }.
const S = require('../schema');
const { toISO } = require('../util');

const name = 'claude-ai';

function detect(conversations) {
  return Array.isArray(conversations) && conversations.some((c) => c && Array.isArray(c.chat_messages));
}

function blocks(msg, include) {
  const out = [];
  if (Array.isArray(msg.content) && msg.content.length) {
    for (const b of msg.content) {
      if (b.type === 'text') out.push(S.text(b.text));
      else if (b.type === 'thinking' && include.thinking) out.push(S.thinking(b.thinking));
      else if (b.type === 'tool_use' && include.toolCalls) out.push(S.toolCall(b.id, b.name, b.input));
      else if (b.type === 'tool_result' && include.toolCalls) out.push(S.toolResult(b.tool_use_id, b.content, b.is_error));
    }
  } else {
    out.push(S.text(msg.text));
  }
  for (const a of msg.attachments || []) {
    out.push(S.attachment(a.file_name, a.file_type, a.extracted_content ? 'extracted text included below' : null));
    if (a.extracted_content) out.push(S.text(a.extracted_content));
  }
  for (const f of msg.files || []) out.push(S.attachment(f.file_name, null, 'file not included in export'));
  return out.filter(Boolean);
}

function parse(conversations, cfg) {
  return conversations
    .map((conv) =>
      S.conversation({
        source: name,
        nativeId: conv.uuid,
        title: conv.name,
        createdAt: toISO(conv.created_at),
        updatedAt: toISO(conv.updated_at),
        meta: conv.project_uuid ? { project_uuid: conv.project_uuid } : {},
        messages: (conv.chat_messages || []).map((m) =>
          S.message({
            id: m.uuid,
            role: m.sender === 'human' ? 'user' : 'assistant',
            timestamp: toISO(m.created_at),
            content: blocks(m, cfg.include),
          })
        ),
      })
    )
    .filter((c) => c.messages.length);
}

module.exports = { name, kind: 'export', detect, parse };
