'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const home = () => process.env.CHATVAULT_HOME_OVERRIDE || os.homedir();

function expandHome(p) {
  if (!p) return p;
  if (p === '~') return home();
  if (p.startsWith('~/') || p.startsWith('~\\')) return path.join(home(), p.slice(2));
  return p;
}

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

// Write via temp file + rename so a crash never leaves a half-written file.
function writeFileAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

function writeJSON(file, obj) {
  writeFileAtomic(file, JSON.stringify(obj, null, 2) + '\n');
}

function* readJSONL(file) {
  const text = fs.readFileSync(file, 'utf8');
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      yield JSON.parse(line);
    } catch {
      // Agents may be mid-write on the last line; skip anything unparseable.
    }
  }
}

function walk(dir, predicate, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, predicate, out);
    else if (e.isFile() && predicate(full)) out.push(full);
  }
  return out;
}

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function safeName(s) {
  return String(s).replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 120) || 'untitled';
}

// Accepts ISO strings, epoch seconds (ChatGPT) or epoch millis.
function toISO(v) {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'number') {
    const ms = v < 1e12 ? v * 1000 : v;
    return new Date(ms).toISOString();
  }
  const d = new Date(v);
  return isNaN(d) ? null : d.toISOString();
}

function parseDuration(s) {
  const m = /^(\d+)\s*(m|h|d|w)$/.exec(String(s).trim());
  if (!m) return null;
  const n = Number(m[1]);
  return n * { m: 60e3, h: 3600e3, d: 86400e3, w: 604800e3 }[m[2]];
}

module.exports = {
  home,
  expandHome,
  readJSON,
  writeJSON,
  writeFileAtomic,
  readJSONL,
  walk,
  sha256,
  safeName,
  toISO,
  parseDuration,
};
