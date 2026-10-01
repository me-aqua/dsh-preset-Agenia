#!/usr/bin/env node
// 读 asar 头部清单：把 header JSON 落盘，并支持按名字查包。
// 用法:
//   node header.mjs header                 → 重新生成 .tools/asar-cli/asar-header.json
//   node header.mjs has <包名> [包名...]     → 查这些名字在不在 asar 清单里
//   node header.mjs ls <asar 内路径>        → 列一个目录下的条目
//
// 来历：桌面客户端代码全在 app.asar 里，看它比看 npm 那份准（版本不一样）。

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const ASAR = 'E:/Harness/CLI/resources/app.asar';
const HEADER_OUT = path.join(here, 'asar-header.json');

function readHeaderJson() {
  const fd = fs.openSync(ASAR, 'r');
  const head = Buffer.alloc(16);
  fs.readSync(fd, head, 0, 16, 0);
  const size = head.readUInt32LE(12);
  const buf = Buffer.alloc(size);
  fs.readSync(fd, buf, 0, size, 16);
  fs.closeSync(fd);
  return buf.toString('utf8');
}

const [cmd, ...rest] = process.argv.slice(2);

if (cmd === 'header' || cmd === undefined) {
  fs.writeFileSync(HEADER_OUT, readHeaderJson());
  const header = JSON.parse(fs.readFileSync(HEADER_OUT, 'utf8'));
  const names = header.files?.dsh?.files?.node_modules?.files?.['@deepseek-ai']?.files;
  console.log(`header 落盘: ${HEADER_OUT}`);
  console.log(`@deepseek-ai 下的包: ${names ? Object.keys(names).length : 0} 个`);
} else if (cmd === 'has') {
  const header = JSON.parse(fs.readFileSync(HEADER_OUT, 'utf8'));
  const names = header.files?.dsh?.files?.node_modules?.files?.['@deepseek-ai']?.files ?? {};
  for (const want of rest) {
    console.log(`${Object.hasOwn(names, want) ? '在  ' : '不在'}  ${want}`);
  }
} else if (cmd === 'ls') {
  const header = JSON.parse(fs.readFileSync(HEADER_OUT, 'utf8'));
  let node = header;
  for (const part of rest[0].split('/').filter(Boolean)) {
    node = node.files?.[part];
    if (!node) {
      console.error(`MISS: ${rest[0]}`);
      process.exit(1);
    }
  }
  console.log(Object.keys(node.files ?? {}).join('\n'));
} else {
  console.error(`未知命令: ${cmd}`);
  process.exit(2);
}
