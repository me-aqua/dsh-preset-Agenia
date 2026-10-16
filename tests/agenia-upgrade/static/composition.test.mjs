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
  multisetDiff,
  parseComposition,
  patchStructuralProblems,
  plain,
  rowGet,
} from '../support/composition.mjs'
import { caseFail, normalizeSha, oracleReadings, preflight, problem, runCase, sha256Equal, stagedVsLiveDrift, stagingReadings } from '../support/evidence.mjs'
import { importStaged, loadStagedModule, readStagedText, stagingExists, stagingPath, writeFixtureText } from '../support/sut.mjs'

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
        if (drift.staged === null) {
          push('STAGED-LIVE-DRIFT', '`AGENIA_STAGING_PRESET` 没设 ⇒ 两棵树比不了（这一格判不了，不许当绿）')
        } else if (!drift.same) {
          const parts = []
          if (drift.only_staged.length > 0) parts.push(`只在 staged：${drift.only_staged.join(', ')}`)
          if (drift.only_live.length > 0) parts.push(`只在活体：${drift.only_live.join(', ')}`)
          if (drift.different.length > 0) parts.push(`同名而内容不同：${drift.different.join(', ')}`)
          push('STAGED-LIVE-DRIFT',
            '**staged 与活体不是同一棵树**（测试的靶子 ≠ 生产）⇒ 这一跑的绿**不能**用来给活体背书：'
            + `${parts.join(' · ')}（staged ${drift.staged_files} 文件 ${drift.staged} · 活体 ${drift.live_files} 文件 ${drift.live}）`
            + '。修法：把改过的文件同步进 staging（**各人同步自己改的**），别靠人记得。')
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
        for (const job of FROZEN.jobs) {
          const row = byId.get(job.id)
          if (!row) { push('STAGED-JOB-ROW', `缺 job 行 ${job.id}`); continue }
          if (rowGet(row, 'name') !== '@deepseek-ai/dsh-tool-subagent') push('JOB-NAME', `${job.id}: name 实得 ${JSON.stringify(rowGet(row, 'name'))}`)
          if (cfg(row, 'provider') !== FROZEN.jobProvider) push('JOB-PROVIDER', `${job.id}: provider 实得 ${JSON.stringify(cfg(row, 'provider'))}，冻结 ${FROZEN.jobProvider}`)
          if (cfg(row, 'toolName') !== job.toolName) push('JOB-TOOLNAME', `${job.id}: toolName 实得 ${JSON.stringify(cfg(row, 'toolName'))}，冻结 ${job.toolName}`)
          if (cfg(row, 'toolName') !== `job_${job.role.replace(/-/g, '_')}`) push('JOB-TOOLNAME', `${job.id}: toolName 必须 = job_<role 下划线形式>`)
          if (cfg(row, 'backgroundMode') !== FROZEN.jobBackgroundMode) push('JOB-BGMODE', `${job.id}: backgroundMode 实得 ${JSON.stringify(cfg(row, 'backgroundMode'))}，冻结 ${FROZEN.jobBackgroundMode}`)
          if (cfg(row, 'maxDepth') !== FROZEN.jobMaxDepth) push('JOB-MAXDEPTH', `${job.id}: maxDepth 实得 ${JSON.stringify(cfg(row, 'maxDepth'))}，冻结 ${FROZEN.jobMaxDepth}`)
          const persona = cfg(row, 'persona')
          if (typeof persona !== 'string' || !persona.startsWith(`【组员:${job.role}】`)) push('JOB-PERSONA', `${job.id}: persona 必须以 【组员:${job.role}】 开头，实得 ${JSON.stringify(persona)?.slice(0, 80)}`)
          const tf = cfg(row, 'toolFilter')
          const deny = tf instanceof Map ? tf.get('deny') : undefined
          if (JSON.stringify(deny) !== JSON.stringify(FROZEN.jobToolFilterDeny)) push('JOB-TOOLFILTER', `${job.id}: toolFilter.deny 必须恰为 ${JSON.stringify(FROZEN.jobToolFilterDeny)}，实得 ${JSON.stringify(deny)}`)
          const cfgRaw = rowGet(row, 'config')
          if (cfgRaw instanceof Map && cfgRaw.has(FROZEN.forbiddenJobConfigKey)) push('JOB-FORBIDDEN-KEY', `${job.id}: 写了 config 键 ${FROZEN.forbiddenJobConfigKey} —— 那等于把后台参数从工具里拿掉（拍板 I1）`)
          if (disabledKind(row) !== 'none') push('JOB-DISABLED', `${job.id}: job 行必须启用（实得 disabled=${disabledKind(row)}）`)
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
        for (let i = 0; i < FROZEN.fixedTeamRowIds.length; i += 1) {
          const row = byId.get(FROZEN.fixedTeamRowIds[i])
          const toolName = FROZEN.fixedTeamTools[i]
          if (!row) { push('STAGED-TEAM-ROW', `缺固定行 ${FROZEN.fixedTeamRowIds[i]}`); continue }
          if (cfg(row, 'toolName') !== toolName) push('TEAM-TOOLNAME', `${row.id}: toolName 实得 ${JSON.stringify(cfg(row, 'toolName'))}`)
          if (cfg(row, 'backgroundMode') !== FROZEN.teamBackgroundMode) push('TEAM-BGMODE', `${row.id}: backgroundMode 必须 ${FROZEN.teamBackgroundMode}`)
          if (cfg(row, 'maxDepth') !== FROZEN.teamMaxDepth) push('TEAM-MAXDEPTH', `${row.id}: maxDepth 必须 ${FROZEN.teamMaxDepth}`)
        }
        const bare = byId.get('tool-subagent')
        if (!bare) push('STAGED-ROW', '缺裸 subagent 行')
        else {
          if (cfg(bare, 'backgroundMode') !== FROZEN.bareSubagent.backgroundMode) push('SUBAGENT-BGMODE', `裸 subagent 必须 ${FROZEN.bareSubagent.backgroundMode}`)
          if (cfg(bare, 'maxDepth') !== FROZEN.bareSubagent.maxDepth) push('SUBAGENT-MAXDEPTH', `裸 subagent 的 maxDepth 必须 ${FROZEN.bareSubagent.maxDepth}`)
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
          // ② 「认岗位」的标记（AGENTS.md 3e ②：组员行的 `persona` 以 `【组员:<role>】` 开头，装配时靠它认人）
          const marker = (role) => `【组员:${role}】`
          // 角色 → 它那一行：固定岗位是 `team-<role>`；作业角色是 `tool-job-<role>`；
          // **`hire` 没有自己的行** —— 它是**裸 `subagent` 那一行**上多出来的那个 `persona` 键（AGENTS.md 3b）。
          const rowFor = (role) => byId.get(`team-${role}`) ?? byId.get(`tool-job-${role}`) ?? (role === 'hire' ? byId.get('tool-subagent') : undefined)
          const markerRows = {}
          for (const role of FROZEN.teamRoles) {
            const row = rowFor(role)
            // ⚠️ `persona` 住在**行下面的 `config:`** 里（不是行自身的键）⇒ 用 `cfg()`，不是 `rowGet()`。
            const persona = row ? String(cfg(row, 'persona') ?? '') : ''
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
              push('CHARTER-MARKER', `${role} 的组员行 persona 里没有「${marker(role)}」—— 装配时认不出这个岗位（AGENTS.md 3e ② / §B1.5 deployment:persona-prefix）`)
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
            note: 'v1.7/B5 说"`team/<role>.md` 必须带 `【组员:<role>】`"；实测**只有 4 条作业角色的 .md 带**（conversation-review / memory-judge / memory-review / technical-review），5 条固定岗位 + hire 的 .md 不带 —— 它们的标记按 AGENTS.md 3e ② 住在**组员行的 `persona`** 里（本用例对**全部 10 个角色**都断言了这一条）。所以这里断言的是**角色级**不变量（每个角色都要有落点 + 不许串岗 + 作业书不许带），而**不是**"每个 team/*.md 都必须带" —— 后者会误伤 6 份冻结正确的说明书。要不要把 .md 那份也变成强制，请组长拍。',
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
        //   `charter` 一个 key 撑 9 个文件 · `roster`/`board`/`memory` 是**算出来的** ⇒ 0 份。
        // 【两条一起钉才**能翻面**】加一个**算出来的**项 ⇒ 名单与份数**都不动**（绿）；
        //   加一个**真文件** ⇒ **两样都红**。只钉个数会被"一进一出"骗过去。
        {
          const NON_FILE = ['roster', 'board', 'memory']
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
      for (const marker of ['subagentBackgroundVerdict', '必须后台运行', 'subagent 后台硬门未生效']) {
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
          // 值必须与组合里那一行的 backgroundMode 一致（否则 guard 会按错的模式放行/拒绝）
          const modeMismatch = []
          for (const row of enabledDelegations(compRows)) {
            const name = cfg(row, 'toolName') ?? row.id
            const want = cfg(row, 'backgroundMode')
            if (dt[name] !== want) modeMismatch.push(`${name}: delegationTools=${JSON.stringify(dt[name])} vs yml backgroundMode=${JSON.stringify(want)}`)
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
