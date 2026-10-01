#!/usr/bin/env node
// 判"开工那一刻跑的是哪份预设"。
//
// 为什么要这个：会话流里 `agent-preset/selected` 只说明**中途换过**预设，
// 它不改历史 —— 换之前那些回合是按**旧**预设跑的。
// 而"开工第一步"这条规矩只住在 agenia 那份组合注入的 `leader.md` 里：
//   ⇒ **没跑在 agenia 上的会话，压根没收到过那条规矩。**
//
// 用法: node preset-at-start.mjs <已解压的 jsonl> ...

import fs from 'node:fs';

for (const file of process.argv.slice(2)) {
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

  console.log(`\n===== ${file.split(/[\\/]/).pop()}`);
  const head = events.find((e) => e.type === 'session');
  const switches = events.filter((e) => e.type === 'agent-preset/selected');
  const firstCall = events.find((e) => e.type === 'tool/call');
  const firstUser = events.find((e) => e.type === 'user/message' && e.data?.source?.kind === 'user');

  console.log(`  会话头 preset = ${head?.agentPreset ?? '?'}   建立于 ${head ? new Date(head.createdAt).toISOString() : '?'}`);
  console.log(`  中途切换 = ${switches.length} 次 ${switches.map((e) => `→${e.data.agentPreset}@seq${e.seq}`).join(' ')}`);
  console.log(`  老板第一句话 = seq ${firstUser?.seq ?? '-'}`);
  console.log(`  第一次工具调用 = seq ${firstCall?.seq ?? '-'}`);

  // 第一次工具调用那一刻，生效的是哪份？
  let effective = head?.agentPreset ?? '?';
  if (firstCall) {
    for (const event of switches) if (event.seq < firstCall.seq) effective = event.data.agentPreset;
  }
  console.log(
    `  ⇒ **第一次工具调用时生效的预设 = ${effective}**` +
      (effective === 'agenia' ? '  ✅ 收到过 leader.md 那条规矩' : '  🔴 没跑在 agenia 上 ⇒ 没收到过那条规矩'),
  );
}
