'use strict';
const path = require('path');
const { home, expandHome, readJSON, writeJSON } = require('./util');

const SCHEDULES = ['session-end', 'hourly', 'daily', 'weekly', 'manual'];

// A function, not a constant, so CLAUDE_CONFIG_DIR / CODEX_HOME (agents'
// relocated data dirs) are honoured at load time.
const defaults = () => ({
  vaultDir: '~/ChatVault',
  // When to back up automatically:
  //   session-end  after every agent session ends (via plugin hooks)
  //   hourly|daily|weekly  at most this often (hooks + optional OS scheduler)
  //   manual       only when you run `chatvault backup`
  schedule: 'session-end',
  sources: {
    'claude-code': { enabled: true, dir: path.join(process.env.CLAUDE_CONFIG_DIR || '~/.claude', 'projects') },
    codex: { enabled: true, dir: path.join(process.env.CODEX_HOME || '~/.codex', 'sessions') },
    'gemini-cli': { enabled: true, dir: '~/.gemini/tmp' },
  },
  // Web chats (chatgpt.com, claude.ai) have no public history API. Request the
  // official export, and ChatVault picks up the zip from this folder by itself.
  autoImport: { enabled: true, dir: '~/Downloads', keepRaw: true },
  formats: ['json', 'md'],
  include: { thinking: true, toolCalls: true, subagents: true },
  redactSecrets: true,
  git: { enabled: false, push: false, remote: 'origin' },
});

// Settings whose value is a list; `config set formats json,md` splits on commas.
const LIST_KEYS = new Set(['formats']);

function configPath() {
  if (process.env.CHATVAULT_CONFIG) return expandHome(process.env.CHATVAULT_CONFIG);
  const base = process.env.XDG_CONFIG_HOME || path.join(home(), '.config');
  return path.join(base, 'chatvault', 'config.json');
}

function merge(base, over) {
  if (!over || typeof over !== 'object' || Array.isArray(over)) return over ?? base;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) {
    out[k] = base && typeof base[k] === 'object' && !Array.isArray(base[k]) ? merge(base[k], v) : v;
  }
  return out;
}

function load() {
  const cfg = merge(defaults(), readJSON(configPath(), {}));
  if (process.env.CHATVAULT_DIR) cfg.vaultDir = process.env.CHATVAULT_DIR;
  cfg.vaultDir = expandHome(cfg.vaultDir);
  return cfg;
}

function loadRaw() {
  return readJSON(configPath(), {});
}

function save(raw) {
  writeJSON(configPath(), raw);
}

// Sets a dotted key like "git.enabled" or "sources.codex.enabled".
function set(key, value) {
  const raw = loadRaw();
  const parts = key.split('.');
  let node = raw;
  for (const p of parts.slice(0, -1)) node = node[p] = typeof node[p] === 'object' && node[p] ? node[p] : {};
  node[parts.at(-1)] = LIST_KEYS.has(key) ? String(value).split(',').filter(Boolean) : coerce(value);
  if (key === 'schedule' && !SCHEDULES.includes(raw.schedule)) {
    throw new Error(`schedule must be one of: ${SCHEDULES.join(', ')}`);
  }
  save(raw);
  return raw;
}

function coerce(v) {
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if (/^[[{]/.test(v)) {
    try {
      return JSON.parse(v);
    } catch {}
  }
  return v;
}

module.exports = { defaults, SCHEDULES, configPath, load, loadRaw, save, set };
