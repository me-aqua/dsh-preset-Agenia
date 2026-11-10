/**
 * `UMH-01`…`UMH-05` —— **撤 / 恢复宿主级行的那条命令**（`bug-20261110-14`）。
 *
 * 契约：`.team/test/2026-11-10/CONTRACT-gate2-unmount-host-row.md`（**唯一出处**；本文件是它的实现）。
 * 定形：`.team/leader/2026-11-10/定形-撤挂载命令.md`（binding；超出它的三处写在契约 §三，逐条带实测）。
 * 被测：`<repo>/.tools/unmount-host-row.mjs --repo <root> --id agenia-dashboard --apply|--restore`
 *       —— **写这一格时它还不存在** ⇒ 五格**预期红**，红因首个 = `UMH-TOOL-ABSENT`（契约 §九）。
 *
 * ── 判什么（只认补丁文本；printf 只是第二个读数）──────────────────────────────────
 *   · **落点**：`row_landing = {insert, preset_bodies}` 由**尺子**从生成器写出来的
 *     `presets/agenia/cordis.patch.yml` 复算（`support/client-ui-placement.mjs::describePlacement()`，
 *     `DASH-15`/`DASH-16` 的判据本体；本文件**不另造解析器**）。
 *     工具自己打印的 `row_landing` 只用来比"两处说的是不是一件事"—— 不一致就红（以补丁为准）。
 *   · **派生物**：`--apply` / `--restore` 之后 `<copy>/.tools/make-bundle-patch.mjs --check` 必须 exit 0
 *     ⇒ 落点是**生成器派生**出来的，不是有人把补丁文件换成了"看起来对"的那份字节。
 *   · **载体**：A 标记（组合里 `  # @host-level`）/ B 名单（生成器 `HOST_LEVEL_IDS` 里在不在）/
 *     C 行字段（`  disabled: true`）。判据只读 A / C 的文本 + B 的**后果**（契约 §六.2 不钉名单形状）。
 *   · **字节**：no-op / 拒绝 / 回滚之后，两份载体文件（+ 补丁）逐字节回到跑之前；
 *     `--restore` 之后同理；并且**文件集合**也要回到跑之前（工具不许留账本 / 临时件）。
 *   · **枪口朝哪**：真工具不在盘上 ⇒ `UMH-TOOL-ABSENT`（红）；红是设计的一部分，不是回归。
 *
 * ── 五格与它们的刀（每把刀跑**同一段判读函数**，不另写一条断言）────────────────────
 *   `UMH-01` 两条腿：`--apply` ⇒ `{0,2}`；`--restore` ⇒ `{1,0}`；来回一圈回原字节；未知 id ⇒ exit 3。
 *      刀 K1 `printf-liar`（只说 `{0,2}`、一个字节不写）⇒ `UMH-LANDING-MISMATCH`；
 *      刀 K2 `forge-patch`（换掉补丁文件伪造派生物）⇒ `UMH-PATCH-NOT-DERIVED`；
 *      刀 K3 `silent-proceed`（未知 id 也 exit 0）⇒ `UMH-USAGE-SILENT-GREEN`。
 *   `UMH-02` 负控①：B 态（只撤了标记）⇒ 拒绝、点名 `marker`、**生成器一次都没被调用**、字节不变。
 *      刀 K3 ⇒ `UMH-REFUSAL-EXIT`；刀 K4（报另一个载体的码）⇒ `UMH-CARRIER-NAMED-WRONG`。
 *   `UMH-03` 负控②：C 态（只撤了名单）⇒ 同样的形状，码是 `E_UNMOUNT_LIST_MISSING`。
 *      两格的码**逐字比**：工具把两个码写反 ⇒ 两格都红（各自钉死自己那一个）。
 *   `UMH-04` 幂等：U 态 `--apply` ⇒ `UMH-NOOP` / `changed: 0` / 字节不动；`--apply` 两次、`--restore` 两次同形。
 *      刀 K5（恒报 `changed: 1`）⇒ `UMH-CHANGED-NOT-ZERO`；刀 K6（报 no-op 却写了一个换行）⇒ `UMH-NOOP-TOUCHED-BYTES`。
 *   `UMH-05` 回滚：生成器步注入"见证 + 抛"⇒ 三处**已经写过**（见证为证）、之后字节逐字节回到跑之前；
 *      自证步注入"成功但产物不翻面"⇒ `failed_step: verify` 也要回滚。
 *      刀 K7（跳到"三处都写好了"再跑生成器、**不回滚**）⇒ `UMH-ROLLBACK-NOT-BYTE-IDENTICAL`。
 *
 * ── 不判（写给下一个读的人，别把这份绿读大）──────────────────────────────────────
 *   🔴 **GUI 不在这里判。** 撤 / 恢复之后面板在不在，属于 R5 那一次实机验证，只能由人在界面上点一次；
 *      本文件不读 GUI、不重启宿主、不读会话流。
 *   · 不判宿主级那套设计（两份真相不合并）；不判"哪几行该是宿主级"；不判 profile 层退役路线。
 *   · 不判 `--id` 指向**非宿主级行**的行为；不判 D / E 两态（契约 §八.4 登记为漏）。
 *   · 不判工具内部结构（函数名 / 常量名 / 是否用账本）；不判 `HOST_LEVEL_IDS` 的形状（数组 / Set / 排法）。
 *
 * ── 今天为什么红（说清楚，别当回归）────────────────────────────────────────────────
 *   `.tools/unmount-host-row.mjs` 不在盘上 ⇒ 五格**全红**、红因 `UMH-TOOL-ABSENT`。
 *   但**刀腿今天就跑**（假工具是判据自己的夹具，不依赖真工具）⇒ "该红时会红"不是自述。
 *   工具落地后若 `UMH-01` 还红在 `E_BUNDLE_CLIENT_UI_ENABLED` 上 ⇒ 第 3 关漏了契约 §三 D-1 的第三处载体。
 *
 * 证据：`<_evidence>/<RUN_ID>/UMH-0x/result.json`（`readings.legs` / `readings.scenarios` 逐格带读数）。
 */
import { before, test } from 'node:test'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { caseFail, preflight, problem, runCase } from '../support/evidence.mjs'
import { withHostRowInPresetBodies } from '../support/client-ui-placement.mjs'
import {
  CODE,
  carrierFacts,
  carrierProblems,
  derivedProblems,
  forgedPatchOf,
  knife,
  landingProblems,
  legBook,
  liveEntryState,
  noopProblems,
  pushToolAbsent,
  refusalProblems,
  rollbackProblems,
  rowLanding,
  runAgain,
  runScenario,
  scratchDir,
  shapeProblems,
  slim,
  unmountedTexts,
  usageProblems,
  REL,
  ROW_ID,
  SOURCE,
  witnessGenerator,
} from '../support/unmount-host-row.mjs'

before(() => {
  preflight()
})

/**
 * **阳性对照**：一份"照契约写对的工具"会给出的读数**长什么样**，判读函数必须对它说 0 条
 * （`OFL-06` / `OFB-06` 的同款规矩）。
 *
 * 为什么要有它：判据今天全红（工具不在盘上）。如果**连一份合规读数也判不成绿**，
 * 那这五格与"永远红"长得一模一样 —— 第 3 关交活时谁也分不出是工具没做对还是判据坏了。
 * 🔴 它不是夹具期望值：真正的断言只读**真工具**在副本上留下的字节与补丁文本；
 *    这里判的是**判读函数自己的可满足性**（`UMH-CONTROL-NOT-GREEN` = 判据坏了，不是工具坏了）。
 */
function controlReading(over = {}) {
  const base = {
    exit: 0,
    action: 'apply',
    stderr: 'ok\n',
    json_error: null,
    stdout_lines: ['{…}'],
    json: {},
    check: { status: 0, stderr: '' },
    live_touched: [],
    files_equal: false,
    tree_equal: false,
    changed_files: ['presets/agenia/agent.cordis.yml'],
    before: { carriers: {}, files: { composition: 'c-before', generator: 'g-before', patch: 'p-before' } },
    after: { carriers: {}, landing: { insert: 0, preset_bodies: 2 }, files: { composition: 'c-after', generator: 'g-after', patch: 'p-after' } },
  }
  return { ...base, ...over }
}

/** 把一份读数的判读结果收成一个码（control 用）。 */
function controlFails(problems, label, got) {
  if (got.length === 0) return
  problems.push(problem(CODE.controlNotGreen, `${label}：阳性对照（一份合规读数）被判成 ${got.length} 条红：`
    + `${JSON.stringify(got.map((p) => p.code))} —— 判据**不可满足**：这一格的红不能算在工具头上，先修判据`))
}

// ─────────────────────────────────────────────────────────────────────────────
test('UMH-01 撤挂载/恢复两条腿：--apply ⇒ 补丁里 {insert:0,preset_bodies:2} · --restore ⇒ {1,0} · 来回一圈回原字节', async () => {
  await runCase('UMH-01', async (rec) => {
    const problems = []
    const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
    const book = legBook(problems)
    const scenarios = {}

    // ── ⓪ 前提与尺子自证（空集不算通过：产品树今天必须是 M 态、尺子必须翻得动）──
    const live = liveEntryState()
    rec.readings.ruler = {
      plain: { insert: live.landing.insert, preset_bodies: live.landing.preset_bodies },
      moved: null,
      carrier_entry: { marker: live.carriers.marker, disabled: live.carriers.disabled, listed: live.carriers.listed },
    }
    book.run('ruler-control', () => {
      const livePatch = readFileSync(SOURCE.patch, 'utf8')
      const moved = withHostRowInPresetBodies({ patchText: livePatch, hostRowIds: [ROW_ID] })
      const movedLanding = rowLanding(moved.text)
      rec.readings.ruler.moved = { insert: movedLanding.insert, preset_bodies: movedLanding.preset_bodies, moved: moved.moved }
      if (live.landing.insert !== 1 || live.landing.preset_bodies !== 0) {
        push(CODE.rulerControl, `尺子自证：产品补丁原样应读出 insert=1 / preset_bodies=0，实得 `
          + `${live.landing.insert} / ${live.landing.preset_bodies} —— 尺子坏了，这一格的红不能算在工具头上`)
      }
      if (!moved.moved || movedLanding.insert !== 0 || movedLanding.preset_bodies !== 2) {
        push(CODE.rulerControl, `尺子自证：把那一行搬进两份预设体之后应读出 {0,2}，实得 `
          + `${movedLanding.insert} / ${movedLanding.preset_bodies}（moved=${moved.moved}）`
          + ' —— 数不出 `{0,2}` 的尺子判不了 `--apply`')
      }
      if (!(live.carriers.marker === true && live.carriers.disabled === false && live.carriers.listed === true)) {
        push(CODE.fixture, `入口态自检：产品树今天应当处于 M 态（标记在 / 没关 / 名单里有），实得 `
          + `${JSON.stringify({ marker: live.carriers.marker, disabled: live.carriers.disabled, listed: live.carriers.listed })} `
          + '—— 前提不成立时这一格判不了（先修产品树，别改判据）')
      }
    })

    // ── ① 腿 apply：M ⇒ U，补丁从 {1,0} 翻到 {0,2}，且是**派生物** ──────────────
    const apply = runScenario({ name: 'umh-01-apply', pre: 'M', generator: 'real', tool: 'real', action: 'apply', check: true })
    scenarios.apply = slim(apply)
    book.run('apply', () => {
      if (!apply.tool_present) {
        pushToolAbsent(problems, apply, '--apply')
        return CODE.toolAbsent
      }
      for (const p of shapeProblems(apply, { exit: 0, code: 'UMH-APPLIED', changed: 3, label: '--apply' })) problems.push(p)
      for (const p of landingProblems(apply, { insert: 0, presetBodies: 2, label: '--apply' })) problems.push(p)
      for (const p of carrierProblems(apply, { marker: false, disabled: true, label: '--apply' })) problems.push(p)
      for (const p of derivedProblems(apply, '--apply')) problems.push(p)
      if (apply.json_error !== null) {
        push(CODE.notJson, `--apply：stdout 读不出一行 JSON（${apply.json_error}；头几行 ${JSON.stringify(apply.stdout_lines.slice(0, 3))}）`)
      }
      if (apply.live_touched.length > 0) {
        push(CODE.liveTouched, `--apply：**活树**被动过 ${JSON.stringify(apply.live_touched)} —— 工具必须只写 \`--repo\` 指的那棵树`
          + '（副本里没有 `.git`，往上爬会写到活树）')
      }
      return undefined
    })

    // ── ② 腿 restore：在①的产物上跑 ⇒ 回到 {1,0}，两份文件逐字节 + 文件集合回到①之前 ──
    const restore = apply.tool_present ? runAgain(apply, { action: 'restore', check: true }) : null
    scenarios.restore = restore === null ? null : slim(restore)
    book.run('restore', () => {
      if (restore === null) return CODE.toolAbsent
      for (const p of shapeProblems(restore, { exit: 0, code: 'UMH-RESTORED', changed: 3, label: '--restore' })) problems.push(p)
      for (const p of landingProblems(restore, { insert: 1, presetBodies: 0, label: '--restore' })) problems.push(p)
      for (const p of carrierProblems(restore, { marker: true, disabled: false, label: '--restore' })) problems.push(p)
      for (const p of derivedProblems(restore, '--restore')) problems.push(p)
      // 🔴 "精确的逆"量的是**回到 apply 之前**（不是回到 restore 之前 —— 那是 U 态，本来就该不同）。
      const beforeApply = JSON.stringify(apply.before.files_map)
      const afterRestore = JSON.stringify(restore.after.files_map)
      if (beforeApply !== afterRestore) {
        const changed = Object.keys(JSON.parse(afterRestore))
          .filter((rel) => JSON.parse(beforeApply)[rel] !== JSON.parse(afterRestore)[rel])
        push(CODE.notInverse, `--restore：副本没有回到 \`--apply\` **之前**（变了 ${JSON.stringify(changed)}）—— `
          + '定形 §二 说这是"精确的逆"：两份载体文件逐字节 + 文件集合都必须回原位（`presets/` 与 `.tools/` 是可执行输入，'
          + '工具不许在那里留账本 / 临时件）')
      }
      if (restore.live_touched.length > 0) {
        push(CODE.liveTouched, `--restore：**活树**被动过 ${JSON.stringify(restore.live_touched)}`)
      }
      return undefined
    })

    // ── ③ 腿 unknown-id：组合里没有那一行 ⇒ exit 3，一个字节不写 ─────────────────
    const unknown = runScenario({ name: 'umh-01-unknown-id', pre: 'M', generator: 'real', tool: 'real', action: 'apply', id: 'agenia-dashboard-typo' })
    scenarios.unknown_id = slim(unknown)
    book.run('unknown-id', () => {
      if (!unknown.tool_present) return CODE.toolAbsent
      for (const p of usageProblems(unknown, '未知 id')) problems.push(p)
      return undefined
    })

    // ── ④ 刀 K1：只用 printf 说 `{0,2}`、一个字节都不写 ⇒ 判读必须响亮地红 ─────────
    const k1 = runScenario({ name: 'umh-01-k1-printf-liar', pre: 'M', generator: 'real', tool: 'printfLiar' })
    scenarios.knife_printf_liar = slim(k1)
    book.run('knife-K1', () => {
      const got = landingProblems(k1, { insert: 0, presetBodies: 2, label: 'K1·printf-liar' })
      knife(problems, { label: 'K1·printf-liar', got, want: CODE.landing, allow: [CODE.landingPrinted] })
      if (!(k1.after.landing?.insert === 1 && k1.after.landing?.preset_bodies === 0)) {
        push(CODE.knifeNotBiting, `K1：假工具应当一个字节都不写（补丁仍 {1,0}），实得 ${JSON.stringify(k1.after.landing)}`)
      }
      return undefined
    })

    // ── ⑤ 刀 K2：把补丁文件换成"看起来对"的那份字节（伪造派生物）⇒ 判读必须红 ─────
    const forged = forgedPatchOf('umh-01-forged')
    scenarios.forged_patch = { ok: forged.ok, status: forged.status, stderr_head: forged.stderr.slice(0, 600) }
    const k2 = forged.ok
      ? runScenario({ name: 'umh-01-k2-forge-patch', pre: 'M', generator: 'real', tool: 'forgePatch', fakeArgs: [forged.file], check: true })
      : null
    scenarios.knife_forge_patch = k2 === null ? null : slim(k2)
    book.run('knife-K2', () => {
      if (!forged.ok) {
        push(CODE.fixture, `K2 的伪造输入造不出来（U 态上真生成器 exit ${forged.status}）：${forged.stderr}`)
        return undefined
      }
      knife(problems, { label: 'K2·forge-patch', got: derivedProblems(k2, 'K2·forge-patch'), want: CODE.notDerived })
      // 伪造的字节确实"看起来对"：落点就是 {0,2} ⇒ 这一把刀专门证明"落点对"不等于"派生对"。
      if (!(k2.after.landing?.insert === 0 && k2.after.landing?.preset_bodies === 2)) {
        push(CODE.fixture, `K2 的伪造补丁落点应读成 {0,2}，实得 ${JSON.stringify(k2.after.landing)} —— 伪造输入坏了`)
      }
      return undefined
    })

    // ── ⑥ 刀 K3：未知 id 也 exit 0（静默成功）⇒ 判读必须红 ─────────────────────────
    const k3 = runScenario({ name: 'umh-01-k3-silent-unknown', pre: 'M', generator: 'real', tool: 'silentProceed', action: 'apply', id: 'agenia-dashboard-typo' })
    scenarios.knife_silent_unknown = slim(k3)
    book.run('knife-K3', () => {
      knife(problems, { label: 'K3·silent-unknown', got: usageProblems(k3, 'K3·silent-unknown'), want: CODE.usageSilentGreen })
      return undefined
    })

    // ── ⑦ 阳性对照：一份"照契约写对的工具"的读数必须判成 0 条（判据可满足）───────────
    book.run('control', () => {
      const conforming = controlReading({
        json: { code: 'UMH-APPLIED', changed: 3, row_landing: { insert: 0, preset_bodies: 2 } },
        before: { carriers: { marker: true, disabled: false, listed: true }, files: { composition: 'c0', generator: 'g0', patch: 'p0' } },
        after: { carriers: { marker: false, disabled: true, listed: false }, landing: { insert: 0, preset_bodies: 2 }, files: { composition: 'c1', generator: 'g1', patch: 'p1' } },
      })
      controlFails(problems, '阳性对照·--apply', [
        ...shapeProblems(conforming, { exit: 0, code: 'UMH-APPLIED', changed: 3, label: 'control' }),
        ...landingProblems(conforming, { insert: 0, presetBodies: 2, label: 'control' }),
        ...carrierProblems(conforming, { marker: false, disabled: true, label: 'control' }),
        ...derivedProblems(conforming, 'control'),
      ])
      return undefined
    })

    book.require(['ruler-control', 'apply', 'restore', 'unknown-id', 'knife-K1', 'knife-K2', 'knife-K3', 'control'])
    rec.readings.legs = book.legs
    rec.readings.scenarios = scenarios
    caseFail(problems)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
test('UMH-02 错配负控①只撤了标记：工具拒绝并点名 marker · 生成器一次都不许被调用 · 字节不变', async () => {
  await runCase('UMH-02', async (rec) => {
    const problems = []
    const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
    const book = legBook(problems)
    const scenarios = {}

    // ── ⓪ 入口态自检：B 态 = 标记不在 / 名单还在 / 没关（生成器换成见证：它一被调用就会留下文件）──
    const probe = runScenario({ name: 'umh-02-pre', pre: 'B', generator: 'witness', tool: 'real', action: 'apply' })
    scenarios.pre = slim(probe)
    book.run('fixture-B', () => {
      const c = probe.before.carriers
      if (c.marker !== false || c.listed !== true || c.disabled !== false) {
        push(CODE.fixture, `B 态夹具应当 {marker:false, listed:true, disabled:false}，实得 ${JSON.stringify(c)} —— 夹具坏了，这一格判不了`)
      }
      return undefined
    })

    // ── ① 真工具：--apply 必须拒绝（exit 2 / E_UNMOUNT_MARKER_MISSING / carrier=marker）──
    book.run('refusal', () => {
      if (!probe.tool_present) {
        pushToolAbsent(problems, probe, 'B 态 --apply')
        return CODE.toolAbsent
      }
      for (const p of refusalProblems(probe, { code: 'E_UNMOUNT_MARKER_MISSING', carrier: 'marker', label: 'B 态 --apply' })) problems.push(p)
      if (probe.live_touched.length > 0) push(CODE.liveTouched, `B 态 --apply：活树被动过 ${JSON.stringify(probe.live_touched)}`)
      if (probe.json_error !== null) push(CODE.notJson, `B 态 --apply：stdout 读不出一行 JSON（${probe.json_error}）`)
      return undefined
    })

    // ── ② 刀 K3：该拒绝的地方 exit 0 ⇒ 判读必须红 ────────────────────────────────
    const k3 = runScenario({ name: 'umh-02-k3-silent', pre: 'B', generator: 'witness', tool: 'silentProceed', action: 'apply' })
    scenarios.knife_silent = slim(k3)
    book.run('knife-K3', () => {
      knife(problems, {
        label: 'K3·silent-proceed',
        got: refusalProblems(k3, { code: 'E_UNMOUNT_MARKER_MISSING', carrier: 'marker', label: 'K3·silent-proceed' }),
        want: CODE.refusalExit,
        allow: [CODE.refusalCode, CODE.carrierNamedWrong],
      })
      return undefined
    })

    // ── ③ 刀 K4：报**另一个**载体的码（两条负控写反）⇒ 判读必须红 ────────────────
    const k4 = runScenario({
      name: 'umh-02-k4-wrong-carrier', pre: 'B', generator: 'witness', tool: 'wrongCarrier',
      fakeArgs: ['E_UNMOUNT_LIST_MISSING', 'list'], action: 'apply',
    })
    scenarios.knife_wrong_carrier = slim(k4)
    book.run('knife-K4', () => {
      knife(problems, {
        label: 'K4·wrong-carrier',
        got: refusalProblems(k4, { code: 'E_UNMOUNT_MARKER_MISSING', carrier: 'marker', label: 'K4·wrong-carrier' }),
        want: CODE.carrierNamedWrong,
        allow: [CODE.refusalCode],
      })
      return undefined
    })

    // ── ④ 阳性对照：一份合规的拒绝（exit 2 / 码 / 载体 / changed 0 / 字节不变 / 生成器不调用）必须判成 0 条 ──
    book.run('control', () => {
      const conforming = controlReading({
        exit: 2,
        json: { code: 'E_UNMOUNT_MARKER_MISSING', carrier: 'marker', changed: 0 },
        files_equal: true,
        tree_equal: true,
        changed_files: [],
      })
      controlFails(problems, '阳性对照·B 态拒绝', refusalProblems(conforming, { code: 'E_UNMOUNT_MARKER_MISSING', carrier: 'marker', label: 'control' }))
      return undefined
    })

    book.require(['fixture-B', 'refusal', 'knife-K3', 'knife-K4', 'control'])
    rec.readings.legs = book.legs
    rec.readings.scenarios = scenarios
    caseFail(problems)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
test('UMH-03 错配负控②只撤了名单：工具拒绝并点名 list（与 UMH-02 的码逐字不同）· 生成器不调用 · 字节不变', async () => {
  await runCase('UMH-03', async (rec) => {
    const problems = []
    const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
    const book = legBook(problems)
    const scenarios = {}

    const probe = runScenario({ name: 'umh-03-pre', pre: 'C', generator: 'witness', tool: 'real', action: 'restore' })
    scenarios.pre = slim(probe)
    book.run('fixture-C', () => {
      const c = probe.before.carriers
      if (c.marker !== true || c.listed !== false || c.disabled !== false) {
        push(CODE.fixture, `C 态夹具应当 {marker:true, listed:false, disabled:false}，实得 ${JSON.stringify(c)} —— 夹具坏了，这一格判不了`)
      }
      return undefined
    })

    book.run('refusal', () => {
      if (!probe.tool_present) {
        pushToolAbsent(problems, probe, 'C 态 --restore')
        return CODE.toolAbsent
      }
      for (const p of refusalProblems(probe, { code: 'E_UNMOUNT_LIST_MISSING', carrier: 'list', label: 'C 态 --restore' })) problems.push(p)
      if (probe.json_error !== null) push(CODE.notJson, `C 态 --restore：stdout 读不出一行 JSON（${probe.json_error}）`)
      if (probe.live_touched.length > 0) push(CODE.liveTouched, `C 态 --restore：活树被动过 ${JSON.stringify(probe.live_touched)}`)
      return undefined
    })

    const k3 = runScenario({ name: 'umh-03-k3-silent', pre: 'C', generator: 'witness', tool: 'silentProceed', action: 'restore' })
    scenarios.knife_silent = slim(k3)
    book.run('knife-K3', () => {
      knife(problems, {
        label: 'K3·silent-proceed',
        got: refusalProblems(k3, { code: 'E_UNMOUNT_LIST_MISSING', carrier: 'list', label: 'K3·silent-proceed' }),
        want: CODE.refusalExit,
        allow: [CODE.refusalCode, CODE.carrierNamedWrong],
      })
      return undefined
    })

    const k4 = runScenario({
      name: 'umh-03-k4-wrong-carrier', pre: 'C', generator: 'witness', tool: 'wrongCarrier',
      fakeArgs: ['E_UNMOUNT_MARKER_MISSING', 'marker'], action: 'restore',
    })
    scenarios.knife_wrong_carrier = slim(k4)
    book.run('knife-K4', () => {
      knife(problems, {
        label: 'K4·wrong-carrier',
        got: refusalProblems(k4, { code: 'E_UNMOUNT_LIST_MISSING', carrier: 'list', label: 'K4·wrong-carrier' }),
        want: CODE.carrierNamedWrong,
        allow: [CODE.refusalCode],
      })
      return undefined
    })

    // ── ④ 阳性对照：一份合规的拒绝（这里钉的是**另一个码**）必须判成 0 条 ────────────
    book.run('control', () => {
      const conforming = controlReading({
        exit: 2,
        json: { code: 'E_UNMOUNT_LIST_MISSING', carrier: 'list', changed: 0 },
        files_equal: true,
        tree_equal: true,
        changed_files: [],
      })
      controlFails(problems, '阳性对照·C 态拒绝', refusalProblems(conforming, { code: 'E_UNMOUNT_LIST_MISSING', carrier: 'list', label: 'control' }))
      return undefined
    })

    book.require(['fixture-C', 'refusal', 'knife-K3', 'knife-K4', 'control'])
    rec.readings.legs = book.legs
    rec.readings.scenarios = scenarios
    caseFail(problems)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
test('UMH-04 幂等：已经在目标态 ⇒ UMH-NOOP / changed:0 / 字节不动（apply 与 restore 两个方向都判）', async () => {
  await runCase('UMH-04', async (rec) => {
    const problems = []
    const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
    const book = legBook(problems)
    const scenarios = {}

    // ── ① U 态上再 --apply ⇒ 一次 no-op（入口态由夹具造；工具的产物不参与期望）──────
    const noopApply = runScenario({ name: 'umh-04-apply-on-U', pre: 'U', generator: 'real', tool: 'real', action: 'apply' })
    scenarios.apply_on_U = slim(noopApply)
    book.run('apply-noop', () => {
      if (!noopApply.tool_present) {
        pushToolAbsent(problems, noopApply, 'U 态 --apply')
        return CODE.toolAbsent
      }
      if (!(noopApply.fixture_generator?.status === 0)) {
        push(CODE.fixture, `U 态夹具的补丁没派生出来（生成器 exit ${noopApply.fixture_generator?.status}）：`
          + `${noopApply.fixture_generator?.stderr ?? ''} —— 夹具坏了，这一格判不了`)
        return undefined
      }
      for (const p of noopProblems(noopApply, { insert: 0, presetBodies: 2, label: 'U 态 --apply' })) problems.push(p)
      return undefined
    })

    // ── ② M 态上 --apply 两次：第二次必须是 no-op，且第二次之后字节 === 第一次之后 ────
    const first = runScenario({ name: 'umh-04-apply-once', pre: 'M', generator: 'real', tool: 'real', action: 'apply' })
    const second = first.tool_present ? runAgain(first, { action: 'apply' }) : null
    scenarios.apply_twice = { first: slim(first), second: second === null ? null : slim(second) }
    book.run('apply-twice', () => {
      if (!first.tool_present) return CODE.toolAbsent
      if (first.exit !== 0) {
        push(CODE.exit, `第一次 --apply：exit ${first.exit}（stderr 头：${String(first.stderr ?? '').slice(0, 300)}）—— 第二次判不了`)
        return undefined
      }
      for (const p of noopProblems(second, { insert: 0, presetBodies: 2, label: '第二次 --apply' })) problems.push(p)
      return undefined
    })

    // ── ③ U 态上 --restore 两次：第二次 no-op，字节稳定，落点回 {1,0} ─────────────
    const restoreOnce = runScenario({ name: 'umh-04-restore-once', pre: 'U', generator: 'real', tool: 'real', action: 'restore' })
    const restoreTwice = restoreOnce.tool_present ? runAgain(restoreOnce, { action: 'restore' }) : null
    scenarios.restore_twice = { first: slim(restoreOnce), second: restoreTwice === null ? null : slim(restoreTwice) }
    book.run('restore-twice', () => {
      if (!restoreOnce.tool_present) return CODE.toolAbsent
      if (restoreOnce.exit !== 0) {
        push(CODE.exit, `第一次 --restore：exit ${restoreOnce.exit}（stderr 头：${String(restoreOnce.stderr ?? '').slice(0, 300)}）—— 第二次判不了`)
        return undefined
      }
      for (const p of noopProblems(restoreTwice, { insert: 1, presetBodies: 0, label: '第二次 --restore' })) problems.push(p)
      return undefined
    })

    // ── ④ 刀 K5：恒报 changed:1（字节不动）⇒ no-op 判据必须红 ──────────────────────
    const k5 = runScenario({ name: 'umh-04-k5-always-changed', pre: 'U', generator: 'real', tool: 'alwaysChanged', action: 'apply' })
    scenarios.knife_always_changed = slim(k5)
    book.run('knife-K5', () => {
      knife(problems, {
        label: 'K5·always-changed',
        got: noopProblems(k5, { insert: 0, presetBodies: 2, label: 'K5·always-changed' }),
        want: CODE.changedNotZero,
        allow: [CODE.code],
      })
      return undefined
    })

    // ── ⑤ 刀 K6：报 no-op 却往组合尾部写一个换行 ⇒ 字节判据必须红 ──────────────────
    const k6 = runScenario({ name: 'umh-04-k6-noop-touches-bytes', pre: 'U', generator: 'real', tool: 'noopTouchesBytes', action: 'apply' })
    scenarios.knife_noop_touches = slim(k6)
    book.run('knife-K6', () => {
      knife(problems, {
        label: 'K6·noop-touches-bytes',
        got: noopProblems(k6, { insert: 0, presetBodies: 2, label: 'K6·noop-touches-bytes' }),
        want: CODE.noopTouchedBytes,
      })
      return undefined
    })

    // ── ⑥ 阳性对照：一份合规的 no-op 读数必须判成 0 条 ────────────────────────────
    book.run('control', () => {
      const conforming = controlReading({
        json: { code: 'UMH-NOOP', changed: 0, row_landing: { insert: 0, preset_bodies: 2 } },
        files_equal: true,
        tree_equal: true,
        changed_files: [],
      })
      controlFails(problems, '阳性对照·no-op', noopProblems(conforming, { insert: 0, presetBodies: 2, label: 'control' }))
      return undefined
    })

    book.require(['apply-noop', 'apply-twice', 'restore-twice', 'knife-K5', 'knife-K6', 'control'])
    rec.readings.legs = book.legs
    rec.readings.scenarios = scenarios
    caseFail(problems)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
test('UMH-05 回滚：生成器步注入失败 ⇒ 三处写过也必须逐字节回到跑之前（见证为证）· 自证失败同样回滚', async () => {
  await runCase('UMH-05', async (rec) => {
    const problems = []
    const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
    const book = legBook(problems)
    const scenarios = {}

    // ── ① 生成器步：见证 + 抛 ⇒ exit 1 / failed_step=generator / 字节回到跑之前 ───────
    const throws = runScenario({ name: 'umh-05-generator-throws', pre: 'M', generator: 'witness', tool: 'real', action: 'apply' })
    scenarios.generator_throws = slim(throws)
    book.run('generator-throws', () => {
      if (!throws.tool_present) {
        pushToolAbsent(problems, throws, 'M 态 --apply（生成器注入抛）')
        return CODE.toolAbsent
      }
      for (const p of rollbackProblems(throws, { step: 'generator', label: '生成器步注入失败' })) problems.push(p)
      if (throws.witness === null) {
        push(CODE.injectionNotReached, 'M 态 --apply：见证文件不存在 ⇒ 工具**没有调用** `<repo>/.tools/make-bundle-patch.mjs`。'
          + '契约 §一.3 钉的是"就地跑那份文件"：另起一棵树去跑的实现，这条失败注入测不到任何东西')
        return undefined
      }
      // 见证 = 注入器自己写的读数：三处**已经写过**（否则"回滚正确"与"根本没写"长得一样）。
      if (throws.witness.marker !== false || throws.witness.disabled !== true) {
        push(CODE.injectionNotReached, `M 态 --apply：生成器被调用时组合还是 `
          + `${JSON.stringify({ marker: throws.witness.marker, disabled: throws.witness.disabled })}，`
          + '期望 {marker:false, disabled:true} —— 三处载体必须在生成器之前写好，否则回滚那一格是空转')
      }
      if (throws.witness.generator_sha256 === throws.before.files.generator) {
        push(CODE.injectionNotReached, 'M 态 --apply：生成器被调用时它自己那份文件还是跑之前那份（sha256 未变）—— 名单那一处没被改过')
      }
      return undefined
    })

    // ── ② 自证步：生成器"成功"但不翻面 ⇒ exit 1 / failed_step=verify / 同样回滚 ─────
    const stale = runScenario({ name: 'umh-05-verify-fails', pre: 'M', generator: 'stub', tool: 'real', action: 'apply' })
    scenarios.verify_fails = slim(stale)
    book.run('verify-fails', () => {
      if (!stale.tool_present) return CODE.toolAbsent
      for (const p of rollbackProblems(stale, { step: 'verify', label: '自证步注入失败' })) problems.push(p)
      if (!stale.generator_called) {
        push(CODE.injectionNotReached, '自证步注入：stub 生成器一次都没被调用（见证文件不在）—— '
          + '那一跑并没有走到"生成器成功、落点不对"这一步')
      }
      return undefined
    })

    // ── ③ 刀 K7：跳到"三处都写好了"再跑生成器、**不回滚** ⇒ 字节判据必须红 ──────────
    const prep = scratchDir('umh-05-k7-prep')
    const witnessOut = path.join(prep, 'generator-called.json')
    const u = unmountedTexts()
    const compFile = path.join(prep, 'u-composition.yml')
    const genFile = path.join(prep, 'u-generator.mjs')
    writeFileSync(compFile, u.compositionText, 'utf8')
    writeFileSync(genFile, witnessGenerator(u.generatorText, witnessOut), 'utf8')
    const k7 = runScenario({
      name: 'umh-05-k7-no-rollback',
      pre: 'M',
      generator: 'real',
      tool: 'jumpToUnmountedThenNoRollback',
      fakeArgs: [compFile, genFile],
      witnessOutFile: witnessOut,
      action: 'apply',
    })
    scenarios.knife_no_rollback = slim(k7)
    book.run('knife-K7', () => {
      knife(problems, {
        label: 'K7·no-rollback',
        got: rollbackProblems(k7, { step: 'generator', label: 'K7·no-rollback' }),
        want: CODE.rollbackBytes,
      })
      // 刀的入口：它必须真的把三处写过再跑生成器（否则它咬的不是"回滚"这一面）。
      if (k7.witness === null || k7.witness.marker !== false || k7.witness.disabled !== true) {
        push(CODE.fixture, `K7 的夹具坏了：见证 ${JSON.stringify(k7.witness)} —— 这一刀没走到"三处已写好"那一刻`)
      }
      return undefined
    })

    // ── ④ 阳性对照：一份合规的回滚读数必须判成 0 条 ──────────────────────────────
    book.run('control', () => {
      const conforming = controlReading({
        exit: 1,
        json: { code: 'E_UNMOUNT_STEP_FAILED', failed_step: 'generator', rolled_back: true, changed: 0 },
        files_equal: true,
        tree_equal: true,
        changed_files: [],
      })
      controlFails(problems, '阳性对照·回滚', rollbackProblems(conforming, { step: 'generator', label: 'control' }))
      return undefined
    })

    book.require(['generator-throws', 'verify-fails', 'knife-K7', 'control'])
    rec.readings.legs = book.legs
    rec.readings.scenarios = scenarios
    caseFail(problems)
  })
})
