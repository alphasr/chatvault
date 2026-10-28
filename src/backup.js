'use strict';
const fs = require('fs');
const path = require('path');
const adapters = require('./adapters');
const importer = require('./importer');
const git = require('./git');
const { Vault } = require('./store');
const { parseDuration, expandHome } = require('./util');

const INTERVALS = { hourly: '1h', daily: '1d', weekly: '7d' };
const CHECKPOINT_EVERY = 200;

function isDue(cfg, state, now = Date.now()) {
  if (cfg.schedule === 'manual') return false;
  if (cfg.schedule === 'session-end') return true;
  const every = parseDuration(INTERVALS[cfg.schedule] || cfg.schedule);
  if (!every) return true;
  return !state.lastBackupAt || now - Date.parse(state.lastBackupAt) >= every;
}

// opts.files: only these transcript files (used by the SessionEnd hook).
// opts.sources: limit to these source names.
// opts.full: ignore the mtime cache and re-parse everything.
function run(cfg, opts = {}) {
  const vault = new Vault(cfg.vaultDir).init();
  const unlock = vault.lock();
  if (!unlock) return { skipped: 'another backup is running' };

  try {
    const state = vault.loadState();
    if (opts.ifDue && !isDue(cfg, state)) return { skipped: `not due (schedule: ${cfg.schedule})` };

    const index = vault.loadIndex();
    const stats = { new: 0, updated: 0, unchanged: 0, errors: [], sources: {} };
    // Save progress regularly so a run killed by a hook timeout resumes, not restarts.
    let sinceCheckpoint = 0;
    const checkpoint = () => {
      if (++sinceCheckpoint < CHECKPOINT_EVERY) return;
      sinceCheckpoint = 0;
      vault.saveIndex(index);
      vault.saveState(state);
    };
    const record = (source, result) => {
      stats[result]++;
      stats.sources[source] = (stats.sources[source] || 0) + (result === 'unchanged' ? 0 : 1);
    };

    for (const adapter of adapters.local) {
      const srcCfg = cfg.sources[adapter.name];
      if (!srcCfg?.enabled) continue;
      if (opts.sources && !opts.sources.includes(adapter.name)) continue;

      const root = path.resolve(expandHome(srcCfg.dir)) + path.sep;
      const files = opts.files ? opts.files.map((f) => path.resolve(f)).filter((f) => f.startsWith(root)) : adapter.discover(srcCfg, cfg);
      for (const file of files) {
        let st;
        try {
          st = fs.statSync(file);
        } catch {
          continue;
        }
        const key = `${adapter.name}:${file}`;
        const seen = state.files[key];
        if (!opts.full && seen && seen.mtimeMs === st.mtimeMs && seen.size === st.size) continue;
        try {
          for (const conv of adapter.parse(file, cfg)) record(adapter.name, vault.write(conv, cfg, index));
          state.files[key] = { mtimeMs: st.mtimeMs, size: st.size };
        } catch (e) {
          stats.errors.push(`${file}: ${e.message}`);
        }
        checkpoint();
      }
    }

    if (!opts.files) {
      for (const zip of importer.findNewExports(cfg, state)) {
        try {
          const r = importInto(vault, index, cfg, zip);
          for (const k of ['new', 'updated', 'unchanged']) stats[k] += r[k];
          stats.sources[r.source] = (stats.sources[r.source] || 0) + r.new + r.updated;
          state.imported = { ...(state.imported || {}), [zip]: fs.statSync(zip).size };
        } catch (e) {
          stats.errors.push(`${zip}: ${e.message}`);
        }
      }
    }

    vault.saveIndex(index);
    state.lastBackupAt = new Date().toISOString();
    state.lastRun = { at: state.lastBackupAt, new: stats.new, updated: stats.updated, errors: stats.errors.length };
    vault.saveState(state);

    if (cfg.git.enabled && (stats.new || stats.updated)) {
      stats.git = git.commit(vault.dir, cfg.git, `${stats.new} new, ${stats.updated} updated`);
    }
    stats.total = Object.keys(index.conversations).length;
    return stats;
  } finally {
    unlock();
  }
}

function importInto(vault, index, cfg, input) {
  const { adapter, conversations } = importer.load(input, cfg);
  const r = { source: adapter.name, new: 0, updated: 0, unchanged: 0 };
  for (const conv of conversations) r[vault.write(conv, cfg, index)]++;
  if (cfg.autoImport?.keepRaw && input.endsWith('.zip')) {
    const dest = path.join(vault.dir, 'exports', adapter.name, path.basename(input));
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(input, dest);
    }
  }
  return r;
}

function importExport(cfg, input) {
  const vault = new Vault(cfg.vaultDir).init();
  const unlock = vault.lock();
  if (!unlock) throw new Error('another backup is running; try again in a moment');
  try {
    const index = vault.loadIndex();
    const r = importInto(vault, index, cfg, input);
    vault.saveIndex(index);
    if (cfg.git.enabled && (r.new || r.updated)) r.git = git.commit(vault.dir, cfg.git, `import ${r.source}`);
    return r;
  } finally {
    unlock();
  }
}

module.exports = { run, importExport, isDue };
