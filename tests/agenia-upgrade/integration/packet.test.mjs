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
import { fixturePath, loadStagedModule, nonCallables, stagingExists } from '../support/sut.mjs'

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

      caseFail(problems)
    })
  })
})
