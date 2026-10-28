'use strict';
// Best-effort scrubbing of well-known credential formats before anything is
// written to the vault (and possibly pushed to a git remote).

// Keys must start a token, so words like "task-…" or "disk-…" are left alone.
const PATTERNS = [
  /(?<![A-Za-z0-9])sk-ant-[A-Za-z0-9_-]{20,}/g, // Anthropic
  /(?<![A-Za-z0-9])sk-(?:proj-)?[A-Za-z0-9_-]{20,}/g, // OpenAI
  /gh[pousr]_[A-Za-z0-9]{30,}/g, // GitHub
  /github_pat_[A-Za-z0-9_]{40,}/g,
  /AKIA[0-9A-Z]{16}/g, // AWS access key id
  /AIza[0-9A-Za-z_-]{35}/g, // Google API key
  /xox[abprs]-[A-Za-z0-9-]{10,}/g, // Slack
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]+?-----END [A-Z ]*PRIVATE KEY-----/g,
];

function redactString(s) {
  let out = s;
  for (const re of PATTERNS) out = out.replace(re, '[REDACTED]');
  return out;
}

function redactDeep(v) {
  if (typeof v === 'string') return redactString(v);
  if (Array.isArray(v)) return v.map(redactDeep);
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, x] of Object.entries(v)) out[k] = redactDeep(x);
    return out;
  }
  return v;
}

module.exports = { redactString, redactDeep };
