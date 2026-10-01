#!/usr/bin/env node
// 扫一批会话目录：每个有多少事件、开头几步干了什么（抽开工三件事）。
// 用法: node session-scan.mjs <父目录> [--window 2026-09-27 2026-10-01]
//
// 口径：**只证"这一步有没有发生"**，不升格成"那些天没人开工"。

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const root = process.argv[2];
if (!root) {
  console.error('用法: node session-scan.mjs <父目录>');
  process.exit(2);
}

/** 解一个会话目录，返回事件数组（坏的流跳过）。 */
function load(dir) {
  const events = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl.zstd'))) {
    let text;
    try {
      text = zlib.zstdDecompressSync(fs.readFileSync(path.join(dir, file))).toString('utf8');
    } catch {
      continue;
    }
    for (const line of text.split(/\r?\n/)) {
      if (line.trim() === '') continue;
      try {
        events.push(JSON.parse(line));
      } catch {
        /* 半行跳过 */
      }
    }
  }
  return events;
}

/** 把一条事件压成一行可读的摘要。 */
function describe(event) {
  const type = event.type ?? '?';
  const data = event.data ?? {};
  const json = JSON.stringify(data);
  if (type === 'user/message') {
    const text = Array.isArray(data.content)
      ? data.content.map((part) => part?.text ?? '').join(' ')
      : '';
    return `${type} role=${data.role} kind=${data.source?.kind} :: ${text.slice(0, 120).replaceAll('\n', ' ')}`;
  }
  if (type === 'tool/call' || type === 'tool/result') {
    return `${type} ${data.name ?? data.toolName ?? ''} :: ${json.slice(0, 160)}`;
  }
  if (type === 'assistant/message') {
    const text = Array.isArray(data.content) ? data.content.map((p) => p?.text ?? '').join(' ') : '';
    return `${type} :: ${text.slice(0, 160).replaceAll('\n', ' ')}`;
  }
  return `${type} :: ${json.slice(0, 140)}`;
}

const dirs = fs
  .readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(root, entry.name));

const rows = [];
for (const dir of dirs) {
  const events = load(dir);
  const mtime = fs.statSync(dir).mtime.toISOString().slice(0, 16).replace('T', ' ');
  const kinds = new Map();
  for (const event of events) kinds.set(event.type ?? '?', (kinds.get(event.type ?? '?') ?? 0) + 1);
  rows.push({ dir, name: path.basename(dir), mtime, count: events.length, kinds, events });
}

rows.sort((a, b) => a.mtime.localeCompare(b.mtime));

console.log('目录 mtime           事件数  会话 id');
for (const row of rows) console.log(`${row.mtime}   ${String(row.count).padStart(5)}  ${row.name}`);

console.log('\n=== 有内容的会话，开头 6 条事件 ===');
for (const row of rows.filter((r) => r.count > 1)) {
  console.log(`\n--- ${row.name}  (${row.mtime}, ${row.count} 事件) ---`);
  for (const event of row.events.slice(0, 6)) console.log('  ' + describe(event));
}

// 抽三个判据：有没有读 leader/now.md、有没有碰 check-notes、有没有叫 team_retro
console.log('\n=== 三件事的判据（全量文本搜索） ===');
for (const row of rows) {
  const text = JSON.stringify(row.events);
  const hitNow = text.includes('leader/now.md') || text.includes('leader\\\\now.md') || text.includes('leader\\now.md');
  const hitCheck = text.includes('check-notes.mjs');
  const hitRetro = text.includes('team_retro');
  const flag = (b) => (b ? '有' : '无');
  console.log(`${row.name}  事件=${String(row.count).padStart(5)}  读now.md=${flag(hitNow)}  碰check-notes=${flag(hitCheck)}  叫team_retro=${flag(hitRetro)}`);
}
