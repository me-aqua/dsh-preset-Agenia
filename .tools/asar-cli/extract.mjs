#!/usr/bin/env node
// 从 Electron asar 里把指定路径解出来。
// 用法: node extract.mjs <asar 路径> <输出目录> <asar 内相对路径...>
// 每个路径若指向目录则整棵解出来。
//
// 来历：桌面客户端的代码全在 app.asar（121 MB）里，`asar extract` 要装工具、还解全量；
// 这里只按需解开要看的那几个包。

import fs from 'node:fs';
import path from 'node:path';

const [asarPath, outRoot, ...targets] = process.argv.slice(2);
if (!asarPath || !outRoot || targets.length === 0) {
  console.error('用法: node extract.mjs <asar> <outDir> <innerPath...>');
  process.exit(2);
}

const fd = fs.openSync(asarPath, 'r');
const head = Buffer.alloc(16);
fs.readSync(fd, head, 0, 16, 0);
const headerSize = head.readUInt32LE(12);
const headerBuf = Buffer.alloc(headerSize);
fs.readSync(fd, headerBuf, 0, headerSize, 16);
const header = JSON.parse(headerBuf.toString('utf8'));
const dataOffset = 16 + headerSize;

function lookup(inner) {
  const parts = inner.split('/').filter(Boolean);
  let node = header;
  for (const part of parts) {
    if (!node.files || !node.files[part]) return null;
    node = node.files[part];
  }
  return node;
}

let outCount = 0;
let byteCount = 0;

function walk(node, inner, outDir) {
  if (node.files) {
    fs.mkdirSync(outDir, { recursive: true });
    for (const [name, child] of Object.entries(node.files)) {
      walk(child, inner ? `${inner}/${name}` : name, path.join(outDir, name));
    }
    return;
  }
  if (node.unpacked) return; // 真身在 app.asar.unpacked 里
  fs.mkdirSync(path.dirname(outDir), { recursive: true });
  const size = Number(node.size ?? 0);
  const buf = Buffer.alloc(size);
  if (size > 0) fs.readSync(fd, buf, 0, size, dataOffset + Number(node.offset));
  fs.writeFileSync(outDir, buf);
  outCount += 1;
  byteCount += size;
}

for (const target of targets) {
  const node = lookup(target);
  if (!node) {
    console.error(`MISS: ${target}`);
    continue;
  }
  const dest = path.join(outRoot, target);
  walk(node, target, dest);
  console.log(`OK: ${target} -> ${dest}`);
}

fs.closeSync(fd);
console.log(`已解出 ${outCount} 个文件，${byteCount} 字节`);
