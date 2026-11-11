/**
 * `EXR-01` —— **R5 练习回执的落点与来源**（`bug-20261110-18` 的判据面）。
 *
 * 契约：`.team/test/CONTRACT-C2.md` §3.7.2（这一格的口径与三种来源的名字只写在那里）。
 * 被测：`support/r5-exercise.mjs`（解析器）+ `support/boot-readings.mjs::rollbackExerciseCaseVerdict()`
 *      （**这一格的判词**；`BOOT-01` 用的是同一处，不许各写一份）。
 *
 * ## 为什么要有这一格
 * 身份那一半（"撤掉挂载、重启之后新建的会话头仍是 `agenia`"）必须真的做过一次练习才有读数。
 * 旧写法只认 `AGENIA_R5_REMOVAL_EXERCISE`：**没人记得设那个变量 ⇒ HOLD**，而盘上那份回执明明在
 * （老板为此花了两次重启）。于是"做过但没读到"与"根本没做"在读数里**长得一模一样** ——
 * 判据把"我记得设变量"当成了证据的一部分。
 *
 * ## 这一格判什么（三种来源，各有名字）
 *   · `env`     —— env 给了就**优先**（测试 / 副本要能指到别处）；
 *   · `default` —— env 没给时读**默认落点**：① `<ws>/.team/leader/_r5/receipt.json`，
 *                  ② `<ws>/.team/leader/<YYYY-MM-DD>/_r5/receipt.json`（**新的先看**）；
 *   · `none`    —— 两处都没有 ⇒ `HOLD BOOT-R5-REMOVAL-EXERCISE-MISSING`，报文点名 `none` 与查过哪几条。
 *   🔴 **有回执但读不出来（哪一种来源都一样）⇒ RED `BOOT-R5-ROLLBACK-CONTRACT-BROKEN`，不是 HOLD**。
 *
 * ## 腿（八条判据 + 一把刀 + 一次真读数）
 *   · `default-canonical`：只有规范落点 ⇒ `source:'default'`、读到并判 **GREEN**；
 *   · `default-dated`：只有日期抽屉里的那份（**两份：新的绿 / 旧的坏**）⇒ 读**新**的那份、GREEN；
 *   · `default-malformed`：规范落点是一段坏 JSON ⇒ `source:'default'` + **RED**（不是 HOLD）；
 *   · `default-not-a-receipt`：规范落点是合法 JSON 但**不是回执**（缺五样）⇒ 同一个**红**码；
 *   · `none`：空工作区 ⇒ `source:'none'` ⇒ **HOLD** + 报文里有 `none` 与规范落点那条路径；
 *   · `env-wins`：env 指向坏的那份、默认落点是好的 ⇒ `source:'env'` + `RED BOOT-R5-IDENTITY-COST`
 *     （证明 env 真的优先，不是"两处都读、挑一个好看的"）；
 *   · **刀** `env-only`：把默认落点的候选清单清空（= `bug-20261110-18` 之前的形状）⇒
 *     同一个工作区的读数从 `default` 翻成 `none`、判词从 GREEN 翻成 HOLD —— 精确翻面，只动来源；
 *   · **真读数**：`PATHS.repo` 上 env 不给 ⇒ 默认落点必须读到老板那份回执并判 GREEN
 *     （读不到 ⇒ `HOLD EXR-REAL-RECEIPT-ABSENT`：那是"这台机器上没有那份回执"，不许记绿）。
 *
 * ## `bug-20261110-17`：回执必须量"那一行是关着的"
 * `row_landing {insert:0, preset_bodies:2}` 只证明那一行**落在哪**，证明不了它**关着**；而"预设体里的
 * 客户端 UI 行必须 `disabled: true`"是生成器的硬要求。回执因此多一格 `row_disabled: true|false|null`：
 *   · ⑨ `row-disabled-false`：`{0,2}` 但 `row_disabled:false` ⇒ **RED `CONTRACT-BROKEN`**（翻面样本）；
 *   · ⑩ `row-disabled-unmeasured`：**老格式回执**（这一格还不存在）⇒ **HOLD `ROW-DISABLED-UNMEASURED`**，
 *     不绿也不红 —— 缺的是一个读数，不是一个失败；补救是重交一份补量过的回执（契约 §3.7.2）。
 */
import { test } from 'node:test'
import path from 'node:path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { caseFail, caseHold, problem, runCase, runRoot } from '../support/evidence.mjs'
import { PATHS } from '../support/env.mjs'
import { ensureMarkedDir } from '../support/root-guard.mjs'
import {
  R5_EXERCISE_DEFAULT_REL,
  R5_EXERCISE_ENV,
  readRollbackExercise,
  rollbackExerciseCandidates,
} from '../support/r5-exercise.mjs'
import { rollbackExerciseCaseVerdict, readRollbackExercise as readRollbackExerciseInRepo } from '../support/boot-readings.mjs'

/** 一份**该绿**的回执（形状照 `rollbackExerciseVerdict` 的文件头）。 */
const GREEN_RECEIPT = {
  at: '2026-11-10T21:38:45.100+08:00',
  marker_removed: true,
  regenerated: true,
  row_landing: { insert: 0, preset_bodies: 2 },
  row_disabled: true,
  restart_at: '2026-11-11T11:18:17.000+08:00',
  new_session: { created_at: '2026-11-11T12:12:58.984+08:00', agentPreset: 'agenia' },
}
/** 一份**回执形状合格、但身份掉了**的（撤挂载折掉了 preset ⇒ 该红 `IDENTITY-COST`）。 */
const IDENTITY_LOST_RECEIPT = {
  ...GREEN_RECEIPT,
  new_session: { ...GREEN_RECEIPT.new_session, agentPreset: 'standard' },
}
/**
 * 一份**落点对、但那一行开着**的回执（`{insert:0, preset_bodies:2}` + `row_disabled:false`）——
 * `bug-20261110-17` 的翻面样本：这一份必须 RED 在 `CONTRACT-BROKEN`，不是绿，也不是 `IDENTITY-COST`。
 */
const ROW_DISABLED_FALSE_RECEIPT = {
  ...GREEN_RECEIPT,
  row_disabled: false,
}
/**
 * **老格式回执**：`row_disabled` 那一格还不存在（= 老板 2026-11-10 那次练习交的形状）。
 * 两份预设体落点都在、身份也对 ⇒ 唯一缺的是"它关没关" ⇒ 必须 HOLD `ROW-DISABLED-UNMEASURED`（不绿）。
 */
const LEGACY_RECEIPT = {
  at: GREEN_RECEIPT.at,
  marker_removed: true,
  regenerated: true,
  row_landing: { insert: 0, preset_bodies: 2 },
  restart_at: GREEN_RECEIPT.restart_at,
  new_session: { ...GREEN_RECEIPT.new_session },
}

/** 这一格自己的工作区（带 marker；每根一格，互不污染）。 */
function workspaceOf(tag) {
  return ensureMarkedDir(path.join(runRoot(), 'workspace', `exr-01-${tag}`), { runRoot: runRoot() })
}

/** 把一份回执写到工作区里的相对落点（建目录 + 写 JSON）。 */
function writeReceipt(ws, rel, value) {
  const file = path.join(ws, ...rel.split('/'))
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  return file
}

test('EXR-01 R5 练习回执：默认落点也要读得到 · 三种来源（env/default/none）各有名字 · 坏回执是红不是挂起', async () => {
  await runCase('EXR-01', async (rec) => {
    const problems = []
    const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
    const noEnv = {}

    // ── ① default-canonical：只有规范落点，env 不给 ⇒ 读到并判绿 ────────────────────
    const wsCanonical = workspaceOf('canonical')
    const canonicalFile = writeReceipt(wsCanonical, R5_EXERCISE_DEFAULT_REL, GREEN_RECEIPT)
    const canonical = readRollbackExercise({ env: noEnv, workspace: wsCanonical })
    const canonicalVerdict = rollbackExerciseCaseVerdict(canonical)
    rec.readings.default_canonical = {
      source: canonical.source,
      path: canonical.path,
      supplied: canonical.supplied,
      checked: canonical.checked,
      candidates: rollbackExerciseCandidates({ workspace: wsCanonical }).map((c) => c.how),
      verdict: canonicalVerdict.verdict,
      code: canonicalVerdict.code,
      why: canonicalVerdict.why,
    }
    if (canonical.source !== 'default' || canonical.path !== canonicalFile) {
      push('EXR-DEFAULT-NOT-READ', `[①] env 没给、规范落点有回执（${canonicalFile}）⇒ 应当 \`source:'default'\` 且读到的就是它，`
        + `实得 ${JSON.stringify({ source: canonical.source, path: canonical.path })} —— 默认落点没落地，`
        + '老板做完的那次练习下一跑又变回"没做过"（`bug-20261110-18`）')
    }
    if (canonicalVerdict.verdict !== 'GREEN') {
      push('EXR-DEFAULT-NOT-JUDGED', `[①] 默认落点上那份回执是该绿的（形状 / 时序 / 落点 / 身份都对），`
        + `判成 ${canonicalVerdict.verdict} / ${canonicalVerdict.code}：${canonicalVerdict.why} —— 读到了还不够，还得判`)
    }

    // ── ② default-dated：只有日期抽屉里那份；两份（新的绿 / 旧的坏）⇒ 读新的 ──────────
    const wsDated = workspaceOf('dated')
    writeReceipt(wsDated, '.team/leader/2026-11-09/_r5/receipt.json', IDENTITY_LOST_RECEIPT)
    const datedFile = writeReceipt(wsDated, '.team/leader/2026-11-10/_r5/receipt.json', GREEN_RECEIPT)
    const dated = readRollbackExercise({ env: noEnv, workspace: wsDated })
    const datedVerdict = rollbackExerciseCaseVerdict(dated)
    rec.readings.default_dated = {
      source: dated.source,
      path: dated.path,
      verdict: datedVerdict.verdict,
      code: datedVerdict.code,
      checked: dated.checked,
    }
    if (dated.source !== 'default' || dated.path !== datedFile) {
      push('EXR-DATED-NOT-NEWEST', `[②] 日期抽屉里有两份（2026-11-09 旧 / 2026-11-10 新）⇒ 必须读**新**的那份（${datedFile}），`
        + `实得 ${JSON.stringify({ source: dated.source, path: dated.path })} —— 读旧的那份会把一次"身份掉了"的排练当成今天的事实`)
    }
    if (datedVerdict.verdict !== 'GREEN') {
      push('EXR-DATED-NOT-JUDGED', `[②] 新的那份该绿，判成 ${datedVerdict.verdict} / ${datedVerdict.code}：${datedVerdict.why}`)
    }

    // ── ③ default-malformed：规范落点是一段坏 JSON ⇒ default + **RED**（不是 HOLD）────────
    const wsBroken = workspaceOf('malformed')
    writeReceipt(wsBroken, R5_EXERCISE_DEFAULT_REL, '{ "at": "2026-11-10T21:38:45+08:00", ')
    const broken = readRollbackExercise({ env: noEnv, workspace: wsBroken })
    const brokenVerdict = rollbackExerciseCaseVerdict(broken)
    rec.readings.default_malformed = {
      source: broken.source,
      supplied: broken.supplied,
      error: broken.error,
      verdict: brokenVerdict.verdict,
      code: brokenVerdict.code,
      why: brokenVerdict.why,
    }
    if (broken.source !== 'default') {
      push('EXR-MALFORMED-SOURCE', `[③] 坏回执在规范落点上 ⇒ \`source\` 必须是 \`default\`（不是 \`none\`），实得 ${JSON.stringify(broken.source)}`
        + ' —— 把"回执坏了"读成"练习没做"，这一格就永远不会红')
    }
    if (brokenVerdict.verdict !== 'RED' || brokenVerdict.code !== 'BOOT-R5-ROLLBACK-CONTRACT-BROKEN') {
      push('EXR-MALFORMED-NOT-RED', `[③] 默认落点上有文件但读不出来 ⇒ 必须 \`RED BOOT-R5-ROLLBACK-CONTRACT-BROKEN\`，`
        + `实得 ${brokenVerdict.verdict} / ${brokenVerdict.code} —— 回执坏了不是"练习没做"（HOLD 是把红藏起来）`)
    }

    // ── ④ default-not-a-receipt：合法 JSON、但不是回执（五样全缺）⇒ 同一个红码 ───────────
    const wsShape = workspaceOf('not-a-receipt')
    writeReceipt(wsShape, R5_EXERCISE_DEFAULT_REL, { hello: 'world' })
    const shape = readRollbackExercise({ env: noEnv, workspace: wsShape })
    const shapeVerdict = rollbackExerciseCaseVerdict(shape)
    rec.readings.default_not_a_receipt = {
      source: shape.source,
      verdict: shapeVerdict.verdict,
      code: shapeVerdict.code,
      why: shapeVerdict.why,
    }
    if (shapeVerdict.verdict !== 'RED' || shapeVerdict.code !== 'BOOT-R5-ROLLBACK-CONTRACT-BROKEN') {
      push('EXR-SHAPE-NOT-RED', `[④] 落点上是一份合法 JSON 但不是回执（缺 \`at\` / \`marker_removed\` / \`regenerated\` / \`row_landing\` / \`row_disabled\` / \`restart_at\` / \`new_session\`）`
        + `⇒ 必须红在 \`BOOT-R5-ROLLBACK-CONTRACT-BROKEN\`，实得 ${shapeVerdict.verdict} / ${shapeVerdict.code}`)
    }

    // ── ⑤ none：两处都没有 ⇒ HOLD 且报文点名来源 ─────────────────────────────────────
    const wsNone = workspaceOf('none')
    const none = readRollbackExercise({ env: noEnv, workspace: wsNone })
    const noneVerdict = rollbackExerciseCaseVerdict(none)
    rec.readings.none = {
      source: none.source,
      supplied: none.supplied,
      path: none.path,
      checked: none.checked,
      verdict: noneVerdict.verdict,
      code: noneVerdict.code,
      why: noneVerdict.why,
    }
    if (none.source !== 'none' || none.supplied !== false) {
      push('EXR-NONE-SOURCE', `[⑤] 空工作区（env 没给、规范落点没有、日期抽屉没有）⇒ \`source:'none'\` / \`supplied:false\`，`
        + `实得 ${JSON.stringify({ source: none.source, supplied: none.supplied })}`)
    }
    if (noneVerdict.verdict !== 'HOLD' || noneVerdict.code !== 'BOOT-R5-REMOVAL-EXERCISE-MISSING') {
      push('EXR-NONE-VERDICT', `[⑤] 两处都没有 ⇒ 必须 \`HOLD BOOT-R5-REMOVAL-EXERCISE-MISSING\`，实得 ${noneVerdict.verdict} / ${noneVerdict.code}`)
    }
    const noneWhy = String(noneVerdict.why ?? '')
    if (!noneWhy.includes('none')) {
      push('EXR-NONE-UNNAMED', `[⑤] HOLD 的报文必须**点名来源** (\`none\`)，实得 ${JSON.stringify(noneWhy)} —— `
        + '"没设变量"与"没做过练习"不许共用一个说不出话的 MISSING')
    }
    if (!noneWhy.includes(R5_EXERCISE_DEFAULT_REL.replace(/\//g, path.sep)) && !noneWhy.includes(R5_EXERCISE_DEFAULT_REL)) {
      push('EXR-NONE-UNNAMED', `[⑤] HOLD 的报文必须写出**查过哪条默认落点**（\`${R5_EXERCISE_DEFAULT_REL}\`），实得 ${JSON.stringify(noneWhy)}`)
    }

    // ── ⑥ env-wins：env 指向坏的那份、默认落点是好的 ⇒ 仍然是 env 说了算 ────────────────
    const wsEnv = workspaceOf('env-wins')
    const envFile = writeReceipt(wsEnv, 'outside/identity-lost.json', IDENTITY_LOST_RECEIPT)
    writeReceipt(wsEnv, R5_EXERCISE_DEFAULT_REL, GREEN_RECEIPT)
    const withEnv = readRollbackExercise({ env: { [R5_EXERCISE_ENV]: envFile }, workspace: wsEnv })
    const withEnvVerdict = rollbackExerciseCaseVerdict(withEnv)
    rec.readings.env_wins = {
      source: withEnv.source,
      path: withEnv.path,
      verdict: withEnvVerdict.verdict,
      code: withEnvVerdict.code,
      why: withEnvVerdict.why,
    }
    if (withEnv.source !== 'env' || withEnv.path !== envFile) {
      push('EXR-ENV-NOT-FIRST', `[⑥] env 给了路径（${envFile}）而默认落点也有回执 ⇒ 必须用 env 指的那份，`
        + `实得 ${JSON.stringify({ source: withEnv.source, path: withEnv.path })} —— env 是测试 / 副本的入口，不许被默认落点顶掉`)
    }
    if (withEnvVerdict.verdict !== 'RED' || withEnvVerdict.code !== 'BOOT-R5-IDENTITY-COST') {
      push('EXR-ENV-NOT-JUDGED', `[⑥] env 指的那份说身份掉了（\`agentPreset: standard\`）⇒ 必须 \`RED BOOT-R5-IDENTITY-COST\`，`
        + `实得 ${withEnvVerdict.verdict} / ${withEnvVerdict.code} —— 读到默认落点那份"好看的"就等于把红换成了绿`)
    }

    // ── ⑨ row-disabled-false：落点 `{0,2}`、身份对，但那行**开着** ⇒ RED（`bug-20261110-17`）────────
    const wsOpen = workspaceOf('row-disabled-false')
    writeReceipt(wsOpen, R5_EXERCISE_DEFAULT_REL, ROW_DISABLED_FALSE_RECEIPT)
    const openRead = readRollbackExercise({ env: noEnv, workspace: wsOpen })
    const openVerdict = rollbackExerciseCaseVerdict(openRead)
    rec.readings.row_disabled_false = {
      source: openRead.source,
      row_landing: openRead.receipt?.row_landing ?? null,
      row_disabled: openRead.receipt?.row_disabled ?? null,
      verdict: openVerdict.verdict,
      code: openVerdict.code,
      why: openVerdict.why,
      readings_row_disabled: openVerdict.readings?.row_disabled ?? null,
    }
    if (openVerdict.verdict !== 'RED' || openVerdict.code !== 'BOOT-R5-ROLLBACK-CONTRACT-BROKEN') {
      push('EXR-ROW-DISABLED-FALSE', `[⑨] 回执的落点是 \`{insert:0, preset_bodies:2}\`、身份也对，但 \`row_disabled: false\`（那一行开着）`
        + `⇒ 必须 \`RED BOOT-R5-ROLLBACK-CONTRACT-BROKEN\`，实得 ${openVerdict.verdict} / ${openVerdict.code} —— `
        + '`row_landing` 只证明"落在哪"，证明不了"关着"；把开着当成撤挂载成功，等于用一个位置读数冒充功能状态')
    }

    // ── ⑩ row-disabled-unmeasured：**老格式回执**（没这一格）⇒ HOLD，不绿也不红（`bug-20261110-17`）────
    const wsLegacy = workspaceOf('row-disabled-unmeasured')
    writeReceipt(wsLegacy, R5_EXERCISE_DEFAULT_REL, LEGACY_RECEIPT)
    const legacyRead = readRollbackExercise({ env: noEnv, workspace: wsLegacy })
    const legacyVerdict = rollbackExerciseCaseVerdict(legacyRead)
    rec.readings.row_disabled_unmeasured = {
      source: legacyRead.source,
      receipt_keys: Object.keys(legacyRead.receipt ?? {}),
      verdict: legacyVerdict.verdict,
      code: legacyVerdict.code,
      why: legacyVerdict.why,
      readings_row_disabled: legacyVerdict.readings?.row_disabled ?? 'ABSENT',
    }
    if (legacyVerdict.verdict === 'GREEN') {
      push('EXR-ROW-DISABLED-UNMEASURED', `[⑩] 老格式回执（没有 \`row_disabled\`）被判成 **GREEN** —— `
        + '没量过的格子被当成了量过；`null` 不许通过绿（`bug-20261110-17`）')
    } else if (legacyVerdict.verdict !== 'HOLD' || legacyVerdict.code !== 'BOOT-R5-ROW-DISABLED-UNMEASURED') {
      push('EXR-ROW-DISABLED-UNMEASURED', `[⑩] 老格式回执必须 \`HOLD BOOT-R5-ROW-DISABLED-UNMEASURED\`（缺一个读数，不是一个失败），`
        + `实得 ${legacyVerdict.verdict} / ${legacyVerdict.code} —— 记成 RED 会把"没量"说成"撤挂载坏了"；`
        + '记成 GREEN 就是静默放行（`bug-20261110-17`）')
    }
    if (!String(legacyVerdict.why ?? '').includes('row_disabled')) {
      push('EXR-ROW-DISABLED-UNMEASURED', `[⑩] 这条 HOLD 的报文必须**点名缺的那个字段**（\`row_disabled\`），实得 ${JSON.stringify(String(legacyVerdict.why ?? '').slice(0, 240))}`
        + ' —— 不点名，读的人不知道该补哪一格')
    }
    if (legacyVerdict.readings?.row_disabled !== null) {
      push('EXR-ROW-DISABLED-UNMEASURED', `[⑩] 没量 ⇒ 读数里 \`row_disabled\` 必须是 \`null\`（不是 \`false\`，也不是缺键），`
        + `实得 ${JSON.stringify(legacyVerdict.readings?.row_disabled ?? 'ABSENT')} —— 三个值必须是三个读数`)
    }

    // ── ⑦ 刀 `env-only`：把默认落点的候选清单清空（= `bug-20261110-18` 之前的形状）────────
    //     同一个工作区（有规范落点）在旧逻辑下必须是 `none` + HOLD ⇒ 证明"默认落点"是承重的。
    const knifeDir = path.join(runRoot(), 'knives', 'exr-01')
    mkdirSync(knifeDir, { recursive: true })
    const sourceFile = path.join(PATHS.testRoot, 'support', 'r5-exercise.mjs')
    const source = readFileSync(sourceFile, 'utf8')
    const ANCHOR = "const out = [{ path: toAbs(ws, R5_EXERCISE_DEFAULT_REL), how: 'default' }]"
    const anchorCount = source.split(ANCHOR).length - 1
    rec.readings.knife = { anchor: ANCHOR, anchor_count: anchorCount, source_file: sourceFile }
    if (anchorCount !== 1) {
      push('EXR-KNIFE-ANCHOR', `[⑦] 刀的锚点在 \`support/r5-exercise.mjs\` 里必须**恰好 1 处**，实得 ${anchorCount} 处 —— 锚点不在，刀不咬`)
    } else {
      const variantFile = path.join(knifeDir, 'r5-exercise-env-only.mjs')
      writeFileSync(variantFile, source.replace(ANCHOR, 'const out = []'), 'utf8')
      let variant = null
      try {
        variant = await import(pathToFileURL(variantFile).href)
      } catch (err) {
        push('EXR-KNIFE-UNAVAILABLE', `[⑦] 刀的副本 import 不进来：${String(err?.message ?? err)}`)
      }
      if (variant !== null) {
        const variantRead = variant.readRollbackExercise({ env: noEnv, workspace: wsCanonical })
        const variantVerdict = rollbackExerciseCaseVerdict(variantRead)
        rec.readings.knife.reading = {
          source: variantRead.source,
          supplied: variantRead.supplied,
          verdict: variantVerdict.verdict,
          code: variantVerdict.code,
        }
        if (variantRead.source !== 'none' || variantVerdict.verdict !== 'HOLD') {
          push('EXR-KNIFE-NOT-BITING', `[⑦] 清空默认落点之后，同一个工作区必须翻成 \`source:'none'\` + HOLD，`
            + `实得 ${JSON.stringify({ source: variantRead.source, verdict: variantVerdict.verdict })} —— 刀不咬，说明这一格没在判默认落点`)
        }
        if (canonical.source !== 'default' || canonicalVerdict.verdict !== 'GREEN') {
          push('EXR-KNIFE-CONTROL', '[⑦] 刀只能证明"少了默认落点会翻"，前提是真模块在同一个工作区上给 `default` + GREEN —— 那一半现在不成立')
        }
      }
    }

    // ── ⑧ 真读数：老板那份回执在 PATHS.repo 的默认落点上，env 不给也得读到 ────────────────
    const real = readRollbackExerciseInRepo({ env: noEnv })
    const realVerdict = rollbackExerciseCaseVerdict(real)
    rec.readings.real = {
      source: real.source,
      path: real.path,
      exists: real.path === null ? false : existsSync(real.path),
      checked: real.checked,
      row_landing: real.receipt?.row_landing ?? null,
      row_disabled: real.receipt?.row_disabled ?? 'ABSENT',
      verdict: realVerdict.verdict,
      code: realVerdict.code,
      why: realVerdict.why,
    }
    if (real.source === 'none') {
      caseHold(rec, 'EXR-REAL-RECEIPT-ABSENT',
        `\`${PATHS.repo}\` 的默认落点上没有回执（查过 ${real.checked.length} 条：${real.checked.slice(0, 3).join(' · ')}）—— `
        + '这一腿判不了（**不是**绿）。这台机器上没做过那次练习，或回执没放在规范落点 / 日期抽屉里')
    } else {
      if (real.source !== 'default') {
        push('EXR-REAL-SOURCE', `[⑧] env 不给时真工作区必须走 \`default\`，实得 ${JSON.stringify(real.source)}`)
      }
      if (realVerdict.verdict === 'HOLD') {
        // 🔴 盘上那份回执**没有** `row_disabled`（`bug-20261110-17` 之前交的那一份）⇒ 这一腿**报缺的那一格**，
        //    不记绿、也不记红：缺的是一个读数，不是一个失败。补救动作 = 重交一份补量过的回执（组长）。
        if (realVerdict.code !== 'BOOT-R5-ROW-DISABLED-UNMEASURED') {
          push('EXR-REAL-VERDICT', `[⑧] 盘上那份回执判 HOLD，但码是 ${JSON.stringify(realVerdict.code)}（期望 \`BOOT-R5-ROW-DISABLED-UNMEASURED\`）`
            + `：${realVerdict.why} —— 别的 HOLD 不许借这一条混过去`)
        }
        caseHold(rec, realVerdict.code,
          `[⑧] 盘上那份练习回执缺 \`row_disabled\`（字段列表 = ${JSON.stringify(Object.keys(real.receipt ?? {}))}）⇒ `
          + '它证明"那一行在两份预设体里",证明不了"那一行是关着的" —— 这一腿**不记绿**。'
          + '补救：按契约 §3.7.2 重交一份补量 `row_disabled: true|false` 的回执（组长），下一跑这一腿才可能绿')
      } else if (realVerdict.verdict !== 'GREEN') {
        push('EXR-REAL-VERDICT', `[⑧] 盘上那份回执按判据自己的验证器应当 GREEN，判成 ${realVerdict.verdict} / ${realVerdict.code}：${realVerdict.why}`)
      }
      if (realVerdict.verdict === 'GREEN' && realVerdict.readings?.row_disabled !== true) {
        push('EXR-REAL-VERDICT', `[⑧] 盘上那份回执判了 GREEN，但读数里 \`row_disabled\` = ${JSON.stringify(realVerdict.readings?.row_disabled ?? 'ABSENT')}`
          + ' —— 判绿的前提是 `row_disabled === true`，读数与判词必须是同一件事')
      }
    }

    caseFail(problems)
  })
})
