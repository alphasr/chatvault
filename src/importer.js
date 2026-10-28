'use strict';
// Imports official data exports (ChatGPT, claude.ai). Web chat history has no
// public API, so the vendor's own export zip is the reliable, ToS-safe route.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { walk, expandHome } = require('./util');
const adapters = require('./adapters');

function extractZip(zip) {
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'chatvault-'));
  try {
    execFileSync('unzip', ['-q', '-o', zip, '-d', dest], { stdio: 'ignore' });
  } catch {
    // Windows 10+ and macOS ship bsdtar, which reads zip files.
    execFileSync('tar', ['-xf', zip, '-C', dest], { stdio: 'ignore' });
  }
  return dest;
}

function zipHasConversations(zip) {
  try {
    const list = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return /(^|\/)conversations\.json$/m.test(list);
  } catch {
    try {
      const list = execFileSync('tar', ['-tf', zip], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      return /(^|\/)conversations\.json$/m.test(list);
    } catch {
      return false;
    }
  }
}

// input: a .zip, an extracted folder, or a conversations.json file.
function load(input, cfg) {
  const p = path.resolve(expandHome(input));
  let tmp = null;
  let file = p;
  if (p.endsWith('.zip')) {
    tmp = extractZip(p);
    file = tmp;
  }
  try {
    if (fs.statSync(file).isDirectory()) {
      const found = walk(file, (f) => path.basename(f) === 'conversations.json');
      if (!found.length) throw new Error(`No conversations.json found in ${input}`);
      file = found[0];
    }
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const adapter = adapters.exports.find((a) => a.detect(data));
    if (!adapter) throw new Error(`Unrecognized export format in ${input} (supported: ChatGPT, claude.ai)`);
    return { adapter, conversations: adapter.parse(data, cfg) };
  } finally {
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const EXPORT_NAME = /^(data-\d{4}-\d{2}-\d{2}|[0-9a-f]{16,}-\d{4}-\d{2}-\d{2}).*\.zip$/i;

// New export zips sitting in the watch folder (e.g. ~/Downloads) since last run.
function findNewExports(cfg, state) {
  if (!cfg.autoImport?.enabled) return [];
  const dir = expandHome(cfg.autoImport.dir);
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const seen = state.imported || {};
  return names
    .filter((n) => EXPORT_NAME.test(n))
    .map((n) => path.join(dir, n))
    .filter((f) => {
      const st = fs.statSync(f);
      return seen[f] !== st.size && zipHasConversations(f);
    });
}

module.exports = { load, findNewExports };
