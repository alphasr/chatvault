'use strict';
// Dependency-free search over the vault: filter the index by metadata, then
// scan message text. Fast enough for tens of thousands of conversations.
const fs = require('fs');
const path = require('path');
const { walk } = require('./util');

function list(vault, { source, project, since, limit = 50 } = {}) {
  const all = Object.values(vault.loadIndex().conversations);
  return all
    .filter((c) => !source || c.source === source)
    .filter((c) => !project || (c.project || '').toLowerCase().includes(project.toLowerCase()))
    .filter((c) => !since || (c.updated_at || '') >= since)
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))
    .slice(0, limit)
    .map(({ hash, ...rest }) => rest);
}

function textOf(m) {
  return m.content
    .map((c) => c.text || c.output || (c.input ? JSON.stringify(c.input) : ''))
    .join('\n');
}

function search(vault, query, opts = {}) {
  const terms = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const limit = opts.limit || 20;
  const candidates = list(vault, { ...opts, limit: Infinity });
  const hits = [];

  for (const entry of candidates) {
    const conv = vault.readEntry(entry);
    if (!conv) continue;
    let score = 0;
    const snippets = [];
    const title = (conv.title || '').toLowerCase();
    for (const t of terms) if (title.includes(t)) score += 5;

    for (const m of conv.messages) {
      const raw = textOf(m);
      const lower = raw.toLowerCase();
      if (!terms.every((t) => lower.includes(t))) continue;
      score += terms.length;
      if (snippets.length < 3) {
        const i = lower.indexOf(terms[0]);
        const start = Math.max(0, i - 80);
        snippets.push({
          role: m.role,
          timestamp: m.timestamp,
          text: (start ? '…' : '') + raw.slice(start, i + 200).replace(/\s+/g, ' ') + '…',
        });
      }
    }
    if (score) hits.push({ ...entry, score, snippets });
  }
  return hits.sort((a, b) => b.score - a.score || (b.updated_at || '').localeCompare(a.updated_at || '')).slice(0, limit);
}

function stats(vault) {
  const all = Object.values(vault.loadIndex().conversations);
  const bySource = {};
  let messages = 0;
  for (const c of all) {
    bySource[c.source] = (bySource[c.source] || 0) + 1;
    messages += c.messages;
  }
  const files = walk(path.join(vault.dir, 'conversations'), () => true);
  const bytes = files.reduce((n, f) => n + fs.statSync(f).size, 0);
  return { conversations: all.length, messages, bySource, bytes };
}

module.exports = { list, search, stats };
