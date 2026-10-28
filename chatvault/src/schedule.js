'use strict';
// OS-level scheduler so backups also happen when no agent is running.
// macOS: launchd agent · Linux: user crontab · Windows: Task Scheduler.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { home, readJSON, writeJSON } = require('./util');
const config = require('./config');

const LABEL = 'dev.chatvault.backup';
const BIN = path.resolve(__dirname, '..', 'bin', 'chatvault.js');
const SECONDS = { hourly: 3600, daily: 86400, weekly: 604800 };

const markerPath = () => path.join(path.dirname(config.configPath()), 'schedule.json');
const plistPath = () => path.join(home(), 'Library', 'LaunchAgents', `${LABEL}.plist`);

function intervalFor(schedule) {
  // session-end is driven by hooks; the OS job is a daily safety net.
  return SECONDS[schedule] || SECONDS.daily;
}

function command() {
  return [process.execPath, BIN, 'backup', '--if-due', '--quiet'];
}

function install(cfg) {
  const seconds = intervalFor(cfg.schedule);
  const cmd = command();
  if (process.platform === 'darwin') {
    const log = path.join(cfg.vaultDir, '.chatvault', 'scheduler.log');
    fs.mkdirSync(path.dirname(log), { recursive: true });
    fs.mkdirSync(path.dirname(plistPath()), { recursive: true });
    try {
      execFileSync('launchctl', ['unload', plistPath()], { stdio: 'ignore' });
    } catch {}
    fs.writeFileSync(plistPath(), plistFor(cmd, seconds, log));
    execFileSync('launchctl', ['load', plistPath()]);
  } else if (process.platform === 'win32') {
    const sc = seconds >= SECONDS.weekly ? ['/SC', 'WEEKLY'] : seconds >= SECONDS.daily ? ['/SC', 'DAILY'] : ['/SC', 'HOURLY'];
    const tr = cmd.map((a) => `"${a}"`).join(' ');
    execFileSync('schtasks', ['/Create', '/F', '/TN', 'ChatVault Backup', ...sc, '/TR', tr]);
  } else {
    const current = readCrontab().filter((l) => !l.includes(LABEL));
    writeCrontab([...current, cronLineFor(cmd, seconds)]);
  }
  writeJSON(markerPath(), { bin: BIN, node: process.execPath, schedule: cfg.schedule, installedAt: new Date().toISOString() });
  return { platform: process.platform, everySeconds: seconds };
}

const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function plistFor(cmd, seconds, log) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key><array>${cmd.map((a) => `<string>${xml(a)}</string>`).join('')}</array>
  <key>StartInterval</key><integer>${seconds}</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>${xml(log)}</string>
  <key>StandardErrorPath</key><string>${xml(log)}</string>
</dict></plist>
`;
}

// Single-quote for sh ('\'' closes, escapes, reopens); cron also treats an unescaped % as a newline.
const shQuote = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`.replace(/%/g, '\\%');

function cronLineFor(cmd, seconds) {
  const expr = seconds >= SECONDS.weekly ? '0 3 * * 0' : seconds >= SECONDS.daily ? '0 3 * * *' : '0 * * * *';
  return `${expr} ${cmd.map(shQuote).join(' ')} # ${LABEL}`;
}

function uninstall() {
  if (process.platform === 'darwin') {
    try {
      execFileSync('launchctl', ['unload', plistPath()], { stdio: 'ignore' });
    } catch {}
    fs.rmSync(plistPath(), { force: true });
  } else if (process.platform === 'win32') {
    try {
      execFileSync('schtasks', ['/Delete', '/F', '/TN', 'ChatVault Backup'], { stdio: 'ignore' });
    } catch {}
  } else {
    writeCrontab(readCrontab().filter((l) => !l.includes(LABEL)));
  }
  fs.rmSync(markerPath(), { force: true });
}

function status() {
  return readJSON(markerPath(), null);
}

// Plugin updates move the install path; re-point the OS job if needed.
function refresh(cfg) {
  const s = status();
  if (s && (s.bin !== BIN || s.node !== process.execPath || s.schedule !== cfg.schedule)) install(cfg);
}

function readCrontab() {
  try {
    return execFileSync('crontab', ['-l'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function writeCrontab(lines) {
  execFileSync('crontab', ['-'], { input: lines.join('\n') + '\n' });
}

module.exports = { install, uninstall, status, refresh, plistFor, cronLineFor };
