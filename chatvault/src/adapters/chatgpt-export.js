'use strict';
// ChatGPT data export (Settings → Data controls → Export data).
// conversations.json is an array of { id|conversation_id, title, create_time,
// update_time, current_node, mapping: { nodeId: { message, parent, children } } }.
// The mapping is a tree (edits/regenerations branch); we keep the branch that
// ends at current_node, which is what the user last saw.
const S = require('../schema');
const { toISO } = require('../util');

const name = 'chatgpt';

function detect(conversations) {
  return Array.isArray(conversations) && conversations.some((c) => c && c.mapping);
}

function partsToBlocks(content) {
  if (!content) return [];
  switch (content.content_type) {
    case 'text':
    case 'multimodal_text':
      return (content.parts || []).map((p) => {
        if (typeof p === 'string') return S.text(p);
        if (p?.content_type === 'image_asset_pointer') return S.attachment(p.asset_pointer, 'image', 'image in export folder');
        if (p?.content_type === 'audio_transcription') return S.text(p.text);
        return null;
      });
    case 'code':
      return [S.text('```\n' + (content.text || '') + '\n```')];
    case 'execution_output':
      return [S.toolResult(null, content.text)];
    case 'thoughts':
      return (content.thoughts || []).map((t) => S.thinking(t.content || t.summary));
    case 'reasoning_recap':
      return [];
    case 'tether_quote':
      return [S.text(`> ${content.title || ''}\n> ${content.text || ''}`)];
    default:
      return content.text ? [S.text(content.text)] : [];
  }
}

function mainBranch(conv) {
  const mapping = conv.mapping || {};
  let nodeId = conv.current_node;
  if (!nodeId || !mapping[nodeId]) {
    // Fall back to the most recently created leaf.
    const leaves = Object.values(mapping).filter((n) => !n.children || !n.children.length);
    leaves.sort((a, b) => (a.message?.create_time || 0) - (b.message?.create_time || 0));
    nodeId = leaves.at(-1)?.id;
  }
  const chain = [];
  const seen = new Set();
  while (nodeId && mapping[nodeId] && !seen.has(nodeId)) {
    seen.add(nodeId);
    chain.push(mapping[nodeId]);
    nodeId = mapping[nodeId].parent;
  }
  return chain.reverse();
}

function parse(conversations, cfg) {
  const out = [];
  for (const conv of conversations) {
    const messages = [];
    for (const node of mainBranch(conv)) {
      const m = node.message;
      if (!m || m.metadata?.is_visually_hidden_from_conversation) continue;
      const role = m.author?.role;
      if (role === 'system' && !(m.content?.parts || []).some((p) => typeof p === 'string' && p.trim())) continue;
      let content = partsToBlocks(m.content).filter(Boolean);
      if (!cfg.include.thinking) content = content.filter((c) => c.type !== 'thinking');
      if (role === 'tool' && !cfg.include.toolCalls) continue;
      messages.push(
        S.message({ id: m.id, role, timestamp: toISO(m.create_time), content, model: m.metadata?.model_slug })
      );
    }
    const model = [...messages].reverse().find((m) => m.model)?.model;
    out.push(
      S.conversation({
        source: name,
        nativeId: conv.conversation_id || conv.id,
        title: conv.title,
        createdAt: toISO(conv.create_time),
        updatedAt: toISO(conv.update_time),
        model,
        meta: conv.gizmo_id ? { gizmo_id: conv.gizmo_id } : {},
        messages,
      })
    );
  }
  return out.filter((c) => c.messages.length);
}

module.exports = { name, kind: 'export', detect, parse };
