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

      caseFail(problems)
    })
  })
})
