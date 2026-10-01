#!/usr/bin/env node
// 读**已经解压好**的会话 jsonl，判"开工三件事"有没有发生。
//
// 背景：会话流是**多帧 zstd**，`zstdDecompressSync` 只解第一帧、静默丢掉 4.4 MB。
// 先用 zstd-frames.mjs 解到底，再用这个读。
//
// 用法: node session-inspect.mjs <已解压的 jsonl> [--head N]

import fs from 'node:fs';

const file = process.argv[2];
const headIndex = process.argv.indexOf('--head');
const headN = headIndex > 0 ? Number(process.argv[headIndex + 1]) : 12;

if (!file) {
  console.error('用法: node session-inspect.mjs <已解压的 jsonl> [--head N]');
  process.exit(2);
}

const lines = fs
  .readFileSync(file, 'utf8')
  .split(/\r?\n/)
  .filter((line) => line.trim() !== '');

const events = [];
for (const line of lines) {
  try {
    events.push(JSON.parse(line));
  } catch {
    /* 跳过坏行 */
  }
}

console.log(`文件: ${file}`);
console.log(`行: ${lines.length}  解析成功: ${events.length}`);

const kinds = new Map();
for (const event of events) kinds.set(event.type ?? '?', (kinds.get(event.type ?? '?') ?? 0) + 1);
console.log('\n事件类型分布:');
[...kinds.entries()].sort((a, b) => b[1] - a[1]).forEach(([t, n]) => console.log(`  ${String(n).padStart(6)}  ${t}`));

/** 把一条事件压成一行。 */
function describe(event) {
  const type = event.type ?? '?';
  const data = event.data ?? {};
  const text = Array.isArray(data.content)
    ? data.content
        .map((part) => (typeof part?.text === 'string' ? part.text : `[${part?.type ?? '?'}]`))
        .join(' ')
    : '';
  const tail = text.replaceAll('\n', ' ').slice(0, 150);
  const where = data.name ?? data.toolName ?? data.role ?? '';
  return `${type}${where ? ` <${where}>` : ''}${data.source?.kind ? ` (${data.source.kind})` : ''} ${tail}`.trim();
}

console.log(`\n=== 开头 ${headN} 条事件 ===`);
for (const event of events.slice(0, headN)) console.log(`  ${describe(event)}`);

// 判据：开工三件事
const raw = fs.readFileSync(file, 'utf8');
const probes = [
  ['开工① 读 .team/leader/now.md', [/leader[\\/]now\.md/g, /leader\\+now\.md/g]],
  ['开工② 看 retro/<今天>/前日复盘.md', [/前日复盘/g, /retro[\\/]2026-[0-9]{2}-[0-9]{2}/g]],
  ['开工② 的处置（叫 team_retro）', [/team_retro/g]],
  ['开工③ 跑 check-notes.mjs', [/check-notes\.mjs/g]],
  ['碰 .team/ 下任何东西', [/\.team[\\/]/g]],
];

console.log('\n=== 判据（全量文本搜索，口径：只证"有没有发生"） ===');
for (const [label, patterns] of probes) {
  let count = 0;
  for (const pattern of patterns) count += (raw.match(pattern) ?? []).length;
  console.log(`  ${count > 0 ? '✅ 命中' : '❌ 没命中'}  ${label}  （${count} 次）`);
}

// 命中"读 now.md"的话，把第一次出现的位置前后贴出来
const first = raw.search(/leader[\\/]now\.md|leader\\+now\.md/);
if (first >= 0) {
  console.log('\n=== 第一次出现 now.md 的上下文（前后 400 字符） ===');
  console.log(raw.slice(Math.max(0, first - 200), first + 400).replaceAll('\\n', '\n'));
} else {
  console.log('\n=== 这份会话里从未出现 now.md ===');
}
