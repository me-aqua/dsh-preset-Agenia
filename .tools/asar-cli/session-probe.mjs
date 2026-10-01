#!/usr/bin/env node
// 判"开工三件事"到底有没有发生 —— 只认 **tool/call 的实参**，不认提示词正文。
//
// 为什么必须这么判：规矩文本（`leader.md` 那一段）**每一轮都注进上下文**，
// 所以全文搜 `now.md` 必然命中几百次 —— 那是**假阳性**。
// 真正的判据只有一个：有没有一次 `read` 调用，参数里指着 `.team/leader/now.md`。
//
// 用法: node session-probe.mjs <已解压的 jsonl> [...]

import fs from 'node:fs';

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('用法: node session-probe.mjs <已解压的 jsonl> ...');
  process.exit(2);
}

/** 事件里的工具名（不同形状都兜住）。 */
function toolName(data) {
  return data.name ?? data.toolName ?? data.call?.name ?? data.tool ?? null;
}

/** 调用实参的文本形式。 */
function argsText(data) {
  return JSON.stringify(data.arguments ?? data.args ?? data.input ?? data.parameters ?? data);
}

for (const file of files) {
  const lines = fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '');
  const events = [];
  for (const line of lines) {
    try {
      events.push(JSON.parse(line));
    } catch {
      /* 跳过 */
    }
  }

  console.log(`\n############ ${file}`);
  console.log(`事件 ${events.length}`);

  const head = events.find((e) => e.type === 'session');
  if (head) {
    console.log(
      `会话头: id=${head.id} cwd=${head.cwd} 建立时 preset=${head.agentPreset} ` +
        `createdAt=${new Date(head.createdAt).toISOString()}`,
    );
  }
  for (const event of events) {
    if (event.type === 'agent-preset/selected') console.log(`preset 切换事件: ${JSON.stringify(event.data)}`);
  }

  const calls = events.filter((e) => e.type === 'tool/call');
  console.log(`tool/call 共 ${calls.length} 次`);

  const counts = new Map();
  for (const call of calls) {
    const name = toolName(call.data ?? {});
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  console.log('工具使用分布:');
  [...counts.entries()].sort((a, b) => b[1] - a[1]).forEach(([n, c]) => console.log(`  ${String(c).padStart(4)}  ${n}`));

  // 三个判据：只看 tool/call 的实参
  const probes = [
    ['开工① 调 read/-fs 读 .team/leader/now.md', (name, args) => /now\.md/.test(args) && /leader/.test(args)],
    ['开工② 找 .team/retro/<日期>/前日复盘.md', (name, args) => /前日复盘/.test(args)],
    ['开工② 处置：调用 team_retro', (name, args) => /team_retro/.test(name ?? '') || /team_retro/.test(args)],
    ['开工③ 跑 .tools/check-notes.mjs', (name, args) => /check-notes\.mjs/.test(args)],
    ['任何对 .team/ 的写（write/edit）', (name, args) => /^(write|edit)$/i.test(name ?? '') && /\.team[\\/]/.test(args)],
  ];

  console.log('判据（**只认 tool/call 实参**，不看提示词正文）:');
  const hits = [];
  for (const [label, test] of probes) {
    const matched = calls.filter((call) => test(toolName(call.data ?? {}), argsText(call.data ?? {})));
    hits.push([label, matched]);
    console.log(`  ${matched.length > 0 ? '✅' : '❌'}  ${label} —— ${matched.length} 次`);
  }

  // 把命中的那几次调用打出来（最多 6 次）
  for (const [label, matched] of hits) {
    if (matched.length === 0) continue;
    console.log(`\n  --- ${label} 的调用（前 6 次） ---`);
    for (const call of matched.slice(0, 6)) {
      const data = call.data ?? {};
      console.log(`    seq=${call.seq ?? '?'} ${toolName(data)} :: ${argsText(data).slice(0, 170)}`);
    }
  }

  // 最初 8 次工具调用按时间顺序（"开工第一步"看的就是这个）
  console.log('\n  最初 8 次工具调用（按序）:');
  for (const call of calls.slice(0, 8)) {
    const data = call.data ?? {};
    console.log(`    seq=${call.seq ?? '?'} ${toolName(data)} :: ${argsText(data).slice(0, 150)}`);
  }
}
