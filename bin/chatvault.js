#!/usr/bin/env node
'use strict';
// The vault holds private chats: everything this process creates is owner-only.
// shortcut: covers the CLI, hooks and MCP server; library callers must set their own umask.
process.umask(0o077);
const fs = require('fs');
const path = require('path');
const config = require('../src/config');
const backup = require('../src/backup');
const schedule = require('../src/schedule');
const { Vault } = require('../src/store');
const { list, search, stats } = require('../src/search');
const { toMarkdown } = require('../src/render');
const pkg = require('../package.json');

const HELP = `chatvault ${pkg.version} — own your AI conversation history

Usage: chatvault <command> [options]

Setup
  init [--vault DIR] [--schedule S] [--git] [--remote URL]
                         Create config + vault and run the first backup
  config                 Show effective config
  config set KEY VALUE   e.g. config set schedule daily | config set git.push true
  config path            Print config file location
  schedule install|uninstall|status
                         OS scheduler (launchd/cron/Task Scheduler) for backups
                         while no agent is running

Backup
  backup [--if-due] [--full] [--source a,b] [--quiet] [--json]
  import <zip|dir|conversations.json>...
                         Import an official ChatGPT or claude.ai data export
  status                 Last backup, counts per source, vault size

Read
  list [--source S] [--project P] [--limit N] [--json]
  search <words...> [--source S] [--limit N] [--json]
  show <id> [--json]
  export --out PATH [--format jsonl|md] [--source S]
                         Bundle the vault into one portable file/folder

Integration
  mcp                    Run the MCP server (stdio) for any MCP-capable agent
  hook <session-start|session-end>
                         Called by agent plugin hooks; reads hook JSON on stdin

Schedules: ${config.SCHEDULES.join(' | ')}
Sources:   claude-code, codex, gemini-cli (local) · chatgpt, claude-ai (export import)
`;

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) out[k] = v;
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) out[k] = argv[++i];
      else out[k] = true;
    } else out._.push(a);
  }
  return out;
}

const fmtBytes = (n) => (n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`);
const csv = (v) => (typeof v === 'string' ? v.split(',') : undefined);

function printBackup(r, args) {
  if (args.json) return console.log(JSON.stringify(r, null, 2));
  if (r.skipped) return args.quiet || console.log(`Skipped: ${r.skipped}`);
  if (args.quiet && !r.new && !r.updated && !r.errors?.length) return;
  const per = Object.entries(r.sources || {})
    .filter(([, n]) => n)
    .map(([s, n]) => `${s}: ${n}`)
    .join(', ');
  console.log(`Backed up: ${r.new} new, ${r.updated} updated${per ? ` (${per})` : ''} · ${r.total} conversations in vault`);
  if (r.git?.committed) console.log(`git: committed${r.git.pushed ? ' and pushed' : ''}`);
  if (r.git?.error) console.error(`git: ${r.git.error}`);
  for (const e of r.errors || []) console.error(`error: ${e}`);
}

function readStdinJSON() {
  if (process.stdin.isTTY) return {};
  try {
    return JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  } catch {
    return {};
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const [cmd, ...rest] = args._;
  const cfg = () => config.load();
  const vault = () => new Vault(cfg().vaultDir).init();

  switch (cmd) {
    case undefined:
    case 'help':
    case '--help':
      return console.log(HELP);
    case 'version':
      return console.log(pkg.version);

    case 'init': {
      if (args.vault) config.set('vaultDir', path.resolve(args.vault));
      if (args.schedule) config.set('schedule', args.schedule);
      if (args.git || args.remote) config.set('git.enabled', 'true');
      if (!fs.existsSync(config.configPath())) config.save({});
      const c = cfg();
      new Vault(c.vaultDir).init();
      if (args.remote) {
        require('child_process').execFileSync('git', ['init', '-q'], { cwd: c.vaultDir });
        try {
          require('child_process').execFileSync('git', ['remote', 'add', 'origin', args.remote], { cwd: c.vaultDir });
        } catch {}
        config.set('git.push', 'true');
      }
      console.log(`Config: ${config.configPath()}\nVault:  ${c.vaultDir}\nSchedule: ${c.schedule}`);
      console.log('Running first backup…');
      return printBackup(backup.run(cfg()), args);
    }

    case 'config': {
      if (rest[0] === 'path') return console.log(config.configPath());
      if (rest[0] === 'set') {
        if (rest.length < 3) throw new Error('usage: chatvault config set KEY VALUE');
        config.set(rest[1], rest.slice(2).join(' '));
        schedule.refresh(cfg());
        return console.log(`set ${rest[1]}`);
      }
      return console.log(JSON.stringify(cfg(), null, 2));
    }

    case 'schedule': {
      if (rest[0] === 'install') {
        const r = schedule.install(cfg());
        return console.log(`Installed ${r.platform} scheduler: every ${r.everySeconds / 3600}h (runs only if due per schedule)`);
      }
      if (rest[0] === 'uninstall') {
        schedule.uninstall();
        return console.log('Scheduler removed');
      }
      const s = schedule.status();
      return console.log(s ? JSON.stringify(s, null, 2) : 'No OS scheduler installed (hooks still back up during agent sessions)');
    }

    case 'backup': {
      const r = backup.run(cfg(), { ifDue: !!args['if-due'], full: !!args.full, sources: csv(args.source) });
      return printBackup(r, args);
    }

    case 'import': {
      if (!rest.length) throw new Error('usage: chatvault import <export.zip|folder|conversations.json>');
      for (const input of rest) {
        const r = backup.importExport(cfg(), input);
        console.log(`${path.basename(input)} → ${r.source}: ${r.new} new, ${r.updated} updated, ${r.unchanged} unchanged`);
      }
      return;
    }

    case 'status': {
      const c = cfg();
      const v = vault();
      const s = stats(v);
      const st = v.loadState();
      if (args.json) return console.log(JSON.stringify({ vault: c.vaultDir, schedule: c.schedule, lastRun: st.lastRun, ...s }, null, 2));
      console.log(`Vault:       ${c.vaultDir}`);
      console.log(`Schedule:    ${c.schedule}${schedule.status() ? ' (+ OS scheduler)' : ''}`);
      console.log(`Last backup: ${st.lastBackupAt || 'never'}`);
      console.log(`Stored:      ${s.conversations} conversations, ${s.messages} messages, ${fmtBytes(s.bytes)}`);
      for (const [src, n] of Object.entries(s.bySource)) console.log(`  ${src.padEnd(12)} ${n}`);
      return;
    }

    case 'list': {
      const rows = list(vault(), { source: args.source, project: args.project, limit: Number(args.limit) || 30 });
      if (args.json) return console.log(JSON.stringify(rows, null, 2));
      for (const r of rows) console.log(`${(r.updated_at || '').slice(0, 10)}  ${r.source.padEnd(11)}  ${r.title.slice(0, 70).padEnd(70)}  ${r.id}`);
      return;
    }

    case 'search': {
      const q = rest.join(' ');
      if (!q) throw new Error('usage: chatvault search <words>');
      const hits = search(vault(), q, { source: args.source, project: args.project, limit: Number(args.limit) || 10 });
      if (args.json) return console.log(JSON.stringify(hits, null, 2));
      if (!hits.length) return console.log('No matches');
      for (const h of hits) {
        console.log(`\n${h.title}  [${h.source} · ${(h.updated_at || '').slice(0, 10)}]\n  id: ${h.id}`);
        for (const s of h.snippets) console.log(`  ${s.role}: ${s.text.slice(0, 220)}`);
      }
      return;
    }

    case 'show': {
      const conv = vault().read(rest[0]);
      if (!conv) throw new Error(`No conversation with id ${rest[0]}`);
      return console.log(args.json ? JSON.stringify(conv, null, 2) : toMarkdown(conv));
    }

    case 'export': {
      if (!args.out) throw new Error('usage: chatvault export --out PATH [--format jsonl|md]');
      const v = vault();
      const rows = list(v, { source: args.source, limit: Infinity });
      const out = path.resolve(args.out);
      if ((args.format || 'jsonl') === 'md') {
        fs.mkdirSync(out, { recursive: true });
        for (const r of rows) {
          const conv = v.readEntry(r);
          if (conv) fs.writeFileSync(path.join(out, `${r.path.replace(/\//g, '__')}.md`), toMarkdown(conv));
        }
      } else {
        const fd = fs.openSync(out, 'w');
        for (const r of rows) {
          const conv = v.readEntry(r);
          if (conv) fs.writeSync(fd, JSON.stringify(conv) + '\n');
        }
        fs.closeSync(fd);
      }
      return console.log(`Exported ${rows.length} conversations → ${out}`);
    }

    case 'mcp':
      return require('../src/mcp').serve();

    case 'hook': {
      // Hooks must never break or slow the agent: swallow everything, stay silent.
      const input = readStdinJSON();
      try {
        const c = cfg();
        if (rest[0] === 'session-end' && c.schedule === 'session-end' && input.transcript_path) {
          backup.run(c, { files: [input.transcript_path] });
        } else if (c.schedule !== 'manual') {
          backup.run(c, { ifDue: true });
        }
        if (rest[0] === 'session-start') schedule.refresh(c);
      } catch (e) {
        if (process.env.CHATVAULT_DEBUG) console.error(e);
      }
      return;
    }

    default:
      throw new Error(`Unknown command: ${cmd}\n\n${HELP}`);
  }
}

try {
  main();
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
