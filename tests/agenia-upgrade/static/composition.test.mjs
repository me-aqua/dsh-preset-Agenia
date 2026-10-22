/**
 * STAT-01 / 02 / 03 / 05 —— 静态组合对账。
 *
 * 被测对象（**永远是 staging**）：`$AGENIA_STAGING_PRESET/agent.cordis.yml`、`inject.js`、
 * `cordis.patch.yml`、`team/*.md`、`job-briefs/*.md`、`package.json`，以及 desktop oracle。
 * 活体 `presets/agenia/**` 只作两件事：**解析器阳性对照**（只读）与"没被碰过"的哈希见证。
 *
 * 首跑为什么应当全红（契约 §9.2）：staging 尚未实现、oracle 未落盘 ⇒
 * `SUT-SURFACE-MISSING` / `ORACLE-MISSING`。**不是因为断言写歪了** ——
 * `before` 里的预检已经把"地基坏了"与"被测对象没实现"分开。
 *
 * 🔴 本文件不许 import `.tools/make-bundle-patch.mjs`：那个模块**在加载期就会写活体的
 * `presets/agenia/cordis.patch.yml`**（没有 `--check` 时直接 writeFileSync）。
 * 所以补丁一致性走 `patchStructuralProblems()` 的结构对账，不跑生成器。
 */
import { before, describe, test } from 'node:test'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { PATHS, FROZEN } from '../support/env.mjs'
import {
  calibrate,
  cfg,
  countIdLines,
  delegationToolNames,
  disabledKind,
  enabledDelegations,
  guardCoverageProblems,
  listDirs,
  listMd,
  memberAnnotations,
  memberPresetIdFor,
  multisetDiff,
  parseComposition,
  patchStructuralProblems,
  plain,
  presetEntries,
  registrationRows,
  roleOfPresetId,
  rowGet,
} from '../support/composition.mjs'
import { caseFail, normalizeSha, oracleReadings, preflight, problem, runCase, sha256Equal, stagedVsLiveDrift, stagingReadings } from '../support/evidence.mjs'
import { importStaged, loadStagedModule, readStagedText, stagingExists, stagingPath, writeFixtureText } from '../support/sut.mjs'
import { countFiles, fixtureDir, writeUnder } from '../support/verify-recompute.mjs'

/** 每例都要先过：根守卫 → 注册表形状 → 解析器阳性对照（活体那两个文件，只读）。 */
before(() => {
  preflight({ calibrateLive: true })
})

function surfaceReport(rec) {
  rec.readings.staging = stagingReadings()
  rec.readings.oracle = oracleReadings()
  return rec.readings.staging
}

function requireStaged(rel, problems) {
  if (stagingExists(rel)) return true
  problems.push(problem('SUT-SURFACE-MISSING', `staged 还没有 ${rel}（落点 ${stagingPath(rel)}）—— 实现关尚未落 staging，这是预期的红`))
  return false
}

/**
 * `stagedVsLiveDrift()` 的读数 → 这一格（`STAGED-LIVE-DRIFT`）的红因，**至多一条**。
 *
 * 三种"空"必须**各自不同**（否则读的人不知道该去补哪一边）：
 *   · `staged === null` —— `AGENIA_STAGING_PRESET` 没设 ⇒ 两棵树比不了（这一格判不了）；
 *   · 两侧各 0 份文件   —— **零样本**：三张差集空着的意思是"什么都没比"，不是"相同"；
 *   · 只有一侧 0 份     —— 走差集分支：`只在 staged` / `只在活体` / `同名而内容不同` 逐份点名。
 *
 * 🔴 零样本那一格的红因必须**自己说出"零样本"**：只说"对不上"会把读的人引去同步两棵树，
 *    而真正缺的是样本（`same` 那边同样不含零样本 —— `evidence.mjs::stagedVsLiveDrift`）。
 */
function stagedLiveDriftProblems(drift) {
  if (drift.staged === null) {
    return [problem('STAGED-LIVE-DRIFT', '`AGENIA_STAGING_PRESET` 没设 ⇒ 两棵树比不了（这一格判不了，不许当绿）')]
  }
  if (drift.staged_files === 0 && drift.live_files === 0) {
    return [problem('STAGED-LIVE-DRIFT',
      '**零样本**（STAGED-LIVE-ZERO-SAMPLE）：两棵树都读得到，但一份普通文件都没枚举到'
      + `（staged 0 文件 ${drift.staged} · 活体 0 文件 ${drift.live}）`
      + ' ⇒ 三张差集空着的意思是"什么都没比"，不是"相同"：这一跑的绿**不能**用来给活体背书。'
      + '修法：确认 `AGENIA_STAGING_PRESET` 指到一棵真有文件的树，且活体预设没被清空。')]
  }
  if (!drift.same) {
    const parts = []
    if (drift.only_staged.length > 0) parts.push(`只在 staged：${drift.only_staged.join(', ')}`)
    if (drift.only_live.length > 0) parts.push(`只在活体：${drift.only_live.join(', ')}`)
    if (drift.different.length > 0) parts.push(`同名而内容不同：${drift.different.join(', ')}`)
    return [problem('STAGED-LIVE-DRIFT',
      '**staged 与活体不是同一棵树**（测试的靶子 ≠ 生产）⇒ 这一跑的绿**不能**用来给活体背书：'
      + `${parts.join(' · ')}（staged ${drift.staged_files} 文件 ${drift.staged} · 活体 ${drift.live_files} 文件 ${drift.live}）`
      + '。修法：把改过的文件同步进 staging（**各人同步自己改的**），别靠人记得。')]
  }
  return []
}

/** 探针形状的摘要（落进 `readings`：红基线要能读到"这一跑量的是哪几种空"）。 */
function driftShape(drift, driftProblems) {
  return {
    same: drift.same,
    staged: drift.staged,
    live: drift.live,
    staged_files: drift.staged_files,
    live_files: drift.live_files,
    only_staged: drift.only_staged.length,
    only_live: drift.only_live.length,
    different: drift.different.length,
    problems: driftProblems,
  }
}

describe('static · composition', () => {
  test('STAT-01 固定 desktop oracle 重算 + staged 组合多重集对账', async () => {
    await runCase('STAT-01', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      surfaceReport(rec)

      // ① oracle：来源、版本、SHA、行数 —— 缺了必须失败，**不许静默换源**（拍板 I3 / 契约 PH0-5）
      const or = rec.readings.oracle
      let oracleIdSet = null
      if (!or.path) {
        push('ORACLE-MISSING', 'AGENIA_DESKTOP_ORACLE_STANDARD 没给 —— oracle 缺失必须红，不许回落到退役 web 路径')
      } else {
        if (or.retired_web_path_marker) push('ORACLE-RETIRED-WEB-PATH', `oracle 指到了退役的 web/npm 安装：${or.path}（字节相同 ≠ 口径相同）`)
        if (!or.exists) push('ORACLE-MISSING', `oracle 文件不存在：${or.path}`)
        else {
          if (!sha256Equal(or.actual_sha256, FROZEN.oracle.sha256)) push('ORACLE-SHA', `oracle SHA 实得 ${or.actual_sha256}，冻结值 ${FROZEN.oracle.sha256}`)
          if (or.actual_bytes !== FROZEN.oracle.bytes) push('ORACLE-BYTES', `oracle 字节数实得 ${or.actual_bytes}，冻结值 ${FROZEN.oracle.bytes}`)
          if (or.declared_version !== FROZEN.oracle.version) push('ORACLE-VERSION', `AGENIA_ORACLE_VERSION 实得 ${JSON.stringify(or.declared_version)}，冻结值 ${FROZEN.oracle.version}`)
          if (!sha256Equal(or.declared_sha256, FROZEN.oracle.sha256)) push('ORACLE-VERSION', `AGENIA_ORACLE_SHA256 实得 ${JSON.stringify(or.declared_sha256)}，冻结值 ${FROZEN.oracle.sha256}`)
          const oracleDoc = parseComposition(readFileSync(or.path, 'utf8'), 'oracle')
          const caps = oracleDoc.rows.filter((r) => r.name !== FROZEN.oracle.registrationName)
          oracleIdSet = caps.map((r) => r.id)
          rec.readings.oracle_rows = oracleDoc.rows.length
          rec.readings.oracle_capability_rows = caps.length
          if (oracleDoc.warnings.length > 0) push('ORACLE-PARSE', `oracle 解析出声：${oracleDoc.warnings.join(' / ')}`)
          if (oracleDoc.rows.length !== FROZEN.oracle.rowsTotal) push('ORACLE-ROWS', `oracle 的 - id: 行数实得 ${oracleDoc.rows.length}，冻结值 ${FROZEN.oracle.rowsTotal}`)
          if (caps.length !== FROZEN.oracle.capabilityRows) push('ORACLE-ROWS', `oracle 剔掉注册行后的能力行实得 ${caps.length}，冻结值 ${FROZEN.oracle.capabilityRows}`)
        }
      }
      if (!or.provenance_exists) {
        push('ORACLE-PROVENANCE-MISSING', `缺 ${PATHS.oracleProvenance} —— oracle 必须带来源/版本/SHA 读数`)
      } else {
        const provText = readFileSync(PATHS.oracleProvenance, 'utf8')
        try {
          rec.readings.oracle_provenance = JSON.parse(provText)
        } catch (err) {
          push('ORACLE-PROVENANCE-MISSING', `provenance.json 不是可解析 JSON：${err.message}`)
        }
        if (!provText.includes(FROZEN.oracle.version)) push('ORACLE-PROVENANCE-MISSING', `provenance.json 里没有版本 ${FROZEN.oracle.version}`)
        // provenance 是**别人写的文本** ⇒ 里面的摘要可能大写也可能小写（同一份摘要）⇒ 大小写不敏感地找
        if (!provText.toUpperCase().includes(normalizeSha(FROZEN.oracle.sha256))) push('ORACLE-PROVENANCE-MISSING', `provenance.json 里没有 SHA ${FROZEN.oracle.sha256}`)
      }

      // ② staged 组合 vs oracle：多重集 diff + 计数
      if (requireStaged('agent.cordis.yml', problems)) {
        const compText = readStagedText('agent.cordis.yml')
        const comp = parseComposition(compText, 'staged')
        const ids = comp.rows.map((r) => r.id)
        rec.readings.staged_rows = comp.rows.length
        rec.readings.staged_id_lines = countIdLines(compText)
        if (comp.warnings.length > 0) push('STAGED-PARSE', `staged 组合解析出声：${comp.warnings.join(' / ')}`)
        if (comp.rows.length !== rec.readings.staged_id_lines) push('STAGED-PARSE', `解析行数 ${comp.rows.length} ≠ 裸计数 ${rec.readings.staged_id_lines} —— 解析器丢了行`)
        const dupes = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))]
        if (dupes.length > 0) push('STAGED-DUP-ID', `组合里有重复行 id：${dupes.join(', ')}`)
        if (comp.rows.length !== FROZEN.staged.capabilityRows) push('STAGED-ROWS', `能力行实得 ${comp.rows.length}，冻结期望 ${FROZEN.staged.capabilityRows}（38 + 4 条 job 行）`)
        for (const id of FROZEN.fixedTeamRowIds) if (!ids.includes(id)) push('STAGED-TEAM-ROW', `缺固定行 ${id}`)
        for (const job of FROZEN.jobs) if (!ids.includes(job.id)) push('STAGED-JOB-ROW', `缺 job 行 ${job.id}`)

        if (oracleIdSet === null) {
          push('ORACLE-MISSING', 'oracle 缺失 ⇒ 多重集对账（onlyInStandard / onlyInAgenia）无法成立：按失败记，**不换源**')
        } else {
          const onlyStd = multisetDiff(oracleIdSet, ids)
          const onlyAge = multisetDiff(ids, oracleIdSet)
          rec.readings.only_in_standard = onlyStd
          rec.readings.only_in_agenia = onlyAge
          const expectOnly = [...FROZEN.liveWitness.onlyInAgenia, ...FROZEN.jobs.map((j) => j.id)].sort()
          if (onlyStd.length !== 0) push('ONLY-IN-STANDARD', `onlyInStandard 必须为空（standard 有的必须有），实得 ${JSON.stringify(onlyStd)}`)
          if (onlyAge.length !== FROZEN.staged.onlyInAgenia) push('ONLY-IN-AGENIA', `onlyInAgenia 项数实得 ${onlyAge.length}，冻结期望 ${FROZEN.staged.onlyInAgenia}`)
          if (JSON.stringify(onlyAge) !== JSON.stringify(expectOnly)) push('ONLY-IN-AGENIA', `onlyInAgenia 明细实得 ${JSON.stringify(onlyAge)}，冻结 ${JSON.stringify(expectOnly)}`)

        }
      }

      // ── ③ 🔴 `T-R1-04` / `T-TEST-03`：**staged 与活体逐字节同值**（两棵树比）──────────────
      // 【钉什么】测试的靶子（`AGENIA_STAGING_PRESET`）与生产（活体 `presets/agenia`）**必须是同一棵树**
      //   （差一个字节就算漂移）。跳过 `.runtime/`（数据，不是代码 —— 它本来就不该同步）。
      //   口径（组长 `T-R1-04` 逐字定）：**必须是"两棵树"比**，不是"活体 vs 冻结期望"（后者是 `calibrate()` 在做的另一件事）。
      // 【为什么在这儿】2026-10-16 一天里撞到**两次**"活体改了、staged 没跟上"，而当时**没有任何一条断言**
      //   拿两棵树比 —— 树哈希只被**记下来**（`evidence.mjs` 的 `stagingReadings()` / `settlement`），
      //   **只记账、不判等**。于是"整批改动不在射程内"而读数看着是绿的（技术评审 F3）。
      //   技术评审的原话：*"在那之前，任何「v1.8 已验」的说法都是空的。"*
      // 【怎么翻面】造一个"只改了一棵树"的现场（本票的做法：把 `AGENIA_STAGING_PRESET` 指到一棵**变异体副本**
      //   —— 判据是**对称**的，任何一边多一个字节都算漂移）⇒ 本条的 `STAGED-LIVE-DRIFT` 当场红。
      //   阳性对照读数：`.team/test/2026-10-14/_evidence/20261016-test-i18-m-drift/`。
      {
        const drift = stagedVsLiveDrift()
        rec.readings.staged_vs_live = drift
        for (const p of stagedLiveDriftProblems(drift)) problems.push(p)
      }

      // ── ③' 🔴 两棵树"都读得到、但都是 0 份文件" ⇒ 这一格必须红（`F-141`）──────────────
      // 【钉什么】`stagedVsLiveDrift()` 的三张差集为空**不等于**两棵树相同 —— 还要**有样本**。
      //   零样本时差集全空、`staged` 非 null ⇒ 只看差集就是绿，而这一格守的正是
      //   "测试的靶子 = 生产"（`F-57-TARGET` 那一侧同一件事也会红，这是第二个读者）。
      // 【怎么翻面】两棵树各指一根**空目录**（都读得到、都是 0 份）⇒ `same` 必须 false、
      //   红因必须自己说出"零样本"。相邻两格一起钉住："只一侧空"仍走差集分支，"没设"仍报判不了
      //   —— 三种空的红因**两两不同**，否则读的人不知道该去补哪一边。
      // 🔴 夹具自证：先量"这两根目录里的普通文件数 = 0 / 活体那棵真树 > 0"，再谈红因。
      //   （否则这一格的红可能来自夹具里恰好有几份文件，而不是"零样本"。）
      {
        const zeroStaged = fixtureDir('STAT-01', 'drift-zero-sample-staged')
        const zeroLive = fixtureDir('STAT-01', 'drift-zero-sample-live')
        const zeroFiles = [countFiles(zeroStaged), countFiles(zeroLive)]
        const zero = stagedVsLiveDrift({ ...process.env, AGENIA_STAGING_PRESET: zeroStaged }, { liveRoot: zeroLive })
        const zeroProblems = stagedLiveDriftProblems(zero)
        rec.readings.staged_live_drift_fixtures = { zero_sample: { fixture_files: zeroFiles, ...driftShape(zero, zeroProblems) } }
        if (zeroFiles[0] !== 0 || zeroFiles[1] !== 0) {
          push('STAGED-LIVE-ZERO-FIXTURE-NOT-EMPTY', `零样本夹具本该两棵树各 0 份普通文件，实测 ${JSON.stringify(zeroFiles)} —— 这一格的红就不是"零样本"那条了`)
        } else {
          if (zero.staged === null) push('STAGED-LIVE-ZERO-FIXTURE-NOT-EMPTY', '零样本夹具的 `AGENIA_STAGING_PRESET` 没被读到（`staged === null`）—— 这一格测不到零样本')
          if (zero.same !== false) {
            push('STAGED-LIVE-ZERO-SAMPLE-GREEN', `🔴 零样本（staged 0 份 · 活体 0 份）⇒ \`drift.same\` 必须是 false（差集全空 ≠ 相同），实得 same=${zero.same} —— 这一格守的是"测试的靶子 = 生产"，它绿了就等于替两棵空树背书`)
          }
          if (zeroProblems.length !== 1 || zeroProblems[0].code !== 'STAGED-LIVE-DRIFT') {
            push('STAGED-LIVE-ZERO-SAMPLE-UNNAMED', `零样本 ⇒ 红因必须恰有一条 \`STAGED-LIVE-DRIFT\`，实得 ${JSON.stringify(zeroProblems.map((p) => p.code))}`)
          } else if (!zeroProblems[0].message.includes('零样本') || !zeroProblems[0].message.includes('STAGED-LIVE-ZERO-SAMPLE')) {
            push('STAGED-LIVE-ZERO-SAMPLE-UNNAMED', `零样本的红因必须**点名"零样本"**（含 \`STAGED-LIVE-ZERO-SAMPLE\` 可指认串），实得 ${JSON.stringify(zeroProblems[0].message).slice(0, 400)} —— 只说"对不上"会把人引去同步两棵树，而真正缺的是样本`)
          }
        }

        // 相邻 ①：只一侧空（staged 是空目录 / 活体那棵真树）⇒ 仍走**差集分支**
        const oneSideStaged = fixtureDir('STAT-01', 'drift-one-side-staged')
        const oneSideFiles = countFiles(oneSideStaged)
        const oneSide = stagedVsLiveDrift({ ...process.env, AGENIA_STAGING_PRESET: oneSideStaged })
        const oneSideProblems = stagedLiveDriftProblems(oneSide)
        rec.readings.staged_live_drift_fixtures.one_side_empty = { staged_fixture_files: oneSideFiles, ...driftShape(oneSide, oneSideProblems) }
        if (oneSideFiles !== 0 || oneSide.live_files === 0) {
          push('STAGED-LIVE-ONE-SIDE-FIXTURE', `单侧空夹具本该"staged 0 份 · 活体 > 0 份"，实测 staged ${oneSideFiles} / 活体 ${oneSide.live_files} —— 这一格测不到"只一侧空"`)
        } else {
          if (oneSide.staged === null) push('STAGED-LIVE-ONE-SIDE-FIXTURE', '单侧空夹具的 `AGENIA_STAGING_PRESET` 没被读到')
          if (oneSide.same !== false) push('STAGED-LIVE-ONE-SIDE-GREEN', `单侧空（staged 0 份 · 活体 ${oneSide.live_files} 份）⇒ same 必须 false，实得 ${oneSide.same}`)
          if (oneSide.only_live.length !== oneSide.live_files) {
            push('STAGED-LIVE-ONE-SIDE-CODE', `单侧空 ⇒ 每一份活体文件都该落在 \`only_live\` 里（实得 ${oneSide.only_live.length} / ${oneSide.live_files}）`)
          }
          if (oneSideProblems.length !== 1 || !oneSideProblems[0].message.includes('只在活体')) {
            push('STAGED-LIVE-ONE-SIDE-CODE', `单侧空必须仍走**差集分支**（红因点名"只在活体"），实得 ${JSON.stringify(oneSideProblems.map((p) => p.message)).slice(0, 400)}`)
          }
          if (oneSideProblems.some((p) => String(p.message).includes('零样本'))) {
            push('STAGED-LIVE-ONE-SIDE-HIJACKED', '单侧空被"零样本"那条顶掉了 —— 两条红因必须分得开（双侧空 = 什么都没比；单侧空 = 那一侧的文件量不到），混成一条，读的人就不知道该去补哪一边')
          }
        }

        // 相邻 ②：`AGENIA_STAGING_PRESET` 没设 ⇒ 仍报原来那句"判不了"，红因不变
        const unset = stagedVsLiveDrift({})
        const unsetProblems = stagedLiveDriftProblems(unset)
        rec.readings.staged_live_drift_fixtures.unset = driftShape(unset, unsetProblems)
        if (unset.staged !== null) push('STAGED-LIVE-UNSET-FIXTURE', `"没设"那一格的 env 里不该有 \`AGENIA_STAGING_PRESET\`，实得 staged=${JSON.stringify(unset.staged)}`)
        if (unsetProblems.length !== 1 || !unsetProblems[0].message.includes('没设') || !unsetProblems[0].message.includes('判不了')) {
          push('STAGED-LIVE-UNSET-CODE', `"没设"必须仍报原来那句（含「没设」「判不了」），实得 ${JSON.stringify(unsetProblems.map((p) => p.message)).slice(0, 400)}`)
        }
        if (unsetProblems.some((p) => String(p.message).includes('零样本'))) {
          push('STAGED-LIVE-UNSET-HIJACKED', '"没设"被"零样本"那条顶掉了 —— 判不了与零样本是两件事（前者要看环境变量，后者要看盘上有没有文件）')
        }

        // 三种空的红因**两两不同**（直接断言，不靠上面几条加起来推）
        {
          const texts = {
            零样本: zeroProblems[0]?.message ?? '',
            单侧空: oneSideProblems[0]?.message ?? '',
            没设: unsetProblems[0]?.message ?? '',
          }
          rec.readings.staged_live_drift_fixtures.red_texts = texts
          if (new Set(Object.values(texts)).size !== 3) {
            push('STAGED-LIVE-EMPTY-INDISTINCT', `三种空（零样本 / 单侧空 / 没设）的红因必须两两不同，实得 ${JSON.stringify(texts).slice(0, 600)}`)
          }
        }

        // 阳性对照：两棵树各 1 份、逐字节相同 ⇒ 必须 same:true 且零红因（`same` 不许被改成"永远 false"）
        {
          const sameStaged = fixtureDir('STAT-01', 'drift-identical-staged')
          const sameLive = fixtureDir('STAT-01', 'drift-identical-live')
          writeUnder(sameStaged, 'inject.js', '// identical fixture\n')
          writeUnder(sameLive, 'inject.js', '// identical fixture\n')
          const identical = stagedVsLiveDrift({ ...process.env, AGENIA_STAGING_PRESET: sameStaged }, { liveRoot: sameLive })
          const identicalProblems = stagedLiveDriftProblems(identical)
          rec.readings.staged_live_drift_fixtures.identical = driftShape(identical, identicalProblems)
          if (identical.same !== true || identicalProblems.length > 0) {
            push('STAGED-LIVE-NEVER-SAME', `两棵树各 1 份、逐字节相同 ⇒ 必须 same:true 且零红因，实得 same=${identical.same} / 红因 ${JSON.stringify(identicalProblems.map((p) => p.code))} —— 这一格红了说明"要求有样本"那条把判据改成了"永远不 same"`)
          }
        }
      }

      caseFail(problems)
    })
  })

  test('STAT-02 staged 四行 job 十项 checklist + officeBound 1（只剩 review）+ 角色/作业书 + 生成补丁一致', async () => {
    await runCase('STAT-02', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      surfaceReport(rec)

      if (requireStaged('agent.cordis.yml', problems)) {
        const compText = readStagedText('agent.cordis.yml')
        const comp = parseComposition(compText, 'staged')
        const byId = new Map(comp.rows.map((r) => [r.id, r]))

        // ── 四行 job 的十项（提案 §B2.2 checklist 逐项）────────────────────
        // 🔴 **0.2.1 迁移（2026-10-19）把其中三项挪了地方** —— 义务一件没少，落点换了：
        //    `backgroundMode` / `persona` / `toolFilter` 已**不是** `tool-subagent` 的配置键
        //    （组合 `agent.cordis.yml:295-301` 的注释：见到 `persona`/`toolFilter` 整行报迁移错；
        //      `backgroundMode` 一起撤了 —— 0.2.1 的委派本身就是异步的）。
        //    ⇒ 三样现在的载体：
        //      · **人格** ← 行上方 `# @member-persona 【组员:<role>】…`（生成器写进那份组员预设的
        //        `persona.prefix`）· 与 REV-02（`roles.test.mjs`）同一口径；
        //      · **否定项** ← 行上方 `# @member-deny <名字>`（生成器写注入器的 `proposalFile: false`）；
        //      · **后台模式** ← `persona-injector.config.delegationTools`（裁定 A4 冻结表）。
        //    ⇒ 判据跟着义务走：**新落点少了**要红（人格/否定项/模式各一条），
        //      **旧键写回来**也要红（`JOB-LEGACY-KEY`：0.2.1 见到就报迁移错，整份预设被判 broken）。
        //    ⚠️ 旧写法里的 `FROZEN.jobToolFilterDeny` **根本不存在**（`env.mjs` 里没有这个键）
        //      ⇒ 那句比较是 `undefined === undefined`，永远是绿 —— 一条静默失效的判据。
        //      本票把它换成"旧键必须不存在"，并删掉对那个不存在常量的引用。
        const ann = memberAnnotations(compText)
        const patchDoc = stagingExists('cordis.patch.yml') ? parseComposition(readStagedText('cordis.patch.yml'), 'staged-patch') : null
        const patchEntries = patchDoc === null ? null : registrationRows(patchDoc.rows).map((r) => cfg(r, 'id'))
        rec.readings.patch_preset_ids = patchEntries

        // ── 🔴 `PERSONA-PREFIX`：**预设 id ↔ `persona.prefix` 的标记**（评审 `F-109` 第 4 关 `M-2`）──
        // 【钉什么】装配时读的是**那一份预设的 `persona.prefix`**（组合 L297-299 自己这么写：
        //   "一个岗位的人格必须是一份独立的 Agent Preset"），不是行上方那句注释。两处必须对上：
        //     · 每份**组员**入口：`prefix` 必须以 `【组员:<由 config.id 推出来的角色>】` **开头**；
        //     · **组长**那一份：`prefix` **不许**带任何 `【组员:`（带了组长就会被认成组员）；
        //     · 任一份**读不到** `prefix` ⇒ 红（"读不到"不许当"没有"）。
        // 【为什么】换锚那一批（22 条）里 12 条是人格，而断言链**止于组合里的注释**：
        //   `JOB-PERSONA` / `CHARTER-MARKER` / `ROLE-MARK` 读的都是注释；`personaPrefix` 字段原来**零读点**
        //   （唯一读它的是 `_probe/` 的探针 —— 探针读数不是判据）。
        //   输入（评审给的）：把生成器的 `memberPersona()` 写成组长那份 ⇒ 注释没动、id 多重集没动、
        //   ④ 在组长份里逐字找得到 ⇒ **全套绿**，而组员装配起来以为自己是组长。
        // 【怎么翻面】`T10`（把 `preset-agenia-team-review` 的 `prefix` 换成 `【组员:dev】…`）⇒ 红。
        if (patchDoc !== null) {
          const prefixes = {}
          for (const ent of presetEntries(patchDoc.rows)) {
            const role = roleOfPresetId(ent.id)
            prefixes[ent.id] = {
              role,
              prefix_head: typeof ent.personaPrefix === 'string' ? ent.personaPrefix.slice(0, 60) : ent.personaPrefix,
            }
            if (typeof ent.personaPrefix !== 'string' || ent.personaPrefix.trim() === '') {
              push('PERSONA-PREFIX', `预设 ${ent.id} 读不到 persona.prefix（或它是空的）—— 装配时那一份没有身份标记，"读不到"不许当"没有"`)
              continue
            }
            if (ent.id === FROZEN.patchPresets.leaderPresetId) {
              if (/【组员:/.test(ent.personaPrefix)) {
                push('PERSONA-PREFIX', `组长那一份（${ent.id}）的 persona.prefix 里带了「【组员:…】」标记 —— 那会让组长被认成组员（分流是按这枚标记走的）`)
              }
              continue
            }
            if (role === null || !FROZEN.teamRoles.includes(role)) {
              push('PERSONA-PREFIX', `预设 ${ent.id} 的 config.id 推不出一个已知角色（推出 ${JSON.stringify(role)}）—— 这一份的身份标记没有对照物`)
              continue
            }
            if (!ent.personaPrefix.startsWith(`【组员:${role}】`)) {
              push('PERSONA-PREFIX', `预设 ${ent.id} 的 persona.prefix 必须以「【组员:${role}】」开头（角色由 config.id 推出 —— 这是装配时真正读的那一份），实得 ${JSON.stringify(ent.personaPrefix.slice(0, 80))} —— 这个岗位会以为自己是别人`)
            }
          }
          rec.readings.persona_prefixes = prefixes

          // ── 🔴 `PERSONA-PREFIX-SOURCE`：标记之后那一段人格**正文**也要对回源注释（评审 `F-2`）──
          // 【钉什么】每份**组员**预设的 `persona.prefix`，去掉块标量那个尾部换行之后，必须与组合里
          //   **那一行** `# @member-persona` 的正文**逐字相同**。源行 = 组合里 `agentPreset === 这一份的 id`
          //   的那一行（`memberAnnotations()` 已经算好，不新造公式）。
          // 【为什么】`PERSONA-PREFIX` 只钉开头那枚 `【组员:<角色>】`；标记之后的人格正文原来全树零断言
          //   （`JOB-PERSONA` / `CHARTER-MARKER` / `ROLE-MARK` 读的是组合里的注释 = 源，④ 又跳过 `persona` 行）
          //   ⇒ 生成器"标记写对、正文写错"（按换行截断 / 取错模板）时全套绿。
          // 【怎么翻面】`T12`（某份组员预设的正文改一个字、标记不动）⇒ 红。
          const sources = {}
          for (const ent of presetEntries(patchDoc.rows)) {
            if (ent.id === FROZEN.patchPresets.leaderPresetId) continue // 组长份没有 `# @member-persona` 源行
            if (typeof ent.personaPrefix !== 'string' || ent.personaPrefix.trim() === '') continue // 上面已报 PERSONA-PREFIX
            const srcRows = comp.rows.filter((r) => cfg(r, 'agentPreset') === ent.id)
            if (srcRows.length !== 1) {
              push('PERSONA-PREFIX-SOURCE', `预设 ${ent.id} 在组合里的源行不唯一：\`agentPreset: ${ent.id}\` 的行有 ${srcRows.length} 条（${srcRows.map((r) => r.id).join(', ') || '无'}）—— 人格正文没有对照物`)
              continue
            }
            const src = srcRows[0]
            const mark = ann.get(src.id)
            const wantBody = typeof mark?.persona === 'string' ? mark.persona : null
            if (wantBody === null) {
              push('PERSONA-PREFIX-SOURCE', `${src.id} 行上方读不到 \`# @member-persona\` 的正文 —— 预设 ${ent.id} 的 persona.prefix 没有对照物（"读不到"不许当"没有"）`)
              continue
            }
            // ⚠️ 块标量读取器（`readBlockScalar`）总给值补一个尾部换行；去掉再逐字比
            //    （`persona.prefix` 是提示词正文，尾部换行不是"人格"的一部分）。
            const gotBody = ent.personaPrefix.replace(/[\r\n]+$/, '')
            sources[ent.id] = {
              source_row: src.id,
              equal: gotBody === wantBody,
              prefix_body_head: gotBody.slice(0, 80),
              source_body_head: wantBody.slice(0, 80),
            }
            if (gotBody !== wantBody) {
              push('PERSONA-PREFIX-SOURCE', `预设 ${ent.id} 的 persona.prefix 正文与源注释不一致（源行 ${src.id} 上方的 \`# @member-persona\`）：`
                + `补丁 ${JSON.stringify(gotBody.slice(0, 80))} ≠ 组合 ${JSON.stringify(wantBody.slice(0, 80))}`
                + ' —— 标记对、正文错：装配时这个岗位的人格不是组里写的那一段')
            }
          }
          rec.readings.persona_prefix_sources = sources
        }
        const injRowCfg = byId.get('persona-injector')?.config
        const injConfigPlain = injRowCfg instanceof Map ? plain(injRowCfg) : null
        const dt = injConfigPlain === null ? undefined : injConfigPlain[FROZEN.delegationToolsKey]
        rec.readings.delegation_tools = dt ?? null
        // 旧键**任何一条已启用的委派行上**都不许回来（0.2.1 见到 `persona`/`toolFilter` 直接报迁移错）。
        // ⚠️ **作用域 = 已启用的行**：关着的行（`disabled: true`）不参与装配，框架不校验它的键
        //    —— 把"关着的历史行还带 0.2.0 的键"判成红，等于给一个不存在的违规开罚单。
        //    `team-retro` 那一行组合里自己写着 🔴「别原样打开，先按 team_* 的迁移做」⇒ 只记读数（落 `rec.readings`）；
        //    "关掉≠删掉"由 STAT-03 的 `DISABLED-COUNT`（5 行字面 true）守：真有人原样打开，那一条先红。
        {
          const offenders = []
          for (const r of enabledDelegations(comp.rows)) {
            for (const legacy of ['backgroundMode', 'persona', 'toolFilter']) {
              if (cfg(r, legacy) !== undefined) offenders.push(`${r.id}.${legacy}`)
            }
          }
          if (offenders.length > 0) push('LEGACY-KEY-EXISTS', `已启用的委派行上还留着 0.2.1 已撤掉的键：${offenders.join(', ')}（persona / toolFilter 会让整行报迁移错、整份预设被 UI 藏掉）`)
        }
        rec.readings.disabled_rows_legacy_keys = comp.rows
          .filter((r) => disabledKind(r) === 'literal-true')
          .map((r) => ({ id: r.id, legacy_keys: ['backgroundMode', 'persona', 'toolFilter'].filter((k) => cfg(r, k) !== undefined) }))
          .filter((x) => x.legacy_keys.length > 0)
        rec.readings.disabled_rows_note = '关着的行不参与装配 ⇒ 上面的旧键**不判红**（判了就是给不存在的违规开罚单）。组合 L422-424 自己写着「别原样打开」；「关掉≠删掉」由 STAT-03 的 DISABLED-COUNT 守。'
        for (const job of FROZEN.jobs) {
          const row = byId.get(job.id)
          if (!row) { push('STAGED-JOB-ROW', `缺 job 行 ${job.id}`); continue }
          if (rowGet(row, 'name') !== '@deepseek-ai/dsh-tool-subagent') push('JOB-NAME', `${job.id}: name 实得 ${JSON.stringify(rowGet(row, 'name'))}`)
          if (cfg(row, 'provider') !== FROZEN.jobProvider) push('JOB-PROVIDER', `${job.id}: provider 实得 ${JSON.stringify(cfg(row, 'provider'))}，冻结 ${FROZEN.jobProvider}`)
          if (cfg(row, 'toolName') !== job.toolName) push('JOB-TOOLNAME', `${job.id}: toolName 实得 ${JSON.stringify(cfg(row, 'toolName'))}，冻结 ${job.toolName}`)
          if (cfg(row, 'toolName') !== `job_${job.role.replace(/-/g, '_')}`) push('JOB-TOOLNAME', `${job.id}: toolName 必须 = job_<role 下划线形式>`)
          if (cfg(row, 'maxDepth') !== FROZEN.jobMaxDepth) push('JOB-MAXDEPTH', `${job.id}: maxDepth 实得 ${JSON.stringify(cfg(row, 'maxDepth'))}，冻结 ${FROZEN.jobMaxDepth}`)
          // ① 人格：**行上方的注释**是唯一来源（0.2.1）
          const mark = ann.get(job.id) ?? { persona: undefined, deny: [] }
          if (typeof mark.persona !== 'string' || !mark.persona.startsWith(`【组员:${job.role}】`)) {
            push('JOB-PERSONA', `${job.id}: 行上方必须有 \`# @member-persona 【组员:${job.role}】…\`（0.2.1 的人格来源：生成器把它写进那份组员预设的 persona.prefix），实得 ${JSON.stringify(mark.persona)?.slice(0, 80)}`)
          }
          // ② 否定项：`# @member-deny` 的期望表（只有判决岗 deny proposal_file）
          const wantDeny = [...(FROZEN.jobMemberDeny[job.id] ?? [])].sort()
          const gotDeny = [...mark.deny].sort()
          if (JSON.stringify(gotDeny) !== JSON.stringify(wantDeny)) {
            push('JOB-MEMBER-DENY', `${job.id}: \`# @member-deny\` 期望 ${JSON.stringify(wantDeny)}，实得 ${JSON.stringify(gotDeny)}（多写 = 那个岗位的工具被拿掉；少写 = 判决岗能自己提候选）`)
          }
          // ③ 后台模式：`delegationTools` 里那一条（A4 冻结表）
          if (dt === undefined || dt === null) {
            push('JOB-MODE', 'persona-injector 的 config 缺 delegationTools —— 后台模式没有落点（裁定 A4）')
          } else if (dt[job.toolName] !== FROZEN.delegationTools[job.toolName]) {
            push('JOB-MODE', `${job.id}: delegationTools[${job.toolName}] 实得 ${JSON.stringify(dt[job.toolName])}，冻结 ${JSON.stringify(FROZEN.delegationTools[job.toolName])}`)
          }
          // ④ 旧键不许回来（0.2.1 见到 persona/toolFilter 直接报迁移错、整份预设 broken）
          for (const legacy of ['backgroundMode', 'persona', 'toolFilter']) {
            if (cfg(row, legacy) !== undefined) push('JOB-LEGACY-KEY', `${job.id}: 写了 0.2.1 已撤掉的键 ${legacy}（那会让整行报迁移错、整份预设被 UI 藏掉）`)
          }
          const cfgRaw = rowGet(row, 'config')
          if (cfgRaw instanceof Map && cfgRaw.has(FROZEN.forbiddenJobConfigKey)) push('JOB-FORBIDDEN-KEY', `${job.id}: 写了 config 键 ${FROZEN.forbiddenJobConfigKey} —— 那等于把后台参数从工具里拿掉（拍板 I1）`)
          if (disabledKind(row) !== 'none') push('JOB-DISABLED', `${job.id}: job 行必须启用（实得 disabled=${disabledKind(row)}）`)
          // ⑤ `agentPreset` 必须**真的指向补丁里存在的一份预设**（悬空引用 = 装配时那一行定不到人）
          const preset = cfg(row, 'agentPreset')
          if (typeof preset !== 'string' || preset.trim() === '') push('JOB-AGENTPRESET', `${job.id}: 缺 agentPreset（0.2.1 的组员必须指一份独立预设）`)
          else if (patchEntries !== null && !patchEntries.includes(preset)) push('JOB-AGENTPRESET', `${job.id}: agentPreset=${preset} 在补丁的预设入口里不存在（实得 ${JSON.stringify(patchEntries)}）—— 悬空引用`)
        }

        // ── officeBound 恰为 1（只剩 review；2026-10-16 两批移出见 env.mjs 那条 🔴）──
        const injRow = byId.get('persona-injector')
        const office = injRow ? cfg(injRow, 'officeBound') : null
        rec.readings.officeBound = office
        if (!Array.isArray(office) || office.length !== FROZEN.staged.officeBound) push('OFFICE-BOUND', `officeBound 必须恰为 ${FROZEN.staged.officeBound} 项，实得 ${JSON.stringify(office)}`)
        else if (JSON.stringify([...office].sort()) !== JSON.stringify([...FROZEN.staged.officeBoundRoles].sort())) {
          push('OFFICE-BOUND', `officeBound 成员实得 ${JSON.stringify([...office].sort())}，冻结 ${JSON.stringify([...FROZEN.staged.officeBoundRoles].sort())}`)
        }

        // ── 五条固定 team_* 与裸 subagent 逐字不变 ────────────────────────
        // 🔴 0.2.1：`backgroundMode` 已不是委派行的配置键 ⇒ 模式改判 `delegationTools` 那一条
        //    （`team_*` / 裸 `subagent` 一律 `continuable`，裁定 A4）；旧键写回来另报 `TEAM-LEGACY-KEY`。
        for (let i = 0; i < FROZEN.fixedTeamRowIds.length; i += 1) {
          const row = byId.get(FROZEN.fixedTeamRowIds[i])
          const toolName = FROZEN.fixedTeamTools[i]
          if (!row) { push('STAGED-TEAM-ROW', `缺固定行 ${FROZEN.fixedTeamRowIds[i]}`); continue }
          // ⚠️ 关着的那一条（`team-retro`）**不参加** 0.2.1 的三项：它不装配、不注册工具名、
          //    也没有对应的组员预设（组合 L422-424 明写"别原样打开，先迁移"）。它只参加下面
          //    `DISABLED-ROW` 那一条（关着就得一直关着）。
          const off = disabledKind(row) === 'literal-true'
          if (cfg(row, 'toolName') !== toolName) push('TEAM-TOOLNAME', `${row.id}: toolName 实得 ${JSON.stringify(cfg(row, 'toolName'))}`)
          if (cfg(row, 'maxDepth') !== FROZEN.teamMaxDepth) push('TEAM-MAXDEPTH', `${row.id}: maxDepth 必须 ${FROZEN.teamMaxDepth}`)
          if (off) continue
          if (dt === undefined || dt === null) push('TEAM-MODE', 'persona-injector 的 config 缺 delegationTools —— 后台模式没有落点（裁定 A4）')
          else if (dt[toolName] !== FROZEN.delegationTools[toolName]) push('TEAM-MODE', `${row.id}: delegationTools[${toolName}] 实得 ${JSON.stringify(dt[toolName])}，冻结 ${JSON.stringify(FROZEN.delegationTools[toolName])}`)
          if (cfg(row, 'backgroundMode') !== undefined) push('TEAM-LEGACY-KEY', `${row.id}: 写了 0.2.1 已撤掉的 backgroundMode`)
          // 固定岗位的组员预设：**等于公式**（评审 `M-4`），不只是"定得到人"。
          // 🔴 上一版只断言"`agentPreset` 在补丁的入口里存在"，于是**把 `team-design` 与 `team-dev`
          //    两行的 `agentPreset` 对调**（份数不变 · 每份行数不变 · 两份都存在）⇒ 全绿，
          //    而装配时 `team_design` 拿到 dev 的人格、`team_dev` 拿到 design 的。
          //    公式只有一份实现（`support/composition.mjs::memberPresetIdFor`，与 `roles.test.mjs` 共用）。
          const preset = cfg(row, 'agentPreset')
          const wantPreset = memberPresetIdFor(toolName)
          if (typeof preset !== 'string' || preset.trim() === '') push('TEAM-AGENTPRESET', `${row.id}: 缺 agentPreset（0.2.1 的组员必须指一份独立预设）`)
          else if (preset !== wantPreset) push('TEAM-AGENTPRESET', `${row.id}: agentPreset=${preset}，按公式（agenia-<toolName 下划线换横线>）应等于 ${wantPreset} —— 指错一份 = 装配时这个岗位拿到别人的人格`)
          else if (patchEntries !== null && !patchEntries.includes(preset)) push('TEAM-AGENTPRESET', `${row.id}: agentPreset=${preset} 在补丁的预设入口里不存在 —— 悬空引用`)
        }
        const bare = byId.get('tool-subagent')
        if (!bare) push('STAGED-ROW', '缺裸 subagent 行')
        else {
          if (dt === undefined || dt === null) push('SUBAGENT-MODE', 'persona-injector 的 config 缺 delegationTools —— 后台模式没有落点（裁定 A4）')
          else if (dt[FROZEN.bareSubagent.toolName] !== FROZEN.delegationTools[FROZEN.bareSubagent.toolName]) push('SUBAGENT-MODE', `裸 subagent 的 delegationTools 实得 ${JSON.stringify(dt[FROZEN.bareSubagent.toolName])}，冻结 ${JSON.stringify(FROZEN.delegationTools[FROZEN.bareSubagent.toolName])}`)
          if (cfg(bare, 'maxDepth') !== FROZEN.bareSubagent.maxDepth) push('SUBAGENT-MAXDEPTH', `裸 subagent 的 maxDepth 必须 ${FROZEN.bareSubagent.maxDepth}`)
          if (cfg(bare, 'backgroundMode') !== undefined) push('SUBAGENT-LEGACY-KEY', '裸 subagent 行写了 0.2.1 已撤掉的 backgroundMode')
          const preset = cfg(bare, 'agentPreset')
          // 公式同上（`M-4`）。⚠️ 外聘那一份的 id 不是 `agenia-subagent` —— 裸 `subagent` 没有自己的
          // 岗位行，它的名字是 `hire`（组合 L302 那句 `# @member-persona 【组员:hire】` 就在这一行上方）。
          const wantPreset = memberPresetIdFor(FROZEN.bareSubagent.toolName)
          if (typeof preset !== 'string' || preset.trim() === '') push('SUBAGENT-AGENTPRESET', '裸 subagent 缺 agentPreset（外聘那一份预设）')
          else if (preset !== wantPreset) push('SUBAGENT-AGENTPRESET', `裸 subagent 的 agentPreset=${preset}，外聘那一份必须叫 ${wantPreset}（公式：agenia-<名字>；裸 subagent 的岗位名是 hire）`)
          else if (patchEntries !== null && !patchEntries.includes(preset)) push('SUBAGENT-AGENTPRESET', `裸 subagent 的 agentPreset=${preset} 在补丁的预设入口里不存在 —— 悬空引用`)
        }
        // ── 🔴 `bareSubagentRows` **接活**（票 `T-TEST-06` ③）：它原来是**死常量**（`tests/**` 里零读点）──
        // 【钉什么】**已启用的行里，`toolName === 'subagent'` 的那一行恰好 1 行**。
        //   为什么这是个真判据（不是 change-detector）：`subagent` 是**裸外聘**的唯一入口，
        //   多一行来抢这个名字 ⇒ 派工分不清"外聘"与"某个岗位"（`inject.js` 的 `HIRE_TOOL` 与
        //   `job_*` 撞名就是同一类事故，见上面那段 `BOARD-LEAK`）。
        // 【怎么翻面】再插一行 `toolName: 'subagent'` ⇒ 当场红；把那一行删掉 ⇒ 也红（不是 1 了）。
        {
          const allRows = [...byId.values()]
          const namedSubagent = allRows.filter((r) => cfg(r, 'toolName') === 'subagent' && disabledKind(r) !== 'literal-true')
          rec.readings.bare_subagent_rows = namedSubagent.map((r) => r.id)
          if (namedSubagent.length !== FROZEN.staged.bareSubagentRows) {
            push('COUNT-BARE-SUBAGENT', `已启用的行里 toolName='subagent' 的实得 ${namedSubagent.length} 行（${namedSubagent.map((r) => r.id).join(', ') || '无'}），冻结 ${FROZEN.staged.bareSubagentRows} 行 —— 裸外聘的入口必须恰好一个`)
          }
        }
        for (const rowId of FROZEN.disabledSubagentRowIds) {
          const row = byId.get(rowId)
          if (!row) push('STAGED-ROW', `缺 ${rowId}（关掉 ≠ 删掉）`)
          else if (disabledKind(row) !== 'literal-true') push('DISABLED-ROW', `${rowId} 必须保持 disabled: true`)
        }

        // ── job_* 不进旧进度板认人（B2.7）────────────────────────────────
        const teamToolRe = new RegExp(FROZEN.oldBoard.teamToolRe)
        for (const job of FROZEN.jobs) {
          if (teamToolRe.test(job.toolName)) push('BOARD-LEAK', `${job.toolName} 命中旧板 TEAM_TOOL —— 四作业会污染旧五关计数`)
          if (job.toolName === FROZEN.oldBoard.hireTool) push('BOARD-LEAK', `${job.toolName} 与 HIRE_TOOL 撞名`)
        }
        if (!teamToolRe.test('team_test')) push('BOARD-CONTROL', '阳性对照失败：TEAM_TOOL 连 team_test 都不认 —— "不认 job_*"那条断言就失去意义')
        if (FROZEN.oldBoard.hireTool !== 'subagent') push('BOARD-CONTROL', '阳性对照失败：HIRE_TOOL 与裸 subagent 名不符')

        // ── 9 份角色 + 4 份作业书 ─────────────────────────────────────────
        const teamDir = stagingPath('team')
        const briefsDir = stagingPath('job-briefs')
        const teamFiles = listMd(teamDir)
        const briefFiles = listMd(briefsDir)
        rec.readings.team_files = teamFiles
        rec.readings.job_brief_files = briefFiles
        if (teamFiles === null) push('SUT-SURFACE-MISSING', `缺 ${teamDir}`)
        else {
          if (teamFiles.length !== FROZEN.staged.teamFiles) push('TEAM-FILES', `team/*.md 实得 ${teamFiles.length} 份，冻结 ${FROZEN.staged.teamFiles} 份`)
          const want = FROZEN.teamRoles.map((r) => `${r}.md`).sort()
          if (JSON.stringify([...teamFiles].sort()) !== JSON.stringify(want)) push('TEAM-FILES', `team/*.md 集合实得 ${JSON.stringify(teamFiles)}，冻结 ${JSON.stringify(want)}`)
          for (const f of teamFiles) {
            const first = readFileSync(path.join(teamDir, f), 'utf8').split(/\r?\n/)[0] ?? ''
            if (first.trim() === '') push('TEAM-FIRSTLINE', `${f} 首行是空的（名册拿它当岗位标题）`)
            if (/作业书|brief/i.test(first)) push('TEAM-FIRSTLINE', `${f} 首行含"作业书/brief" —— 那是 job-briefs 的身份，别混`)
          }
        }
        if (briefFiles === null) push('SUT-SURFACE-MISSING', `缺 ${briefsDir}`)
        else {
          if (briefFiles.length !== FROZEN.staged.jobBriefFiles) push('JOB-BRIEF-FILES', `job-briefs/*.md 实得 ${briefFiles.length} 份，冻结 ${FROZEN.staged.jobBriefFiles} 份`)
          for (const job of FROZEN.jobs) {
            const f = `${job.role}.md`
            if (!briefFiles.includes(f)) { push('JOB-BRIEF-FILES', `缺作业书 ${f}`); continue }
            const first = readFileSync(path.join(briefsDir, f), 'utf8').split(/\r?\n/)[0] ?? ''
            if (first.trim() !== `# 作业书 · ${job.role}`) push('JOB-BRIEF-FIRSTLINE', `${f} 首行必须恰为「# 作业书 · ${job.role}」（拍板 Q8），实得 ${JSON.stringify(first)}`)
          }
        }
        if (teamFiles && briefFiles) {
          // 🔴 追加裁定 v1.7 / B5：**删掉**「team/ 与 job-briefs/ basename 相交即红」那一条 ——
          //   冻结命名（§B1.3 目录图 + §B2.2 映射 + 拍板 Q8）**就是同名**（两边都有 `<role>.md`），
          //   那条断言与冻结互斥，属**断言自身缺陷**（不许给作业书改名绕过）。
          const rootMd = listMd(stagingPath('.')) ?? []
          const collideRoot = [...teamFiles, ...briefFiles].filter((f) => rootMd.includes(f))
          if (collideRoot.length > 0) push('ROLE-BRIEF-COLLIDE', `角色/作业书与根目录 .md 重名：${collideRoot.join(', ')}`)
          // 换成**真意图**：① 作业书不进 `leaderOrder`/`memberOrder`（不注入）；② 认岗位的那枚标记在哪。
          const orders = { leaderOrder: cfg(injRow, 'leaderOrder') ?? null, memberOrder: cfg(injRow, 'memberOrder') ?? null }
          rec.readings.orders = orders
          const jobRoleNames = new Set([...FROZEN.jobs.map((j) => j.role), ...FROZEN.jobs.map((j) => `${j.role}.md`)])
          for (const [key, list] of Object.entries(orders)) {
            if (!Array.isArray(list)) { push('ORDER-SHAPE', `${key} 必须是数组（拍板 Q8：作业书不注入，所以它不该出现在这里）`); continue }
            for (const entry of list) {
              const s = String(entry)
              if (/job-briefs|brief/i.test(s) || jobRoleNames.has(s)) {
                push('BRIEF-NOT-INJECTED', `${key} 里出现作业书相关项 ${JSON.stringify(s)} —— 作业书**不注入**（§B2.2 / 拍板 Q8：它由作业自己在派工时读）`)
              }
            }
          }
          // ② 「认岗位」的标记（AGENTS.md 3e ②：装配时靠 `【组员:<role>】` 认人）
          // 🔴 0.2.1：这个标记**不在委派行的 config 里了**（`persona` 已不是 `tool-subagent` 的配置键）
          //    ⇒ 现在的载体是**行上方那句注释** `# @member-persona 【组员:<role>】…`，
          //      生成器把它写成那份组员预设的 `persona.prefix` —— 装配时读的是那一份。
          //    判据钉的仍是同一件义务（"这个岗位的组员拿得到它自己的人格标记"），只是**换了落点**；
          //    与 REV-02（`roles.test.mjs:137-175`）同一口径（同一份 `memberAnnotations()`）。
          const marker = (role) => `【组员:${role}】`
          // 角色 → 它那一行：固定岗位是 `team-<role>`；作业角色是 `tool-job-<role>`；
          // **`hire` 没有自己的行** —— 它是**裸 `subagent` 那一行**（AGENTS.md 3b）。
          const rowFor = (role) => byId.get(`team-${role}`) ?? byId.get(`tool-job-${role}`) ?? (role === 'hire' ? byId.get('tool-subagent') : undefined)
          const markerRows = {}
          for (const role of FROZEN.teamRoles) {
            const row = rowFor(role)
            const persona = row ? String((ann.get(row.id) ?? {}).persona ?? '') : ''
            const teamText = teamFiles?.includes(`${role}.md`) ? readFileSync(path.join(teamDir, `${role}.md`), 'utf8') : null
            const briefText = briefFiles?.includes(`${role}.md`) ? readFileSync(path.join(briefsDir, `${role}.md`), 'utf8') : null
            markerRows[role] = {
              in_persona: persona.includes(marker(role)),
              in_team_md: teamText === null ? null : teamText.includes(marker(role)),
              team_md_has_any_marker: teamText === null ? null : /【组员:/.test(teamText),
              brief_has_any_marker: briefText === null ? null : /【组员:/.test(briefText),
            }
            if (row === undefined) push('CHARTER-MARKER', `${role} 找不到它那一行（team-${role} / tool-job-${role}${role === 'hire' ? ' / tool-subagent' : ''}）—— 认岗位的标记没有落点`)
            else if (!markerRows[role].in_persona) {
              push('CHARTER-MARKER', `${role} 那一行上方的 \`# @member-persona\` 里没有「${marker(role)}」—— 装配时认不出这个岗位（AGENTS.md 3e ② / §B1.5 deployment:persona-prefix；0.2.1 的人格载体是那句注释 → 组员预设的 persona.prefix）`)
            }
            if (markerRows[role].team_md_has_any_marker && !markerRows[role].in_team_md) {
              push('CHARTER-MARKER', `team/${role}.md 里带了**别人**的「【组员:…】」标记 —— 那会把岗位认错`)
            }
            if (markerRows[role].brief_has_any_marker) {
              push('CHARTER-MARKER', `job-briefs/${role}.md 里带了「【组员:…】」标记 —— 作业书**不带**这枚标记（它不进装配，只有角色说明书才带）`)
            }
          }
          rec.readings.role_markers = markerRows
          rec.readings.marker_note = {
            note: 'v1.7/B5 说"`team/<role>.md` 必须带 `【组员:<role>】`"；实测**只有 4 条作业角色的 .md 带**（conversation-review / memory-judge / memory-review / technical-review），5 条固定岗位 + hire 的 .md 不带 —— 它们的标记按 AGENTS.md 3e ② 住在**组员行上方那句 `# @member-persona` 注释**里（0.2.1 起的人格载体；本用例对**全部 9 个角色**都断言了这一条）。所以这里断言的是**角色级**不变量（每个角色都要有落点 + 不许串岗 + 作业书不许带），而**不是**"每个 team/*.md 都必须带" —— 后者会误伤 5 份冻结正确的说明书。要不要把 .md 那份也变成强制，请组长拍。',
          }
        }
        const teamSubdirs = listDirs(teamDir) ?? []
        if (teamSubdirs.length > 0) push('TEAM-DRAWER', `staging/team/ 下出现了目录：${teamSubdirs.join(', ')}（角色是 .md，不是常驻抽屉）`)

        // ── package.json ─────────────────────────────────────────────────
        if (requireStaged('package.json', problems)) {
          const pkg = JSON.parse(readStagedText('package.json'))
          if (!pkg.name) push('PACKAGE-JSON', 'package.json 缺 name（AGENTS.md 3a：每次请求都会失败）')
          if (!pkg.version) push('PACKAGE-JSON', 'package.json 缺 version（AGENTS.md 3a：每次请求都会失败）')
        }

        // ── 生成补丁与组合一致（不 import 生成器，见文件头）───────────────
        if (requireStaged('cordis.patch.yml', problems)) {
          const ps = patchStructuralProblems(compText, readStagedText('cordis.patch.yml'))
          rec.readings.patch = { patch_rows: ps.patchRowCount, composition_rows: ps.compositionRowCount }
          for (const p of ps.problems) push('PATCH-MISMATCH', p)
        }
      }

      caseFail(problems)
    })
  })

  test('STAT-03 派生判据源成组改（计数 / DEFAULT_OFFICE_BOUND / check-notes 换源 / 旧板 / disabled）', async () => {
    await runCase('STAT-03', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      surfaceReport(rec)

      let office = null
      if (requireStaged('agent.cordis.yml', problems)) {
        const compText = readStagedText('agent.cordis.yml')
        const rows = parseComposition(compText, 'staged').rows
        const teamFiles = listMd(stagingPath('team'))
        const jobRows = rows.filter((r) => /^job_/.test(String(cfg(r, 'toolName') ?? '')))
        const fixedRows = rows.filter((r) => FROZEN.fixedTeamRowIds.includes(r.id))
        const injRow = rows.find((r) => r.id === 'persona-injector')
        office = injRow ? cfg(injRow, 'officeBound') : null
        rec.readings.counts = {
          team_files: teamFiles ? teamFiles.length : null,
          job_rows: jobRows.length,
          fixed_team_rows: fixedRows.length,
          office_bound: Array.isArray(office) ? office.length : null,
        }
        if (!teamFiles) push('SUT-SURFACE-MISSING', '缺 staged/team/ —— 派生计数无从对账')
        else if (teamFiles.length !== FROZEN.staged.teamFiles) push('COUNT-TEAM', `team 文件实得 ${teamFiles.length}，冻结 ${FROZEN.staged.teamFiles}`)
        if (jobRows.length !== FROZEN.staged.jobRows) push('COUNT-JOB', `job 行实得 ${jobRows.length}，冻结 ${FROZEN.staged.jobRows}`)
        if (fixedRows.length !== FROZEN.staged.fixedTeamToolRows) push('COUNT-TEAM-ROW', `固定 team_* 行实得 ${fixedRows.length}，冻结 ${FROZEN.staged.fixedTeamToolRows}`)

        // ── 🔴 注入的 `.md` 文件：**名单 + 份数**（票 `T-TEST-06` ③ · 两个死常量接活之一）──────
        // 【口径】数「**配置里声明了哪几份**」（确定性 · 与盘上文件在不在无关）；
        //   不数「本回合实际注入了哪几份」（环境相关 ⇒ 归探针，票 `T-TEST-07`）。
        //   `charter` 一个 key 撑 9 个文件 · `roster`/`board`/`memory` 是**算出来的** ⇒ 0 份
        //   （那张表是 `FROZEN.staged.computedOrderKeys`，与 `docs-surface.mjs` 同源 —— 别在这儿再抄一份）。
        // 【两条一起钉才**能翻面**】加一个**算出来的**项 ⇒ 名单与份数**都不动**（绿）；
        //   加一个**真文件** ⇒ **两样都红**。只钉个数会被"一进一出"骗过去。
        {
          const NON_FILE = FROZEN.staged.computedOrderKeys
          const files = new Set()
          for (const key of ['leaderOrder', 'memberOrder']) {
            const list = injRow ? cfg(injRow, key) : null
            if (!Array.isArray(list)) { push('INJECTED-FILES', `${key} 必须是数组（拿不到就判不了"注入了哪几份"）`); continue }
            for (const entry of list) {
              if (entry === 'charter') { for (const role of FROZEN.teamRoles) files.add(`team/${role}.md`); continue }
              if (NON_FILE.includes(entry)) continue
              files.add(`${entry}.md`)
            }
          }
          const got = [...files].sort()
          const want = [...FROZEN.staged.injectedMarkdownFiles].sort()
          rec.readings.injected_markdown = { files: got, count: got.length, frozen_count: FROZEN.staged.injectedMarkdownClasses }
          if (got.length !== FROZEN.staged.injectedMarkdownClasses) {
            push('COUNT-INJECTED-MD', `会被注入的 .md 文件实得 ${got.length} 份，冻结 ${FROZEN.staged.injectedMarkdownClasses} 份 —— 名单：${got.join(', ')}`)
          }
          if (JSON.stringify(got) !== JSON.stringify(want)) {
            const only = got.filter((f) => !want.includes(f))
            const missing = want.filter((f) => !got.includes(f))
            push('INJECTED-MD-LIST', `会被注入的 .md **名单**对不上：多出 ${JSON.stringify(only)} · 缺 ${JSON.stringify(missing)}（⚠️ 加一个"算出来的"项**不该**动这份名单；动了就说明它被算成了文件）`)
          }
        }
        if (!Array.isArray(office) || office.length !== FROZEN.staged.officeBound) push('COUNT-OFFICE', `officeBound 实得 ${JSON.stringify(office)}，冻结 ${FROZEN.staged.officeBound} 项`)

        // disabled 有效行数：注释里那个 `disabled: true` 不许被算进去（AGENTS.md 3b 记过这个坑）
        const rawText = readStagedText('agent.cordis.yml')
        const stripped = rawText.split(/\r?\n/).filter((l) => !l.trimStart().startsWith('#')).join('\n')
        const literalRows = rows.filter((r) => disabledKind(r) === 'literal-true')
        rec.readings.disabled = {
          naive_text_count: (rawText.match(/disabled:\s*true/g) ?? []).length,
          comment_stripped_text_count: (stripped.match(/disabled:\s*true/g) ?? []).length,
          parsed_rows: literalRows.map((r) => r.id),
        }
        if (literalRows.length !== FROZEN.staged.disabledLiteralRows) push('DISABLED-COUNT', `disabled: true 有效行实得 ${literalRows.length}，冻结 ${FROZEN.staged.disabledLiteralRows}`)
        if (rec.readings.disabled.comment_stripped_text_count !== literalRows.length) push('DISABLED-COUNT', `裸文本计数（剔注释）${rec.readings.disabled.comment_stripped_text_count} ≠ 解析行数 ${literalRows.length}`)
        if (rec.readings.disabled.naive_text_count !== literalRows.length) {
          rec.readings.disabled.note = 'naive 计数（含注释）与有效行数不同 —— 这正是 AGENTS.md 3b 记的那个坑，检查脚本必须剔注释'
        }

        // DEFAULT_OFFICE_BOUND 与 yml 一致 + 旧板正则
        if (requireStaged('inject.js', problems)) {
          const src = readStagedText('inject.js')
          const m = /DEFAULT_OFFICE_BOUND\s*=\s*\[([^\]]*)\]/.exec(src)
          if (!m) push('DEFAULT-OFFICE-BOUND', 'staged/inject.js 里找不到 DEFAULT_OFFICE_BOUND 字面量（P2-V6 的残余项）')
          else {
            const got = m[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
            rec.readings.default_office_bound = got
            if (JSON.stringify([...got].sort()) !== JSON.stringify([...(office ?? [])].sort())) {
              push('DEFAULT-OFFICE-BOUND', `DEFAULT_OFFICE_BOUND=${JSON.stringify(got)} 与 yml 的 officeBound=${JSON.stringify(office)} 不一致（配置缺失时 fallback 与 yml 分叉）`)
            }
          }
          const tm = /TEAM_TOOL\s*=\s*(\/[^\n]*?\/)/.exec(src)
          const hm = /HIRE_TOOL\s*=\s*(['"][^'"]+['"])/.exec(src)
          if (!tm) push('BOARD-REGEX', 'staged/inject.js 里找不到 TEAM_TOOL 正则')
          else {
            const re = new RegExp(tm[1].slice(1, -1))
            for (const job of FROZEN.jobs) if (re.test(job.toolName)) push('BOARD-LEAK', `${job.toolName} 命中旧板 TEAM_TOOL`)
            if (!re.test('team_test')) push('BOARD-CONTROL', '阳性对照失败：staged 的 TEAM_TOOL 连 team_test 都不认')
          }
          if (!hm) push('BOARD-REGEX', 'staged/inject.js 里找不到 HIRE_TOOL')
          else {
            const hire = hm[1].slice(1, -1)
            for (const job of FROZEN.jobs) if (hire === job.toolName) push('BOARD-LEAK', `HIRE_TOOL 与 ${job.toolName} 撞名`)
            if (hire !== 'subagent') push('BOARD-CONTROL', `阳性对照失败：staged 的 HIRE_TOOL=${hire} 不是裸 subagent 名`)
          }
        }
      }

      // ── 工具侧静态扫描 ─────────────────────────────────────────────────
      const checkNotes = readFileSync(PATHS.checkNotes, 'utf8')
      rec.readings.check_notes_bytes = checkNotes.length
      for (const job of FROZEN.jobs) {
        if (!checkNotes.includes(job.id)) push('CHECKNOTES-JOB', `check-notes.mjs 里没有 ${job.id} —— onlyInAgenia 的期望没跟着 4 条 job 行走`)
      }
      for (const role of ['memory-review', 'conversation-review']) {
        if (!checkNotes.includes(role)) push('CHECKNOTES-OFFICE', `check-notes.mjs 里没有 ${role} —— officeBound 的期望没扩到 4 个`)
      }
      if (!checkNotes.includes('job-briefs')) push('CHECKNOTES-BRIEFS', 'check-notes.mjs 里没有 job-briefs —— 新目录没进派生检查')
      if (!checkNotes.includes('_staging')) push('CHECKNOTES-ORACLE', 'check-notes.mjs 里没有 _staging —— standard oracle 还是老来源（拍板 I3：换到 desktop 固定来源，找不到就红，不许静默回落）')
      const oracleLines = checkNotes.split(/\r?\n/).filter((l) => l.includes('standard.patch.yml') && !/^\s*(\/\/|\*|#)/.test(l))
      rec.readings.check_notes_oracle_lines = oracleLines.map((l) => l.trim().slice(0, 160))
      for (const l of oracleLines) {
        if (/Roaming|_npx|npm-cache/i.test(l)) push('CHECKNOTES-ORACLE', `check-notes.mjs 仍在用退役 web 路径找 oracle：${l.trim().slice(0, 160)}`)
      }
      if (oracleLines.length === 0) push('CHECKNOTES-ORACLE', 'check-notes.mjs 里没有一行非注释代码在解析 standard.patch.yml —— 无法确认 oracle 来源')
      // 旧口径的三处字面量：改过之后必须消失
      const mustBeGone = [
        ['onlyAge.length, 6', 'onlyInAgenia 的期望项数还是 6'],
        ['ymlRoles.length === fixed.length', '"team 文件数 == team_* 行数"这条一一对应还在（B2.5 ② 要求换成 5 固定 + 1 hire + 4 job 的分组断言）'],
        ['正好是 review + retro', 'officeBound 的期望还写着"正好是 review + retro"'],
        ['files.length, 6', 'team/ 说明书份数的期望还是 6'],
      ]
      rec.readings.check_notes_must_be_gone = mustBeGone.map(([needle]) => ({ needle, present: checkNotes.includes(needle) }))
      for (const [needle, why] of mustBeGone) if (checkNotes.includes(needle)) push('CHECKNOTES-STALE', `check-notes.mjs 里还留着旧口径：${why}`)

      const probe = readFileSync(PATHS.injectProbe, 'utf8')
      // 🔴 2026-10-20（`F-112`）：第三个标记原来是 `subagent 后台硬门未生效` —— 那句话在 0.2.1 的注入器里
      //    **已经不存在**（现在的告警是「没有 tools.guard …… 没有生效 / 没挂上」）⇒ 拿死话当"探针里有没有
      //    这一族"的标记，只会把判据变成常驻红。
      // 🔴 2026-10-20（第 4 关 `N-2`）：也不能只钉 `没有 tools.guard` —— 这串字在探针里同时出现在
      //    `§硬门` 口径原文、GD10 的注释里 ⇒ 把断言整段删掉它照样绿（`mig-rules-13`：静态判据连注释一起抠）。
      //    第三个标记钉的是**断言那一行本身**（`silence.includes('没有 tools.guard')`，只在 GD10 的条件里出现），
      //    删断言 ⇒ 红；只留口径/注释 ⇒ 也红。
      const markers = [
        'subagentBackgroundVerdict',
        '必须后台运行',
        "silence.includes('没有 tools.guard')",
      ]
      for (const marker of markers) {
        if (!probe.includes(marker)) push('PROBE-GUARD', `inject-probe.mjs 里没有 ${marker} —— 新的 guard 断言族（G*）还没加`)
      }

      const gen = readFileSync(PATHS.generator, 'utf8')
      if (!gen.includes(FROZEN.patchTargets.injectorUrl)) push('GENERATOR-PATH', `生成器里没写死冻结的 injector 行名 ${FROZEN.patchTargets.injectorUrl}`)
      if (!gen.includes(FROZEN.patchTargets.contentDir)) push('GENERATOR-PATH', `生成器里没写死冻结的 contentDir ${FROZEN.patchTargets.contentDir}`)

      caseFail(problems)
    })
  })

  test('STAT-05 枚举全部具名委派实例 + guard 名单对齐 + 第 11 条委派行必须让检查变红', async () => {
    await runCase('STAT-05', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      surfaceReport(rec)
      const expected = [...FROZEN.enabledFixedTeamTools, FROZEN.bareSubagent.toolName, ...FROZEN.jobs.map((j) => j.toolName)].sort()
      rec.readings.expected_delegations = expected

      // ① 组合侧枚举（被测对象：staged）
      let compText = null
      if (requireStaged('agent.cordis.yml', problems)) {
        compText = readStagedText('agent.cordis.yml')
        const rows = parseComposition(compText, 'staged').rows
        const enumerated = delegationToolNames(rows)
        rec.readings.enumerated = enumerated
        if (enumerated.length !== FROZEN.staged.enabledNamedDelegations) push('DELEGATION-COUNT', `已启用具名委派实得 ${enumerated.length} 个，冻结 ${FROZEN.staged.enabledNamedDelegations} 个`)
        if (JSON.stringify(enumerated) !== JSON.stringify(expected)) push('DELEGATION-SET', `枚举集合实得 ${JSON.stringify(enumerated)}，冻结 ${JSON.stringify(expected)}`)
        const opened = enabledDelegations(rows).filter((r) => /fork|codex|claude/.test(String(cfg(r, 'toolName') ?? '')))
        if (opened.length > 0) push('DELEGATION-DISABLED', `有本该关着的子代理行被打开：${opened.map((r) => cfg(r, 'toolName')).join(', ')}`)
      }

      // ② `delegationTools` 单一形状对账（**裁定 A4**：只有这一种形状，不做三候选试探）
      //    `config` = `persona-injector` 那一行的 config（`apply(ctx, config)` 收到的就是它），
      //    `delegationTools` 是它新增的必填键：键 = 工具名，值 = one-shot | continuable。
      let compRows = null
      if (compText !== null) compRows = parseComposition(compText, 'staged').rows
      if (compRows === null) {
        push('SUT-SURFACE-MISSING', 'staged 组合不在 ⇒ `delegationTools` 的对账无从做起（预期红）')
      } else {
        const injRow = compRows.find((r) => r.id === 'persona-injector')
        const injConfig = injRow && injRow.config instanceof Map ? plain(injRow.config) : null
        const dt = injConfig ? injConfig[FROZEN.delegationToolsKey] : undefined
        rec.readings.delegation_tools = dt ?? null
        if (injConfig === null) push('DELEGATION-TOOLS', 'staged 组合里找不到 persona-injector 行（或它没有 config 映射）')
        else if (dt === undefined || dt === null) push('DELEGATION-TOOLS', `persona-injector 的 config 缺必填键 ${FROZEN.delegationToolsKey}（裁定 A4）`)
        else if (typeof dt !== 'object' || Array.isArray(dt)) push('DELEGATION-TOOLS', `${FROZEN.delegationToolsKey} 必须是"工具名 → one-shot|continuable"的映射，实得 ${JSON.stringify(dt)?.slice(0, 120)}`)
        else {
          const keys = Object.keys(dt).sort()
          const enumerated = rec.readings.enumerated ?? []
          if (JSON.stringify(keys) !== JSON.stringify(expected)) {
            push('DELEGATION-TOOLS-KEYS', `${FROZEN.delegationToolsKey} 的键集合实得 ${JSON.stringify(keys)}，必须**严格等于**组合里已启用的 ${FROZEN.staged.enabledNamedDelegations} 个具名实例 ${JSON.stringify(expected)}（裁定 A4 第 4 条：多一个/少一个都红）`)
          }
          // 值必须与**这一行是什么**一致（否则 guard 会按错的模式放行/拒绝）。
          // 🔴 0.2.1：`backgroundMode` 这个配置键已经不存在了 ⇒ 原来那句"与 yml 的 backgroundMode 比"
          //    没有第二个来源可对（两边都是它自己 ⇒ 同义反复）。换成的口径是**从行身份推**：
          //    `job_*` 是一次性后台作业 ⇒ `one-shot`；`team_*` / 裸 `subagent` 是常驻/可续 ⇒ `continuable`。
          //    这条能翻面：把 `job_memory_judge` 写成 `continuable`（或把一行 team 写成 one-shot）⇒ 红。
          //    ⚠️ **代价认下来**：0.2.1 起模式没有"第二个来源"可交叉核对了；A4 冻结表 + 行身份
          //    这两条已经是能拿到的最强一对（这一点已写进交接页，请组长决定要不要再加一处落点）。
          const modeMismatch = []
          for (const row of enabledDelegations(compRows)) {
            const name = cfg(row, 'toolName') ?? row.id
            const want = /^job_/.test(String(name)) ? 'one-shot' : 'continuable'
            if (dt[name] !== want) modeMismatch.push(`${name}: delegationTools=${JSON.stringify(dt[name])} vs 由行身份推出的 ${JSON.stringify(want)}（job_* = one-shot；team_*/subagent = continuable）`)
            if (cfg(row, 'backgroundMode') !== undefined) modeMismatch.push(`${name}: 行上又写了 0.2.1 已撤掉的 backgroundMode —— 模式只许在 ${FROZEN.delegationToolsKey} 一处`)
          }
          rec.readings.delegation_mode_mismatch = modeMismatch
          if (modeMismatch.length > 0) push('DELEGATION-TOOLS-MODE', `delegationTools 的值与组合里那一行的 backgroundMode 不符：${modeMismatch.join('；')}`)
          // 与冻结表逐项相等（job_* 一律 one-shot，team_*/subagent 一律 continuable）
          const frozenMismatch = Object.entries(FROZEN.delegationTools).filter(([k, v]) => dt[k] !== v)
          if (frozenMismatch.length > 0) push('DELEGATION-TOOLS-MODE', `与裁定 A4 冻结表不符：${frozenMismatch.map(([k, v]) => `${k} 应为 ${v}`).join('；')}`)
        }

        // guard 的命名导出：`delegationToolNames(config)` 只吃这一种 shape
        if (stagingExists('inject.js')) {
          const mod = await importStaged('inject.js')
          const fn = mod.delegationToolNames
          if (typeof fn !== 'function') push('SUT-SURFACE-MISSING', 'staged/inject.js 没有导出 delegationToolNames（拍板 Q1 冻了命名 export）')
          else if (injConfig !== null) {
            let guardNames = null
            try {
              guardNames = fn(injConfig)
            } catch (err) {
              push('GUARD-CALL', `delegationToolNames(persona-injector 的 config) 抛错：${String(err.message).slice(0, 200)}`)
            }
            if (guardNames !== null && !Array.isArray(guardNames)) push('GUARD-CALL', `delegationToolNames 必须返回数组（键升序去重），实得 ${typeof guardNames}`)
            else if (Array.isArray(guardNames)) {
              rec.readings.guard_names = [...guardNames].sort()
              const cov = guardCoverageProblems(rec.readings.enumerated ?? [], guardNames)
              rec.readings.coverage = cov
              if (cov.uncovered.length > 0) push('GUARD-UNCOVERED', `guard 名单漏了：${cov.uncovered.join(', ')}`)
              if (cov.extra.length > 0) push('GUARD-EXTRA', `guard 名单多了：${cov.extra.join(', ')}`)
            }
          }
        } else {
          push('SUT-SURFACE-MISSING', 'staged/inject.js 不在 ⇒ guard 名单拿不到（预期红）')
        }
      }

      // ③ 变异测试：往**测试副本**里插第 11 条委派行 ⇒ 判据必须翻面。
      //    基底是活体组合的**只读副本**（枚举器的阳性对照），**不是**被测对象。
      const liveText = readFileSync(PATHS.liveComposition, 'utf8')
      const mutated = liveText.replace(
        /^(    - id: team-retro\n)/m,
        `    - id: tool-job-bonus\n      name: '@deepseek-ai/dsh-tool-subagent'\n      config:\n        provider: spawn\n        toolName: job_bonus\n        backgroundMode: one-shot\n        maxDepth: 1\n$1`,
      )
      if (mutated === liveText) push('MUTATION-CONTROL', '变异没插进去（锚点 team-retro 没匹配到）—— 这条控制就白跑了')
      const mutCopy = writeFixtureText('stat-05', 'mutated-composition', mutated, 'yml')
      const mutNames = delegationToolNames(parseComposition(readFileSync(mutCopy, 'utf8'), 'mutated').rows)
      rec.readings.mutation = { copy: mutCopy, enumerated: mutNames }
      const mutCov = guardCoverageProblems(mutNames, expected)
      if (mutCov.uncovered.length !== 1 || mutCov.uncovered[0] !== 'job_bonus') {
        push('MUTATION-CONTROL', `插入第 11 条委派行后，判据应当报出恰好 job_bonus 未覆盖；实得 uncovered=${JSON.stringify(mutCov.uncovered)}`)
      }
      const baseCov = guardCoverageProblems(delegationToolNames(parseComposition(liveText, 'live-control').rows), expected)
      rec.readings.control = baseCov
      if (baseCov.uncovered.length !== 0) push('MUTATION-CONTROL', `阳性对照失败：活体副本（未变异）的委派集合与冻结集合对不上：${JSON.stringify(baseCov)}`)

      // ④ 结构保证的范围必须诚实（拍板 I7）
      if (requireStaged('work-guidelines.md', problems)) {
        const wg = readStagedText('work-guidelines.md')
        rec.readings.wg_mentions_workflow = /workflow|ralph/.test(wg)
        if (!/workflow|ralph/.test(wg)) push('SCOPE-HONESTY', 'work-guidelines.md 没提 workflow/ralph 在不在结构保证内（拍板 I7：禁止说"所有委派路径都拦住了"）')
      }

      // ⑤ 退出码表：**重叠集一致性**（v1.11 ④）
      //    隐患：`FROZEN.exitCodes` 被当成期望值用；缺码时"查不到期望 ⇒ 不报错"——**静默空过比红更坏**。
      //    口径：重叠部分的码值必须**逐项相同**；实现多出的码**只记读数**（`impl_only`），**不当失败**。
      {
        const codesLib = await loadStagedModule('lib/error-codes.mjs', ['CODES'])
        rec.readings.exit_codes_lib = { surfaceMissing: codesLib.surfaceMissing, errors: codesLib.errors }
        if (codesLib.surfaceMissing) {
          push('SUT-SURFACE-MISSING', 'staged/lib/error-codes.mjs 不在 ⇒ 退出码表无从对账（预期的首跑红）')
        } else {
          const table = codesLib.mod?.CODES ?? {}
          const impl = {}
          for (const [k, v] of Object.entries(table)) impl[k] = v?.exit
          const mine = FROZEN.exitCodes
          const overlap = Object.keys(mine).filter((k) => k in impl)
          const mismatch = overlap.filter((k) => mine[k] !== impl[k])
          const implOnly = Object.keys(impl).filter((k) => !(k in mine)).sort()
          const mineOnly = Object.keys(mine).filter((k) => !(k in impl)).sort()
          rec.readings.exit_codes = {
            mine_count: Object.keys(mine).length,
            impl_count: Object.keys(impl).length,
            overlap: overlap.length,
            consistent: overlap.length - mismatch.length,
            mismatched: mismatch.map((k) => ({ code: k, mine: mine[k], impl: impl[k] })),
            /** 实现多出来的码 —— **只记读数**（实现先长出来是正常的）。 */
            impl_only: implOnly,
            /** 我有、实现没有的 —— 也记读数（可能是我抄多了，也可能实现还没用到）。 */
            mine_only: mineOnly,
          }
          if (Object.keys(impl).length === 0) {
            // 自控：读不到码表时**不许静默通过**（"查不到期望 ⇒ 不报错"正是这条要防的）
            push('EXIT-CODE-EMPTY', 'staged/lib/error-codes.mjs 的 `CODES` 读出来是空的 —— 这条对账会变成空转，必须红')
          }
          for (const k of mismatch) {
            push('EXIT-CODE-MISMATCH', `退出码 ${k}：冻结表 ${mine[k]}，实现表 ${impl[k]} —— 两张表**重叠部分必须逐项相同**（值以实现表为准改冻结表，或回组长裁定）`)
          }
        }
      }

      caseFail(problems)
    })
  })
})
