/**
 * `UMH-01`…`UMH-05` —— **撤 / 恢复宿主级行的那条命令**（`bug-20261110-14`）。
 *
 * 契约：`.team/test/2026-11-10/CONTRACT-gate2-unmount-host-row.md`（**唯一出处**；本文件是它的实现）。
 * 定形：`.team/leader/2026-11-10/定形-撤挂载命令.md`（binding；超出它的三处写在契约 §三，逐条带实测）。
 * 被测：`<repo>/.tools/unmount-host-row.mjs --repo <root> --id agenia-dashboard --apply|--restore`
 *       （在盘上；它不在盘上时这一族每格记 `UMH-TOOL-ABSENT` = 红，不是 skip / HOLD）。
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
 *   · **枪口朝哪**：工具缺位 ⇒ `UMH-TOOL-ABSENT`（红，不是回归）；判据的刀腿不依赖它。
 *
 * ── 五格与它们的刀（每把刀跑**同一段判读函数**，不另写一条断言）────────────────────
 *   `UMH-01` 两条腿：`--apply` ⇒ `{0,2}`；`--restore` ⇒ `{1,0}`；来回一圈回原字节；未知 id ⇒ exit 3。
 *      夹具腿 `copy-runnable-set`：副本必须带着工具的**运行集**（含 `presets/agenia/lib/atomic.mjs`，
 *      工具 import 那份 `writeFileAtomic`）—— 少了它，副本里的工具加载即失败，五格会红在与产品无关的事上。
 *      腿 `position-sidecar` / `position-tail`（`bug-20261110-16`）：名单做成**三条**、我们的 id 在**中间**
 *      ⇒ `--apply` 记原下标 1、`--restore` 按旁证插回 1（`restore_position.source: sidecar`），三份产品
 *      文件逐字节回到 `--apply` 之前；**没有旁证**那一支 ⇒ `source: "tail"`、名单顺序真的变了
 *      （`[a, b, id]`）**而且 stderr 说出来**（变了并说了，不是静默）。
 *      刀 K1 `printf-liar`（只说 `{0,2}`、一个字节不写）⇒ `UMH-LANDING-MISMATCH`；
 *      刀 K2 `forge-patch`（换掉补丁文件伪造派生物）⇒ `UMH-PATCH-NOT-DERIVED`；
 *      刀 K3 `silent-proceed`（未知 id 也 exit 0）⇒ `UMH-USAGE-SILENT-GREEN`；
 *      刀 K8 `trim-runnable-set`（把副本里那一份原子写剪掉）⇒ `UMH-FIXTURE-BROKEN`；
 *      刀 K16 `no-sidecar`（真工具不记旁证 = 改之前的形状）⇒ `position-sidecar` 腿翻
 *         `UMH-RESTORE-POSITION`（`source: "tail"`、名单顺序变了）+ 次生 `UMH-RESTORE-NOT-INVERSE`。
 *   `UMH-02` 负控①：B 态（只撤了标记）⇒ 拒绝、点名 `marker`、**生成器一次都没被调用**、字节不变。
 *      刀 K3 ⇒ `UMH-REFUSAL-EXIT`；刀 K4（报另一个载体的码/载体）⇒ `UMH-CARRIER-NAMED-WRONG`；
 *      刀 K4b（**码对、载体报成 `list`**）⇒ 只翻 `UMH-CARRIER-NAMED-WRONG`：`carrier` 不是 `code` 的复述。
 *   `UMH-03` 负控②：C 态（只撤了名单）⇒ 同样的形状，码是 `E_UNMOUNT_LIST_MISSING`。
 *      两格的码**逐字比**：工具把两个码写反 ⇒ 两格都红（各自钉死自己那一个）。
 *   `UMH-04` 幂等 + **no-op 的三道签字**：U 态 `--apply` ⇒ `UMH-NOOP` / `changed: 0` / 字节不动；
 *      `--apply` 两次、`--restore` 两次同形。no-op 那一支要盘上补丁签字，而签字有**三个出口**
 *      （`bug-20261111-02`；契约 §4.1-A）：读得出来+相同 ⇒ no-op / 读得出来+不同 ⇒ `NOT_DERIVED` /
 *      **读不出来 ⇒ `E_UNMOUNT_PATCH_UNREADABLE`**。每条腿各判一次：
 *      腿 `stale-patch` —— U 载体 + 故意过期的补丁（还是 `{1,0}`）⇒ 不许 exit 0 / `UMH-NOOP`，
 *         必须 `E_UNMOUNT_PATCH_STALE`（exit 1）· `changed: 0` · 字节与文件集合不动 · **不调写那一支的生成器**；
 *      腿 `restore-stale` —— `--restore` 的同一形状（M 载体 + 已翻成 `{0,2}` 的补丁）⇒ 同样的码；
 *      腿 `truncated-patch` —— 落点**读得对**、但补丁是半截（尾巴没了、两行 `- id` 都在）⇒ 不许 no-op，
 *         必须 `E_UNMOUNT_PATCH_NOT_DERIVED`；同一棵树上**未截断**的那份 ⇒ 仍 `UMH-NOOP`（阳性那一半）；
 *      腿 `unreadable-patch` —— 补丁那一条路径被换成**同名目录**（读不出来）⇒ 必须
 *         `E_UNMOUNT_PATCH_UNREADABLE`（**不许**折进 `NOT_DERIVED`）· `row_landing: null` ·
 *         stderr **点名机制**；这一格判的是"失败归到了对的机制上"；
 *      腿 `state-step` —— 副本里 `.team/state` 做成一个**文件** ⇒ 旁证的原子写 `ENOTDIR` ⇒
 *         `failed_step: "state"`（第四种失败步）· 一个产品字节都没写（旁证是"回原位"的前提）；
 *      腿 `residue-sweep` —— 工具自己上一次被杀留下的 `<补丁>.tmp-<死 pid>-<hex>` ⇒ 它收掉那份残渣、
 *         产品字节不动、仍是 `UMH-NOOP`（契约 §4.4 的例外）。
 *      🔴 失败腿都断言**失败形状**（契约 §4.1）：`failed_step: "patch"` · `rolled_back: false` ·
 *         `row_landing` = 盘上那份补丁读出来的落点（读不出来那一支是 `null` —— 没有落点可报）。
 *      刀 K5（恒报 `changed: 1`）⇒ `UMH-CHANGED-NOT-ZERO`；刀 K6（报 no-op 却写了一个换行）⇒ `UMH-NOOP-TOUCHED-BYTES`；
 *      刀 K9（只摘**落点**闸）⇒ stale 腿翻 `UMH-STALE-PATCH-UNNAMED`，**而且必须落在"第二道闸拒"那一面**
 *         （换出来的码是 `NOT_DERIVED` · exit 1 · `--check` 真跑过 —— 只证明"别处也拒了"不算咬住）；
 *      刀 K9b（摘**两道**闸）⇒ stale 腿翻 `UMH-STALE-PATCH-NOOP`（只有这样才能回到 no-op）；
 *      刀 K10（只摘 `--check` 那一行）⇒ 半截补丁腿翻 `UMH-NOOP-UNDERIVED`；
 *      刀 K11（落点闸，`--restore` 方向）⇒ restore-stale 腿翻 `UMH-STALE-PATCH-UNNAMED`（落点同 K9）；
 *      刀 K12（只摘**扫残渣**那一行）⇒ residue-sweep 腿翻 `UMH-RESIDUE-NOT-SWEPT`；
 *      刀 K13（把失败形状改回旧的 `verify` / `true` / `null`）⇒ 翻 `UMH-PATCH-FAILURE-SHAPE`；
 *      刀 K15（**摘掉"读不出来"那道判**，读失败当读到空串）⇒ unreadable-patch 腿翻
 *         `UMH-UNREADABLE-UNNAMED`（刀跑出来的码是 `STALE`：空文本落点 `{0,0}`）；
 *      刀 K17（把"记不下旁证"报成 `patch`）⇒ state-step 腿翻 `UMH-STATE-STEP-UNNAMED`。
 *   `UMH-05` 回滚：生成器步注入"见证 + 抛"⇒ 三处**已经写过**（见证为证）、之后字节逐字节回到跑之前；
 *      自证步注入"成功但产物不翻面"⇒ `failed_step: verify` 也要回滚。
 *      腿 `rollback-broken`（回滚**没做到**那一支）：见证 + 抛 **并且**把组合改成只读 ⇒ 回滚的原子换写不动它
 *      ⇒ `rolled_back: false` · `changed` = **夹具前后快照量到的份数** · `rollback: {ok:false, drifted:[…那几份]}`。
 *      刀 K7（跳到"三处都写好了"再跑生成器、**不回滚**）⇒ `UMH-ROLLBACK-NOT-BYTE-IDENTICAL`；
 *      刀 K14（把回滚账里的 drift 量成空 = 旧行为）⇒ `UMH-ROLLBACK-DRIFT`。
 *
 * ── 不判（写给下一个读的人，别把这份绿读大）──────────────────────────────────────
 *   🔴 **GUI 不在这里判。** 撤 / 恢复之后面板在不在，属于 R5 那一次实机验证，只能由人在界面上点一次；
 *      本文件不读 GUI、不重启宿主、不读会话流。
 *   · 不判宿主级那套设计（两份真相不合并）；不判"哪几行该是宿主级"；不判 profile 层退役路线。
 *   · 不判 `--id` 指向**非宿主级行**的行为；不判 D / E 两态（契约 §八.4 登记为漏）。
 *   · 不判工具内部结构（函数名 / 常量名 / 是否用账本）；不判 `HOST_LEVEL_IDS` 的形状（数组 / Set / 排法）。
 *   · 不判**活 pid** 的 `.tmp-*`（工具必须留着它 —— 那是别人正在写）。判的只有"死 pid 那份被扫掉"
 *     （`residue-sweep` 腿）；活 pid 那一支登记在契约 §八.7，别把这一格的绿读成"扫残渣全判了"。
 *
 * ── 今天为什么是绿的（说清这一跑覆盖了哪一层）──────────────────────────────────────
 *   `.tools/unmount-host-row.mjs` 在盘上（`20b6cfb`）：五格全绿。
 *   🔴 绿的这一层是**判据**：副本上跑那条命令、读它留下的字节与补丁文本 —— **不是** "GUI 好了"、不是 R5。
 *   · 副本的运行集含 `presets/agenia/lib/atomic.mjs`（工具 import 那份 `writeFileAtomic`：返回 `{ok, code}`、
 *     **不抛**）：`copy-runnable-set` 腿 + 刀 K8 守着它 —— 谁把这一份从夹具里剪掉，那一格红。
 *   · 本文件不判工具**内部结构**（契约 §六.4）：它怎么落那三处载体、走哪一份原子写，换了都不该有一条断言翻面
 *     —— 会翻面的只有"它留下的字节"与"补丁文本"。
 *
 * 证据：`<_evidence>/<RUN_ID>/UMH-0x/result.json`（`readings.legs` / `readings.scenarios` 逐格带读数）。
 */
import { before, test } from 'node:test'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { caseFail, preflight, problem, runCase } from '../support/evidence.mjs'
import { withHostRowInPresetBodies } from '../support/client-ui-placement.mjs'
import {
  CODE,
  NOT_DERIVED_CODE,
  STALE_CODE,
  UNREADABLE_CODE,
  carrierFacts,
  carrierProblems,
  copyFixture,
  deadResidueName,
  derivedProblems,
  forgedPatchOf,
  gateBlindTool,
  knife,
  landingProblems,
  legBook,
  liveEntryState,
  liveSentinel,
  noopProblems,
  pushToolAbsent,
  refusalProblems,
  residueSweepProblems,
  rollbackProblems,
  rollbackDriftProblems,
  rollbackLiarTool,
  rowLanding,
  runAgain,
  runScenario,
  runnableSetProblems,
  scratchDir,
  shapeLiarTool,
  shapeProblems,
  slim,
  snapshotTree,
  truncatePatch,
  stalePatchProblems,
  underivedPatchProblems,
  unmountedTexts,
  usageProblems,
  unreadableBlindTool,
  unreadablePatchProblems,
  sidecarBlindTool,
  stateStepProblems,
  stateStepLiarTool,
  restorePositionProblems,
  tailFallbackProblems,
  threeItemListTexts,
  listOrderInCopy,
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
 * 为什么要有它：判读函数一旦写坏，**红的那一格与"工具没做对"长得一模一样**。一份合规读数必须判成 0 条，
 * 否则这一格的红不能算在工具头上（先修判据）—— 这也是"判据可满足"的唯一证据。
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
test('UMH-01 撤挂载/恢复两条腿：--apply ⇒ 补丁里 {insert:0,preset_bodies:2} · --restore ⇒ {1,0} · 来回一圈回原字节（名单三条时也回原位）', async () => {
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

    // ── ①′ 夹具腿：副本必须带着工具的**运行集**（少一份 ⇒ 副本里工具加载即失败，红因会指错）──
    book.run('copy-runnable-set', () => {
      const got = runnableSetProblems(apply.before, { label: '--apply 副本' })
      rec.readings.runnable_set = {
        copied: Object.keys(apply.before.files_map).filter((rel) => [REL.atomic, REL.generator, REL.composition, REL.patch, REL.tool].includes(rel)),
        problems: got.map((p) => p.code),
      }
      for (const p of got) problems.push(p)
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

    // ── ②′ 腿 position-sidecar：名单里**三条**、我们的 id 在中间 ⇒ `--restore` 必须按旁证插回原位
    //    （`bug-20261110-16`）。名单只有一条时"插回原位"与"追加在表尾"是同一个结果 —— 那一格无论
    //    实现怎么写都绿，所以这一腿把名单做成三条：原下标 = 1，尾插 = 2，两个数分得开。
    const three = threeItemListTexts({ compositionText: readFileSync(SOURCE.composition, 'utf8'), generatorText: readFileSync(SOURCE.generator, 'utf8') }, ROW_ID)
    rec.readings.three_item_fixture = { order: three.order, id_index: three.order.indexOf(ROW_ID), u_order: three.U.want_carriers }
    const positioned = runScenario({
      name: 'umh-01-position-sidecar', pre: 'M', generator: 'real', tool: 'real', action: 'apply', rederivePatch: true,
      extraCopyFiles: { [REL.composition]: three.M.compositionText, [REL.generator]: three.M.generatorText },
    })
    const repositioned = positioned.tool_present ? runAgain(positioned, { action: 'restore' }) : null
    scenarios.position_sidecar = { apply: slim(positioned), restore: repositioned === null ? null : slim(repositioned) }
    book.run('position-sidecar', () => {
      if (!positioned.tool_present) {
        pushToolAbsent(problems, positioned, '三条名单 · --apply + --restore')
        return CODE.toolAbsent
      }
      if (positioned.exit !== 0 || repositioned === null || repositioned.exit !== 0) {
        push(CODE.exit, `三条名单那一圈没跑成（apply exit ${positioned.exit} / restore exit ${repositioned?.exit ?? '(没跑)'}）：`
          + `apply stderr ${JSON.stringify(String(positioned.stderr ?? '').slice(0, 300))}`
          + ` · restore stderr ${JSON.stringify(String(repositioned?.stderr ?? '').slice(0, 300))} —— 这一格判不了`)
        return undefined
      }
      // apply 记的是**原下标**（1），restore 按旁证插回（sidecar），两个方向各判一次。
      for (const p of restorePositionProblems(positioned, {
        label: '三条名单 · --apply',
        want: { source: 'recorded', index: three.order.indexOf(ROW_ID) },
        orderAfter: [three.order[0], three.order[2]],
      })) problems.push(p)
      for (const p of restorePositionProblems(repositioned, {
        label: '三条名单 · --restore',
        want: { source: 'sidecar', index: three.order.indexOf(ROW_ID) },
        orderAfter: three.order,
        filesBefore: positioned.before.files_map,
      })) problems.push(p)
      // "精确的逆"在这一腿才第一次真的成立：三份产品文件逐字节回到 apply 之前（`restorePositionProblems` 判了），
      // 再单独判一次**旁证自己消失**（工具自己的账本必须自己删掉）。
      const sidecarFile = path.join(positioned.copy, '.team', 'state', 'unmount', `${encodeURIComponent(ROW_ID)}.json`)
      rec.readings.position_sidecar = {
        sidecar_file: sidecarFile,
        sidecar_after_restore: existsSync(sidecarFile),
        order_after_restore: repositioned === null ? null : listOrderInCopy(repositioned.copy),
        files_before_apply: positioned.before.files,
        files_after_restore: repositioned?.after.files ?? null,
      }
      if (existsSync(sidecarFile)) {
        push(CODE.position, `三条名单 · --restore：位置旁证没被删掉（${sidecarFile} 还在）—— `
          + '契约 §4.4：工具自己的账本必须自己删掉（下次 apply 读到别人的位置 = 插错地方）')
      }
      return undefined
    })

    // ── ②″ 腿 position-tail：**没有旁证** ⇒ 退回表尾，而且**说出来**（顺序变了要说，不许静默）──
    //   入口 = 三条名单的 U 态（名单里本来就没有我们的 id、没有旁证）⇒ `--restore` 只能尾插。
    const tailRestore = runScenario({
      name: 'umh-01-position-tail', pre: 'U', generator: 'real', tool: 'real', action: 'restore', rederivePatch: true,
      extraCopyFiles: { [REL.composition]: three.U.compositionText, [REL.generator]: three.U.generatorText },
    })
    scenarios.position_tail = slim(tailRestore)
    book.run('position-tail', () => {
      if (!tailRestore.tool_present) {
        pushToolAbsent(problems, tailRestore, '三条名单 · 无旁证 --restore')
        return CODE.toolAbsent
      }
      // 夹具自检：入口必须是"名单里没有它"（否则这一腿测的是别的东西）。
      if (tailRestore.before.carriers.listed !== false) {
        push(CODE.fixture, `退回表尾夹具坏了：U 态入口里名单仍含 ${ROW_ID}（listed=${JSON.stringify(tailRestore.before.carriers.listed)}）—— 这一格判不了`)
        return undefined
      }
      for (const p of tailFallbackProblems(tailRestore, {
        label: '三条名单 · 无旁证 --restore',
        orderAfter: [three.order[0], three.order[2], ROW_ID],
      })) problems.push(p)
      rec.readings.position_tail = {
        exit: tailRestore.exit,
        code: tailRestore.json?.code ?? null,
        restore_position: tailRestore.json?.restore_position ?? null,
        order_after: listOrderInCopy(tailRestore.copy),
        stderr_head: String(tailRestore.stderr ?? '').split(/\r?\n/).slice(0, 4).join('\n').slice(0, 600),
      }
      return undefined
    })

    // ── ②‴ 刀 K16：`--apply` **不记旁证**（= `bug-20261110-16` 的病）⇒ position-sidecar 腿必须红 ──
    const k16Tool = sidecarBlindTool(readFileSync(SOURCE.tool, 'utf8'))
    scenarios.knife_sidecar_blind = { ok: k16Tool.ok, applied: k16Tool.applied, why: k16Tool.why }
    const k16Apply = k16Tool.ok
      ? runScenario({
        name: 'umh-01-k16-no-sidecar', pre: 'M', generator: 'real', tool: 'real', action: 'apply', toolText: k16Tool.text, rederivePatch: true,
        extraCopyFiles: { [REL.composition]: three.M.compositionText, [REL.generator]: three.M.generatorText },
      })
      : null
    const k16Restore = k16Apply !== null && k16Apply.exit === 0 ? runAgain(k16Apply, { action: 'restore' }) : null
    scenarios.knife_k16_restore = k16Restore === null ? null : slim(k16Restore)
    book.run('knife-K16', () => {
      if (!k16Tool.ok) {
        push(CODE.knifeNotBiting, `K16 的锚点不见了（${k16Tool.why}）—— 刀不咬，这一格的红不是判据给的`)
        return undefined
      }
      if (k16Restore === null) {
        push(CODE.fixture, `K16 那一圈没跑成（apply exit ${k16Apply?.exit ?? '(没跑)'}）—— 刀不咬`)
        return undefined
      }
      knife(problems, {
        label: 'K16·no-sidecar',
        got: restorePositionProblems(k16Restore, {
          label: 'K16·no-sidecar',
          want: { source: 'sidecar', index: three.order.indexOf(ROW_ID) },
          orderAfter: three.order,
          filesBefore: k16Apply.before.files_map,
        }),
        want: CODE.position,
        allow: [CODE.notInverse],
      })
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

    // ── ⑦′ 刀 K8：把副本里那份原子写剪掉（"谁把运行集剪了一角"的形状）⇒ 夹具腿必须红 ─────
    //   这一刀**不依赖真工具**（它量的是夹具），所以工具缺位的那些日子它也照跑。
    const trimCopy = path.join(scratchDir('umh-01-k8-trim'), 'copy')
    copyFixture(trimCopy)
    unlinkSync(path.join(trimCopy, REL.atomic))
    const trimmedCopy = { files_map: Object.fromEntries(snapshotTree(trimCopy).map((x) => [x.rel, x.sha256])) }
    scenarios.knife_trim_runnable_set = { files: Object.keys(trimmedCopy.files_map) }
    book.run('knife-K8', () => {
      knife(problems, {
        label: 'K8·trim-runnable-set',
        got: runnableSetProblems(trimmedCopy, { label: 'K8·trim-runnable-set' }),
        want: CODE.fixture,
      })
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

    book.require(['ruler-control', 'copy-runnable-set', 'apply', 'restore', 'position-sidecar', 'position-tail', 'unknown-id', 'knife-K1', 'knife-K2', 'knife-K3', 'knife-K8', 'knife-K16', 'control'])
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

    // ── ③′ 刀 K4b：**码对、载体报成 `list`** ⇒ 只翻 `UMH-CARRIER-NAMED-WRONG` ─────────────
    //   为什么还要这一把：K4 把码与载体**一起**换掉 ⇒ 它翻的两面分不开；四码对三载体，
    //   `carrier` 是 `code` 的复述这件事就没人判。这一刀只动载体一个维度。
    const k4b = runScenario({
      name: 'umh-02-k4b-carrier-only', pre: 'B', generator: 'witness', tool: 'wrongCarrier',
      fakeArgs: ['E_UNMOUNT_MARKER_MISSING', 'list'], action: 'apply',
    })
    scenarios.knife_carrier_only = slim(k4b)
    book.run('knife-K4b', () => {
      knife(problems, {
        label: 'K4b·carrier-only',
        got: refusalProblems(k4b, { code: 'E_UNMOUNT_MARKER_MISSING', carrier: 'marker', label: 'K4b·carrier-only' }),
        want: CODE.carrierNamedWrong,
      })
      // 刀的入口：码必须是**对的**（否则它又与 K4 同形，切不开一个维度）。
      if (k4b.json?.code !== 'E_UNMOUNT_MARKER_MISSING' || k4b.json?.carrier !== 'list') {
        push(CODE.fixture, `K4b 的夹具坏了：它应当报「对的码 + 错的载体」，实得 `
          + `code=${JSON.stringify(k4b.json?.code)} / carrier=${JSON.stringify(k4b.json?.carrier)}`)
      }
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

    book.require(['fixture-B', 'refusal', 'knife-K3', 'knife-K4', 'knife-K4b', 'control'])
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
test('UMH-04 幂等：目标态再跑 ⇒ UMH-NOOP / changed:0 / 字节不动（两个方向）· 补丁没签字（落点过期 / 不是派生物 / 读不出来）⇒ 三个码各自具名', async () => {
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

    // ── ①′ 腿 stale-patch：U 载体 + **故意过期**的补丁（还是 `{1,0}`）⇒ 不许 no-op ─────────
    //   造法：入口态摆成 U，但**不**重派生补丁（`generator: 'spy'` ⇒ `runScenario` 跳过重派生），
    //   盘上那份补丁就还是 M 态的 `{1,0}` = "载体翻过了、生成器没翻过补丁、上一次被打断"的形状。
    //   与①成对：①证明"落点对 ⇒ 还是 no-op"，这一条证明"落点不对 ⇒ 不许记成 no-op"。
    const stale = runScenario({ name: 'umh-04-stale-patch', pre: 'U', generator: 'spy', tool: 'real', action: 'apply' })
    scenarios.stale_patch = slim(stale)
    book.run('stale-patch', () => {
      if (!stale.tool_present) {
        pushToolAbsent(problems, stale, 'U 态 + 过期补丁 --apply')
        return CODE.toolAbsent
      }
      // 夹具自检：入口必须是"载体已翻、补丁没翻"，否则这一格测的是别的形状。
      const c = stale.before.carriers
      const l = stale.before.landing
      if (!(c.marker === false && c.disabled === true && l !== null && l.insert === 1 && l.preset_bodies === 0)) {
        push(CODE.fixture, `过期补丁夹具坏了：入口应是 U 载体（marker:false / disabled:true）+ 旧补丁 {1,0}，实得 `
          + `${JSON.stringify({ carriers: c, landing: l })}`)
        return undefined
      }
      rec.readings.stale_patch = {
        exit: stale.exit, code: stale.json?.code ?? null, changed: stale.json?.changed ?? null,
        row_landing_printed: stale.json?.row_landing ?? null,
        generator_calls: stale.generator_calls, generator_writes: stale.generator_writes, generator_checks: stale.generator_checks,
      }
      for (const p of stalePatchProblems(stale, { label: 'U 态 + 过期补丁 --apply' })) problems.push(p)
      return undefined
    })

    // ── ①″ 腿 restore-stale：`--restore` 那一侧的同一个半截形状（契约 §八.6 的漏，现在判了）──
    //   入口 = M 载体 + **已经翻成 U 落点**的补丁（`{0,2}`）—— "restore 写完载体、还没跑生成器就被杀掉" 的形状。
    //   `--restore` 的目标落点是 `{1,0}` ⇒ 盘上那份没签字 ⇒ 必须 `E_UNMOUNT_PATCH_STALE`。
    //   🔴 补丁用**同一棵树里派生出来的那份字节**：生成器写出来的补丁与副本路径无关（实测
    //   `_probe-umh-trim/reading-path-dependence.json`：两棵不同路径的副本 ⇒ 同一份 sha256）⇒ 未截断时它
    //   在目标副本里**是**派生物，所以"这一格红"只可能是落点那件事。
    const uPatch = forgedPatchOf('umh-04-u-derived')
    const uPatchText = uPatch.ok ? readFileSync(uPatch.file, 'utf8') : null
    scenarios.u_derived_patch = { ok: uPatch.ok, status: uPatch.status, chars: uPatchText === null ? null : uPatchText.length, stderr_head: uPatch.stderr.slice(0, 600) }
    const restoreStale = uPatchText === null
      ? null
      : runScenario({
        name: 'umh-04-restore-stale', pre: 'M', generator: 'spy', tool: 'real', action: 'restore',
        extraCopyFiles: { [REL.patch]: uPatchText },
      })
    scenarios.restore_stale = restoreStale === null ? null : slim(restoreStale)
    book.run('restore-stale', () => {
      if (uPatchText === null) {
        push(CODE.fixture, `U 态补丁派生不出来（真生成器 exit ${uPatch.status}）：${uPatch.stderr.slice(0, 600)} —— 这一格判不了`)
        return undefined
      }
      if (!restoreStale.tool_present) {
        pushToolAbsent(problems, restoreStale, 'M 载体 + 已翻面的补丁 --restore')
        return CODE.toolAbsent
      }
      const c = restoreStale.before.carriers
      const l = restoreStale.before.landing
      if (!(c.marker === true && c.disabled === false && l !== null && l.insert === 0 && l.preset_bodies === 2)) {
        push(CODE.fixture, `--restore 半截夹具坏了：入口应是 M 载体（marker:true / disabled:false）+ 已翻面的补丁 {0,2}，实得 `
          + `${JSON.stringify({ carriers: c, landing: l })}`)
        return undefined
      }
      rec.readings.restore_stale = {
        exit: restoreStale.exit, code: restoreStale.json?.code ?? null, changed: restoreStale.json?.changed ?? null,
        generator_writes: restoreStale.generator_writes, generator_checks: restoreStale.generator_checks,
      }
      for (const p of stalePatchProblems(restoreStale, { label: 'M 载体 + 已翻面的补丁 --restore' })) problems.push(p)
      return undefined
    })

    // ── ①‴ 腿 truncated-patch：**第二道签字** —— 落点读得对、但补丁不是派生物 ⇒ 也不许 no-op ─────
    //   形状（用户报的那一个）：杀在生成器自己那次 `writeFileSync` 里 ⇒ 补丁尾巴没了，两行 `- id` 都还在，
    //   落点**照样**读作 `{0,2}`。只核落点的实现会把它放行。
    //   两半：截断的那份 ⇒ `E_UNMOUNT_PATCH_NOT_DERIVED`；**同一棵树上未截断的那份 ⇒ `UMH-NOOP`**
    //   （阴性 + 阳性成对：证明红只来自"不是派生物"，不是这一格见谁都拒）。
    const truncated = uPatchText === null ? null : truncatePatch(uPatchText)
    scenarios.truncated_patch_fixture = truncated === null ? null : {
      dropped_lines: truncated.dropped, chars: truncated.text.length, from_chars: uPatchText.length,
      pct: Number(((100 * truncated.text.length) / uPatchText.length).toFixed(2)),
      landing: { insert: truncated.landing.insert, preset_bodies: truncated.landing.preset_bodies },
    }
    const underived = truncated === null
      ? null
      : runScenario({
        name: 'umh-04-truncated-patch', pre: 'U', generator: 'spy', tool: 'real', action: 'apply',
        extraCopyFiles: { [REL.patch]: truncated.text },
      })
    scenarios.truncated_patch = underived === null ? null : slim(underived)
    const underivedOk = uPatchText === null
      ? null
      : runScenario({
        name: 'umh-04-truncated-control', pre: 'U', generator: 'spy', tool: 'real', action: 'apply',
        extraCopyFiles: { [REL.patch]: uPatchText },
      })
    scenarios.truncated_control = underivedOk === null ? null : slim(underivedOk)
    book.run('truncated-patch', () => {
      if (truncated === null || underived === null || underivedOk === null) {
        push(CODE.fixture, '半截补丁的夹具造不出来（U 态派生 / 截断都失败）—— 这一格判不了')
        return undefined
      }
      if (!underived.tool_present) {
        pushToolAbsent(problems, underived, 'U 态 + 半截补丁 --apply')
        return CODE.toolAbsent
      }
      // 夹具自检：截断之后落点必须**仍然**读作 {0,2}（否则这一格退化成 stale-patch，测不到第二道签字）。
      const l = underived.before.landing
      if (!(l !== null && l.insert === 0 && l.preset_bodies === 2) || truncated.dropped < 1) {
        push(CODE.fixture, `半截补丁夹具坏了：截断 ${truncated.dropped} 行之后落点应仍是 {0,2}，实得 ${JSON.stringify(l)}`)
        return undefined
      }
      rec.readings.truncated_patch = {
        exit: underived.exit, code: underived.json?.code ?? null, changed: underived.json?.changed ?? null,
        generator_calls: underived.generator_calls, generator_writes: underived.generator_writes, generator_checks: underived.generator_checks,
        control: { exit: underivedOk.exit, code: underivedOk.json?.code ?? null, generator_checks: underivedOk.generator_checks },
      }
      for (const p of underivedPatchProblems(underived, { label: 'U 态 + 半截补丁 --apply' })) problems.push(p)
      // 阳性那一半：同一棵树上**未截断**的那份 ⇒ 仍是 no-op（判据不是"见谁都拒"）。
      for (const p of noopProblems(underivedOk, { insert: 0, presetBodies: 2, label: 'U 态 + 完整派生物 --apply（阳性对照）' })) problems.push(p)
      return undefined
    })

    // ── ①⁗ 腿 unreadable-patch：**第二道签字的第三个出口**（`bug-20261111-02`）─────────────
    //   形状：入口是 U 态（目标态）、补丁那一条路径被换成**同名目录** —— 读不出来，也就判不了
    //   "它是不是派生物"。三个出口必须各自有名字：读得出来+相同 ⇒ no-op（①），读得出来+不同 ⇒
    //   `NOT_DERIVED`（①‴），**读不出来 ⇒ `E_UNMOUNT_PATCH_UNREADABLE`**。
    //   🔴 这一格判的是"失败归到了对的机制上"：折进 `NOT_DERIVED` 会让值班的人去重跑生成器，
    //      而该做的是看权限 / 占用 / 那条路径还是不是文件。
    const unreadable = runScenario({
      name: 'umh-04-unreadable-patch', pre: 'U', generator: 'spy', tool: 'real', action: 'apply',
      extraCopyDirs: [REL.patch],
    })
    scenarios.unreadable_patch = slim(unreadable)
    book.run('unreadable-patch', () => {
      if (!unreadable.tool_present) {
        pushToolAbsent(problems, unreadable, 'U 态 + 补丁被换成目录 --apply')
        return CODE.toolAbsent
      }
      // 夹具自检：补丁那一条路径跑之前必须是**目录**（否则这一腿测的是别的形状）。
      if (unreadable.before.landing !== null) {
        push(CODE.fixture, `读不出来夹具坏了：补丁路径应当读不出落点，实得 ${JSON.stringify(unreadable.before.landing)}`)
        return undefined
      }
      rec.readings.unreadable_patch = {
        exit: unreadable.exit, code: unreadable.json?.code ?? null, changed: unreadable.json?.changed ?? null,
        failed_step: unreadable.json?.failed_step ?? null, rolled_back: unreadable.json?.rolled_back ?? null,
        row_landing: unreadable.json?.row_landing ?? null,
        generator_writes: unreadable.generator_writes, generator_checks: unreadable.generator_checks,
        stderr_head: String(unreadable.stderr ?? '').slice(0, 600),
      }
      for (const p of unreadablePatchProblems(unreadable, { label: 'U 态 + 补丁被换成目录 --apply' })) problems.push(p)
      return undefined
    })

    // ── ①⁘ 刀 K15：摘掉「读不出来」那道判（读失败当读到空串 = 生成器 `--check` 的那一手）⇒ 上面那条腿必须红 ──
    const k15Tool = unreadableBlindTool(readFileSync(SOURCE.tool, 'utf8'))
    scenarios.knife_unreadable_blind = { ok: k15Tool.ok, applied: k15Tool.applied, why: k15Tool.why }
    const k15 = k15Tool.ok
      ? runScenario({
        name: 'umh-04-k15-unreadable-blind', pre: 'U', generator: 'spy', tool: 'real', action: 'apply', toolText: k15Tool.text,
        extraCopyDirs: [REL.patch],
      })
      : null
    scenarios.knife_k15 = k15 === null ? null : slim(k15)
    book.run('knife-K15', () => {
      if (!k15Tool.ok) {
        push(CODE.knifeNotBiting, `K15 的锚点不见了（${k15Tool.why}）—— 刀不咬，这一格的红不是判据给的`)
        return undefined
      }
      knife(problems, {
        label: 'K15·unreadable-blind',
        got: unreadablePatchProblems(k15, { label: 'K15·unreadable-blind' }),
        want: CODE.unreadableUnnamed,
      })
      // 刀的效果要说清：它把"读不出来"折成了 `E_UNMOUNT_PATCH_STALE`（读空文本 ⇒ 落点 {0,0}）。
      if (!k15Tool.ok) return undefined
      if (k15.json?.code === 'E_UNMOUNT_PATCH_UNREADABLE') {
        push(CODE.knifeNotBiting, 'K15：摘掉那道判之后工具仍然报 `E_UNMOUNT_PATCH_UNREADABLE` —— 刀没切到东西')
      }
      return undefined
    })

    // ── ①⁙ 腿 state-step：**记不下位置旁证 ⇒ 一个产品字节都不写**（契约 §4.2 ①‴ 的第四种失败步）──
    //   造法：把副本里的 `.team/state` 做成**一个文件**（不是目录）⇒ 旁证的原子写建父目录时
    //   `ENOTDIR` ⇒ 工具必须在写任何产品字节**之前**停下。这一格钉的是"失败的归因"：
    //   `failed_step: "state"`（不是 patch / generator / verify）+ 一个字节都没写。
    const stateStep = runScenario({
      name: 'umh-04-state-step', pre: 'M', generator: 'real', tool: 'real', action: 'apply',
      extraCopyFiles: { '.team/state': 'not a directory\n' },
    })
    scenarios.state_step = slim(stateStep)
    book.run('state-step', () => {
      if (!stateStep.tool_present) {
        pushToolAbsent(problems, stateStep, 'M 态 --apply（旁证写不下来）')
        return CODE.toolAbsent
      }
      rec.readings.state_step = {
        exit: stateStep.exit, code: stateStep.json?.code ?? null, failed_step: stateStep.json?.failed_step ?? null,
        changed: stateStep.json?.changed ?? null, rollback: stateStep.json?.rollback ?? null,
        rolled_back: stateStep.json?.rolled_back ?? null, changed_files: stateStep.changed_files,
        stderr_head: String(stateStep.stderr ?? '').slice(0, 600),
      }
      for (const p of stateStepProblems(stateStep, { label: 'M 态 --apply（旁证写不下来）' })) problems.push(p)
      if (!stateStep.files_equal) {
        push(CODE.refusalWrote, `旁证写不下来的那一跑写了产品字节（${JSON.stringify(stateStep.changed_files)}）—— `
          + '契约 §4.2 ①‴：这一步在**任何产品字节之前**，写不下去就不做（否则 `--restore` 没有原位可回）')
      }
      return undefined
    })

    // ── ①⁚ 刀 K17：把"记不下旁证"报成补丁那一步 ⇒ state-step 腿必须红 ───────────────────
    const k17Tool = stateStepLiarTool(readFileSync(SOURCE.tool, 'utf8'))
    scenarios.knife_state_step_liar = { ok: k17Tool.ok, applied: k17Tool.applied, why: k17Tool.why }
    const k17 = k17Tool.ok
      ? runScenario({
        name: 'umh-04-k17-state-step-liar', pre: 'M', generator: 'real', tool: 'real', action: 'apply', toolText: k17Tool.text,
        extraCopyFiles: { '.team/state': 'not a directory\n' },
      })
      : null
    scenarios.knife_k17 = k17 === null ? null : slim(k17)
    book.run('knife-K17', () => {
      if (!k17Tool.ok) {
        push(CODE.knifeNotBiting, `K17 的锚点不见了（${k17Tool.why}）—— 刀不咬`)
        return undefined
      }
      knife(problems, {
        label: 'K17·state-step-liar',
        got: stateStepProblems(k17, { label: 'K17·state-step-liar' }),
        want: CODE.stateStep,
      })
      return undefined
    })

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

    // ── ⑤′ 刀 K9（`landing` 闸）：只摘落点那一道 ⇒ stale 腿必须红 ────────────────────────
    //   🔴 这一刀**不会再掉回 `UMH-NOOP`**：no-op 现在有两道签字，"落点"那一道摘掉之后，第二道
    //   （只读 `--check`）还在，所以它换**另一个码**拒（`E_UNMOUNT_PATCH_NOT_DERIVED`）。
    //   那正是这一刀要证明的事，而且它落在判据的**码**那一面：stale 腿要求码是 `E_UNMOUNT_PATCH_STALE`。
    //   `generator_checks` 记着第二道闸确实被走到（`--check` 那一次只读调用），所以"红因"指得准。
    const blindLanding = gateBlindTool(readFileSync(SOURCE.tool, 'utf8'), { landing: true })
    scenarios.knife_stale_blind = { applied: blindLanding.applied, missing: blindLanding.missing, why: blindLanding.why }
    const k9 = blindLanding.ok
      ? runScenario({
        name: 'umh-04-k9-landing-blind', pre: 'U', generator: 'spy', tool: 'real',
        toolText: blindLanding.text, action: 'apply',
      })
      : null
    scenarios.knife_landing_blind_reading = k9 === null ? null : slim(k9)
    book.run('knife-K9', () => {
      if (k9 === null) {
        push(CODE.fixture, `K9 的刀没装上：${blindLanding.why} —— 工具改过？这一格的红不能算在工具头上`)
        return undefined
      }
      knife(problems, { label: 'K9·landing-blind', got: stalePatchProblems(k9, { label: 'K9·landing-blind' }), want: CODE.staleUnnamed })
      // 🔴 这一刀必须**落在第二道闸拒**那一面，而不是"反正有别的地方拒了"：
      //   换出来的码是 `E_UNMOUNT_PATCH_NOT_DERIVED`、exit 1、而且那一次只读 `--check` 真的跑过。
      //   只判"某个别的码"分不出"修对了"与"换了个地方拒"（评审 §4 的原话）。
      const drifted = []
      if (k9.json?.code !== NOT_DERIVED_CODE) drifted.push(`code=${JSON.stringify(k9.json?.code)}（期望 ${NOT_DERIVED_CODE}）`)
      if (k9.exit !== 1) drifted.push(`exit=${k9.exit}（期望 1）`)
      if (!(Number(k9.generator_checks) >= 1)) drifted.push(`generator_checks=${JSON.stringify(k9.generator_checks)}（期望 ≥1 —— 第二道闸没被走到）`)
      if (Number(k9.generator_writes) !== 0) drifted.push(`generator_writes=${JSON.stringify(k9.generator_writes)}（期望 0）`)
      if (drifted.length > 0) {
        push(CODE.knifeVector, `K9 摘了落点闸，但没有落在"第二道闸拒"那一面：${drifted.join(' · ')} —— `
          + '这一刀只证明"别的地方也拒了"，分不出对的修法与错的修法')
      }
      // 刀的入口：它必须真的走到"载体已翻、补丁没翻"那一刻，且跑的确实是那份被改过的工具。
      const c = k9.before.carriers
      if (k9.tool !== 'mutated' || !(c.marker === false && c.disabled === true) || k9.before.landing?.insert !== 1) {
        push(CODE.fixture, `K9 的夹具坏了：tool=${k9.tool} / carriers=${JSON.stringify(c)} / landing=${JSON.stringify(k9.before.landing)}`
          + ' —— 这一刀没走到半截树那一刻')
      }
      rec.readings.knife_k9 = { exit: k9.exit, code: k9.json?.code ?? null, checks: k9.generator_checks, writes: k9.generator_writes }
      return undefined
    })

    // ── ⑤″ 刀 K9b（**两道闸都摘**）：只有这样才能回到 `UMH-NOOP` ⇒ 腿翻 `UMH-STALE-PATCH-NOOP` ──
    //   它证明的是"no-op 那一面也会咬"（否则 `UMH-STALE-PATCH-NOOP` 成了一条没人翻得动的码）；
    //   K9 证明"落点那一面单独也能翻"。两把刀各切一个维度，谁也没替谁。
    const blindBoth = gateBlindTool(readFileSync(SOURCE.tool, 'utf8'), { landing: true, check: true })
    scenarios.knife_stale_both = { applied: blindBoth.applied, missing: blindBoth.missing, why: blindBoth.why }
    const k9b = blindBoth.ok
      ? runScenario({
        name: 'umh-04-k9b-both-gates-blind', pre: 'U', generator: 'spy', tool: 'real',
        toolText: blindBoth.text, action: 'apply',
      })
      : null
    scenarios.knife_both_blind_reading = k9b === null ? null : slim(k9b)
    book.run('knife-K9b', () => {
      if (k9b === null) {
        push(CODE.fixture, `K9b 的刀没装上：${blindBoth.why} —— 工具改过？这一格的红不能算在工具头上`)
        return undefined
      }
      knife(problems, { label: 'K9b·both-gates-blind', got: stalePatchProblems(k9b, { label: 'K9b·both-gates-blind' }), want: CODE.staleNoop })
      rec.readings.knife_k9b = { exit: k9b.exit, code: k9b.json?.code ?? null, calls: k9b.generator_calls }
      return undefined
    })

    // ── ⑤‴ 刀 K10（只摘 `--check` 那一行）⇒ 半截补丁那一格必须掉回 `UMH-NOOP` ─────────────
    //   为什么这一刀是"第二道签字"的**唯一**证据：截断的补丁落点读得对，第一道闸放它过去；
    //   摘掉 `--check` 之后没有别的东西会拒它 ⇒ 只剩"把半截补丁记成 no-op"这一种结果。
    const blindCheck = gateBlindTool(readFileSync(SOURCE.tool, 'utf8'), { check: true })
    scenarios.knife_underived_blind = { applied: blindCheck.applied, missing: blindCheck.missing, why: blindCheck.why }
    const k10 = blindCheck.ok && truncated !== null
      ? runScenario({
        name: 'umh-04-k10-check-blind', pre: 'U', generator: 'spy', tool: 'real',
        toolText: blindCheck.text, action: 'apply', extraCopyFiles: { [REL.patch]: truncated.text },
      })
      : null
    scenarios.knife_check_blind_reading = k10 === null ? null : slim(k10)
    book.run('knife-K10', () => {
      if (k10 === null) {
        push(CODE.fixture, `K10 的刀没装上：${blindCheck.why ?? '半截补丁造不出来'} —— 这一格的红不能算在工具头上`)
        return undefined
      }
      knife(problems, { label: 'K10·check-blind', got: underivedPatchProblems(k10, { label: 'K10·check-blind' }), want: CODE.noopUnderived })
      const l = k10.before.landing
      if (k10.tool !== 'mutated' || !(l !== null && l.insert === 0 && l.preset_bodies === 2)) {
        push(CODE.fixture, `K10 的夹具坏了：tool=${k10.tool} / landing=${JSON.stringify(l)} —— 落点不是 {0,2} 就不是第二道闸的题`)
      }
      return undefined
    })

    // ── ⑤⁗ 刀 K11（`landing` 闸，**`--restore` 方向**）⇒ restore-stale 腿必须红 ─────────────
    //   与 K9 同一条刀路、换方向：摘掉落点闸之后，`--restore` 会走到 `--check`（组合是 M ⇒ 派生 {1,0}），
    //   盘上却是 U 落点的补丁 ⇒ 换码拒 ⇒ 腿翻 `UMH-STALE-PATCH-UNNAMED`。
    const k11 = blindLanding.ok && uPatchText !== null
      ? runScenario({
        name: 'umh-04-k11-restore-landing-blind', pre: 'M', generator: 'spy', tool: 'real', action: 'restore',
        toolText: blindLanding.text, extraCopyFiles: { [REL.patch]: uPatchText },
      })
      : null
    scenarios.knife_restore_blind_reading = k11 === null ? null : slim(k11)
    book.run('knife-K11', () => {
      if (k11 === null) {
        push(CODE.fixture, `K11 的刀没装上：${blindLanding.why ?? 'U 态补丁派生不出来'} —— 这一格的红不能算在工具头上`)
        return undefined
      }
      knife(problems, { label: 'K11·restore-landing-blind', got: stalePatchProblems(k11, { label: 'K11·restore-landing-blind' }), want: CODE.staleUnnamed })
      // 与 K9 同一条口径：必须落在"第二道闸拒"那一面（同一个码、exit 1、`--check` 真跑过）。
      const drifted = []
      if (k11.json?.code !== NOT_DERIVED_CODE) drifted.push(`code=${JSON.stringify(k11.json?.code)}（期望 ${NOT_DERIVED_CODE}）`)
      if (k11.exit !== 1) drifted.push(`exit=${k11.exit}（期望 1）`)
      if (!(Number(k11.generator_checks) >= 1)) drifted.push(`generator_checks=${JSON.stringify(k11.generator_checks)}（期望 ≥1）`)
      if (drifted.length > 0) {
        push(CODE.knifeVector, `K11（restore 方向）摘了落点闸，但没有落在"第二道闸拒"那一面：${drifted.join(' · ')}`)
      }
      rec.readings.knife_k11 = { exit: k11.exit, code: k11.json?.code ?? null, checks: k11.generator_checks, writes: k11.generator_writes }
      return undefined
    })

    // ── ①⁗ 腿 residue-sweep：上一次被杀留下的 `.tmp-*` 残渣 ⇒ 工具自己收掉，no-op 仍是 no-op ──────
    //   契约 §4.4 的那个例外：清扫发生在**判入口态之前**，所以一次 no-op 之后**文件集合会少一份**。
    //   钉三件事：那一份（pid 已死的）没了 · 没删别的、也没加东西 · 产品那三份的字节不动、仍然是 `UMH-NOOP`。
    const residue = deadResidueName()
    const sweptRun = runScenario({
      name: 'umh-04-residue-sweep', pre: 'U', generator: 'real', tool: 'real', action: 'apply',
      extraCopyFiles: { [residue.rel]: residue.content },
    })
    scenarios.residue_sweep = sweptRun.tool_present ? slim(sweptRun) : null
    scenarios.residue_fixture = { rel: residue.rel, pid: residue.pid }
    book.run('residue-sweep', () => {
      if (!sweptRun.tool_present) {
        pushToolAbsent(problems, sweptRun, 'U 态 + 上一次的 `.tmp-*` 残渣 --apply')
        return CODE.toolAbsent
      }
      rec.readings.residue_sweep = {
        exit: sweptRun.exit, code: sweptRun.json?.code ?? null, changed: sweptRun.json?.changed ?? null,
        seeded: residue.rel, removed: Object.keys(sweptRun.before.files_map).filter((rel) => !(rel in sweptRun.after.files_map)),
        stderr_head: String(sweptRun.stderr ?? '').split(/\r?\n/).slice(0, 2).join('\n').slice(0, 400),
      }
      for (const p of residueSweepProblems(sweptRun, { residue: residue.rel, label: 'U 态 + 上一次的 `.tmp-*` 残渣 --apply' })) problems.push(p)
      return undefined
    })

    // ── ⑤‴‴ 刀 K12（摘掉**扫残渣**那一行）⇒ residue-sweep 腿必须红 ──────────────────────
    //   工具的清扫发生在**判入口态之前** ⇒ 一次 no-op 之后文件集合会少一份（契约 §4.4 的那个例外）。
    //   这一刀把清扫换成空账本，于是那份死 pid 的残渣留在原地 ⇒ 腿翻 `UMH-RESIDUE-NOT-SWEPT`。
    const blindSweep = gateBlindTool(readFileSync(SOURCE.tool, 'utf8'), { sweep: true })
    scenarios.knife_sweep_blind = { applied: blindSweep.applied, missing: blindSweep.missing, why: blindSweep.why }
    const k12 = blindSweep.ok
      ? runScenario({
        name: 'umh-04-k12-sweep-blind', pre: 'U', generator: 'real', tool: 'real',
        toolText: blindSweep.text, action: 'apply', extraCopyFiles: { [residue.rel]: residue.content },
      })
      : null
    scenarios.knife_sweep_blind_reading = k12 === null ? null : slim(k12)
    book.run('knife-K12', () => {
      if (k12 === null) {
        push(CODE.fixture, `K12 的刀没装上：${blindSweep.why} —— 工具改过？这一格的红不能算在工具头上`)
        return undefined
      }
      knife(problems, { label: 'K12·sweep-blind', got: residueSweepProblems(k12, { residue: residue.rel, label: 'K12·sweep-blind' }), want: CODE.residueUnswept })
      return undefined
    })

    // ── ⑤⁵ 刀 K13（把两道签字的**失败形状**改坏）⇒ 那三格断言必须红 ───────────────────────
    //   契约 §4.1 钉了失败也要说清 `failed_step` / `rolled_back` / `row_landing`；只判"码对不对"的腿
    //   在工具把这三格乱填时照样绿。这一刀把三者一起改回旧形状（`verify` / `true` / `null`）。
    const shapeLiar = shapeLiarTool(readFileSync(SOURCE.tool, 'utf8'))
    scenarios.knife_shape_liar = { applied: shapeLiar.applied, missing: shapeLiar.missing, why: shapeLiar.why }
    const k13 = shapeLiar.ok
      ? runScenario({
        name: 'umh-04-k13-failure-shape-liar', pre: 'U', generator: 'spy', tool: 'real',
        toolText: shapeLiar.text, action: 'apply',
      })
      : null
    scenarios.knife_shape_liar_reading = k13 === null ? null : slim(k13)
    book.run('knife-K13', () => {
      if (k13 === null) {
        push(CODE.fixture, `K13 的刀没装上：${shapeLiar.why} —— 工具改过？这一格的红不能算在工具头上`)
        return undefined
      }
      knife(problems, { label: 'K13·failure-shape-liar', got: stalePatchProblems(k13, { label: 'K13·failure-shape-liar' }), want: CODE.patchFailureShape })
      rec.readings.knife_k13 = {
        exit: k13.exit, code: k13.json?.code ?? null,
        failed_step: k13.json?.failed_step ?? null, rolled_back: k13.json?.rolled_back ?? null,
        row_landing: k13.json?.row_landing ?? null,
      }
      return undefined
    })

    // ── ⑥ 阳性对照：一份合规的 no-op 读数必须判成 0 条（`stale-patch` 那一面也带一份，判据要可满足）──
    book.run('control', () => {
      const conforming = controlReading({
        json: { code: 'UMH-NOOP', changed: 0, row_landing: { insert: 0, preset_bodies: 2 } },
        files_equal: true,
        tree_equal: true,
        changed_files: [],
      })
      controlFails(problems, '阳性对照·no-op', noopProblems(conforming, { insert: 0, presetBodies: 2, label: 'control' }))
      const staleOk = controlReading({
        exit: 1,
        json: { code: STALE_CODE, changed: 0, row_landing: { insert: 1, preset_bodies: 0 }, failed_step: 'patch', rolled_back: false },
        before: { carriers: { marker: false, disabled: true, listed: false }, landing: { insert: 1, preset_bodies: 0 }, files: { composition: 'c-before', generator: 'g-before', patch: 'p-before' } },
        files_equal: true,
        tree_equal: true,
        changed_files: [],
        generator_called: false,
      })
      controlFails(problems, '阳性对照·过期补丁', stalePatchProblems(staleOk, { label: 'control' }))
      const underivedControl = controlReading({
        exit: 1,
        json: { code: NOT_DERIVED_CODE, changed: 0, row_landing: { insert: 0, preset_bodies: 2 }, failed_step: 'patch', rolled_back: false },
        before: { carriers: { marker: false, disabled: true, listed: false }, landing: { insert: 0, preset_bodies: 2 }, files: { composition: 'c-before', generator: 'g-before', patch: 'p-before' } },
        files_equal: true,
        tree_equal: true,
        changed_files: [],
        generator_called: false,
        generator_writes: 0,
        generator_calls: [],
      })
      controlFails(problems, '阳性对照·半截补丁', underivedPatchProblems(underivedControl, { label: 'control' }))
      // 阳性对照·补丁读不出来（第三个出口）：一份合规读数必须判成 0 条 ——
      // 否则"这一格红"分不出是工具没做对还是判据写坏了。
      const unreadableControl = controlReading({
        exit: 1,
        json: { code: UNREADABLE_CODE, changed: 0, row_landing: null, failed_step: 'patch', rolled_back: false },
        stderr: `E_UNMOUNT_PATCH_UNREADABLE 盘上补丁读不出来：这个路径现在是目录（补丁被换掉了）`,
        before: { carriers: { marker: false, disabled: true, listed: false }, landing: null, files: { composition: 'c-before', generator: 'g-before', patch: 'p-before' } },
        files_equal: true,
        tree_equal: true,
        changed_files: [],
        generator_called: false,
        generator_writes: 0,
        generator_calls: [],
      })
      controlFails(problems, '阳性对照·补丁读不出来', unreadablePatchProblems(unreadableControl, { label: 'control' }))
      return undefined
    })

    book.require([
      'apply-noop', 'stale-patch', 'restore-stale', 'truncated-patch', 'unreadable-patch', 'state-step', 'residue-sweep', 'apply-twice', 'restore-twice',
      'knife-K5', 'knife-K6', 'knife-K9', 'knife-K9b', 'knife-K10', 'knife-K11', 'knife-K12', 'knife-K13', 'knife-K15', 'knife-K17', 'control',
    ])
    rec.readings.legs = book.legs
    rec.readings.scenarios = scenarios
    caseFail(problems)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
test('UMH-05 回滚：生成器步注入失败 ⇒ 三处写过也必须逐字节回到跑之前（见证为证）· 自证失败同样回滚 · 回滚没做到时账要如实', async () => {
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

    // ── ②′ 腿 rollback-broken：载体写完、生成器步失败、**回滚本身做不到** ⇒ 账必须如实 ─────────
    //   造法：见证生成器在 `exit 1` 之前把**组合** chmod 成只读（实测：Windows 上 rename 覆盖只读件 ⇒ EPERM）
    //   ⇒ 回滚的第一次原子换写不动它 ⇒ 回滚半路抛。盘上于是还剩"载体翻过"的字节。
    //   期望（`changed` 的口径 = **结束时仍与跑前快照不同的文件数**）：
    //     exit 1 · `E_UNMOUNT_STEP_FAILED` · `failed_step: "generator"` · `rolled_back: false` ·
    //     `changed` = **夹具自己前后快照量到的份数** · `rollback: {ok:false, drifted:[…同样的那几份]}`。
    const sabotage = { rel: REL.composition, mode: 0o444 }
    const broken = runScenario({
      name: 'umh-05-rollback-broken', pre: 'M', generator: 'witness', tool: 'real', action: 'apply', sabotage,
    })
    scenarios.rollback_broken = slim(broken)
    book.run('rollback-broken', () => {
      if (!broken.tool_present) {
        pushToolAbsent(problems, broken, 'M 态 --apply（回滚本身失败）')
        return CODE.toolAbsent
      }
      // 刀的入口：载体确实写过了（见证），否则"回滚失败"可能是"根本没写"。
      if (broken.witness === null || broken.witness.marker !== false || broken.witness.disabled !== true) {
        push(CODE.injectionNotReached, `回滚失败那一跑：见证 ${JSON.stringify(broken.witness)} —— `
          + '这一跑没走到"三处载体已写好、生成器步失败"那一刻')
        return undefined
      }
      rec.readings.rollback_broken = {
        exit: broken.exit, code: broken.json?.code ?? null, failed_step: broken.json?.failed_step ?? null,
        changed: broken.json?.changed ?? null, rolled_back: broken.json?.rolled_back ?? null,
        rollback: broken.json?.rollback ?? null,
        measured: Object.keys(broken.before.files_map).filter((rel) => broken.after.files_map[rel] !== broken.before.files_map[rel]),
      }
      for (const p of rollbackDriftProblems(broken, { label: 'M 态 --apply（回滚本身失败）' })) problems.push(p)
      return undefined
    })

    // ── ③′ 刀 K14：把回滚账改回旧的谎（`drift` 量成空）⇒ rollback-broken 腿必须红 ─────────────
    //   `82251bd` 之前工具就是这么报的：`changed: 0` / `rolled_back: true`，而盘上两份文件明明还差着
    //   （组长探针 (c)）。只判 `failed_step` / stderr 的腿抓不到它 —— 红必须来自"账与盘对不上"。
    const liar = rollbackLiarTool(readFileSync(SOURCE.tool, 'utf8'))
    scenarios.knife_rollback_liar = { applied: liar.applied, missing: liar.missing, why: liar.why }
    const k14 = liar.ok
      ? runScenario({
        name: 'umh-05-k14-rollback-liar', pre: 'M', generator: 'witness', tool: 'real',
        toolText: liar.text, action: 'apply', sabotage,
      })
      : null
    scenarios.knife_rollback_liar_reading = k14 === null ? null : slim(k14)
    book.run('knife-K14', () => {
      if (k14 === null) {
        push(CODE.fixture, `K14 的刀没装上：${liar.why} —— 工具改过？这一格的红不能算在工具头上`)
        return undefined
      }
      knife(problems, { label: 'K14·rollback-liar', got: rollbackDriftProblems(k14, { label: 'K14·rollback-liar' }), want: CODE.rollbackDrift })
      rec.readings.knife_k14 = {
        exit: k14.exit, code: k14.json?.code ?? null, changed: k14.json?.changed ?? null,
        rolled_back: k14.json?.rolled_back ?? null, rollback: k14.json?.rollback ?? null,
        measured: Object.keys(k14.before.files_map).filter((rel) => k14.after.files_map[rel] !== k14.before.files_map[rel]),
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

    book.require(['generator-throws', 'verify-fails', 'rollback-broken', 'knife-K7', 'knife-K14', 'control'])
    rec.readings.legs = book.legs
    rec.readings.scenarios = scenarios
    caseFail(problems)
  })
})
