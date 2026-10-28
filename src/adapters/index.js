'use strict';
// To add an agent: create an adapter exporting { name, kind, discover, parse }
// (local sources) or { name, kind: 'export', detect, parse } (export files),
// then register it here. See CONTRIBUTING.md.

const local = [require('./claude-code'), require('./codex'), require('./gemini-cli')];
const exports_ = [require('./chatgpt-export'), require('./claude-ai-export')];

module.exports = { local, exports: exports_ };
