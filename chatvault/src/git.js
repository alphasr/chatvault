'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function git(dir, args) {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function ensureRepo(dir) {
  if (fs.existsSync(path.join(dir, '.git'))) return;
  git(dir, ['init', '-q']);
  fs.writeFileSync(path.join(dir, '.gitignore'), '.chatvault/lock\n*.tmp\n');
}

const errText = (e) => (e.stderr || e.message || '').toString().trim();

// Commits whatever changed in the vault; pushes if configured. Never throws:
// a failed push must not break a backup that already succeeded locally.
function commit(dir, gitCfg, summary) {
  try {
    ensureRepo(dir);
    git(dir, ['add', '-A']);
    if (!git(dir, ['status', '--porcelain'])) return { committed: false };
    git(dir, ['-c', 'user.name=ChatVault', '-c', 'user.email=chatvault@localhost', 'commit', '-q', '-m', `backup: ${summary}`]);
  } catch (e) {
    return { committed: false, error: errText(e) };
  }
  if (!gitCfg.push) return { committed: true, pushed: false };
  try {
    git(dir, ['push', '-q', gitCfg.remote || 'origin', 'HEAD']);
    return { committed: true, pushed: true };
  } catch (e) {
    // The commit is safe locally; the next successful push sends it.
    return { committed: true, pushed: false, error: `push failed: ${errText(e)}` };
  }
}

module.exports = { commit };
