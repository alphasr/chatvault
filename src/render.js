'use strict';
// Human-readable Markdown rendering of an OCA conversation. Readable in any
// editor, Obsidian, GitHub, or pasteable into another assistant.

const ROLE_LABEL = { user: '🧑 User', assistant: '🤖 Assistant', system: '⚙️ System', tool: '🔧 Tool' };
const MAX_TOOL_CHARS = 4000;

function yamlStr(s) {
  return JSON.stringify(s ?? '');
}

function fence(s) {
  const longest = Math.max(2, ...(String(s).match(/`+/g) || []).map((m) => m.length));
  const f = '`'.repeat(longest + 1);
  return `${f}\n${s}\n${f}`;
}

function clip(s) {
  return s.length > MAX_TOOL_CHARS ? s.slice(0, MAX_TOOL_CHARS) + `\n… [${s.length - MAX_TOOL_CHARS} more chars in .json]` : s;
}

function block(c) {
  switch (c.type) {
    case 'text':
      return c.text;
    case 'thinking':
      return `<details><summary>Thinking</summary>\n\n${c.text}\n\n</details>`;
    case 'tool_call':
      return `<details><summary>Tool call: <code>${c.name}</code></summary>\n\n${fence(clip(typeof c.input === 'string' ? c.input : JSON.stringify(c.input, null, 2)))}\n\n</details>`;
    case 'tool_result':
      return `<details><summary>Tool result${c.is_error ? ' (error)' : ''}</summary>\n\n${fence(clip(c.output || ''))}\n\n</details>`;
    case 'attachment':
      return `📎 _Attachment${c.name ? `: ${c.name}` : ''}${c.note ? ` (${c.note})` : ''}_`;
    default:
      return '';
  }
}

function toMarkdown(conv) {
  const lines = [
    '---',
    `id: ${yamlStr(conv.id)}`,
    `source: ${conv.source}`,
    `title: ${yamlStr(conv.title)}`,
    `created_at: ${conv.created_at || ''}`,
    `updated_at: ${conv.updated_at || ''}`,
    ...(conv.project ? [`project: ${yamlStr(conv.project)}`] : []),
    ...(conv.model ? [`model: ${conv.model}`] : []),
    `messages: ${conv.messages.length}`,
    '---',
    '',
    `# ${conv.title}`,
    '',
  ];
  for (const m of conv.messages) {
    const when = m.timestamp ? ` · ${m.timestamp.replace('T', ' ').slice(0, 19)}` : '';
    lines.push(`## ${ROLE_LABEL[m.role] || m.role}${m.sidechain ? ' (subagent)' : ''}${when}`, '');
    lines.push(m.content.map(block).filter(Boolean).join('\n\n'), '');
  }
  return lines.join('\n');
}

module.exports = { toMarkdown };
