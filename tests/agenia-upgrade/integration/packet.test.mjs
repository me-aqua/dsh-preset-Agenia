/**
 * REV-01 —— 会话包（多帧 zstd 夹具 + 窗口/排除项/坏帧）。
 *
 * 冻结依据：契约 §6.7 REV-01 + AGENTS.local.md **五之二**（多帧 zstd：只解第一帧会**静默丢几 MB**；按 RFC 8878 算帧边界，
 * **不许靠搜魔数**）+ 提案 §B1.6（夹具接缝）。
 *
 * 🔴 两条纪律：
 *   ① **不许自造解压器**：帧边界用现成工具 `.tools/asar-cli/zstd-frames.mjs`（它带 `--json-out`，按 RFC 8878 读块头）。
 *      那个脚本**有顶层副作用**（import 就会执行）⇒ 只能当子进程调，**不能 import**。
 *   ② **夹具要有阴性对照**：`zlib.zstdDecompressSync(整个多帧文件)` 只会吐出**第一帧** ——
 *      这一条正是"只解第一帧"的 bug 形状；夹具必须能把它抓出来，否则这个夹具是摆设。
 *
 * ⚠️ 本用例分两半，读数里分得清清楚楚：
 *   · **A 半（夹具与口径）**：今天就能跑，今天就是**通过**的；
 *   · **B 半（被测对象的会话包生成/校验）**：**接口没有冻结** —— 提案 §B1.3 的文件清单里没有会话包模块，
 *     §B1.4 的三张 op 表里也没有会话包 op ⇒ 我**不发明**模块名与函数名，改为记一条
 *     `REV01-INTERFACE-UNFROZEN`（要冻什么写在报文里），并让这一半红在 `SUT-SURFACE-MISSING` 上。
 */
import { before, describe, test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { ENV } from '../support/env.mjs'
import { caseFail, preflight, problem, runCase, sha256Equal, sha256File, stagingReadings, writeJson } from '../support/evidence.mjs'
import { canonical, ensureMarkedDir } from '../support/root-guard.mjs'
import { fixturePath, loadStagedModule, nonCallables, runCli, stagingExists, writeFixture } from '../support/sut.mjs'

before(() => {
  preflight()
})

const DAY = '2026-10-14'

/** 每例一个带 marker 的工作区（路线/包的家）。 */
function caseWorkspace(id, name) {
  const runRoot = canonical(process.env[ENV.RUN_ROOT])
  return ensureMarkedDir(path.join(runRoot, `ws-${id.toLowerCase()}-${name}`), {
    runRoot,
    runId: path.basename(runRoot),
    kind: 'agenia-test-workspace',
  })
}

/** 冻结字符口径（提案 §B3.4）：去 BOM、CRLF/CR → LF、按 code point 计；**不 trim、不做 NFC**。 */
function frozenCharCount(text) {
  return [...String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')].length
}

/** outDir 里现有的包目录（`packet-*`）。 */
function listPacketDirs(dir) {
  return existsSync(dir) ? readdirSync(dir).filter((n) => n.startsWith('packet-')).sort() : []
}

/** 从 build 的返回里读 manifest（读不到就给 null）。 */
function manifestOf(built) {
  const p = built?.manifest_path
  if (!p || !existsSync(p)) return null
  try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return null }
}

const ZSTD_TOOL = 'E:\\Harness\\.tools\\asar-cli\\zstd-frames.mjs'

/** 合成一条"会话流"（本项目的 / 别的项目的 / 本次评审作业的），压成**多帧**：逐段压缩再拼接。 */
function multiFrameFixture() {
  const chunks = [
    { project: 'harness', session: 'session-aaa-0001', lines: ['（夹具）本项目 · 上一窗口的第一段', '（夹具）本项目 · 第二段'] },
    { project: 'other', session: 'session-bbb-0002', lines: ['（夹具）别的项目 · 不该进包'] },
    { project: 'harness', session: 'session-ccc-0003', lines: ['（夹具）本项目 · 本次评审作业自己 · 不该进包'] },
    { project: 'harness', session: 'session-ddd-0004', lines: ['（夹具）本项目 · 窗口内的最后一段'] },
  ]
  // 每段一个**真 zstd 帧**；拼起来就是多帧文件（帧边界 = 每段压缩后的字节长度，不靠搜魔数）
  const frames = chunks.map((c) => zlib.zstdCompressSync(Buffer.from(`${c.lines.join('\n')}\n`, 'utf8')))
  const buf = Buffer.concat(frames)
  const file = fixturePath('rev-01', 'multi-frame-session', 'jsonl.zstd')
  writeFileSync(file, buf) // ⚠️ 二进制必须按字节写，不能走"按 utf8 写文本"那条路
  return { file, chunks, frameBytes: frames.map((f) => f.length), total: buf.length }
}

describe('integration · packet (REV-01)', () => {
  test('REV-01 多帧 zstd 会话包：帧边界按 RFC 8878 算；窗口/排除项/坏帧不产半包', async () => {
    await runCase('REV-01', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      rec.readings.staging = stagingReadings()

      // ── A 半：夹具本身（今天必须通过）────────────────────────────────────
      const fx = multiFrameFixture()
      rec.readings.fixture = { file: fx.file, bytes: fx.total, frames: fx.frameBytes.length, frame_bytes: fx.frameBytes }
      if (fx.frameBytes.length < 2) push('FIXTURE', `夹具必须是**多帧**（≥2 帧），实得 ${fx.frameBytes.length} 帧`)

      // ① 阴性对照：只解第一帧会丢多少 —— 这就是"只解第一帧"的 bug 形状
      const whole = readFileSync(fx.file)
      let firstOnly = null
      let firstOnlyErr = null
      try { firstOnly = zlib.zstdDecompressSync(whole).toString('utf8') } catch (err) { firstOnlyErr = String(err?.message ?? err) }
      const allText = fx.chunks.map((c) => `${c.lines.join('\n')}\n`).join('')
      rec.readings.first_frame_trap = {
        first_only_chars: firstOnly === null ? null : firstOnly.length,
        all_chars: allText.length,
        decompress_error: firstOnlyErr,
      }
      // 🔴 裁定 v1.14 ③：对照**必须拿到真的"被截断的解压结果"（不是异常）**才算成立。
      //    以前把异常也包成字符串 ⇒ `typeof === 'string'` 成立、长度又短 ⇒ **对照没跑却不算红**。
      if (firstOnlyErr !== null) {
        push('FIXTURE-CONTROL', `阴性对照没跑成：\`zstdDecompressSync(整个多帧文件)\` 抛了异常（${firstOnlyErr.slice(0, 200)}）—— 这一条要的是"只解第一帧会丢内容"的**实测结果**，不是异常`)
      } else if (firstOnly.length >= allText.length) {
        push('FIXTURE-CONTROL', '阴性对照不成立：只解第一帧竟然拿到了全部内容 —— 这个夹具抓不出"只解第一帧"的 bug')
      }

      // ② 帧边界：**用现成工具**（不许自造解压器）
      if (!existsSync(ZSTD_TOOL)) {
        push('ZSTD-TOOL-MISSING', `现成工具不在：${ZSTD_TOOL} —— 帧边界没法定（不许自己写解压器）`)
      } else {
        const res = spawnSync(process.execPath, [ZSTD_TOOL, fx.file], { encoding: 'utf8', timeout: 30000, windowsHide: true })
        const out = `${res.stdout ?? ''}`
        rec.readings.zstd_tool = { exit_code: res.status, head: out.split(/\r?\n/).slice(0, 3) }
        const frameLine = /帧:\s*(\d+)/.exec(out)
        const declared = frameLine ? Number(frameLine[1]) : null
        if (res.status !== 0) push('ZSTD-TOOL', `zstd-frames.mjs 退出码 ${res.status}：${(res.stderr ?? '').slice(0, 200)}`)
        if (declared !== fx.frameBytes.length) {
          push('ZSTD-TOOL', `工具数出的帧数 ${declared} ≠ 夹具造的帧数 ${fx.frameBytes.length} —— 夹具与"按 RFC 8878 算边界"的口径对不上`)
        }
        if (!/合计:\s*\d+\s*字符/.test(out)) push('ZSTD-TOOL', '工具没报"合计 … 字符" —— 多帧拼接解压这一路没跑通')
      }

      // ── **v1.6 的真样本**：四类 `sources` + 坏帧对照（**夹具在 SUT 之外先造好**）──────────
      // 为什么要先造：SUT 今天还不在盘上（`lib/packet.mjs` 未实现），那一段调用会整块跳过 ——
      // 夹具与"期望值"若也写在里面，今天就**什么都证明不了**。放外面 ⇒ 今天就能证明"样本是真的"。
      // 坏帧样本 = 一个**好帧** + 一个**截断的帧头**（magic + 描述符 0x00 后面就没了）。
      // ⚠️ 第一版我拿"把帧尾切掉 5 字节"当坏帧 —— **自控当场抓出它不坏**：现成工具把它读成 2 个正常帧、exit=0
      //    （帧的块结构在那 5 字节之前就收尾了，工具不会去查 `pos` 是否越界）。坏样本必须**真的解不动**，
      //    否则"排除项不许被解压"这条根本测不出来。
      const corruptFile = (name) => {
        const good = zlib.zstdCompressSync(Buffer.from(`（夹具）${name} · 不该被解压\n`, 'utf8'))
        const truncatedHeader = Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 0x00]) // magic + descriptor，后面缺 Window_Descriptor/块
        const file = fixturePath('rev-01', name, 'jsonl.zstd')
        writeFileSync(file, Buffer.concat([good, truncatedHeader]))
        return file
      }
      const sources = [
        { session_id: 'session-in-window', project: 'harness', file: fx.file, last_event_at: '2026-10-14T11:30:00+08:00' },
        { session_id: 'session-other-project', project: 'other', file: corruptFile('src-other-project'), last_event_at: '2026-10-14T11:45:00+08:00' },
        { session_id: 'session-self-review', project: 'harness', file: corruptFile('src-self-review'), last_event_at: '2026-10-14T11:40:00+08:00' },
        { session_id: 'session-outside-window', project: 'harness', file: corruptFile('src-outside-window'), last_event_at: '2026-10-14T08:00:00+08:00' },
      ]
      const EXPECT_EXCLUDED = ['session-other-project:other_project', 'session-outside-window:outside_window', 'session-self-review:self_review'].sort()
      rec.readings.sources = sources.map((s) => ({ session_id: s.session_id, project: s.project, last_event_at: s.last_event_at, is_in_window_fixture: s.file === fx.file }))
      rec.readings.expected_excluded_pairs = EXPECT_EXCLUDED
      rec.readings.expected_frames = { count: fx.chunks.length, all_chars: frozenCharCount(allText), first_frame_chars: frozenCharCount(`${fx.chunks[0].lines.join('\n')}\n`), bytes: fx.total }
      // **夹具自控**（今天就能跑）：窗口内那份源必须是**好的 4 帧**；三份被排除的源必须是**真坏帧**。
      if (existsSync(ZSTD_TOOL)) {
        const control = {}
        for (const s of sources) {
          const res = spawnSync(process.execPath, [ZSTD_TOOL, s.file], { encoding: 'utf8', timeout: 30000, windowsHide: true })
          const frames = Number(/帧:\s*(\d+)/.exec(`${res.stdout ?? ''}`)?.[1] ?? NaN)
          control[s.session_id] = { exit_code: res.status, frames: Number.isNaN(frames) ? null : frames, expect: s.file === fx.file ? '好' : '坏' }
          if (s.file === fx.file) {
            if (res.status !== 0 || frames !== fx.chunks.length) push('FIXTURE-CONTROL', `窗口内那份源必须是可解的 ${fx.chunks.length} 帧，工具读成 exit=${res.status} frames=${frames}`)
          } else if (res.status === 0) {
            push('FIXTURE-CONTROL', `被排除的那份源（${s.session_id}）**不是**坏帧（工具 exit=0）—— 那"排除项不许被解压"这条就测不出来`)
          }
        }
        rec.readings.fixture_control = control
      }

      // ══ B 半：被测对象（**追加裁定 v1.5 已冻结**：`lib/packet.mjs` + 四个导出 + 包布局/manifest/五个码）══
      const PACKET_EXPORTS = ['readSessionStream', 'packetWindow', 'buildSessionPacket', 'validateSessionPacket']
      const pk = await loadStagedModule('lib/packet.mjs', PACKET_EXPORTS)
      rec.readings.packet_lib = { surfaceMissing: pk.surfaceMissing, missing: pk.missing, errors: pk.errors, exports: PACKET_EXPORTS }
      if (pk.surfaceMissing) push('SUT-SURFACE-MISSING', 'staged/lib/packet.mjs 不在 ⇒ 会话包四面拿不到（预期的首跑红；v1.5 已冻这个名字）')
      for (const n of pk.missing) push('SUT-SURFACE-MISSING', `staged/lib/packet.mjs 没有导出 ${n}（v1.5 冻了这四个导出）`)
      for (const n of nonCallables(pk.mod, PACKET_EXPORTS)) push('SUT-SURFACE-MISSING', `staged/lib/packet.mjs 导出的 ${n} 不是函数`)

      const markerOf = (c) => c.lines[0] // `allText`（A 半已经算好：4 段拼起来的样子）直接用
      const callSoft = (label, fn, ...args) => {
        try { return { value: fn(...args), threw: null } } catch (err) { return { value: null, threw: err } }
      }

      if (pk.mod !== null && nonCallables(pk.mod, PACKET_EXPORTS).length === 0) {
        const ws = caseWorkspace('REV-01', 'packet')
        const statusRoot = path.join(ws, '.team')
        const nowIso = '2026-10-14T12:00:00+08:00'

        // ① `readSessionStream`：正例 = **全帧拼接**（4 帧的每一段都要在）；负例 = 坏帧 ⇒ `E_PACKET_FRAMES`
        const good = callSoft('readSessionStream(正例)', pk.mod.readSessionStream, fx.file)
        rec.readings.read_stream_good = { threw: good.threw ? String(good.threw.message).slice(0, 140) : null, chars: typeof good.value === 'string' ? good.value.length : null }
        if (good.threw) {
          push('PACKET-READ', `readSessionStream 对**好的**多帧夹具抛错了：${String(good.threw.message).slice(0, 160)}`)
        } else {
          const text = String(good.value ?? '')
          for (const c of fx.chunks) {
            if (!text.includes(markerOf(c))) push('PACKET-READ', `全帧拼接缺了「${markerOf(c)}」这一段 —— 只解第一帧会正好丢后面几段（v1.5：全帧拼接文本）`)
          }
          // 与"只解第一帧"那个实测结果比（对照没跑成时 `firstOnly === null` ⇒ 这一条不空判，A 半已经红了）
          if (firstOnly !== null && text.length <= firstOnly.length) {
            push('PACKET-READ', `解出来的字符数 ${text.length} ≤ 只解第一帧的 ${firstOnly.length} —— 没有把 4 帧都解出来`)
          }
          rec.readings.read_stream_text_chars = text.length
          rec.readings.read_stream_all_chars = allText.length
        }
        // 坏帧：在文件末尾接一段**截断**的帧（字节切掉尾巴）⇒ 必须抛 E_PACKET_FRAMES
        const badFile = fixturePath('rev-01', 'truncated-frame', 'jsonl.zstd')
        writeFileSync(badFile, Buffer.concat([readFileSync(fx.file), readFileSync(fx.file).subarray(0, Math.max(1, fx.frameBytes[0] - 5))]))
        const bad = callSoft('readSessionStream(坏帧)', pk.mod.readSessionStream, badFile)
        rec.readings.read_stream_bad = { threw: bad.threw ? String(bad.threw.message).slice(0, 160) : null, code: bad.threw?.code ?? null }
        if (!bad.threw) push('PACKET-FRAMES', '截断的帧没有让 readSessionStream 抛错 —— v1.5：坏帧/截断 ⇒ `E_PACKET_FRAMES`，不许吐半截')
        else if (bad.threw.code !== 'E_PACKET_FRAMES' && !String(bad.threw.message).includes('E_PACKET_FRAMES')) {
          push('PACKET-FRAMES', `坏帧的码应是 E_PACKET_FRAMES，实得 ${JSON.stringify(bad.threw.code ?? bad.threw.message.slice(0, 80))}`)
        }

        // ② `packetWindow`：没有评审完成记录 ⇒ `from:null`；有 ⇒ `from` = **最近一次**完成事件的 `occurred_at`
        const routeDir = path.join(statusRoot, 'route')
        const currentPath = path.join(routeDir, 'current.json')
        mkdirSync(routeDir, { recursive: true })
        // ②-a 空路线（还没评审过）：from 必须是 null，to 必须是我给的 now
        writeJson(currentPath, { goal: { id: 'g1', title: '（夹具）目标' }, stages: [], current_stage_id: null, tasks: [], current_task_id: null, tickets: [] })
        const w0 = callSoft('packetWindow(无评审)', pk.mod.packetWindow, { statusRoot, now: nowIso })
        rec.readings.window_empty = { threw: w0.threw ? String(w0.threw.message).slice(0, 140) : null, value: w0.value ?? null }
        if (w0.threw) push('PACKET-WINDOW', `packetWindow 在没有评审记录的干净路线上抛错了：${String(w0.threw.message).slice(0, 160)}`)
        else {
          if (w0.value?.from !== null) push('PACKET-WINDOW', `没有评审完成事件时 \`from\` 必须是 null（v1.5），实得 ${JSON.stringify(w0.value?.from)}`)
          if (w0.value?.to !== nowIso) push('PACKET-WINDOW', `\`to\` 必须是我给的 now ${nowIso}，实得 ${JSON.stringify(w0.value?.to)}`)
        }
        // ②-b 两条评审完成记录 ⇒ from = 晚的那条（"最近一次"）
        const earlier = '2026-10-14T09:15:00+08:00'
        const latest = '2026-10-14T10:45:00+08:00'
        writeJson(currentPath, {
          goal: { id: 'g1', title: '（夹具）目标' },
          stages: [{ id: 's1', name: '执行一', order: 1, state: 'current', exit_criteria: '（夹具）', outcome_evidence: null, boss_gate: 'none', boss_approval_evidence: null, started_at: earlier, closed_at: null }],
          current_stage_id: 's1', tasks: [], current_task_id: null, tickets: [],
          reviews: [
            { field: 'conversation', event: 'complete', occurred_at: earlier, attempt: 1 },
            { field: 'technical', event: 'complete', occurred_at: latest, attempt: 2 },
          ],
        })
        const w1 = callSoft('packetWindow(有评审)', pk.mod.packetWindow, { statusRoot, now: nowIso })
        rec.readings.window_latest = { threw: w1.threw ? String(w1.threw.message).slice(0, 140) : null, value: w1.value ?? null, planted_earlier: earlier, planted_latest: latest }
        if (w1.threw) push('PACKET-WINDOW', `packetWindow 在带评审记录的路线上抛错了：${String(w1.threw.message).slice(0, 160)}`)
        else if (w1.value?.from !== latest) {
          push('PACKET-WINDOW', `\`from\` 应取**最近一次** review 完成事件的 occurred_at=${latest}，实得 ${JSON.stringify(w1.value?.from)}`)
        }
        rec.readings.window_event_shape = {
          frozen_by: '追加裁定 v1.6 ①',
          note: '`current.json` 的 `reviews[]` 每项必填 `event:"complete"` · `occurred_at`(ISO8601) · `attempt`(正整数)；`packetWindow` 取 `event==="complete"` 里 `occurred_at` **最大**的一条（同一时刻取 `attempt` 最大），一条都没有 ⇒ `from:null`。其它键（如 `field`）允许存在但不参与判定。⚠️ 同一时刻 + 不同 attempt 的并列**从 `from` 上看不出差别**（`from` 就是那个时刻本身）⇒ 这一档没有可观测断言，不写假断言。',
        }

        // ③ `buildSessionPacket` + `validateSessionPacket`：布局 / manifest 必填 / content SHA / **三类排除用真样本**
        const outDir = path.join(statusRoot, 'retro', DAY, 'conversation-packet')
        mkdirSync(outDir, { recursive: true })
        // `sources`（四类真样本）与期望值在 SUT 之外已经造好并记进读数了（上面那段）——
        // 被排除的三份源故意是**坏帧**：`不进包的 source 不许被解压` ⇒ 实现要是解了它们，这里会当场 `E_PACKET_FRAMES`。
        const built = callSoft('buildSessionPacket', pk.mod.buildSessionPacket, { project: 'harness', outDir, statusRoot, now: nowIso, sources, excludeSessionIds: ['session-self-review'] })
        rec.readings.build = { threw: built.threw ? String(built.threw.message).slice(0, 200) : null, value: built.value ?? null }
        if (built.threw) {
          push('PACKET-BUILD', `buildSessionPacket 抛错：${String(built.threw.message).slice(0, 200)}（v1.6：一份窗口内好源 + 三份待排除源应当出包；抛出 E_PACKET_FRAMES 就说明**排除项也被解压了**）`)
        } else {
          const r = built.value ?? {}
          for (const key of ['ok', 'packet_id', 'dir', 'manifest_path', 'content_sha256', 'frames', 'excluded']) {
            if (!(key in r)) push('PACKET-BUILD', `buildSessionPacket 的返回缺 ${key}（v1.5 冻了这七个键）`)
          }
          if (r.ok !== true) push('PACKET-BUILD', `正常输入应 ok:true，实得 ${JSON.stringify(r.ok)}`)
          const dir = String(r.dir ?? '')
          if (!/packet-\d{8}-\d{6}-[0-9a-f]{8}$/.test(path.basename(dir))) {
            push('PACKET-LAYOUT', `包目录名应形如 \`packet-<YYYYMMDD-HHmmss>-<packet_id 前 8 位>\`，实得 ${JSON.stringify(path.basename(dir))}`)
          }
          if (!dir.startsWith(outDir)) push('PACKET-LAYOUT', `包目录必须落在 outDir 里，实得 ${dir}（outDir=${outDir}）`)
          const manifestPath = path.join(dir, 'manifest.json')
          const contentPath = path.join(dir, 'content.jsonl')
          const files = existsSync(dir) ? readdirSync(dir).sort() : []
          rec.readings.packet_files = files
          if (JSON.stringify(files) !== JSON.stringify(['content.jsonl', 'manifest.json'])) {
            push('PACKET-LAYOUT', `包目录里必须恰好是 ['content.jsonl','manifest.json']（v1.5：不许更多必需文件），实得 ${JSON.stringify(files)}`)
          }
          if (!existsSync(contentPath)) push('PACKET-LAYOUT', '包目录里没有 content.jsonl')
          else {
            // content_sha256 **必须等于 content.jsonl 的字节 sha256**（小写）
            const realSha = sha256File(contentPath)
            rec.readings.content_sha = { returned: r.content_sha256 ?? null, computed: realSha }
            if (!sha256Equal(r.content_sha256, realSha)) push('PACKET-CONTENT-SHA', `返回的 content_sha256=${JSON.stringify(r.content_sha256)} 与 content.jsonl 字节 sha256=${realSha} 不一致（v1.5 要求相等、小写）`)
            if (typeof r.content_sha256 === 'string' && r.content_sha256 !== r.content_sha256.toLowerCase()) push('PACKET-CONTENT-SHA', `content_sha256 必须小写，实得 ${r.content_sha256}`)
          }
          const man = existsSync(manifestPath) ? (() => { try { return JSON.parse(readFileSync(manifestPath, 'utf8')) } catch { return null } })() : null
          rec.readings.manifest = man
          if (man === null) push('PACKET-MANIFEST', 'manifest.json 不存在或不是可解析 JSON')
          else {
            const need = { schema: 'agenia.session-packet/1' }
            for (const [k, v] of Object.entries(need)) if (man[k] !== v) push('PACKET-MANIFEST', `manifest.${k} 应为 ${JSON.stringify(v)}，实得 ${JSON.stringify(man[k])}`)
            for (const k of ['packet_id', 'project', 'created_at', 'window', 'source_ids', 'excluded', 'frames', 'content_sha256', 'tool']) {
              if (!(k in man)) push('PACKET-MANIFEST', `manifest 缺必填字段 ${k}（v1.5 的字段表）`)
            }
            if (man.project !== 'harness') push('PACKET-MANIFEST', `manifest.project 应为 harness，实得 ${JSON.stringify(man.project)}`)
            if (man.window === null || typeof man.window !== 'object') push('PACKET-MANIFEST', 'manifest.window 必须是对象 {from,to}')
            else {
              if (man.window.to !== nowIso) push('PACKET-MANIFEST', `manifest.window.to 应等于 now ${nowIso}，实得 ${JSON.stringify(man.window.to)}`)
              if (man.window.from !== latest) push('PACKET-MANIFEST', `manifest.window.from 应等于最近一次评审完成时刻 ${latest}，实得 ${JSON.stringify(man.window.from)}`)
            }
            if (!Array.isArray(man.source_ids)) push('PACKET-MANIFEST', 'manifest.source_ids 必须是数组')
            const reasons = new Set(['other_project', 'self_review', 'outside_window'])
            if (!Array.isArray(man.excluded)) push('PACKET-MANIFEST', 'manifest.excluded 必须是数组')
            else for (const e of man.excluded) {
              if (!e || typeof e !== 'object') { push('PACKET-EXCLUDE', `excluded 的每一项必须是对象，实得 ${JSON.stringify(e)}`); continue }
              if (!('session_id' in e) || !('reason' in e)) push('PACKET-EXCLUDE', `excluded 项缺 session_id/reason：${JSON.stringify(e)}`)
              if (!reasons.has(e.reason)) push('PACKET-EXCLUDE', `excluded 的 reason 必须是 ${[...reasons].join('|')} 之一，实得 ${JSON.stringify(e.reason)}`)
            }
            const fr = man.frames
            if (fr === null || typeof fr !== 'object') push('PACKET-MANIFEST', 'manifest.frames 必须是对象 {count,bytes,first_frame_chars,all_chars}')
            else {
              for (const k of ['count', 'bytes', 'first_frame_chars', 'all_chars']) if (!(k in fr)) push('PACKET-MANIFEST', `manifest.frames 缺 ${k}`)
              if (typeof fr.count === 'number' && fr.count < 1) push('PACKET-MANIFEST', `frames.count 至少 1，实得 ${fr.count}`)
              if (typeof fr.all_chars === 'number' && typeof fr.first_frame_chars === 'number') {
                if (fr.all_chars < fr.first_frame_chars) push('PACKET-MANIFEST', `frames.all_chars(${fr.all_chars}) 不该小于 first_frame_chars(${fr.first_frame_chars})`)
                if (fr.count > 1 && fr.all_chars === fr.first_frame_chars) push('PACKET-MANIFEST', `count=${fr.count} 却 all_chars === first_frame_chars(${fr.all_chars}) —— 那正是"只解第一帧"的形状`)
              }
              if (existsSync(contentPath) && typeof fr.all_chars === 'number') {
                const contentChars = frozenCharCount(readFileSync(contentPath, 'utf8'))
                rec.readings.content_chars = { computed: contentChars, manifest_all_chars: fr.all_chars }
                if (fr.all_chars !== contentChars) push('PACKET-FRAMES-CHARS', `manifest.frames.all_chars=${fr.all_chars} 与 content.jsonl 的字符数 ${contentChars} 不一致（字符口径 = B3.4：去 BOM、CRLF/CR→LF、按 code point；不 trim、不做 NFC）`)
              }
            }
            if (man.content_sha256 !== r.content_sha256) push('PACKET-MANIFEST', `manifest.content_sha256 与返回的 content_sha256 不一致（${JSON.stringify(man.content_sha256)} vs ${JSON.stringify(r.content_sha256)}）`)
            if (!man.tool || typeof man.tool.path !== 'string') push('PACKET-MANIFEST', 'manifest.tool.path 必须是字符串（写清用哪份工具/路径）')
            // ⑤ `validateSessionPacket`：正例 ok；篡改 content ⇒ E_PACKET_CONTENT_SHA；删 manifest 必填 ⇒ E_PACKET_MANIFEST
            const v0 = callSoft('validate(正例)', pk.mod.validateSessionPacket, dir)
            rec.readings.validate_ok = { threw: v0.threw ? String(v0.threw.message).slice(0, 140) : null, value: v0.value ?? null }
            if (v0.threw) push('PACKET-VALIDATE', `validateSessionPacket 对刚生成的好包抛错：${String(v0.threw.message).slice(0, 160)}`)
            else {
              if (v0.value?.ok !== true) push('PACKET-VALIDATE', `好包应 ok:true，实得 ${JSON.stringify(v0.value?.ok)} problems=${JSON.stringify(v0.value?.problems ?? null)?.slice(0, 160)}`)
              if (!sha256Equal(v0.value?.content_sha256, sha256File(contentPath))) push('PACKET-VALIDATE', 'validate 返回的 content_sha256 与包内 content.jsonl 的字节 sha256 不一致')
            }
            if (existsSync(contentPath)) {
              writeFileSync(contentPath, `${readFileSync(contentPath, 'utf8')}（改一字）`, 'utf8')
              const v1v = callSoft('validate(内容被改)', pk.mod.validateSessionPacket, dir)
              rec.readings.validate_tampered = { threw: v1v.threw ? String(v1v.threw.message).slice(0, 140) : null, value: v1v.value ?? null }
              if (v1v.threw) push('PACKET-CONTENT-SHA', `validate 对内容被改的包抛错而不是返回 ok:false：${String(v1v.threw.message).slice(0, 160)}`)
              else {
                if (v1v.value?.ok !== false) push('PACKET-CONTENT-SHA', 'content.jsonl 被改一字之后 validate 必须 ok:false（v1.5：content_sha256 = 内容字节 sha256）')
                else if (v1v.value?.code !== 'E_PACKET_CONTENT_SHA') push('PACKET-CONTENT-SHA', `内容被改的稳定码应是 E_PACKET_CONTENT_SHA，实得 ${JSON.stringify(v1v.value?.code)}`)
              }
            }
            if (man !== null && existsSync(manifestPath)) {
              const broken = { ...man }
              delete broken.content_sha256
              writeJson(manifestPath, broken)
              const v2 = callSoft('validate(manifest 缺必填)', pk.mod.validateSessionPacket, dir)
              rec.readings.validate_bad_manifest = { threw: v2.threw ? String(v2.threw.message).slice(0, 140) : null, value: v2.value ?? null }
              if (v2.threw) push('PACKET-MANIFEST', `validate 对缺必填字段的 manifest 抛错而不是返回 ok:false：${String(v2.threw.message).slice(0, 160)}`)
              else if (v2.value?.ok !== false) push('PACKET-MANIFEST', 'manifest 缺 content_sha256 之后 validate 必须 ok:false')
              else if (v2.value?.code !== 'E_PACKET_MANIFEST') push('PACKET-MANIFEST', `缺必填字段的稳定码应是 E_PACKET_MANIFEST，实得 ${JSON.stringify(v2.value?.code)}`)
            }
          }

          // ── **v1.6 新写实的断言**：三类排除用真样本 + 空包 ─────────────────
          const manNow = manifestOf(r)
          // (a) `source_ids` **恰好**是窗口内那一条
          if (manNow !== null) {
            const ids = Array.isArray(manNow.source_ids) ? [...manNow.source_ids].sort() : null
            rec.readings.source_ids = ids
            if (JSON.stringify(ids) !== JSON.stringify(['session-in-window'])) {
              push('PACKET-SOURCE-IDS', `进入包的 source_ids 必须**恰好**是窗口内那一条 ['session-in-window']，实得 ${JSON.stringify(ids)}（别的项目 / 本次评审自己 / 窗口外都不许进包）`)
            }
          }
          // (b) 三条 reason **各就各位**（按 (session_id, reason) 配对比较，不比顺序）
          const seenPairs = (Array.isArray(r.excluded) ? r.excluded : []).map((e) => `${e?.session_id}:${e?.reason}`).sort()
          const wantPairs = EXPECT_EXCLUDED
          rec.readings.excluded_pairs = seenPairs
          if (JSON.stringify(seenPairs) !== JSON.stringify(wantPairs)) {
            push('PACKET-EXCLUDE', `排除项必须是三条且 reason 各就各位 ${JSON.stringify(wantPairs)}，实得 ${JSON.stringify(seenPairs)}`)
          }
          if (manNow !== null && Array.isArray(manNow.excluded)) {
            const manPairs = manNow.excluded.map((e) => `${e?.session_id}:${e?.reason}`).sort()
            if (JSON.stringify(manPairs) !== JSON.stringify(wantPairs)) {
              push('PACKET-EXCLUDE', `manifest.excluded 的配对应为 ${JSON.stringify(wantPairs)}，实得 ${JSON.stringify(manPairs)}`)
            }
          }
          // (c) 内容里**只有**窗口内那份源：四段标记都在，坏帧源的字样一个都不许出现
          if (existsSync(contentPath)) {
            const contentText = readFileSync(contentPath, 'utf8')
            for (const c of fx.chunks) if (!contentText.includes(markerOf(c))) push('PACKET-CONTENT', `content.jsonl 里没有窗口内源的「${markerOf(c)}」这一段（那份源是 4 帧，必须全解）`)
            for (const s of sources.filter((x) => x.file !== fx.file)) {
              if (contentText.includes('不该被解压')) push('PACKET-CONTENT', `content.jsonl 里出现了被排除源的内容（${s.session_id}）—— 不进包的 source 不许被解压（v1.6 ②）`)
            }
            // (d) frames 与那份源**对得上**（现在源是受控的，可以钉死）
            if (manNow?.frames) {
              const wantAll = frozenCharCount(allText)
              const wantFirst = frozenCharCount(`${fx.chunks[0].lines.join('\n')}\n`)
              rec.readings.frames_expect = { count: fx.chunks.length, all_chars: wantAll, first_frame_chars: wantFirst, bytes: fx.total }
              if (manNow.frames.count !== fx.chunks.length) push('PACKET-FRAMES', `frames.count 应为窗口内那份源的帧数 ${fx.chunks.length}，实得 ${manNow.frames.count}`)
              if (manNow.frames.all_chars !== wantAll) push('PACKET-FRAMES', `frames.all_chars 应为 ${wantAll}（全帧拼接的字符数），实得 ${manNow.frames.all_chars}`)
              if (manNow.frames.first_frame_chars !== wantFirst) push('PACKET-FRAMES', `frames.first_frame_chars 应为 ${wantFirst}（只解第一帧的字符数），实得 ${manNow.frames.first_frame_chars}`)
            }
            if (manNow?.window) {
              if (manNow.window.from !== latest) push('PACKET-WINDOW', `manifest.window.from 应等于最近一次评审完成时刻 ${latest}，实得 ${JSON.stringify(manNow.window.from)}`)
            }
          }
          // (e) `sources: []` 是**合法空包**（manifest 照写、source_ids 空）
          const emptyOut = path.join(statusRoot, 'retro', DAY, 'conversation-packet-empty')
          mkdirSync(emptyOut, { recursive: true })
          const empty = callSoft('buildSessionPacket(空源)', pk.mod.buildSessionPacket, { project: 'harness', outDir: emptyOut, statusRoot, now: nowIso, sources: [], excludeSessionIds: [] })
          rec.readings.build_empty = { threw: empty.threw ? String(empty.threw.message).slice(0, 160) : null, value: empty.value ?? null }
          if (empty.threw) {
            push('PACKET-EMPTY', `\`sources: []\` 是**合法空包**（v1.6 ②），不该抛错：${String(empty.threw.message).slice(0, 180)}`)
          } else {
            if (empty.value?.ok !== true) push('PACKET-EMPTY', `空源也应当 ok:true（合法空包），实得 ${JSON.stringify(empty.value?.ok)}`)
            const em = manifestOf(empty.value)
            rec.readings.empty_manifest = em === null ? null : { source_ids: em.source_ids ?? null, excluded: em.excluded ?? null, window: em.window ?? null }
            if (em === null) push('PACKET-EMPTY', '空包也必须落 manifest.json')
            else {
              if (!Array.isArray(em.source_ids) || em.source_ids.length !== 0) push('PACKET-EMPTY', `空包的 source_ids 必须是 []，实得 ${JSON.stringify(em.source_ids)}`)
              if (!Array.isArray(em.excluded) || em.excluded.length !== 0) push('PACKET-EMPTY', `空包的 excluded 必须是 []，实得 ${JSON.stringify(em.excluded)}`)
              if (em.window?.to !== nowIso) push('PACKET-EMPTY', `空包的 manifest.window.to 仍须等于 now，实得 ${JSON.stringify(em.window?.to)}`)
            }
            if (empty.value?.dir && !existsSync(path.join(empty.value.dir, 'content.jsonl'))) push('PACKET-EMPTY', '空包里也要有 content.jsonl（哪怕是空的）')
          }
        }

        // ④「失败不留半包」：故意让**生成**失败（outDir 的父是个文件）⇒ 失败之后**一个包目录都不许留下**
        const blockedParent = path.join(ws, 'blocked-parent')
        writeFileSync(blockedParent, '（夹具）这是一个文件，不是目录\n', 'utf8')
        const badOut = path.join(blockedParent, 'conversation-packet')
        const beforeDirs = listPacketDirs(outDir)
        const badBuild = callSoft('buildSessionPacket(失败)', pk.mod.buildSessionPacket, { project: 'harness', outDir: badOut, statusRoot, now: nowIso, sources, excludeSessionIds: ['session-self-review'] })
        rec.readings.build_failed = { threw: badBuild.threw ? String(badBuild.threw.code ?? badBuild.threw.message).slice(0, 160) : null, ok: badBuild.value?.ok ?? null }
        if (!badBuild.threw && badBuild.value?.ok === true) {
          push('PACKET-NO-HALF', '把 outDir 指到一个"父是文件"的路径竟然成功了 —— 那种路径写不下去，必须失败')
        }
        if (existsSync(badOut)) push('PACKET-NO-HALF', '失败的生成把半包目录留在了盘上（v1.5：临时目录必须清掉、不许留半包）')
        if (JSON.stringify(listPacketDirs(outDir)) !== JSON.stringify(beforeDirs)) {
          push('PACKET-NO-HALF', '失败的生成改动了正常 outDir 里的包目录列表')
        }
        rec.readings.packet_dirs_after_failure = listPacketDirs(outDir)

        // ⑤ 三类排除：**真样本**已经在上面逐条断言（`PACKET-SOURCE-IDS` / `PACKET-EXCLUDE` / `PACKET-CONTENT`），
        //    这里只留一条口径读数（v1.6 ② 冻死了判定规则，不再是"只钉枚举形状"）。
        rec.readings.exclude_rule_frozen = {
          frozen_by: '追加裁定 v1.6 ②',
          note: '`sources` 每项 `{session_id, project, file, last_event_at}`；`project` 不同 ⇒ `other_project` · `session_id ∈ excludeSessionIds` ⇒ `self_review` · `window.from !== null && last_event_at < window.from` ⇒ `outside_window`；**不进包的 source 不许被解压**（我给三个被排除的源都塞了**坏帧文件**：实现要是解了它们，这一条会当场 `E_PACKET_FRAMES`）；`sources: []` = 合法空包。',
        }
      } else {
        rec.readings.packet_calls = { skipped: '四个导出不齐，B 半的调用断言没跑（缺面已经在上面点名）' }
      }

      // ══════════════════════════════════════════════════════════════════════════════
      // ⑥ v1.8「只打人话」（`sources[].human`）—— 2026-10-16 加 · 六样形状
      //
      // 【为什么落在这儿】分母是**盘上**的 `test('<ID> …')` 条数（`support/discover.mjs` 数），
      //   历史冻结的 55 条以 `FROZEN_IDS` 清单存在、一条不许少；加新 ID 要"盘上 + 登记 + 一处同批"，
      //   这三件事不同批就红 ⇒ 本批的判据**并进 REV-01**（它就是"会话包"那一条）。
      //
      // 【被测面】`agenia-brain.mjs --op session-packet`（**真子进程**）—— 于是
      //   `packet.mjs` 的投影与 `agenia-brain.mjs` 的透传/账**两条路一起**被验到。
      //
      // 【六样形状】① 三种形状（true / false / 不给）+ 坏形状当场拒；② `false` ≡ 不给（逐字节）；
      //   ③ 与 `window` 正交（两个一起给，谁也不改写谁）；④ 未闭合 turn ⇒ 不取、账上写明；
      //   ⑤ 没 text 的 turn ⇒ 记 0 条、不占位；⑥ **一帧多行**（帧 ↔ 行不是一对一）。
      //
      // 【怎么翻面】
      //   · 把 `humanFlagOf` 的"坏形状当场抛"删掉 ⇒ ① 那一格从 `E_ARG_SCHEMA` 变 ok；
      //   · 把 `filterStream` 里 `human` 那一段整个短路掉 ⇒ ② 仍然绿（它本来就该"没变化"），
      //     但 ④⑤⑥ 的三份账与"包里有几行"**当场红**；
      //   · 把裁定 ① （未闭合 turn 不取）删掉 ⇒ ④ 红：包里会多出 seq 114 那一行；
      //   · 把裁定 ③ （没 text 记 0 条）改成"占位"⇒ ⑤ 红：包里会多出一行空 text。
      //
      // ⚠️ 期望值**手算**在下面每一条的注释里（不引用实现岗那份 `cases.json` 的结论）。
      // ══════════════════════════════════════════════════════════════════════════════
      {
        const day = DAY
        const ws = caseWorkspace('REV-01', 'human')
        const statusRoot = path.join(ws, '.team')
        const testDataRoot = process.env[ENV.TEST_DATA_ROOT]
        const T0 = Date.parse('2026-10-14T12:00:00Z')
        const iso = (ms) => new Date(ms).toISOString()
        const line = (o) => `${JSON.stringify(o)}\n`
        const sess = (seq, time, kind, text, id) => line({
          type: 'user/message', seq, time,
          data: { content: [{ type: 'text', text }], source: { kind }, role: 'user', id },
          surfaceOp: 'append',
        })
        const asst = (seq, time, id, content, turn = 1, step = 1) => line({
          type: 'assistant/message', seq, time,
          data: {
            turn, step,
            message: {
              role: 'assistant', id,
              source: { kind: 'model', provider: 'deepseek-official', model: 'deepseek-flash-dev0', replayState: { response: { kind: 'deepseek-messages', version: 1 }, blocks: [{ type: 'reasoning', signature: `sig-${seq}` }] } },
              content,
            },
            stream: [{ kind: 'text-delta', text: '（流式增量，D 档不许留）' }],
            usage: { inputTokens: 11, outputTokens: 22 },
          },
          surfaceOp: 'append',
        })

        // ── 夹具：7 帧 / 16 行（**帧 ↔ 行不是一对一**：f0 三行、f2 三行、f6 四行）────────
        // 逐行归属（手算）：
        //   f0 L1 session(无消息→non_message) · L2 turn/start(开 turn1) · L3 step/start
        //   f1 L4 user(kind=user)                      ⇒ BOSS
        //   f2 L5 assistant(有 text)                   ⇒ 非最后 assistant
        //      L6 tool/call                             ⇒ non_message
        //      L7 tool/result(role=tool)                ⇒ other_message
        //   f3 L8 assistant(有 text)                   ⇒ turn1 的最后输出（L9 收尾时定）
        //   f4 L9 turn/end(turn1 completed) · L10 turn/start(开 turn2)
        //   f5 L11 assistant(**只有 reasoning**)       ⇒ turn2 无 text
        //      L12 turn/end(turn2 aborted)
        //   f6 L13 turn/start(开 turn3) · L14 user(kind=user) ⇒ BOSS · L15 user(kind=user) ⇒ BOSS
        //      （**同一帧里两条都进包**）· L16 user(kind=plugin:agenia) ⇒ 注入
        //      · L17 assistant(有 text，turn3 **永不闭合**) ⇒ 未闭合 turn 的 assistant
        const framesText = [
          line({ type: 'session', agentPreset: 'agenia', createdAt: T0, cwd: 'E:\\Harness', delegationDepth: 0, id: 'session-fixture-v18', isSeeded: false, version: 4 })
            + line({ type: 'turn/start', seq: 101, time: T0 + 1000, data: { turn: 1 } })
            + line({ type: 'step/start', seq: 102, time: T0 + 2000, data: { turn: 1, step: 1 } }),
          sess(103, T0 + 3000, 'user', '老板句甲', 'msg-u-103'),
          asst(104, T0 + 4000, 'msg-a-104', [{ type: 'reasoning', text: '想一下' }, { type: 'text', text: '中间话（非最后）' }])
            + line({ type: 'tool/call', seq: 105, time: T0 + 5000, data: { arguments: {}, callId: 'call-105', name: 'read', step: 1, turn: 1 } })
            + line({ type: 'tool/result', seq: 106, time: T0 + 6000, data: { turn: 1, step: 1, message: { role: 'tool', source: { kind: 'tool', callId: 'call-106' }, toolCallId: 'call-106', content: [{ type: 'text', text: '（工具结果）' }] } }, }),
          asst(107, T0 + 7000, 'msg-a-107', [{ type: 'reasoning', text: '收尾' }, { type: 'text', text: '第一轮的最后输出' }]),
          line({ type: 'turn/end', seq: 108, time: T0 + 8000, data: { turn: 1, reason: { kind: 'completed' } } })
            + line({ type: 'turn/start', seq: 109, time: T0 + 9000, data: { turn: 2 } }),
          asst(110, T0 + 10000, 'msg-a-110', [{ type: 'reasoning', text: '只有思考链，没有正文' }], 2, 1)
            + line({ type: 'turn/end', seq: 111, time: T0 + 11000, data: { turn: 2, reason: { kind: 'aborted' } } }),
          line({ type: 'turn/start', seq: 112, time: T0 + 12000, data: { turn: 3 } })
            + sess(113, T0 + 13000, 'user', '老板句乙', 'msg-u-113')
            + sess(114, T0 + 14000, 'user', '老板句丙', 'msg-u-114')
            + sess(115, T0 + 15000, 'plugin:agenia', '（注入文本）', 'msg-u-115')
            + asst(116, T0 + 16000, 'msg-a-116', [{ type: 'text', text: '未闭合那一轮的最后一句' }], 3, 1),
        ]
        const fxFile = fixturePath('REV-01', 'human-mixed', 'jsonl.zstd')
        writeFileSync(fxFile, Buffer.concat(framesText.map((t) => zlib.zstdCompressSync(Buffer.from(t, 'utf8')))))
        const allLines = framesText.map((t) => t.split('\n').filter((x) => x !== '')).flat()
        // 手算的那份账（**契约 §v1.8 那三行闭合式**的左边逐项）：
        const WANT = {
          scanned_lines: 17,
          boss_lines: 3, last_output_lines: 1, kept_lines: 4,
          assistant_lines: 4,
          dropped_non_last_assistant: 1, turns_without_text: 1,
          injected_lines: 1, unclosed_turns: 1, dropped_unclosed_assistant: 1,
          other_message_lines: 1, non_message_lines: 8,
        }
        rec.readings.human_fixture = { file: fxFile, frames: framesText.length, lines: allLines.length, want: WANT }
        if (framesText.length !== 7 || allLines.length !== 17) {
          push('HUMAN-FIXTURE', `夹具形状变了（帧 ${framesText.length} / 行 ${allLines.length}，应为 7 / 17）—— 下面的手算期望值全部作废，先修夹具`)
        }
        // 帧 ↔ 行**不是一对一**：这条是 ⑥ 的前提，夹具本身不成立就不许往下判。
        if (Math.max(...framesText.map((t) => t.split('\n').filter((x) => x !== '').length)) < 2) {
          push('HUMAN-FIXTURE', '没有"一帧多行"的帧 —— ⑥ 那一格等于没测（验收夹具必须是多行帧）')
        }

        const payloadFor = (extra) => writeFixture('REV-01', `human-${extra.tag}`, {
          day,
          project: 'harness',
          exclude_session_ids: [],
          now: iso(T0 + 20000),
          sources: [{
            session_id: 'session-fixture-v18',
            project: 'harness',
            file: fxFile,
            last_event_at: iso(T0 + 15000),
            ...(extra.humanKey === undefined ? {} : { human: extra.humanKey }),
            ...(extra.window === undefined ? {} : { window: extra.window }),
          }],
        })
        const runPacket = (tag, extra) => {
          const res = runCli('agenia-brain.mjs', {
            op: 'session-packet', dataRoot: testDataRoot, workspace: ws, inFile: payloadFor({ tag, ...extra }), testMode: true,
          }, { env: process.env })
          return res
        }
        const readPacket = (dir) => {
          const c = path.join(dir, 'content.jsonl')
          if (!existsSync(c)) return null
          const raw = readFileSync(c, 'utf8')
          return { text: raw, bytes: Buffer.byteLength(raw, 'utf8'), lines: raw.split('\n').filter((x) => x !== ''), manifest: (() => { try { return JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8')) } catch { return null } })() }
        }

        const rTrue = runPacket('true', { humanKey: true })
        const rFalse = runPacket('false', { humanKey: false })
        const rNone = runPacket('none', {})
        const rBad = runPacket('badshape', { humanKey: 'yes' })
        const rOrthW = runPacket('window-only', { window: { from: iso(T0 + 6000) } })
        const rOrthBoth = runPacket('window-human', { humanKey: true, window: { from: iso(T0 + 6000) } })
        rec.readings.human_runs = [rTrue, rFalse, rNone, rBad, rOrthW, rOrthBoth].map((r) => ({
          exit: r.exit_code, ok: r.json?.ok ?? null, code: r.json?.error?.code ?? null, dir: r.json?.packet_dir ?? null,
        }))

        // ① 三种形状：真 / false / 不给 —— 三种都必须被接受（不给=false 是"逐字相同"那一条的地基）。
        for (const [tag, r] of [['true', rTrue], ['false', rFalse], ['不给', rNone]]) {
          if (r.exit_code !== 0 || r.json?.ok !== true) {
            push('HUMAN-SHAPE', `human=${tag} 的会话包应当成功，实得 exit=${r.exit_code} code=${r.json?.error?.code ?? '(无码)'}：${r.stdout.trim().slice(0, 200)}`)
          }
        }
        // ①b 坏形状 ⇒ 当场抛 `E_ARG_SCHEMA`（**不许静默当 false**）。
        if (rBad.exit_code === 0 || rBad.json?.error?.code !== 'E_ARG_SCHEMA') {
          push('HUMAN-SHAPE', `sources[].human 形状不合法（字符串 'yes'）必须当场 E_ARG_SCHEMA，实得 exit=${rBad.exit_code} code=${rBad.json?.error?.code ?? '(无码)'}`)
        }

        // ② `false` ≡ 不给：**逐字节相同**（包内容 sha256 + `frames` 四条）。
        const cFalse = rFalse.json?.packet_dir ? readPacket(rFalse.json.packet_dir) : null
        const cNone = rNone.json?.packet_dir ? readPacket(rNone.json.packet_dir) : null
        rec.readings.human_false_vs_none = {
          false: { sha: rFalse.json?.content_sha256 ?? null, frames: rFalse.json?.frames ?? null, bytes: cFalse?.bytes ?? null },
          none: { sha: rNone.json?.content_sha256 ?? null, frames: rNone.json?.frames ?? null, bytes: cNone?.bytes ?? null },
        }
        if (cFalse === null || cNone === null) {
          push('HUMAN-FALSE-EQ-NONE', '`human:false` 或"不给"那一跑没落下包 ⇒ 这条逐字节判据判不了')
        } else {
          if (cFalse.text !== cNone.text) push('HUMAN-FALSE-EQ-NONE', '`human:false` 与"不给"的 content.jsonl **不是逐字节相同**（v1.8 的硬要求：不给/false ⇒ 与 v1.7 逐字相同）')
          if (JSON.stringify(rFalse.json?.frames) !== JSON.stringify(rNone.json?.frames)) {
            push('HUMAN-FALSE-EQ-NONE', `\`human:false\` 与"不给"的 frames 四条不同：${JSON.stringify(rFalse.json?.frames)} vs ${JSON.stringify(rNone.json?.frames)}`)
          }
          if (rFalse.json?.human !== null) push('HUMAN-FALSE-EQ-NONE', `\`human:false\` 时返回值里的 human 账应为 null（"没开"不是"筛完一条不剩"），实得 ${JSON.stringify(rFalse.json?.human)?.slice(0, 120)}`)
          if (rNone.json?.human !== null) push('HUMAN-FALSE-EQ-NONE', `不给 human 时返回值里的 human 账应为 null，实得 ${JSON.stringify(rNone.json?.human)?.slice(0, 120)}`)
          if (cFalse.lines.length !== allLines.length) {
            push('HUMAN-FALSE-EQ-NONE', `没开 human 时包里应当是**全部 16 行**，实得 ${cFalse.lines.length} 行`)
          }
        }

        // ③ 与 `window` 正交：
        //    · 只给 window ⇒ 与 v1.7 同形（human 账为 null）；
        //    · 两个一起给 ⇒ 先裁后筛（账只数**落进窗口**的行），且 `human` 账的 `scanned_lines` = 窗口内行数。
        const wWin = rOrthW.json?.packet_dir ? readPacket(rOrthW.json.packet_dir) : null
        const wBoth = rOrthBoth.json?.packet_dir ? readPacket(rOrthBoth.json.packet_dir) : null
        rec.readings.human_window = {
          window_only: { exit: rOrthW.exit_code, lines: wWin?.lines.length ?? null, human: rOrthW.json?.human ?? null, cropped: rOrthW.json?.cropped ?? null },
          both: { exit: rOrthBoth.exit_code, lines: wBoth?.lines.length ?? null, totals: rOrthBoth.json?.human?.totals ?? null },
        }
        if (rOrthW.json?.human !== null) push('HUMAN-WINDOW', '只给 window（没给 human）时 human 账必须是 null —— 两条参数正交，别互相点亮')
        if (rOrthBoth.exit_code !== 0) {
          push('HUMAN-WINDOW', `window + human 一起给应当成功，实得 exit=${rOrthBoth.exit_code} code=${rOrthBoth.json?.error?.code ?? '(无码)'}`)
        } else {
          // 窗口 from = T0+6000 · to = now = T0+20000 ⇒ 落进窗口的是 **L7..L17 共 11 行**。
          // 逐条手算（按契约那份 `LINE_KIND` 表）：
          //   L7 tool/result ⇒ other_message(1) · L8 assistant(107,有 text, turn1 在 L9 闭合) ⇒ last_output(1)
          //   L9 turn/end · L10 turn/start · L12 turn/end · L13 turn/start(t3) ⇒ non_message(4)
          //   L11 assistant(110,**只有 reasoning**, turn2 在 L12 以 aborted 闭合) ⇒ turns_without_text(1)
          //   L14/L15 user(kind=user) ⇒ boss(2) · L16 user(kind=plugin:agenia) ⇒ injected(1)
          //   L17 assistant(116,turn3 在 L13 开、**永不闭合**) ⇒ dropped_unclosed_assistant(1) · unclosed_turns(1)
          //   L5（非最后 assistant，t=4000）**在窗口外** ⇒ dropped_non_last_assistant(0)
          //   闭合式：3 + 0 + 1 + 1 + 1 + 1 + 4 = 11 = scanned_lines ✓
          const t = rOrthBoth.json?.human?.totals ?? {}
          const wantWin = { scanned_lines: 11, boss_lines: 2, last_output_lines: 1, kept_lines: 3, assistant_lines: 3, injected_lines: 1, unclosed_turns: 1, dropped_unclosed_assistant: 1, other_message_lines: 1, non_message_lines: 4, turns_without_text: 1, dropped_non_last_assistant: 0 }
          rec.readings.human_window.want = wantWin
          for (const k of Object.keys(wantWin)) {
            if (t[k] !== wantWin[k]) push('HUMAN-WINDOW', `window+human 的账 ${k} 手算 ${wantWin[k]}，实得 ${t[k]}`)
          }
          if (wBoth !== null && wBoth.lines.length !== wantWin.kept_lines) {
            push('HUMAN-WINDOW', `window+human 之后包里应是 ${wantWin.kept_lines} 行，实得 ${wBoth.lines.length}`)
          }
        }

        // ④⑤⑥ + 投影：拿 `human:true`（不裁）那一份逐条对。
        if (rTrue.exit_code !== 0 || cFalse === null) {
          push('HUMAN-LEDGER', '`human:true` 那一跑没成功 ⇒ 账与投影那几条判不了')
        } else {
          const dir = rTrue.json.packet_dir
          const pk = readPacket(dir)
          const totals = rTrue.json?.human?.totals ?? null
          rec.readings.human_totals = totals
          rec.readings.human_projection = rTrue.json?.human?.projection ?? null
          if (totals === null) {
            push('HUMAN-LEDGER', '`human:true` 时返回值里必须有 `human.totals` 这把账')
          } else {
            for (const k of Object.keys(WANT)) {
              if (totals[k] !== WANT[k]) push('HUMAN-LEDGER', `账 ${k} 手算 ${WANT[k]}，实得 ${totals[k]}`)
            }
            // 契约里那三行**闭合式**（账自己闭合）—— 对不上就是某一格漏了或重了。
            const close = totals.kept_lines + totals.dropped_non_last_assistant + totals.turns_without_text
              + totals.dropped_unclosed_assistant + totals.injected_lines + totals.other_message_lines + totals.non_message_lines
            if (close !== totals.scanned_lines) {
              push('HUMAN-LEDGER', `账不闭合：kept+dropped+without_text+unclosed+injected+other+non_message = ${close} ≠ scanned_lines ${totals.scanned_lines}`)
            }
            if (totals.kept_lines !== totals.boss_lines + totals.last_output_lines) {
              push('HUMAN-LEDGER', `kept_lines ${totals.kept_lines} ≠ boss_lines ${totals.boss_lines} + last_output_lines ${totals.last_output_lines}`)
            }
            if (totals.assistant_lines !== totals.last_output_lines + totals.turns_without_text + totals.dropped_non_last_assistant + totals.dropped_unclosed_assistant) {
              push('HUMAN-LEDGER', `assistant_lines ${totals.assistant_lines} ≠ 四格之和 ${totals.last_output_lines + totals.turns_without_text + totals.dropped_non_last_assistant + totals.dropped_unclosed_assistant}`)
            }
            // ④ 未闭合 turn：**不取**，而且账上要写明（`unclosed_turns` + `dropped_unclosed_assistant`）。
            if (totals.unclosed_turns !== 1 || totals.dropped_unclosed_assistant !== 1) {
              push('HUMAN-UNCLOSED', `未闭合 turn 应当 unclosed_turns=1 / dropped_unclosed_assistant=1，实得 ${totals.unclosed_turns} / ${totals.dropped_unclosed_assistant}`)
            }
            // ⑤ 没 text 的 turn：**记 0 条、不占位**。
            if (totals.turns_without_text !== 1) push('HUMAN-NO-TEXT', `turn2 只有 reasoning ⇒ turns_without_text 应为 1，实得 ${totals.turns_without_text}`)
          }

          if (pk === null) {
            push('HUMAN-CONTENT', '`human:true` 的包目录里没有 content.jsonl')
          } else {
            const seqs = pk.lines.map((l) => { try { return JSON.parse(l).seq } catch { return null } })
            rec.readings.human_packet_seqs = seqs
            // 手算：留下的应当是 L4(103 BOSS) · L8(107 最后输出) · L14(113 BOSS) · L15(114 BOSS) —— 顺序即流序。
            if (JSON.stringify(seqs) !== JSON.stringify([103, 107, 113, 114])) {
              push('HUMAN-CONTENT', `人话包里的 seq 应为 [103,107,113,114]（老板 3 条 + 最后输出 1 条），实得 ${JSON.stringify(seqs)}`)
            }
            // ④ 未闭合 turn 那一行（seq 116）**一个字都不许进包**。
            if (seqs.includes(116)) push('HUMAN-UNCLOSED', '未闭合 turn 里的 assistant（seq 116）进了包 —— 裁定 ① 是"不取"')
            // ⑤ 没 text 的那个 turn（seq 110）不许占位。
            if (seqs.includes(110)) push('HUMAN-NO-TEXT', '没有 text 的 turn 的最后一条 assistant（seq 110）进了包 —— 裁定 ③ 是"记 0 条、不占位"')
            if (pk.lines.some((l) => /"content":\[\]/.test(l) || /"text":""/.test(l))) {
              push('HUMAN-NO-TEXT', '包里出现了空 text 的行 —— 那是"占位"，不是"记 0 条"')
            }
            // ⑤b 老板的行**原样**进包（唯一不投影的一类）：逐字节等于原流里那一行。
            const bossLine = allLines.find((l) => JSON.parse(l).seq === 103)
            if (!pk.lines.includes(bossLine)) push('HUMAN-BOSS-VERBATIM', '老板那一行没有**逐字节原样**进包（老板侧一个字都不许投影）')
            // 投影：最后输出那一行 = **白名单键序**重建出来的那一行（独立重造，不信实现的自述）。
            const projWant = JSON.stringify({
              type: 'assistant/message', seq: 107, time: T0 + 7000,
              data: {
                turn: 1, step: 1,
                message: {
                  role: 'assistant', id: 'msg-a-107',
                  source: { kind: 'model', provider: 'deepseek-official', model: 'deepseek-flash-dev0' },
                  content: [{ type: 'text', text: '第一轮的最后输出' }],
                },
              },
            })
            if (!pk.lines.includes(projWant)) {
              push('HUMAN-PROJECTION', '最后输出那一行不是按白名单键序投影出来的那一行（独立重造应当逐字节相同）—— 实得：' + JSON.stringify(pk.lines.find((l) => { try { return JSON.parse(l).seq === 107 } catch { return false } }) ?? null))
            }
            // 投影**只减不增**：D 档丢掉的那几样一样都不许留。
            const outLine = pk.lines.find((l) => { try { return JSON.parse(l).seq === 107 } catch { return false } }) ?? ''
            for (const [needle, why] of [['reasoning', 'content[type=reasoning]'], ['tool-call', 'content[type=tool-call]'], ['"stream"', 'data.stream'], ['"usage"', 'data.usage'], ['replayState', 'message.source.replayState'], ['surfaceOp', '事件顶层的 surfaceOp']]) {
              if (outLine.includes(needle)) push('HUMAN-PROJECTION', `投影后的行里还留着 ${why}（白名单只留 keeps 那张单子）`)
            }
            // ⑥ 一帧多行：**有贡献的帧数**（`frames.count`）不是"行数"，也不是"总帧数"。
            //    手算：进包的 4 行来自 f1(1 行) / f3(1 行) / f6(2 行) ⇒ count = 3。
            const fr = rTrue.json?.frames ?? null
            rec.readings.human_frames = fr
            if (fr?.count !== 3) {
              push('HUMAN-MULTILINE-FRAME', `有贡献的帧数应为 3（4 行来自 3 个帧，其中 f6 一帧两行），实得 count=${fr?.count}（总帧数 7 / 行数 4 —— 这两个数都不是答案）`)
            }
            const shrunk = framesText.map((t) => zlib.zstdCompressSync(Buffer.from(t, 'utf8')))
            const wantFrameBytes = shrunk[1].length + shrunk[3].length + shrunk[6].length
            if (fr?.bytes !== wantFrameBytes) {
              push('HUMAN-MULTILINE-FRAME', `frames.bytes 应为 f1+f3+f6 三个帧的压缩字节之和 ${wantFrameBytes}，实得 ${fr?.bytes}`)
            }
            // `first_frame_chars` = **第一个有贡献的帧里留下来的那些行**的字符数（f1 只有 1 行）。
            const wantFirst = frozenCharCount(framesText[1])
            if (fr?.first_frame_chars !== wantFirst) {
              push('HUMAN-MULTILINE-FRAME', `first_frame_chars 应为第一个有贡献的帧（f1）里留下的那一行的字符数 ${wantFirst}，实得 ${fr?.first_frame_chars}`)
            }
            // manifest 那**十个**顶层字段一个不许动。
            const req = rTrue.json?.manifest_fields ?? null
            rec.readings.human_manifest_fields = req
            if (req?.required !== 10 || req?.present !== 10 || (req?.missing ?? []).length !== 0) {
              push('HUMAN-MANIFEST', `manifest 必填字段必须仍是**十个、齐**，实得 required=${req?.required} present=${req?.present} missing=${JSON.stringify(req?.missing)}`)
            }
            if (pk.manifest !== null && Object.hasOwn(pk.manifest, 'human')) {
              push('HUMAN-MANIFEST', 'manifest 里**不许**多出 human 键（那十个顶层字段是冻结的；账走返回值与 audit）')
            }
          }
          // 投影的**降级声明**必须活着回到调用方（"这是 D 档、字节保证降级了"的唯一书面凭据）。
          const pj = rTrue.json?.human?.projection ?? null
          if (pj === null || pj.level !== 'D' || typeof pj.guarantee !== 'string' || typeof pj.downgrade !== 'string') {
            push('HUMAN-PROJECTION', `返回值里必须有 human.projection（level=D + guarantee + downgrade 两句），实得 ${JSON.stringify(pj)?.slice(0, 200)}`)
          } else if (!/逐字/.test(pj.guarantee) || !/降级|只对老板/.test(pj.downgrade)) {
            push('HUMAN-PROJECTION', `projection 的两句话形状变了（guarantee/downgrade 必须说清"逐字"与"降级"）：${JSON.stringify(pj).slice(0, 240)}`)
          }
        }
      }

      // ══════════════════════════════════════════════════════════════════════════════
      // ⑦ 解压总量的**软上限** · `E_PACKET_TOO_LARGE` · 「崩溃不许悄悄发生」—— 2026-10-23（`F-144`）
      //
      // 【被测面】`agenia-brain.mjs --op session-packet`（真子进程）。契约 = `CONTRACT.md` §9。
      //
      // 【病根一句话】解压总量没有上限 ⇒ 撞到某个量级 V8 直接把进程杀掉（`exit 134`，
      //   2026-10-23 11:34 现量：40 源 ≈121,000,000 字 · 11.5 s · 崩前堆 2111 MB / 上限 2237 MB · stdout 空）
      //   ⇒ 调用方拿不到 `{ok:false}`、不落 state/health/receipt ⇒「今天没做」与「今天做失败了」
      //   长得一模一样。
      //
      // 【夹具口径】两条合成会话流（各 10 个 turn / 40 行 / 12 帧）+ 一条**被排除**的坏帧源
      //   （`other_project`：它一个字节都不许被解压，所以也不许进 `out_bytes` / `session_count`）。
      //   🔴 **不许依赖真会话流**（定形验收 #4：那份 40 源真流会被清理，只做一次性验收）；
      //   常驻用例只用"可注入的上限 + 几十 KB 的合成流"造出同一条超限路。
      //
      // 【怎么翻面】（每条都能单独红，也能单独绿）
      //   · 上限真的在（`CAP-KNOB-OVER`）⇒ 把上限调低 1 字节必须拒。闸不在 ⇒ 这一格从"拒"变"跑成功"。
      //   · 边界写成 `>=` ⇒ `CAP-KNOB-EXACT`（`out_bytes === limit` 必须过）红。
      //   · 上限比的是"留下多少"而不是"读了多少" ⇒ `CAP-FILTER-PATH`（`human:true` 那条路）红。
      //   · 先解压后判 ⇒ 那条被排除的坏帧源会当场 `E_PACKET_FRAMES`（`CAP-SESSION-COUNT` 红）。
      //   · 拒的时候"读到一半就报数" ⇒ `CAP-NO-TRUNCATE`（`out_bytes` 必须是全量）红。
      //   · 三个数按 `packetError(code, msg, {...})` 写、出口不改 ⇒ `error.details` 是 `null`
      //     （`packetError` 挂在 `err.detail`，CLI 的 catch 只转发 `err.details`）⇒ `CAP-KNOB-OVER` 红。
      //
      // ⚠️ 期望值**手算**（不引用实现自报；手算就是"改前读数"）。
      // ══════════════════════════════════════════════════════════════════════════════
      {
        const CAP_ENV = 'AGENIA_PACKET_MAX_BYTES'
        /** 契约 §9.1 ③：缺省 = 512 MiB（理由那一段是可算的：一个 code point ≤ 4 B ⇒ 121,000,000 字 ≤ 484,000,000 B）。 */
        const DEFAULT_LIMIT = 536870912
        const testDataRoot = process.env[ENV.TEST_DATA_ROOT]
        const capWs = caseWorkspace('REV-01', 'cap')
        const capStatusRoot = path.join(capWs, '.team')
        const capOutDir = path.join(capStatusRoot, 'retro', DAY, 'conversation-packet')
        mkdirSync(path.join(capStatusRoot, 'route'), { recursive: true })
        mkdirSync(capOutDir, { recursive: true })
        // 一条**没有评审完成记录**的路线 ⇒ `window.from = null` ⇒ 没有源会被判成 `outside_window`。
        writeJson(path.join(capStatusRoot, 'route', 'current.json'), {
          goal: { id: 'g1', title: '（夹具）目标' },
          stages: [], current_stage_id: null, tasks: [], current_task_id: null, tickets: [],
        })

        const CT0 = Date.parse('2026-10-14T12:00:00Z')
        const capIso = (ms) => new Date(ms).toISOString()
        const PAD = '（夹具）本段是刻意拉长的正文，用来把「解压后总量」顶到几十 KB —— 上限那一格只跟这个量有关。'.repeat(4)

        /** 一条合成会话流：10 个 turn × 4 行 = 40 行，切成 12 帧（帧 ↔ 行**不是**一对一）。 */
        const capStream = (tag) => {
          const lines = []
          let seq = 1000
          for (let t = 1; t <= 10; t += 1) {
            const base = CT0 + t * 30000
            lines.push(JSON.stringify({ type: 'turn/start', seq: (seq += 1), time: base, data: { turn: t } }))
            lines.push(JSON.stringify({
              type: 'user/message', seq: (seq += 1), time: base + 1000,
              data: { content: [{ type: 'text', text: `（夹具）老板第 ${t} 句 · ${tag} · ${PAD}` }], source: { kind: 'user' }, role: 'user', id: `msg-u-${tag}-${t}` },
              surfaceOp: 'append',
            }))
            lines.push(JSON.stringify({
              type: 'assistant/message', seq: (seq += 1), time: base + 2000,
              data: {
                turn: t, step: 1,
                message: {
                  role: 'assistant', id: `msg-a-${tag}-${t}`,
                  source: { kind: 'model', provider: 'deepseek-official', model: 'deepseek-flash-dev0' },
                  content: [{ type: 'reasoning', text: '想一下' }, { type: 'text', text: `（夹具）第 ${t} 轮的最后输出 · ${tag} · ${PAD}` }],
                },
              },
              surfaceOp: 'append',
            }))
            lines.push(JSON.stringify({ type: 'turn/end', seq: (seq += 1), time: base + 3000, data: { turn: t, reason: { kind: 'completed' } } }))
          }
          const cuts = [2, 5, 9, 14, 18, 23, 27, 31, 34, 36, 38, 40]
          const frames = []
          let at = 0
          for (const cut of cuts) {
            frames.push(`${lines.slice(at, cut).join('\n')}\n`)
            at = cut
          }
          return frames
        }

        const capFramesA = capStream('A')
        const capFramesB = capStream('B')
        const capFileA = fixturePath('REV-01', 'cap-src-a', 'jsonl.zstd')
        const capFileB = fixturePath('REV-01', 'cap-src-b', 'jsonl.zstd')
        writeFileSync(capFileA, Buffer.concat(capFramesA.map((t) => zlib.zstdCompressSync(Buffer.from(t, 'utf8')))))
        writeFileSync(capFileB, Buffer.concat(capFramesB.map((t) => zlib.zstdCompressSync(Buffer.from(t, 'utf8')))))
        // 被排除的那条源故意是**坏帧**：实现要是为了"量一量它多大"去解压，会当场 `E_PACKET_FRAMES`。
        const capFileExcluded = fixturePath('REV-01', 'cap-src-excluded', 'jsonl.zstd')
        writeFileSync(capFileExcluded, Buffer.concat([
          zlib.zstdCompressSync(Buffer.from('（夹具）别的项目 · 不该被解压\n', 'utf8')),
          Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 0x00]),
        ]))
        const capTextA = capFramesA.join('')
        const capTextB = capFramesB.join('')
        const capAllText = `${capTextA}${capTextB}`
        const WANT = {
          session_count: 2,
          // 解压后 UTF-8 字节总量 = 两条流各自逐帧"实解 N B"之和
          out_bytes: Buffer.byteLength(capAllText, 'utf8'),
          all_chars: frozenCharCount(capAllText),
          frames: capFramesA.length + capFramesB.length,
        }
        rec.readings.cap_fixture = {
          out_bytes: WANT.out_bytes, all_chars: WANT.all_chars, frames: WANT.frames,
          bytes_a: Buffer.byteLength(capTextA, 'utf8'), bytes_b: Buffer.byteLength(capTextB, 'utf8'),
          excluded_source: { session_id: 'cap-src-other', project: 'other', reason: 'other_project', file_is_corrupt: true },
        }
        if (WANT.out_bytes < 20000 || WANT.out_bytes > 4 * 1024 * 1024) {
          push('CAP-FIXTURE', `夹具的解压后总量应当在"几十 KB"这个量级，实得 ${WANT.out_bytes} B —— 太大就违背定形验收 #4（常驻用例不许扛大流），太小则上限那一格（调低 1 字节）没有说服力`)
        }

        const capPayload = ({ humanAll = false } = {}) => ({
          day: DAY,
          project: 'harness',
          exclude_session_ids: [],
          now: capIso(CT0 + 400000),
          sources: [
            { session_id: 'cap-src-a', project: 'harness', file: capFileA, last_event_at: capIso(CT0 + 290000), ...(humanAll ? { human: true } : {}) },
            { session_id: 'cap-src-b', project: 'harness', file: capFileB, last_event_at: capIso(CT0 + 295000), ...(humanAll ? { human: true } : {}) },
            // 源序刻意放在**第三位**：它要是被计进账，`session_count` 会变成 3（不是"第一个恰好没算"）
            { session_id: 'cap-src-other', project: 'other', file: capFileExcluded, last_event_at: capIso(CT0 + 300000) },
          ],
        })
        const capRun = (tag, payload, limit) => {
          const env = { ...process.env }
          delete env[CAP_ENV]
          if (limit !== undefined) env[CAP_ENV] = String(limit)
          const inFile = writeFixture('REV-01', `cap-${tag}`, payload)
          return runCli('agenia-brain.mjs', { op: 'session-packet', dataRoot: testDataRoot, workspace: capWs, inFile, testMode: true }, { env })
        }
        const capTrace = (r) => ({
          exit: r.exit_code, signal: r.signal ?? null, timed_out: r.timed_out === true, ok: r.json?.ok ?? null,
          code: r.json?.error?.code ?? null, details: r.json?.error?.details ?? null,
          packet_bytes: r.json?.packet_bytes ?? null, frames: r.json?.frames ?? null,
          stdout_head: String(r.stdout ?? '').slice(0, 200), stderr_head: String(r.stderr ?? '').slice(0, 200),
        })

        const rDefault = capRun('default', capPayload(), undefined)
        const rExact = capRun('exact', capPayload(), WANT.out_bytes)
        const capDirsBeforeOver = listPacketDirs(capOutDir)
        const rOver = capRun('over', capPayload(), WANT.out_bytes - 1)
        const capDirsAfterOver = listPacketDirs(capOutDir)
        const rOff = capRun('off', capPayload(), 0)
        const rNeg = capRun('negative', capPayload(), -1)
        const rJunk = capRun('junk', capPayload(), '1KB')
        const rHuman = capRun('human-over', capPayload({ humanAll: true }), WANT.out_bytes - 1)
        const capNoDay = capPayload()
        delete capNoDay.day
        const rNoDay = capRun('shape-no-day', capNoDay, undefined)
        const capMissing = capPayload()
        capMissing.sources[0].file = path.join(capWs, '（夹具）这条流不在盘上.jsonl.zstd')
        const rMissing = capRun('shape-missing-stream', capMissing, undefined)
        rec.readings.cap_runs = {
          default: capTrace(rDefault), exact: capTrace(rExact), over: capTrace(rOver), off: capTrace(rOff),
          negative: capTrace(rNeg), junk: capTrace(rJunk), human_over: capTrace(rHuman),
          shape_no_day: capTrace(rNoDay), shape_missing_stream: capTrace(rMissing),
          dirs_before_over: capDirsBeforeOver, dirs_after_over: capDirsAfterOver,
        }

        // ── 正例 ①：不注入上限 ⇒ 照常出包，四项手算值对上，且生效上限读得到 ────────────────
        if (rDefault.exit_code !== 0 || rDefault.json?.ok !== true) {
          push('CAP-DEFAULT', `不注入上限时，几十 KB 的合法小流必须照常出包（缺省 512 MiB 不会挡它），实得 exit=${rDefault.exit_code} code=${JSON.stringify(rDefault.json?.error?.code ?? null)}：${String(rDefault.stdout ?? '').trim().slice(0, 200)}`)
        } else {
          const pb = rDefault.json?.packet_bytes ?? null
          if (pb === null || typeof pb !== 'object') {
            push('CAP-DEFAULT', '成功那一跑的信封顶层必须有 `packet_bytes = {session_count, out_bytes, limit}`（契约 §9.1 ⑤）—— 生效上限在成功路上读不到，就等于"闸在不在"在跑得通的那一跑里没有读数')
          } else {
            if (pb.limit !== DEFAULT_LIMIT) push('CAP-DEFAULT', `不注入时生效上限必须是缺省 ${DEFAULT_LIMIT} B（= 512 MiB，见 CONTRACT §9.1 ③），实得 ${JSON.stringify(pb.limit)}`)
            if (pb.out_bytes !== WANT.out_bytes) push('CAP-DEFAULT', `成功路上的 out_bytes 应为两条进包流解压后字节之和 ${WANT.out_bytes}，实得 ${JSON.stringify(pb.out_bytes)}`)
            if (pb.session_count !== WANT.session_count) push('CAP-SESSION-COUNT', `成功路上的 session_count 应为进包的源数 2（第三条是 other_project，一个字节都不许解压），实得 ${JSON.stringify(pb.session_count)}`)
          }
          const fr = rDefault.json?.frames ?? null
          if (fr === null || typeof fr !== 'object') {
            push('CAP-DEFAULT', '成功那一跑必须带回 `frames` 四条读数')
          } else {
            if (fr.count !== WANT.frames) push('CAP-DEFAULT', `frames.count 应为两条流的帧数之和 ${WANT.frames}，实得 ${JSON.stringify(fr.count)}`)
            if (fr.all_chars !== WANT.all_chars) push('CAP-DEFAULT', `frames.all_chars 应为手算的 ${WANT.all_chars}（B3.4 口径：去 BOM、CRLF→LF、按 code point），实得 ${JSON.stringify(fr.all_chars)}`)
          }
          const man = rDefault.json?.packet_dir ? manifestOf({ manifest_path: path.join(rDefault.json.packet_dir, 'manifest.json') }) : null
          if (man === null) push('CAP-DEFAULT', '成功那一跑必须落下 manifest.json（读不到 ⇒ 这条正例不成立）')
          else {
            if (man.frames?.all_chars !== WANT.all_chars) push('CAP-DEFAULT', `manifest.frames.all_chars 应为 ${WANT.all_chars}，实得 ${JSON.stringify(man.frames?.all_chars)}`)
            const ids = Array.isArray(man.source_ids) ? [...man.source_ids].sort() : null
            if (JSON.stringify(ids) !== JSON.stringify(['cap-src-a', 'cap-src-b'])) {
              push('CAP-SESSION-COUNT', `进包的 source_ids 必须恰好是 ['cap-src-a','cap-src-b']，实得 ${JSON.stringify(ids)}`)
            }
          }
        }

        // ── 正例 ②（边界）：`out_bytes === limit` ⇒ **过**（"超过才拒"，口径同 §8.1 的 400/401）────
        if (rExact.exit_code !== 0 || rExact.json?.ok !== true) {
          push('CAP-KNOB-EXACT', `out_bytes 恰好等于上限（${WANT.out_bytes} B）时必须**过** —— 上限是"超过才拒"，不是"到了就拒"；实得 exit=${rExact.exit_code} code=${JSON.stringify(rExact.json?.error?.code ?? null)}：${String(rExact.stdout ?? '').trim().slice(0, 200)}`)
        } else if (rExact.json?.packet_bytes?.limit !== WANT.out_bytes) {
          push('CAP-KNOB-EXACT', `注入上限的那一跑必须把**生效上限**报回来（应为注入的 ${WANT.out_bytes}），实得 ${JSON.stringify(rExact.json?.packet_bytes?.limit)}`)
        }

        // ── 反例 ①：调低 1 字节 ⇒ `E_PACKET_TOO_LARGE` + 三个数的 `error.details` ────────────
        if (rOver.exit_code === 0 || rOver.json?.ok !== false) {
          push('CAP-KNOB-OVER', `上限调到 ${WANT.out_bytes - 1} B（< 解压总量 ${WANT.out_bytes}）必须**拒**，实得 exit=${rOver.exit_code} ok=${JSON.stringify(rOver.json?.ok ?? null)} —— 今天这一跑是"照做"（没有上限，超限就是照常出包）`)
        } else {
          const code = rOver.json?.error?.code ?? null
          if (code !== 'E_PACKET_TOO_LARGE') {
            push('CAP-KNOB-OVER', `超限的稳定码必须是 E_PACKET_TOO_LARGE，实得 ${JSON.stringify(code)} —— 码没登记进 lib/error-codes.mjs 的 CODES 时，CLI 的 catch 会把它折成 E_INTERNAL（"包太大"与"程序有 bug"就长得一模一样）`)
          }
          if (rOver.exit_code !== 5) push('CAP-KNOB-OVER', `E_PACKET_TOO_LARGE 的退出码应是 5（校验拒绝族，PACKET_* 五个码全是 5），实得 ${rOver.exit_code}`)
          const d = rOver.json?.error?.details ?? null
          if (d === null || typeof d !== 'object') {
            push('CAP-KNOB-OVER', '`E_PACKET_TOO_LARGE` 必须把三个数放进 `error.details`：{session_count, out_bytes, limit}（⚠️ lib/packet.mjs 的 packetError() 把它挂在 err.detail（单数），而 CLI 的 catch 只转发 err.details（复数）—— 只改 throw 不改出口，这三个数在 stdout 里是 null）')
          } else {
            if (d.session_count !== WANT.session_count) push('CAP-SESSION-COUNT', `error.details.session_count 应为进包的源数 2（不是 sources 的 3 条），实得 ${JSON.stringify(d.session_count)}`)
            if (d.limit !== WANT.out_bytes - 1) push('CAP-KNOB-OVER', `error.details.limit 必须是**这一次生效**的那个数 ${WANT.out_bytes - 1}，实得 ${JSON.stringify(d.limit)}`)
            if (d.out_bytes !== WANT.out_bytes) {
              push('CAP-NO-TRUNCATE', `拒的时候 error.details.out_bytes 必须是**解压总量**（${WANT.out_bytes}），实得 ${JSON.stringify(d.out_bytes)} —— 比它小就是"读到被顶住那一刻就报数"，也就是"少读几帧凑合"（定形不做清单第 4 条禁的就是这件事）`)
            }
          }
        }
        if (JSON.stringify(capDirsAfterOver) !== JSON.stringify(capDirsBeforeOver)) {
          push('CAP-NO-TRUNCATE', `超限那一跑必须在 outDir 里**零写入**：跑前 ${JSON.stringify(capDirsBeforeOver)} / 跑后 ${JSON.stringify(capDirsAfterOver)}（失败不留半包，与既有 PACKET-NO-HALF 同一条）`)
        }

        // ── 三个值的语义：`0` = 关闸 · 负数/非整数 = 当场拒 ─────────────────────────────────
        //   `0` 这一格**两件事都要抓**：① 信封顶层**没有** `packet_bytes`（上限读不到 ⇒ 红）
        //   ② 在、但 `limit !== null`（"关"被写成 0 / 缺省值 / 干脆没这个键 ⇒ 红）。
        //   🔴 不许写成 `(v ?? '…') !== null`：`??` 把 `null` 也当成"没有值" ⇒ 那个比较**恒真**，
        //   契约要的 `null` 反倒判红（2026-10-23 现场：`limit: null` 却报 `[CAP-OFF] … 实得 null`）。
        const capOffProblems = (envelope) => {
          if (envelope === null || typeof envelope !== 'object' || !Object.prototype.hasOwnProperty.call(envelope, 'packet_bytes')) {
            return ['信封顶层没有 `packet_bytes` —— 成功的那一跑对"闸关没关"没有读数（契约 §9.1 ⑤ 的第二个出口）']
          }
          const pb = envelope.packet_bytes
          if (pb === null || typeof pb !== 'object') {
            return [`\`packet_bytes\` 必须是对象 {session_count, out_bytes, limit}，实得 ${JSON.stringify(pb)}`]
          }
          if (!Object.prototype.hasOwnProperty.call(pb, 'limit')) {
            return [`\`packet_bytes\` 里没有 \`limit\` 这个键（实得键 ${JSON.stringify(Object.keys(pb))}）—— 生效上限没被报出来`]
          }
          if (pb.limit !== null) {
            return [`上限关掉时 \`packet_bytes.limit\` 必须是 null（不是 0 —— 0 与"关"混在一起，读的人分不出"没设闸"和"闸设成 0"），实得 ${JSON.stringify(pb.limit)}`]
          }
          return []
        }
        //   谓词自控（六格，喂合成信封）：翻不了面的判据是装饰 —— 只有"该绿时绿"与"该红时红"都出现过，
        //   下面那一格的绿才算读数。（`mig-rules-11`；同款做法见本文件 `FAIL-SHAPE-CONTROL`。）
        const CAP_OFF_CONTROL = [
          { label: '照契约写的成功信封（limit === null）', envelope: { ok: true, packet_bytes: { session_count: 2, out_bytes: WANT.out_bytes, limit: null } }, wantRed: 0 },
          { label: '不注入上限那一跑的读数（limit = 缺省值；它走的是"正常出包"那条分支，不是关闸那条）', envelope: { ok: true, packet_bytes: { session_count: 2, out_bytes: WANT.out_bytes, limit: DEFAULT_LIMIT } }, wantRed: 1 },
          { label: 'limit 是 0（把"关"写成"设成 0"）', envelope: { ok: true, packet_bytes: { session_count: 2, out_bytes: WANT.out_bytes, limit: 0 } }, wantRed: 1 },
          { label: '顶层没有 packet_bytes', envelope: { ok: true, op: 'session-packet' }, wantRed: 1 },
          { label: 'packet_bytes 是 null', envelope: { ok: true, packet_bytes: null }, wantRed: 1 },
          { label: 'packet_bytes 里没有 limit 键', envelope: { ok: true, packet_bytes: { session_count: 2, out_bytes: WANT.out_bytes } }, wantRed: 1 },
        ]
        rec.readings.cap_off_control = CAP_OFF_CONTROL.map((c) => {
          const red = capOffProblems(c.envelope)
          return { label: c.label, want_red: c.wantRed, got_red: red.length === 0 ? 0 : 1, red }
        })
        for (const c of rec.readings.cap_off_control) {
          if (c.got_red !== c.want_red) {
            push('CAP-OFF', `CAP-OFF 谓词自控：「${c.label}」应判 ${c.want_red === 0 ? '绿' : '红'}、实判 ${c.got_red === 0 ? '绿' : '红'}（${c.red.join(' / ') || '无红因'}）—— 谓词不翻面时，下面那一格的绿是装饰`)
          }
        }
        if (rOff.exit_code !== 0 || rOff.json?.ok !== true) {
          push('CAP-OFF', `\`${CAP_ENV}=0\` 的语义是"关掉上限"，几十 KB 的小流必须照常出包，实得 exit=${rOff.exit_code} code=${JSON.stringify(rOff.json?.error?.code ?? null)}`)
        } else {
          for (const msg of capOffProblems(rOff.json)) push('CAP-OFF', msg)
        }
        for (const [label, r, raw] of [['负整数', rNeg, '-1'], ['带单位的字符串', rJunk, "'1KB'"]]) {
          if (r.exit_code === 0 || r.json?.ok !== false) {
            push('CAP-BAD-VALUE', `上限的值是${label}（${raw}）⇒ 必须当场 E_ARG_SCHEMA 拒掉（不许静默当 0 就当"关闸"，也不许当无穷），实得 exit=${r.exit_code} ok=${JSON.stringify(r.json?.ok ?? null)}`)
          } else if (r.json?.error?.code !== 'E_ARG_SCHEMA') {
            push('CAP-BAD-VALUE', `上限的值是${label}（${raw}）时稳定码应是 E_ARG_SCHEMA，实得 ${JSON.stringify(r.json?.error?.code ?? null)}`)
          } else if (r.exit_code !== 2) {
            push('CAP-BAD-VALUE', `E_ARG_SCHEMA 的退出码是 2，实得 ${r.exit_code}`)
          }
        }

        // ── 量的是"读了多少"，不是"留下多少"：同一条上限也要挡住 `human:true` 那条路 ──────────
        //    它走 `filterStream`（40 源那次崩的正是那一段），而留下的人话包比解压总量小得多 ——
        //    按"留下多少"判的实现，会在不开 human 那一格绿、在这一格红。
        if (rHuman.exit_code === 0 || rHuman.json?.ok !== false || rHuman.json?.error?.code !== 'E_PACKET_TOO_LARGE') {
          push('CAP-FILTER-PATH', `同一条上限必须也挡住 \`sources[].human: true\` 那条路（解压总量同为 ${WANT.out_bytes} B，上限 ${WANT.out_bytes - 1} B ⇒ 必须 E_PACKET_TOO_LARGE），实得 exit=${rHuman.exit_code} code=${JSON.stringify(rHuman.json?.error?.code ?? null)} ok=${JSON.stringify(rHuman.json?.ok ?? null)}`)
        }
        if (rHuman.json?.error?.code === 'E_PACKET_TOO_LARGE' && rHuman.json?.error?.details?.out_bytes !== WANT.out_bytes) {
          push('CAP-FILTER-PATH', `\`human:true\` 那一跑的 out_bytes 也必须是解压总量 ${WANT.out_bytes}（不是筛完留下多少），实得 ${JSON.stringify(rHuman.json?.error?.details?.out_bytes)}`)
        }

        // ══ 「崩溃不许悄悄发生」：exit 非 0 ⇒ stdout 必须是可解析的 JSON；**绝不 134** ══════
        //  谓词先拿四种合成样本自证（该红时红、该绿时绿），再逐条量真实的路。
        const failShape = (r, wantCode) => {
          if (r.exit_code === 0) return ['退出码是 0 —— 这条路**根本没失败**（没有失败可读，所以"失败时 stdout 是不是 JSON"这一格今天读不到）']
          const fails = []
          if (r.exit_code === 134) fails.push('退出码是 134 —— 那是进程被 V8 杀掉，不是一条失败读数（定形"问题"第 3 条：这条就是今天那个 crash 的形状）')
          if (r.signal !== null && r.signal !== undefined) fails.push(`进程被信号杀掉（signal=${r.signal}）—— 调用方拿不到 {ok:false}`)
          if (r.timed_out === true) fails.push('超时被杀（timed_out）—— 没有读数')
          if (r.spawn_error) fails.push(`子进程起不来：${String(r.spawn_error).slice(0, 160)}`)
          const lines = String(r.stdout ?? '').split(/\r?\n/).filter((l) => l.trim() !== '')
          let envelope = null
          try { envelope = JSON.parse(lines[lines.length - 1] ?? '') } catch { envelope = null }
          if (envelope === null) fails.push(`stdout 里没有可解析的 JSON（前 120 字：${JSON.stringify(String(r.stdout ?? '').slice(0, 120))}）—— 契约 §9.1 ⑥：退出码非 0 时 stdout 必须是一行 JSON`)
          else {
            if (envelope.ok !== false) fails.push(`stdout 的 JSON 里 ok 应为 false，实得 ${JSON.stringify(envelope.ok)}`)
            if (wantCode !== undefined && (envelope?.error?.code ?? null) !== wantCode) {
              fails.push(`错误码应是 ${wantCode}，实得 ${JSON.stringify(envelope?.error?.code ?? null)}`)
            }
          }
          return fails
        }
        const CAP_CONTROL = [
          { label: '真·134（今天那个 crash 的形状）', rec: { exit_code: 134, signal: null, timed_out: false, stdout: '' }, want: 'BAD' },
          { label: '被信号杀掉', rec: { exit_code: null, signal: 'SIGKILL', timed_out: false, stdout: '' }, want: 'BAD' },
          { label: '非 0 但 stdout 是散文（GC 日志）', rec: { exit_code: 5, signal: null, timed_out: false, stdout: 'FATAL ERROR: invalid array length Allocation failed - JavaScript heap out of memory\n' }, want: 'BAD' },
          { label: '照契约写的失败形状', rec: { exit_code: 5, signal: null, timed_out: false, stdout: '{"ok":false,"op":"session-packet","error":{"code":"E_PACKET_TOO_LARGE","message":"（样本）","details":{"session_count":2,"out_bytes":40000,"limit":39999}}}\n' }, want: 'OK' },
        ]
        const capControl = CAP_CONTROL.map((s) => {
          const fails = failShape(s.rec, undefined)
          return { label: s.label, want: s.want, got: fails.length === 0 ? 'OK' : 'BAD', fails }
        })
        rec.readings.fail_shape_control = capControl
        for (const c of capControl) {
          if (c.want !== c.got) {
            push('FAIL-SHAPE-CONTROL', `失败形状谓词自控：「${c.label}」应判 ${c.want}、实判 ${c.got}（${c.fails.join(' / ') || '无红因'}）—— 谓词不咬的话，下面那张表就是装饰`)
          }
        }
        const CAP_PATHS = [
          ['缺 day', rNoDay, 'E_ARG_SCHEMA'],
          ['会话流不在盘上', rMissing, 'E_PACKET_FRAMES'],
          [`上限是负整数（${CAP_ENV}=-1）`, rNeg, 'E_ARG_SCHEMA'],
          [`解压总量超限（${CAP_ENV}=${WANT.out_bytes - 1}）`, rOver, 'E_PACKET_TOO_LARGE'],
        ]
        rec.readings.fail_shape_paths = CAP_PATHS.map(([label, r, want]) => ({
          label, want_code: want, exit: r.exit_code, signal: r.signal ?? null, timed_out: r.timed_out === true,
          code: r.json?.error?.code ?? null, stdout_head: String(r.stdout ?? '').slice(0, 160), fails: failShape(r, want),
        }))
        for (const [label, r, want] of CAP_PATHS) {
          for (const f of failShape(r, want)) push('FAIL-SHAPE', `「${label}」：${f}`)
        }
        rec.readings.cap_note = {
          real_crash: {
            measured_at: '2026-10-23 11:34（组长现量，另一个工作区的 40 源真流）',
            exit: 134, ms: 11500, heap_before_crash_mb: 2111, heap_limit_mb: 2237, stdout: '（空 —— 没有 JSON）',
          },
          why_not_in_this_case: '定形验收 #4：那份 40 源真流会被清理 ⇒ 只做一次性验收读数，不做常驻用例。常驻用例靠"可注入的上限 + 几十 KB 合成流"造同一条超限路；`exit 134` 那一格今天由 fail_shape_control 的合成样本守着（谓词认得出 134），不是"这一跑真的 134 过"。',
        }
      }

      caseFail(problems)
    })
  })
})
