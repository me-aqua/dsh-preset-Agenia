#!/usr/bin/env node
// 按 zstd 格式**算**帧边界（不靠"搜魔数"—— 压缩数据里也可能撞见魔数），逐帧解，拼接。
//
// 为什么要这个：会话流是**多帧 zstd**，而 `zlib.zstdDecompressSync` 只解第一帧、
// **静默丢掉后面几 MB**（实测 744 KB 的 v4 流只吐出 191 字符）。
//
// 帧结构（RFC 8878）：
//   Magic_Number(4) | Frame_Header_Descriptor(1) | [Window_Descriptor(1)] |
//   [Dictionary_ID(0/1/2/4)] | [Frame_Content_Size(0/1/2/4/8)] | Blocks… | [Checksum(4)]
//   块头 3 字节（小端 24 位）：bit0 = Last_Block，bits1-2 = Block_Type，bits3-23 = Block_Size
//   Block_Type: 0=Raw  1=RLE  2=Compressed  3=Reserved
//
// 用法:
//   node zstd-frames.mjs <文件> [--json-out <路径>] [--list]
//   （把一个目录整批报大小：见 --scan <目录>）

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ZSTD_MAGIC = 0xfd2fb528;
const BLOCK_HEADER = 3;

/** 读一个帧：返回头部各字段 + 负载结束偏移 + 总长 + 是否带校验和。 */
function readFrame(buf, start) {
  if (start + 4 > buf.length || buf.readUInt32LE(start) !== ZSTD_MAGIC) {
    throw new Error(`偏移 ${start} 不是 zstd 帧头`);
  }
  let pos = start + 4;
  const descriptor = buf[pos];
  pos += 1;

  const fcsFlag = descriptor >> 6;
  const singleSegment = (descriptor >> 5) & 1;
  const hasChecksum = ((descriptor >> 2) & 1) === 1;
  const dictIdFlag = descriptor & 3;
  const reserved = (descriptor >> 3) & 1;
  const unused = (descriptor >> 4) & 1;

  if (reserved === 1 || unused === 1) throw new Error(`帧头保留位非零（偏移 ${start}）`);

  if (!singleSegment) pos += 1; // Window_Descriptor
  pos += [0, 1, 2, 4][dictIdFlag]; // Dictionary_ID
  const fcsSize = fcsFlag === 0 ? (singleSegment ? 1 : 0) : [0, 2, 4, 8][fcsFlag];
  let contentSize = null;
  if (fcsSize === 1) contentSize = buf.readUInt8(pos);
  else if (fcsSize === 2) contentSize = buf.readUInt16LE(pos) + 256;
  else if (fcsSize === 4) contentSize = buf.readUInt32LE(pos);
  else if (fcsSize === 8) contentSize = Number(buf.readBigUInt64LE(pos));
  pos += fcsSize;

  const headerSize = pos - start;

  // 走块
  let blocks = 0;
  let last = false;
  while (!last) {
    if (pos + BLOCK_HEADER > buf.length) throw new Error(`块头越过文件末尾（偏移 ${pos}）`);
    const raw = buf.readUIntLE(pos, BLOCK_HEADER);
    last = (raw & 1) === 1;
    const blockType = (raw >> 1) & 3;
    const blockSize = raw >> 3;
    pos += BLOCK_HEADER;
    if (blockType === 3) throw new Error(`块类型 3 是保留值（偏移 ${pos - BLOCK_HEADER}）`);
    if (blockType === 1) pos += 1; // RLE：1 字节
    else pos += blockSize; // Raw：原样；Compressed：压缩后字节数
    blocks += 1;
  }

  const payloadEnd = pos;
  const totalEnd = payloadEnd + (hasChecksum ? 4 : 0);
  return { headerSize, contentSize, hasChecksum, blocks, payloadEnd, totalEnd, bytes: totalEnd - start };
}

/** 解一个文件（多帧），返回 { text, frames }。 */
function decompressFile(file) {
  const buf = fs.readFileSync(file);
  const frames = [];
  const pieces = [];
  let offset = 0;
  let index = 0;
  while (offset < buf.length) {
    const info = readFrame(buf, offset);
    const frameBytes = buf.subarray(offset, info.totalEnd);
    let out = null;
    let error = null;
    try {
      out = zlib.zstdDecompressSync(frameBytes);
    } catch (cause) {
      error = cause.message;
    }
    frames.push({ index, offset, ...info, outBytes: out?.length ?? 0, error });
    if (out) pieces.push(out);
    offset = info.totalEnd;
    index += 1;
  }
  return { text: Buffer.concat(pieces).toString('utf8'), frames, bytes: buf.length };
}

const args = process.argv.slice(2);
const scanAt = args.indexOf('--scan');

if (scanAt >= 0) {
  const root = args[scanAt + 1];
  const dirs = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, entry.name));

  console.log(`扫描 ${root}（${dirs.length} 个会话目录）`);
  console.log('落盘时刻            目录名                                               v3 文件   v4 文件   解出字符   建立时刻(preset)');
  const rows = [];
  for (const dir of dirs) {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl.zstd'));
    if (files.length === 0) continue;
    let total = 0;
    let head = null;
    const sizes = {};
    for (const file of files) {
      const full = path.join(dir, file);
      const stat = fs.statSync(full);
      sizes[file.includes('.v4.') ? 'v4' : 'v3'] = stat.size;
      if (file.includes('.v4.')) {
        try {
          const { text } = decompressFile(full);
          total += text.length;
          const first = text.split(/\r?\n/)[0];
          if (first) head = JSON.parse(first);
        } catch {
          /* 坏流跳过 */
        }
      }
    }
    const mtime = fs.statSync(dir).mtime.toISOString().slice(0, 16).replace('T', ' ');
    const created = head?.createdAt ? new Date(head.createdAt).toISOString().slice(0, 16).replace('T', ' ') : '?';
    rows.push({ mtime, name: path.basename(dir), v3: sizes.v3 ?? 0, v4: sizes.v4 ?? 0, total, created, preset: head?.agentPreset ?? '?' });
  }
  rows.sort((a, b) => a.mtime.localeCompare(b.mtime));
  for (const row of rows) {
    const mark = row.total > 2000 ? '★' : ' ';
    console.log(
      `${mark}${row.mtime}  ${row.name.padEnd(52)} ${String(row.v3).padStart(8)} ${String(row.v4).padStart(9)} ${String(row.total).padStart(10)}   ${row.created} (${row.preset})`,
    );
  }
  console.log('\n★ = 这个会话里真有对话（解出 > 2000 字符）；没星的只有一行 session 头。');
  process.exit(0);
}

const file = args[0];
const jsonOutAt = args.indexOf('--json-out');
const jsonOut = jsonOutAt >= 0 ? args[jsonOutAt + 1] : null;

if (!file) {
  console.error('用法: node zstd-frames.mjs <文件> [--json-out <路径>]   或   --scan <目录>');
  process.exit(2);
}

const { text, frames, bytes } = decompressFile(file);
console.log(`文件: ${file}`);
console.log(`字节: ${bytes}  帧: ${frames.length}`);
for (const frame of frames) {
  console.log(
    `  帧 ${frame.index}: 偏移 ${String(frame.offset).padStart(8)} · 总长 ${String(frame.bytes).padStart(8)} B · ` +
      `块 ${String(frame.blocks).padStart(4)} · 声明解压 ${String(frame.contentSize ?? '?').padStart(9)} · 实解 ${String(frame.outBytes).padStart(9)} B` +
      (frame.contentSize != null && frame.contentSize !== frame.outBytes ? '  ⚠️ 不符' : '') +
      (frame.error ? `  ❌ ${frame.error}` : ''),
  );
}
console.log(`合计: ${text.length} 字符 · LF ${(text.match(/\n/g) ?? []).length} 个`);
if (jsonOut) {
  fs.writeFileSync(jsonOut, text);
  console.log(`已落盘: ${jsonOut}`);
}
