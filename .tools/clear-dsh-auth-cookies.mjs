/**
 * 清理 DeepSeek Harness 桌面版累积的 dsh-auth-* Cookie。
 *
 * 背景：桌面版每次启动都会由本地 host 发一个 `dsh-auth-<随机>` Cookie
 * （Path=/，有效期 30 天），但旧的一直不删。Chromium 会把这些 Cookie
 * 全部塞进同一域（127.0.0.1）的 `Cookie:` 请求头。每个约 226 字节，
 * 攒到 ~72 个时请求头超过 Node http 服务端默认的 16 KB 上限
 * （maxHeaderSize = 16384），host 直接回 431 Request Header Fields Too Large，
 * 外壳只看到"非 2xx"，于是报 `desktop welcome: Web authentication failed`。
 *
 * 用法（在仓库根跑）：
 *   node .tools/clear-dsh-auth-cookies.mjs --dry    # 只报数，不删
 *   node .tools/clear-dsh-auth-cookies.mjs          # 清理（自动备份到 .team/_repair-backups/Cookies.bak-<时间>，落项目盘不落 C 盘）
 * 运行前请先完全退出 DeepSeek Harness（含托盘），否则库被占着打不开。
 *
 * 只删 host_key='127.0.0.1' 且 name like 'dsh-auth-%' 的行 —— **别整个删 Cookies 库**：
 * 那会顺带踢掉客户端里别的登录态。
 *
 * 2026-11-12 加：来历与完整证据见仓库根 `修复-DSH桌面版启动失败.md`。
 * 放在 .tools/ 而不是 .workbuddy/：后者是 gitignore 的本机工作区记忆，这里是要留下的工具。
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const dry = process.argv.includes('--dry');
const dir = path.join(os.homedir(), 'AppData', 'Roaming', '@deepseek-ai', 'dsh-desktop', 'Network');
const dbPath = path.join(dir, 'Cookies');

if (!fs.existsSync(dbPath)) {
  console.log('找不到 Cookies 数据库：', dbPath);
  process.exit(1);
}

const { DatabaseSync } = await import('node:sqlite');
const openDb = () => {
  try {
    return new DatabaseSync(dbPath);
  } catch (error) {
    // 客户端还在跑的时候 Chromium 独占这个库，sqlite 只回一句 "unable to open database file"。
    console.log('打不开 Cookies 数据库 —— 多半是客户端还在跑（它独占了这个文件）。');
    console.log('请先**完全退出** DeepSeek Harness（窗口关掉不算，右下角托盘图标也要退出），再跑一次。');
    console.log(`  库：${dbPath}`);
    console.log(`  原始错误：${error.message}`);
    process.exit(2);
  }
};
const db = openDb();

const report = () => {
  const rows = db.prepare(
    "select count(*) as n, sum(length(name) + length(value) + 2) as bytes from cookies where host_key='127.0.0.1' and name like 'dsh-auth-%'"
  ).get();
  console.log(`当前 dsh-auth-* Cookie：${rows.n} 个，约 ${rows.bytes ?? 0} 字节（含 "name=value; " 约 ${(rows.bytes ?? 0) + rows.n * 3} 字节请求头）`);
  return rows.n;
};

const before = report();
if (dry) {
  console.log('（--dry：未做改动）');
  process.exit(0);
}
if (before === 0) {
  console.log('已经是干净的，无需清理。');
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
// 🔴 备份落**项目盘**不落 C 盘（队规：C 盘一个字节都不许写）。DB 本身在原处是没办法的事 ——
//    它是客户端自己的库，删行必须动它；但多出来的一份拷件没理由放 C 盘。
const backupDir = path.resolve(process.cwd(), '.team', '_repair-backups');
fs.mkdirSync(backupDir, { recursive: true });
const backup = path.join(backupDir, `Cookies.bak-${stamp}`);
fs.copyFileSync(dbPath, backup);
console.log('已备份：', backup, '（落项目盘；原库备份行归这里，不占 C 盘）');

const del = db.prepare("delete from cookies where host_key='127.0.0.1' and name like 'dsh-auth-%'");
del.run();
console.log('已删除。清理后：');
report();
db.close();
console.log('完成。重新打开 DeepSeek Harness 即可。');
