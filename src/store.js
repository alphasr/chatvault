'use strict';
const fs = require('fs');
const path = require('path');
const { readJSON, writeJSON, writeFileAtomic, sha256, safeName } = require('./util');
const { toMarkdown } = require('./render');
const { redactDeep } = require('./redact');
const { SCHEMA } = require('./schema');

const VAULT_README = `# ChatVault

This folder is a backup of your AI conversations in the open
[Open Chat Archive (OCA) v1](https://github.com/alphasr/chatvault/blob/main/docs/FORMAT.md) format.

- \`conversations/<source>/<YYYY-MM>/<id>.json\` — full fidelity, machine readable
- \`conversations/<source>/<YYYY-MM>/<id>.md\`   — human readable
- \`index.json\` — one entry per conversation (title, dates, path)

Nothing here depends on ChatVault to be read. Any agent, script or person can use it.
ChatVault never deletes conversations from this folder, even if they disappear upstream.
`;

class Vault {
  constructor(dir) {
    this.dir = dir;
    this.metaDir = path.join(dir, '.chatvault');
    this.indexPath = path.join(dir, 'index.json');
    this.statePath = path.join(this.metaDir, 'state.json');
  }

  init() {
    fs.mkdirSync(this.metaDir, { recursive: true });
    // Also locks down vaults created world-readable by 0.1.0.
    fs.chmodSync(this.dir, 0o700);
    const readme = path.join(this.dir, 'README.md');
    if (!fs.existsSync(readme)) fs.writeFileSync(readme, VAULT_README);
    return this;
  }

  loadIndex() {
    return readJSON(this.indexPath, { schema: SCHEMA, conversations: {} });
  }

  saveIndex(index) {
    index.schema = SCHEMA;
    index.generated_at = new Date().toISOString();
    writeJSON(this.indexPath, index);
  }

  loadState() {
    return readJSON(this.statePath, { files: {}, lastBackupAt: null });
  }

  saveState(state) {
    writeJSON(this.statePath, state);
  }

  relPathFor(conv) {
    const month = conv.created_at ? conv.created_at.slice(0, 7) : 'undated';
    return path.join('conversations', conv.source, month, safeName(conv.native_id.replace(/\//g, '--')));
  }

  // Returns 'new' | 'updated' | 'unchanged'.
  write(conv, cfg, index) {
    if (cfg.redactSecrets) conv = redactDeep(conv);
    const hash = sha256(JSON.stringify(conv.messages));
    const prev = index.conversations[conv.id];
    if (prev && prev.hash === hash) return 'unchanged';

    const rel = prev?.path || this.relPathFor(conv);
    const base = path.join(this.dir, rel);

    // Upstream lost messages (deleted/edited)? Keep the fuller copy as a version.
    if (prev && conv.messages.length < prev.messages && fs.existsSync(base + '.json')) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      fs.copyFileSync(base + '.json', `${base}.${stamp}.json`);
    }

    if (cfg.formats.includes('json')) writeFileAtomic(base + '.json', JSON.stringify(conv, null, 2) + '\n');
    if (cfg.formats.includes('md')) writeFileAtomic(base + '.md', toMarkdown(conv));

    index.conversations[conv.id] = {
      id: conv.id,
      source: conv.source,
      title: conv.title,
      created_at: conv.created_at,
      updated_at: conv.updated_at,
      project: conv.project,
      messages: conv.messages.length,
      path: rel.split(path.sep).join('/'),
      hash,
    };
    return prev ? 'updated' : 'new';
  }

  read(id) {
    const entry = this.loadIndex().conversations[id];
    return entry ? this.readEntry(entry) : null;
  }

  // For callers that already hold index rows; avoids re-reading index.json per conversation.
  readEntry(entry) {
    return readJSON(path.join(this.dir, entry.path + '.json'), null);
  }

  // Simple advisory lock so concurrent hook runs don't race on index.json.
  // A lock left by a killed process (e.g. hook timeout) is cleared right away.
  lock() {
    fs.mkdirSync(this.metaDir, { recursive: true });
    const file = path.join(this.metaDir, 'lock');
    try {
      const pid = Number(fs.readFileSync(file, 'utf8'));
      if (!isAlive(pid)) fs.unlinkSync(file);
    } catch {}
    try {
      fs.writeFileSync(file, String(process.pid), { flag: 'wx' });
    } catch {
      return null;
    }
    return () => fs.rmSync(file, { force: true });
  }
}

function isAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

module.exports = { Vault };
