/**
 * `PLT-01` · **`F-163`** —— 平台版本这条**读数**自己得先过一关：它读的是哪一版、读不到时说不说得出来。
 *
 * 病根（2026-10-24 客户端升到 `0.2.1-rc.3` 之后现量）：asar 目录头里的 `size` 是**声明值**，
 * 这一包把 `package.json` / `dsh/node_modules/@deepseek-ai/dsh/package.json` 的声明长度写得比源文件短 2 B
 * （声明 797 / 7989；源文件 799 / 7991；asar 里能解析的 JSON 文本 798 / 7990，结尾的 `}` 在声明边界外 1 B）。
 * 按 `size` 精确读 ⇒ 结尾的 `}` 被切掉 ⇒ `JSON.parse` 抛 ⇒ 套件印 `[平台] 🔴 判不了`，
 * 而**这条读数没有任何一条用例证明过自己**。
 *
 * 这一格判四件事（合成 asar 造在运行根里，`presets/**`、真实 asar 一个字节都不写）：
 *   A `SHORT-2`  头里的 `size` 比真身短 2 B，两份 package.json 都要能读出**夹具里那个版本号**；
 *   B `BOM`      同一个形状 + 文件头 `\uFEFF`，版本号换成另一个值 ⇒ 证明它读的是**这一份**（不是常量）；
 *   C `TRUNCATED` 短 24 B（> 16 B 的读窗）⇒ **必须判不了**：`ok:false`、版本为 `null`、报文里点名
 *                文件 / 读了多少字节的窗口 / 最后 40 个字符 —— 而且**不许补括号**把它"修"成 JSON；
 *   D `PURE`     把容错解析当纯函数再喂两串文本（短 2 B 的窗口 / 截断的窗口）—— 与 A/C 是同一条腿的
 *                两种入口（合成 asar 走 IO，纯函数走字符串），防止"IO 那一侧绿、解析那一侧松"。
 *
 * 另记 `E LIVE`：**这一跑**在真实 asar 上的 `[平台]` 行（读数，不写死版本）。它今天必须不再
 * `🔴 判不了`；没有安装包时如实记 `asar_present:false`，不把"没装上"当成"读对了"。
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { before, describe, test } from 'node:test'
import { caseFail, preflight, problem, runCase, runRoot } from '../support/evidence.mjs'
import { parseAsarJson, platformLine, platformReading } from '../support/platform.mjs'

before(() => {
  preflight()
})

const DESKTOP = '@deepseek-ai/dsh-desktop'
const DSH = '@deepseek-ai/dsh'
const APP_PKG = 'package.json'
const DSH_PKG = 'dsh/node_modules/@deepseek-ai/dsh/package.json'

/** 夹具里的两份 package.json（**字符串**；asar 造好之后它们就是"真身"，不许再从别处读）。 */
function appPkg(version, { engines = false } = {}) {
  const extras = engines ? '\n  "engines": { "node": ">=20" },' : ''
  return `{\n  "name": "${DESKTOP}",${extras}\n  "version": "${version}",\n  "dshBuildDirty": false\n}\n`
}
const dshPkg = (version) => `{\n  "name": "${DSH}",\n  "version": "${version}",\n  "dshBuildDirty": false\n}\n`

/**
 * 造一份**结构同形**的小 asar：16 B 前缀 + 目录头 JSON + 按 offset 顺序铺开的数据区。
 *
 * 前缀那四个 uint32 照真实 asar 的形状写（`4 / header+9 / header+5 / header`）——
 * 本读具只读第 12..15 字节（头长度），但夹具不因此长成"只有它会认"的形状。
 *
 * `shortBy`：**目录头里声明的 `size` 比真身短几字节**。数据区永远写**完整**字节
 * （真实包就是这样：`size` 是声明值，真身比它长）。这就是被复现的那条几何。
 */
function buildAsar(entries) {
  const tree = { files: {} }
  const chunks = []
  let offset = 0
  for (const entry of entries) {
    const bytes = Buffer.from(entry.text, 'utf8')
    const parts = entry.inner.split('/')
    let node = tree
    for (const part of parts.slice(0, -1)) {
      node.files[part] ??= { files: {} }
      node = node.files[part]
    }
    node.files[parts.at(-1)] = { size: bytes.length - (entry.shortBy ?? 0), offset }
    chunks.push(bytes)
    offset += bytes.length
  }
  const header = Buffer.from(JSON.stringify(tree), 'utf8')
  const head = Buffer.alloc(16)
  head.writeUInt32LE(4, 0)
  head.writeUInt32LE(header.length + 9, 4)
  head.writeUInt32LE(header.length + 5, 8)
  head.writeUInt32LE(header.length, 12)
  return Buffer.concat([head, header, ...chunks])
}

describe('unit · platform reading (PLT) · F-163 asar 头的 size 是声明值', () => {
  test('PLT-01 平台版本读不出来时套件只能"判不了"：短 2 B 要能读、短过窗口必须当场报（点名文件/窗口/最后 40 字）', async () => {
    await runCase('PLT-01', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))

      const dir = path.join(runRoot(), 'plt01-platform-asar')
      mkdirSync(dir, { recursive: true })
      const write = (name, buf) => {
        const file = path.join(dir, name)
        writeFileSync(file, buf)
        return file
      }

      // ── A `SHORT-2`：声明比真身短 2 B，两份都必须读出夹具版本 ─────────────
      const short2Version = '0.2.1-rc.3'
      const short2App = appPkg(short2Version)
      const short2Dsh = dshPkg(short2Version)
      const short2 = write('short2.asar', buildAsar([
        { inner: APP_PKG, text: short2App, shortBy: 2 },
        { inner: DSH_PKG, text: short2Dsh, shortBy: 2 },
      ]))
      const rShort2 = platformReading({ env: { AGENIA_PLATFORM_ASAR: short2 }, fallbackAsar: null })
      rec.readings.short2 = {
        asar: short2,
        declared: { app: Buffer.byteLength(short2App) - 2, dsh: Buffer.byteLength(short2Dsh) - 2 },
        actual: { app: Buffer.byteLength(short2App), dsh: Buffer.byteLength(short2Dsh) },
        ok: rShort2.ok, app: rShort2.app, dsh: rShort2.dsh, line: platformLine(rShort2),
      }
      if (rShort2.ok !== true) {
        push('PLT-SHORT2-UNREADABLE', `声明 size 比真身短 2 B 时读具必须仍读出 ${short2Version}，实得 ok=${rShort2.ok}`
          + `（app.problem=${JSON.stringify(rShort2.app?.problem)} · dsh.problem=${JSON.stringify(rShort2.dsh?.problem)}）`)
      }
      if (rShort2.app?.version !== short2Version) {
        push('PLT-SHORT2-APP', `桌面 App 版本应为夹具里的 ${short2Version}，实得 ${JSON.stringify(rShort2.app?.version)}`)
      }
      if (rShort2.dsh?.version !== short2Version) {
        push('PLT-SHORT2-DSH', `平台包版本应为夹具里的 ${short2Version}，实得 ${JSON.stringify(rShort2.dsh?.version)}`)
      }

      // ── B `BOM`：同一个短 2 B 的形状 + 文件头 BOM，版本换成另一个值 ────────
      //    换版本号是为了证"它读的是这一份文件"：若哪天有人把版本写死成常量，A、B 不可能同时过。
      const bomVersion = '0.2.2-rc.0-bom'
      const bom = write('short2-bom.asar', buildAsar([
        { inner: APP_PKG, text: `\uFEFF${appPkg(bomVersion)}`, shortBy: 2 },
        { inner: DSH_PKG, text: `\uFEFF${dshPkg(bomVersion)}`, shortBy: 2 },
      ]))
      const rBom = platformReading({ env: { AGENIA_PLATFORM_ASAR: bom }, fallbackAsar: null })
      rec.readings.bom = { asar: bom, ok: rBom.ok, app: rBom.app, dsh: rBom.dsh, line: platformLine(rBom) }
      if (rBom.ok !== true || rBom.app?.version !== bomVersion || rBom.dsh?.version !== bomVersion) {
        push('PLT-BOM', `带 BOM 的 package.json 必须剥掉 BOM 后读出 ${bomVersion}，实得 ok=${rBom.ok}`
          + ` app=${JSON.stringify(rBom.app?.version)} dsh=${JSON.stringify(rBom.dsh?.version)}`
          + ` app.problem=${JSON.stringify(rBom.app?.problem)}`)
      }

      // ── C `TRUNCATED`：短 24 B（> 16 B 读窗）⇒ 必须判不了，且报文可读 ──────
      const truncApp = appPkg(short2Version, { engines: true })
      const shortBy = 24
      const trunc = write('short24.asar', buildAsar([
        { inner: APP_PKG, text: truncApp, shortBy },
        { inner: DSH_PKG, text: short2Dsh, shortBy: 0 },
      ]))
      const rTrunc = platformReading({ env: { AGENIA_PLATFORM_ASAR: trunc }, fallbackAsar: null })
      const declaredBytes = Buffer.byteLength(truncApp) - shortBy
      const windowBytes = declaredBytes + 16
      const seenTail = truncApp.slice(0, windowBytes).slice(-40)
      const message = rTrunc.app?.problem ?? ''
      rec.readings.truncated = {
        asar: trunc,
        declared: declaredBytes,
        window: windowBytes,
        actual: Buffer.byteLength(truncApp),
        seen_tail: seenTail,
        ok: rTrunc.ok,
        app: rTrunc.app,
        dsh: rTrunc.dsh,
        line: platformLine(rTrunc),
      }
      if (rTrunc.ok !== false) push('PLT-TRUNC-ACCEPTED', `短 ${shortBy} B（> 读窗 16 B）的 package.json 必须判不了，实得 ok=${rTrunc.ok}、版本 ${JSON.stringify(rTrunc.app?.version)}`)
      if (rTrunc.app?.version !== null) push('PLT-TRUNC-VERSION', `截断文件的版本必须是 null（不许补括号"修"出来），实得 ${JSON.stringify(rTrunc.app?.version)}`)
      if (!message.includes(APP_PKG)) push('PLT-TRUNC-MSG-FILE', `失败报文必须点名文件 ${APP_PKG}，实得：${message}`)
      if (!message.includes('窗口')) push('PLT-TRUNC-MSG-WINDOW', `失败报文必须说清读了多少字节的窗口，实得：${message}`)
      if (!message.includes(`最后 ${40} 个字符`)) push('PLT-TRUNC-MSG-TAIL-LABEL', `失败报文必须给出"最后 40 个字符"，实得：${message}`)
      if (!message.includes(JSON.stringify(seenTail))) push('PLT-TRUNC-MSG-TAIL', `失败报文里的尾巴必须逐字是窗口最后 40 个字符 ${JSON.stringify(seenTail)}，实得：${message}`)
      if (rTrunc.dsh?.version !== short2Version) push('PLT-TRUNC-OUTSIDE', `同一份 asar 里没被截断的那一份（dsh）必须照读，实得 ${JSON.stringify(rTrunc.dsh?.version)}`)

      // ── D `PURE`：同一条腿的字符串入口（合成 asar 走 IO，这里走纯函数）────
      const pureVersion = '1.2.3-pure'
      const pureText = appPkg(pureVersion)
      const pureWindow = `${pureText}NEXT-FILE-BYTES`
      const pure = parseAsarJson(pureWindow, {
        inner: 'pure/package.json',
        declared: Buffer.byteLength(pureText) - 2,
        windowBytes: Buffer.byteLength(pureWindow),
      })
      const pureTruncText = pureText.slice(0, Buffer.byteLength(pureText) - 24)
      const pureTrunc = parseAsarJson(pureTruncText, {
        inner: 'pure/package.json',
        declared: Buffer.byteLength(pureTruncText),
        windowBytes: Buffer.byteLength(pureTruncText),
      })
      rec.readings.pure = {
        short2: { value: pure.value, problem: pure.problem, repaired: pure.repaired },
        truncated: { value: pureTrunc.value, problem: pureTrunc.problem, repaired: pureTrunc.repaired },
      }
      if (pure.problem !== null || pure.value?.version !== pureVersion || pure.repaired !== true) {
        push('PLT-PURE-SHORT2', `纯函数：短 2 B + 尾巴的窗口必须截到最后一个 \`}\` 读出 ${pureVersion}，实得 value=${JSON.stringify(pure.value)} problem=${JSON.stringify(pure.problem)}`)
      }
      if (pureTrunc.problem === null || pureTrunc.value !== null) {
        push('PLT-PURE-TRUNC', `纯函数：截断的窗口必须返回 problem（不许"修"出 JSON），实得 value=${JSON.stringify(pureTrunc.value)} problem=${JSON.stringify(pureTrunc.problem)}`)
      }

      // ── E `LIVE`：这一跑真实 asar 上的 [平台] 行（读数；不写死版本）────────
      const live = platformReading()
      rec.readings.live = {
        asar_present: live.asar !== null,
        ok: live.ok, level: live.level, source: live.source,
        app: live.app, dsh: live.dsh, problems: live.problems,
        line: platformLine(live),
      }
      if (live.asar !== null) {
        if (live.ok !== true) {
          push('PLT-LIVE-UNREADABLE', `真实 asar 在盘（${live.asar}），这一跑必须读出版本，实得 ok=false：${live.problems.join('；')}`)
        }
        for (const [side, reading] of [['app', live.app], ['dsh', live.dsh]]) {
          if (typeof reading?.version !== 'string' || reading.version === '') {
            push('PLT-LIVE-VERSION', `真实 asar 的 ${side} 版本必须是非空字符串，实得 ${JSON.stringify(reading?.version)}`)
          }
        }
        if (!platformLine(live).startsWith('[平台] ') || platformLine(live).includes('判不了')) {
          push('PLT-LIVE-LINE', `真实 asar 读得出来时 [平台] 行不许再是"判不了"：${platformLine(live)}`)
        }
      }

      caseFail(problems)
    })
  })
})
