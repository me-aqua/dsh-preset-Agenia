/**
 * STO-01 / STO-02 / STO-03 / STO-04 —— 存储 / 锁 / 事务 / claim（集成层）。
 *
 * 冻结依据：契约 §6.3 + 提案 §B1.4（`agenia-brain.mjs` / `agenia-local.mjs` 的 op/payload/退出码）
 * + §B3.6（`state/update` · `state/jobs` · `local-state` 的 schema）+ §B3.7（原子写 / 独占锁 / CAS / 审计）
 * + §B1.6（**真子进程**：不许用"同进程两次调用"冒充并发；时钟用 `AGENIA_NOW_FILE`）
 * + 追加裁定 v1.3（`E_DATA_EXISTS` ⇒ exit 7；并发/锁/CAS ⇒ 4；状态不变量 ⇒ 6）。
 *
 * 三条纪律：
 *   · 锁 / CAS / 审计 / 路径校验 **一律不许 mock**（契约 §9.5 第 4 条）；
 *   · 并发必须是**两个真进程**（`runCliAsync`）；
 *   · 故障注入只用**真文件系统事实**（例如把目标文件的位置先占成目录 ⇒ 写入必失败），
 *     不发明"注入开关"那类接口。
 */
import { before, describe, test } from 'node:test'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ENV, FROZEN } from '../support/env.mjs'
import { caseFail, caseHold, preflight, problem, runCase, sha256File, stagingReadings, treeHash, writeJson } from '../support/evidence.mjs'
import { canonical, ensureMarkedDir } from '../support/root-guard.mjs'
import { brainPaths, countJsonlLines, runBrain, runCli, runCliAsync, runLocal, stagingExists, writeFixture } from '../support/sut.mjs'

before(() => {
  preflight()
})

/** 起 staged 的 CLI（缺面就返回一个等价的"缺面"结果，不抛 —— 这条用例还有别的断言要收）。 */
const runCliSoft = (cli, opts) => {
  try {
    return runCli(cli, opts, { env: process.env })
  } catch (err) {
    return { exit_code: null, json: { error: { code: err?.code ?? 'THREW' } }, stdout: '', stderr: String(err.message) }
  }
}

const DAY = '2026-10-14'

/**
 * 每例一个带 marker 的**空**脑根（D-B3：`init` 只在空根成功）。
 *
 * 🔴 "空"要由这一格自己保证：同一个 RUN_ID 连跑第二次时，上一跑 `init` 过的那一棵还在，
 * 本跑的 `init` 会直接 `E_DATA_EXISTS`（→ STO01/02/03-INIT 三条假红）。⇒ 开跑前清掉这一棵
 * （只清这一格自己那一个目录，marker 随后由 `ensureMarkedDir` 重建）。
 */
function caseBrainRoot(id, name) {
  const runRoot = canonical(process.env[ENV.RUN_ROOT])
  const dir = path.join(runRoot, `brain-${id.toLowerCase()}-${name}`)
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  const root = ensureMarkedDir(dir, {
    runRoot,
    runId: path.basename(runRoot),
    kind: 'agenia-test-brain-root',
  })
  return brainPaths({ ...process.env, [ENV.TEST_DATA_ROOT]: root })
}

/** 每例一个带 marker 的工作区（路线/本地状态的家）。 */
function caseWorkspace(id, name) {
  const runRoot = canonical(process.env[ENV.RUN_ROOT])
  return ensureMarkedDir(path.join(runRoot, `ws-${id.toLowerCase()}-${name}`), {
    runRoot,
    runId: path.basename(runRoot),
    kind: 'agenia-test-workspace',
  })
}

/**
 * 同 `caseWorkspace`，但**先把它自己那块本地状态清干净**。
 *
 * 为什么要有这一条：同一个 RUN_ID 连跑第二次时，上一跑留在 `<ws>\.team\state\local\` 里的
 * 状态会让下一跑的前置直接 `E_CLAIM_HELD`（"这一场已经 claim 过了"）—— 那不是被测对象坏了，
 * 是这一格没把自己的现场建干净。⇒ 每跑一次都从零开始（只清这一格自己的那一个子目录，
 * 工作区 marker 与 `.team` 其余部分一律不动）。
 */
function freshWorkspace(id, name) {
  const ws = caseWorkspace(id, name)
  const localDir = path.join(ws, '.team', 'state', 'local')
  if (existsSync(localDir)) rmSync(localDir, { recursive: true, force: true })
  return ws
}

const requireBrain = (problems, why) => {
  if (stagingExists('bin/agenia-brain.mjs')) return true
  problems.push(problem('SUT-SURFACE-MISSING', `staged/bin/agenia-brain.mjs 不在 ⇒ ${why} 拿不到（预期的首跑红）`))
  return false
}
const requireLocal = (problems, why) => {
  if (stagingExists('bin/agenia-local.mjs')) return true
  problems.push(problem('SUT-SURFACE-MISSING', `staged/bin/agenia-local.mjs 不在 ⇒ ${why} 拿不到（预期的首跑红）`))
  return false
}
const requireNotify = (problems, why) => {
  if (stagingExists('bin/bg-notify.mjs')) return true
  problems.push(problem('SUT-SURFACE-MISSING', `staged/bin/bg-notify.mjs 不在 ⇒ ${why} 拿不到（预期的首跑红）`))
  return false
}

/** 读一个 JSON 文件；读不到就返回 null（不抛）。 */
const readJson = (file) => {
  try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return null }
}

/**
 * 一个 JSONL 的"有没有被动过"三件套：**sha256 + 字节数 + 非空行数**（T-MEM-07 · V8）。
 *
 * 🔴 只比行数不够：追加一行再改另一行，行数照样对得上。三样一起钉，任一维度动了都翻面；
 * 文件不存在时三样都 `null` + `exists:false`（"从来没有索引"与"索引被清空"必须分得开）。
 */
const fileFactsOf = (file) => {
  try {
    const buf = readFileSync(file)
    return {
      exists: true,
      bytes: buf.length,
      rows: buf.toString('utf8').split(/\r?\n/).filter((l) => l.trim() !== '').length,
      sha256: sha256File(file),
    }
  } catch {
    return { exists: false, bytes: null, rows: null, sha256: null }
  }
}

/**
 * 把这一天的本地状态**垫大**（STO-04 ① 的夹具；为什么要垫见那个用例里那段注释）。
 *
 * 只做一件事：往状态级的 `imported_proposal_ids` 里堆历史 id。挑这个键的理由有两条 ——
 * ① 它是 `emptyLocalState()` 自己产出的；② 每次写回都是 `{...state}` 展开，**一定**被保留。
 * ⇒ 垫进去的字节会跟着每一次读-改-写一起被读、被写，于是那次读-改-写被拉长。
 *
 * 🔴 垫的**不是**被测对象该有的样子，是**夹具**：形状仍由被测对象自己校验
 *    （垫坏了它会当场 `E_DATA_CORRUPT`，不会静默读过去）。
 */
const padLocalState = (state, targetBytes = 4 * 1024 * 1024) => {
  const out = JSON.parse(JSON.stringify(state))
  let n = 80000
  for (let round = 0; round < 8; round += 1) {
    out.imported_proposal_ids = Array.from({ length: n }, (_, i) => `p-20250930-${String(i).padStart(8, '0')}`)
    const bytes = Buffer.byteLength(`${JSON.stringify(out, null, 2)}\n`, 'utf8')
    if (bytes >= targetBytes) return { state: out, entries: n, bytes, target: targetBytes }
    n = Math.max(n + 1, Math.ceil(n * (targetBytes / bytes)))
  }
  return { state: out, entries: n, bytes: null, target: targetBytes }
}

const CALL = 'claim-update'
const claimPayload = (over = {}) => ({ day: DAY, owner_project: 'harness', owner_session: 'session-a-0000', ...over })

describe('integration · store (STO)', () => {
  test('STO-01 判决提交原子性：三个阶段各注入失败 + 成功事务的正例', async () => {
    await runCase('STO-01', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      rec.readings.staging = stagingReadings()
      const bp = caseBrainRoot('STO-01', 'main')
      if (!requireBrain(problems, '判决事务')) caseFail(problems)

      // ① 正例：claim → freeze → judge-start → judge-commit
      const init = runBrain('init', {}, { dataRoot: bp.root })
      if (init.exit_code !== 0) { push('STO01-INIT', `init 必须成功（正例），实得 exit=${init.exit_code} / ${init.json?.error?.code ?? '(无码)'}`); caseFail(problems) }
      const claim = runBrain(CALL, claimPayload(), { dataRoot: bp.root })
      rec.readings.claim = { exit_code: claim.exit_code, code: claim.json?.error?.code ?? null, generation: claim.json?.generation ?? null, attempt: claim.json?.attempt ?? null, job_intent_path: claim.json?.job_intent_path ?? null }
      if (claim.exit_code !== 0) { push('STO01-CLAIM', `claim-update 必须成功（正例），实得 exit=${claim.exit_code} / ${claim.json?.error?.code ?? '(无码)'}`); caseFail(problems) }
      const generation = claim.json?.generation ?? 1
      const attempt = claim.json?.attempt ?? 1
      const freeze = runBrain('candidates-freeze', { generation, candidate_ids: ['c-0001'] }, { dataRoot: bp.root })
      if (freeze.exit_code !== 0) push('STO01-FREEZE', `candidates-freeze 必须成功（正例），实得 exit=${freeze.exit_code} / ${freeze.json?.error?.code ?? '(无码)'}`)
      const start = runBrain('judge-start', { generation, attempt, token: 'tok-a', job_id: 'job-memory-judge-1' }, { dataRoot: bp.root })
      rec.readings.judge_start = { exit_code: start.exit_code, code: start.json?.error?.code ?? null }
      if (start.exit_code !== 0) push('STO01-START', `judge-start 必须成功（正例），实得 exit=${start.exit_code} / ${start.json?.error?.code ?? '(无码)'}`)
      // `judging` 期间：`snapshot_available` 必须是 false（不变量）
      const midState = readJson(bp.updateState(DAY))
      rec.readings.mid_state = midState ? { phase: midState.phase, snapshot_available: midState.snapshot_available } : null
      if (midState) {
        if (midState.phase === 'judging' && midState.snapshot_available === true) {
          push('STO01-INVARIANT', '`phase==="judging"` 时 `snapshot_available` 必须是 false（B3.6 的不变量）')
        }
      } else {
        // 🔴 v1.14：「前置本不该失败」⇒ 红（judge-start 之后状态必须读得出来，否则这条不变量根本没判）
        push('STO01-INVARIANT', `judge-start 之后 \`state/update\` 必须读得出来（"judging ⇒ snapshot_available=false"这条全押在它上面），实得读不到 ${bp.updateState(DAY)}`)
      }
      const commitPayload = (over = {}) => ({
        generation, attempt, token: 'tok-a', base_snapshot: 'v0',
        entries_patch: [{ kind: 'add', entry: { id: 'm-00000001', type: 'general', text: '（夹具）一条', raw: 0.5, imp_share: 1, fresh_share: 1, double_low_streak: 0, is_double_low: false, last_evidence_review: DAY, known_from: 'fixture', created_at: '2026-10-14T00:00:00+08:00', type_changed_at: null } }],
        accepted: ['c-0001'], maintenance_decisions: [],
        common_sense_sha256: init.json?.common_sense_sha256 ?? 'a'.repeat(64),
        report: { memory_update: `reports/memory-update/${DAY}.json` },
        ...over,
      })
      const commit = runBrain('judge-commit', commitPayload(), { dataRoot: bp.root })
      rec.readings.commit = { exit_code: commit.exit_code, code: commit.json?.error?.code ?? null, new_snapshot: commit.json?.new_snapshot ?? null, snapshot_available: commit.json?.snapshot_available ?? null, phase: commit.json?.phase ?? null, report_path: commit.json?.report_path ?? null }
      if (commit.exit_code !== 0) {
        push('STO01-COMMIT', `judge-commit 必须成功（正例），实得 exit=${commit.exit_code} / ${commit.json?.error?.code ?? '(无码)'}`)
      } else {
        if (commit.json?.snapshot_available !== true) push('STO01-FIELDS', `成功提交必须给 snapshot_available:true，实得 ${JSON.stringify(commit.json?.snapshot_available)}`)
        if (commit.json?.phase !== 'awaiting_review_start') push('STO01-FIELDS', `成功提交后 phase 应为 awaiting_review_start，实得 ${JSON.stringify(commit.json?.phase)}`)
        const after = readJson(bp.updateState(DAY))
        rec.readings.after_state = after ? { phase: after.phase, snapshot_available: after.snapshot_available, new_snapshot: after.new_snapshot } : null
        if (after && after.snapshot_available !== true) push('STO01-FIELDS', '提交成功后 `state/update` 里的 snapshot_available 必须为 true')
        // 快照与报告必须真的落盘
        const snapList = runBrain('snapshot-list', {}, { dataRoot: bp.root })
        rec.readings.snapshot_list = { exit_code: snapList.exit_code, code: snapList.json?.error?.code ?? null, versions: snapList.json?.versions ?? null, current: snapList.json?.current ?? null }
        // 🔴 裁定 v1.13 ②③：「期望必须存在」前置 —— `snapshot-list` 读不出来时，下面那条"应当多一个快照"**不许静默跳过**
        if (snapList.exit_code !== 0 || !Array.isArray(snapList.json?.versions)) {
          push('SNAPSHOT-LIST-UNREADABLE', `提交成功后 snapshot-list 必须能读出快照列表（"多出一个快照版本"这条全押在它上面），实得 exit=${snapList.exit_code} / ${snapList.json?.error?.code ?? '(无码)'} / versions=${JSON.stringify(snapList.json?.versions)}`)
        } else if (snapList.json.versions.length < 2) {
          push('STO01-ARTIFACTS', `提交成功后应当多出一个快照版本（v0 + 新版本），实得 ${JSON.stringify(snapList.json?.versions)}`)
        }
        const reportFile = path.join(bp.root, 'reports', 'memory-update', `${DAY}.json`)
        if (!existsSync(reportFile)) push('STO01-ARTIFACTS', `成功提交必须落记忆更新报告 ${reportFile}`)
      }

      // ② 故障注入（真文件系统事实）：把目标位置先占成**目录** ⇒ 写入必失败，事务必须回滚
      const injectAt = (label, target) => {
        const b2 = caseBrainRoot('STO-01', label)
        const i2 = runBrain('init', {}, { dataRoot: b2.root })
        if (i2.exit_code !== 0) return { label, skipped: `init 失败：${i2.json?.error?.code ?? i2.exit_code}` }
        runBrain(CALL, claimPayload(), { dataRoot: b2.root })
        runBrain('judge-start', { generation: 1, attempt: 1, token: 'tok-b', job_id: 'job-memory-judge-1' }, { dataRoot: b2.root })
        const beforeList = runBrain('snapshot-list', {}, { dataRoot: b2.root })
        const beforeTree = treeHash(b2.root)
        // 占位：把要被写的那条路径做成目录（写入必然失败 —— 真文件系统事实，不是"注入开关"）
        mkdirSync(target(b2), { recursive: true })
        const res = runBrain('judge-commit', commitPayload({ token: 'tok-b' }), { dataRoot: b2.root })
        const afterList = runBrain('snapshot-list', {}, { dataRoot: b2.root })
        const afterState = readJson(b2.updateState(DAY))
        return {
          label,
          exit_code: res.exit_code,
          code: res.json?.error?.code ?? null,
          before_versions: beforeList.json?.versions ?? null,
          after_versions: afterList.json?.versions ?? null,
          after_phase: afterState?.phase ?? null,
          after_snapshot_available: afterState?.snapshot_available ?? null,
          tree_changed: beforeTree.sha256 !== treeHash(b2.root).sha256,
        }
      }
      const injections = [
        injectAt('快照写入失败', (b) => path.join(b.snapshotsDir, 'v1.json')),
        injectAt('报告写入失败', (b) => path.join(b.root, 'reports', 'memory-update', `${DAY}.json`)),
      ]
      rec.readings.injections = injections
      for (const inj of injections) {
        if (inj.skipped) { push('STO01-INJECT', `${inj.label} 注入前置失败：${inj.skipped}`); continue }
        if (inj.exit_code === 0) push('STO01-ATOMIC', `${inj.label} 时提交竟然成功了 —— 写入失败必须让整个事务失败`)
        // v1.14 分界：**注入前**的列表读不出来 = 前置本不该失败 ⇒ 红；**注入后**读不出来 = 那一档判不了 ⇒ HOLD
        if (!inj.before_versions) {
          push('STO01-ATOMIC', `${inj.label}：注入**之前**的 \`snapshot-list\` 必须读得出来（"列表没变"这条押在它上面），实得 ${JSON.stringify(inj.before_versions)}`)
        } else if (!inj.after_versions) {
          caseHold(rec, 'STO01-AFTER-LIST-UNREADABLE', `${inj.label}：注入**之后** \`snapshot-list\` 读不出来 ⇒ "列表有没有变"这一档判不了（不适用）`)
        } else if (JSON.stringify(inj.before_versions) !== JSON.stringify(inj.after_versions)) {
          push('STO01-ATOMIC', `${inj.label} 之后快照列表变了（${JSON.stringify(inj.before_versions)} → ${JSON.stringify(inj.after_versions)}）—— 不许出现半写快照`)
        }
        if (inj.after_phase === 'judging' && inj.after_snapshot_available === true) {
          push('STO01-INVARIANT', `${inj.label} 之后出现了 judging && snapshot_available=true`)
        }
      }
      rec.readings.process_exit_pending = {
        status: 'PENDING',
        note: '"写到一半进程退出"需要一个**确定的**杀点（提案 §B1.6 只给了通知/时钟/父死三个接缝，没有"故障注入开关"）⇒ 本条只用真文件系统事实（占位成目录）注入写失败；进程中途被杀的那一档归 R1/STO-02 的过期锁路径。',
      }
      rec.readings.other_project_review = {
        note: '"成功提交后其它项目可以启动本地评审" = commit 之后 `local-claim` 能成功（STO-04/JOB-03 主验）。',
      }

      caseFail(problems)
    })
  })

  test('STO-02 两项目抢同一天记忆更新：一个 claim、过期锁不静默顶掉、字段落盘', async () => {
    await runCase('STO-02', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      rec.readings.staging = stagingReadings()
      const bp = caseBrainRoot('STO-02', 'race')
      if (!requireBrain(problems, 'claim/锁')) caseFail(problems)
      const init = runBrain('init', {}, { dataRoot: bp.root })
      if (init.exit_code !== 0) { push('STO02-INIT', `init 必须成功（正例），实得 exit=${init.exit_code} / ${init.json?.error?.code ?? '(无码)'}`); caseFail(problems) }

      // ① 真并发：两个 owner 同时抢
      const fileA = writeFixture('STO-02', 'claim-a', claimPayload({ owner_project: 'A', owner_session: 'session-a-0000' }))
      const fileB = writeFixture('STO-02', 'claim-b', claimPayload({ owner_project: 'B', owner_session: 'session-b-0000' }))
      const [ra, rb] = await Promise.all([
        runCliAsync('agenia-brain.mjs', { op: CALL, dataRoot: bp.root, inFile: fileA, testMode: true }, { env: process.env }),
        runCliAsync('agenia-brain.mjs', { op: CALL, dataRoot: bp.root, inFile: fileB, testMode: true }, { env: process.env }),
      ])
      const winners = [ra, rb].filter((r) => r.exit_code === 0)
      rec.readings.concurrent_claim = [
        { exit_code: ra.exit_code, code: ra.json?.error?.code ?? null },
        { exit_code: rb.exit_code, code: rb.json?.error?.code ?? null },
      ]
      if (winners.length !== 1) push('STO02-RACE', `并发 claim 应当**恰好一个**成功，实得 ${winners.length} 个（exit=${ra.exit_code}/${rb.exit_code}）`)
      for (const [label, r] of [['A', ra], ['B', rb]]) {
        if (r.exit_code !== 0 && !['E_LOCK_HELD', 'E_LOCK_STALE', 'E_CAS_STALE'].includes(r.json?.error?.code)) {
          push('STO02-RACE', `失败方（${label}）的错误码应是锁冲突/旧版本，实得 ${r.json?.error?.code}`)
        }
      }
      // 失败方"只报告已有状态"：不许改 owner
      const st = readJson(bp.updateState(DAY))
      rec.readings.state_after_race = st ? { phase: st.phase, owner_project: st.owner_project, generation: st.generation, attempt: st.judge_attempt } : null
      if (st && st.owner_project && ra.exit_code !== 0 && rb.exit_code !== 0) push('STO02-RACE', '两个 claim 都失败了 —— 至少要有一个成功')

      // ② 从同一状态再抢（顺序）⇒ 不许产生第二个 claim
      const again = runBrain(CALL, claimPayload({ owner_project: 'B', owner_session: 'session-b-0000' }), { dataRoot: bp.root })
      rec.readings.second_claim = { exit_code: again.exit_code, code: again.json?.error?.code ?? null }
      if (again.exit_code === 0) {
        const st2 = readJson(bp.updateState(DAY))
        if (st2 && st.owner_project === 'B') push('STO02-SECOND', '第二个 owner 从同一状态又抢成功了并改写了 owner —— 同一天只许一个 claim')
        else push('STO02-SECOND', '第二个 owner 的 claim 返回成功（即便没改 owner）—— 应当明确拒绝（E_LOCK_HELD）')
      }

      // ③ 崩溃残留锁：一个死 pid 的锁文件 ⇒ 不静默顶掉，要显式恢复
      const lockDir = bp.locksDir
      mkdirSync(lockDir, { recursive: true })
      const lockFile = path.join(lockDir, `update-${DAY}.lock`)
      writeFileSync(lockFile, `${JSON.stringify({ pid: 999999, session_id: 'session-dead-0000', at: '2026-10-14T00:00:00+08:00', ttl_ms: 1 })}\n`, 'utf8')
      const beforeState = readJson(bp.updateState(DAY))
      const locked = runBrain(CALL, claimPayload({ owner_project: 'C', owner_session: 'session-c-0000' }), { dataRoot: bp.root })
      const afterState = readJson(bp.updateState(DAY))
      rec.readings.stale_lock = { exit_code: locked.exit_code, code: locked.json?.error?.code ?? null }
      if (locked.exit_code === 0) push('STO02-STALE-LOCK', '留着死 pid 的锁时 claim 仍然成功了 —— 过期锁不许被静默顶掉（要显式恢复）')
      else if (!['E_LOCK_STALE', 'E_LOCK_HELD'].includes(locked.json?.error?.code)) {
        push('STO02-STALE-LOCK', `过期锁的错误码应为 E_LOCK_STALE（或 E_LOCK_HELD），实得 ${locked.json?.error?.code}`)
      }
      if (JSON.stringify(beforeState) !== JSON.stringify(afterState)) push('STO02-STALE-LOCK', '被过期锁挡住的那次 claim 改动了状态 —— 拒绝必须零副作用')
      // 显式恢复
      const forced = runBrain(CALL, claimPayload({ owner_project: 'C', owner_session: 'session-c-0000' }), { dataRoot: bp.root, extra: ['--force-recover'] })
      rec.readings.force_recover = { exit_code: forced.exit_code, code: forced.json?.error?.code ?? null }
      if (forced.exit_code !== 0) push('STO02-RECOVER', `--force-recover 显式恢复必须能继续（正例），实得 exit=${forced.exit_code} / ${forced.json?.error?.code ?? '(无码)'}`)

      // ④ 字段落盘：owner / attempt / token / launch intent / job id
      const finalState = readJson(bp.updateState(DAY))
      const claimJson = (winners[0] ?? {}).json ?? {}
      rec.readings.claim_fields = { claim: claimJson, state: finalState }
      for (const key of ['generation', 'attempt', 'token']) {
        if (!(key in claimJson)) push('STO02-FIELDS', `claim-update 的返回缺 ${key}（提案 §B1.4）`)
      }
      if (!claimJson.job_intent_path) push('STO02-FIELDS', 'claim-update 必须给 `job_intent_path`（launch intent 落盘的地方）')
      if (finalState) {
        for (const [key, why] of [['owner_project', '归属'], ['owner_session', '会话'], ['judge_attempt', 'attempt'], ['judge_token', 'token'], ['frozen_proposal_ids', '冻结清单'], ['started_at', '开始时间']]) {
          if (!(key in finalState)) push('STO02-FIELDS', `state/update 缺 ${key}（${why}）`)
        }
        // 🔴 裁定 v1.13 ②③：`judge_token` 必须是字符串（B3.6 冻的是"只存 sha256 前 16 位"）——
        //    原来只有 `if (typeof … === 'string' && …)`：类型不对时**静默跳过**，长度那条根本没跑。
        if (typeof finalState.judge_token !== 'string') {
          push('STO02-FIELDS', `judge_token 必须是字符串（B3.6），实得 ${JSON.stringify(finalState.judge_token)}（typeof=${typeof finalState.judge_token}）—— 类型不对时长度那条根本不会跑`)
        } else if (finalState.judge_token.length > 32) {
          push('STO02-FIELDS', `judge_token 只许存 sha256 前 16 位（B3.6），实得长度 ${finalState.judge_token.length}`)
        }
        if (!existsSync(path.join(bp.root, 'state', 'jobs'))) push('STO02-FIELDS', 'claim 之后应当有 `state/jobs/` 目录（job 记录与 launch intent 落在那里）')
      }
      // 审计：只增
      const audit = path.join(bp.root, 'audit.jsonl')
      rec.readings.audit_lines = countJsonlLines(audit)

      caseFail(problems)
    })
  })

  test('STO-03 重做与迟到：旧 token / 旧通知 / 旧候选一律拒；同日最多一个新快照', async () => {
    await runCase('STO-03', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      rec.readings.staging = stagingReadings()
      const bp = caseBrainRoot('STO-03', 'attempt')
      if (!requireBrain(problems, 'attempt/fence')) caseFail(problems)
      const init = runBrain('init', {}, { dataRoot: bp.root })
      if (init.exit_code !== 0) { push('STO03-INIT', `init 必须成功（正例），实得 exit=${init.exit_code} / ${init.json?.error?.code ?? '(无码)'}`); caseFail(problems) }

      // attempt A：claim + start（拿 token A）
      const cA = runBrain(CALL, claimPayload({ owner_session: 'session-a-0000' }), { dataRoot: bp.root })
      if (cA.exit_code !== 0) { push('STO03-CLAIM', `第一次 claim 必须成功（正例），实得 exit=${cA.exit_code} / ${cA.json?.error?.code ?? '(无码)'}`); caseFail(problems) }
      const genA = cA.json?.generation ?? 1
      const attA = cA.json?.attempt ?? 1
      const sA = runBrain('judge-start', { generation: genA, attempt: attA, token: 'tok-A', job_id: 'job-memory-judge-A' }, { dataRoot: bp.root })
      rec.readings.start_A = { exit_code: sA.exit_code, code: sA.json?.error?.code ?? null }
      if (sA.exit_code !== 0) push('STO03-START', `attempt A 的 judge-start 必须成功（正例），实得 ${sA.exit_code} / ${sA.json?.error?.code ?? '(无码)'}`)

      // 手动重做 ⇒ generation 递增、attempt B。
      // **E-B5（追加裁定 v1.4）冻结了入口形状**：`redo:true` 必须同时带 `previous_attempt_id` 与
      // **`boss_redo_evidence`**（原话/动作 + source_session_id + occurred_at）；缺老板点名证据 ⇒
      // `E_REDO_NOT_AUTHORIZED`（exit 5）。
      // ① 负例一：只有 `redo:true`（没有老板证据）
      const redoBare = runBrain(CALL, claimPayload({ owner_session: 'session-a-0000', redo: true }), { dataRoot: bp.root })
      rec.readings.redo_bare = { exit_code: redoBare.exit_code, code: redoBare.json?.error?.code ?? null }
      if (redoBare.exit_code === 0) push('REDO-NOT-AUTHORIZED', '`redo:true` 不带老板证据竟然成功了 —— E-B5：必须 `E_REDO_NOT_AUTHORIZED`（exit 5）')
      else {
        if (redoBare.json?.error?.code !== 'E_REDO_NOT_AUTHORIZED') push('REDO-NOT-AUTHORIZED', `无老板证据的重做应以 E_REDO_NOT_AUTHORIZED 拒绝，实得 ${redoBare.json?.error?.code}`)
        if (redoBare.exit_code !== FROZEN.exitCodes.E_REDO_NOT_AUTHORIZED) push('REDO-NOT-AUTHORIZED', `无老板证据的重做退出码应为 ${FROZEN.exitCodes.E_REDO_NOT_AUTHORIZED}，实得 ${redoBare.exit_code}`)
      }
      // ② 负例二：带了 `previous_attempt_id`、但没有 `boss_redo_evidence`
      const redoNoEvidence = runBrain(CALL, claimPayload({ owner_session: 'session-a-0000', redo: true, previous_attempt_id: 'attempt-0001' }), { dataRoot: bp.root })
      rec.readings.redo_no_evidence = { exit_code: redoNoEvidence.exit_code, code: redoNoEvidence.json?.error?.code ?? null }
      if (redoNoEvidence.exit_code === 0) push('REDO-NOT-AUTHORIZED', '带了 previous_attempt_id 但没有 boss_redo_evidence 竟然成功了 —— 必须拒')
      else if (redoNoEvidence.json?.error?.code !== 'E_REDO_NOT_AUTHORIZED') push('REDO-NOT-AUTHORIZED', `缺 boss_redo_evidence 应以 E_REDO_NOT_AUTHORIZED 拒绝，实得 ${redoNoEvidence.json?.error?.code}`)
      // ③ 正例：两样都带 ⇒ 放行，且 generation 递增
      const redo = runBrain(CALL, claimPayload({
        owner_session: 'session-a-0000',
        redo: true,
        previous_attempt_id: 'attempt-0001',
        boss_redo_evidence: {
          kind: 'quote',
          verbatim: '（夹具）重做一次，把上一轮的判决作废',
          source_session_id: 'session-c0dabefd-13fe-4380-abdf-1cc1e52ea89a',
          occurred_at: '2026-10-14T11:30:00+08:00',
        },
      }), { dataRoot: bp.root })
      rec.readings.redo = { exit_code: redo.exit_code, code: redo.json?.error?.code ?? null, generation: redo.json?.generation ?? null, attempt: redo.json?.attempt ?? null }
      if (redo.exit_code !== 0) {
        push('STO03-REDO', `带齐 previous_attempt_id + boss_redo_evidence 的重做必须成功（正例），实得 exit=${redo.exit_code} / ${redo.json?.error?.code ?? '(无码)'}`)
      }
      const genB = redo.json?.generation ?? genA + 1
      const attB = redo.json?.attempt ?? attA + 1
      if (genB <= genA) push('STO03-REDO', `重做之后 generation 必须递增（${genA} → ${genB}）`)
      const sB = runBrain('judge-start', { generation: genB, attempt: attB, token: 'tok-B', job_id: 'job-memory-judge-B' }, { dataRoot: bp.root })
      if (sB.exit_code !== 0) push('STO03-REDO', `attempt B 的 judge-start 必须成功（正例），实得 ${sB.exit_code} / ${sB.json?.error?.code ?? '(无码)'}`)

      const mkCommit = (over) => ({
        generation: genA, attempt: attA, token: 'tok-A', base_snapshot: 'v0',
        entries_patch: [{ kind: 'add', entry: { id: 'm-00000002', type: 'general', text: '（夹具）旧 attempt 想写的东西', raw: 0.5, imp_share: 1, fresh_share: 1, double_low_streak: 0, is_double_low: false, last_evidence_review: DAY, known_from: 'fixture', created_at: '2026-10-14T00:00:00+08:00', type_changed_at: null } }],
        accepted: [], maintenance_decisions: [],
        common_sense_sha256: init.json?.common_sense_sha256 ?? 'a'.repeat(64),
        report: {},
        ...over,
      })
      // ① 旧 token 提交 ⇒ 拒，且不许改状态/快照
      const stateBefore = readJson(bp.updateState(DAY))
      const listBefore = runBrain('snapshot-list', {}, { dataRoot: bp.root })
      const stale = runBrain('judge-commit', mkCommit({}), { dataRoot: bp.root })
      const stateAfter = readJson(bp.updateState(DAY))
      const listAfter = runBrain('snapshot-list', {}, { dataRoot: bp.root })
      rec.readings.stale_token = { exit_code: stale.exit_code, code: stale.json?.error?.code ?? null }
      if (stale.exit_code === 0) push('STO03-STALE-TOKEN', '旧 attempt 的 token 提交竟然成功了 —— 必须拒绝（E_TXN_TOKEN）')
      else if (stale.json?.error?.code !== 'E_TXN_TOKEN') push('STO03-STALE-TOKEN', `旧 token 应以 E_TXN_TOKEN 拒绝，实得 ${stale.json?.error?.code}`)
      if (JSON.stringify(stateBefore) !== JSON.stringify(stateAfter)) push('STO03-STALE-TOKEN', '被拒的旧 token 提交改动了状态')
      if (JSON.stringify(listBefore.json?.versions) !== JSON.stringify(listAfter.json?.versions)) push('STO03-STALE-TOKEN', '被拒的旧 token 提交动了快照')

      // ② 旧 job 的迟到通知 ⇒ 只能记审计，不许改 job_state
      if (requireNotify(problems, '旧通知的 fence')) {
        const jobFile = bp.jobFile('job-memory-judge-A')
        const beforeJob = readJson(jobFile)
        const late = runCliSoft('bg-notify.mjs', {
          op: 'deliver', dataRoot: bp.root,
          extra: ['--status-root', path.join(bp.root, '..'), '--job', 'memory-judge', '--job-id', 'job-memory-judge-A', '--state', 'done', '--result-file', writeFixture('STO-03', 'late-result', { ok: true })],
        })
        const afterJob = readJson(jobFile)
        const jobBytesBefore = existsSync(jobFile) ? readFileSync(jobFile, 'utf8') : null
        rec.readings.late_notice = { exit_code: late.exit_code, code: late.json?.error?.code ?? null, before_job: beforeJob === null ? null : { state: beforeJob.state, fence: beforeJob.fence }, after_job: afterJob === null ? null : { state: afterJob.state, fence: afterJob.fence } }
        // 🔴 v1.17 ③：**"被拒"不是"不适用"** —— 它是可用"零写入"验证的结果。
        //    ① 成功 ⇒ job_state 不许被改（`JSON.stringify` 比：以前是两次 `JSON.parse` 的**对象引用**比较，恒真 ⇒ 假红）；
        //    ② 被拒（合法 fence）⇒ 必须**零写入**（job 记录字节不许变）。
        if (late.exit_code !== 0) {
          if (jobBytesBefore !== null && readFileSync(jobFile, 'utf8') !== jobBytesBefore) {
            push('STO03-LATE-NOTICE', `旧 job 的迟到通知被拒（${late.json?.error?.code ?? 'exit≠0'}）却**动了盘**—— 拒必须零写入`)
          }
        } else if (beforeJob === null || afterJob === null) {
          caseHold(rec, 'STO03-LATE-NO-RECORD', '旧 job id 本来就没有 job 记录 ⇒ "状态有没有被改"无从比较（不适用）')
        } else if (JSON.stringify(beforeJob) !== JSON.stringify(afterJob)) {
          push('STO03-LATE-NOTICE', `旧 job 的迟到通知改动了 job 记录（${JSON.stringify(beforeJob)} → ${JSON.stringify(afterJob)}）—— 只许记审计（E_JOB_FENCE_STALE 或仅追加审计）`)
        }
      }

      // ③ 旧 attempt 的候选导入 ⇒ 拒（E_FENCE_STALE）
      const staleImport = runBrain('proposal-import', {
        source: 'dev/2026-10-14/旧 attempt 的候选.json', sha256: 'b'.repeat(64),
        base_snapshot: 'v0', update_generation: genA, review_attempt: attA,
        payload: { entry: { id: 'm-00000003', type: 'general', text: '（夹具）旧 attempt 的候选' } },
      }, { dataRoot: bp.root })
      rec.readings.stale_import = { exit_code: staleImport.exit_code, code: staleImport.json?.error?.code ?? null }
      if (staleImport.exit_code === 0) push('STO03-STALE-IMPORT', '旧 generation/attempt 的候选竟然导入成功了 —— 必须拒绝（E_FENCE_STALE）')
      else if (staleImport.json?.error?.code !== 'E_FENCE_STALE') push('STO03-STALE-IMPORT', `旧候选应以 E_FENCE_STALE 拒绝，实得 ${staleImport.json?.error?.code}`)

      // ④ 同日最多一个新成功快照：attempt B 成功提交之后，快照数只 +1
      const b4 = runBrain('snapshot-list', {}, { dataRoot: bp.root })
      const okB = runBrain('judge-commit', mkCommit({ generation: genB, attempt: attB, token: 'tok-B' }), { dataRoot: bp.root })
      const after = runBrain('snapshot-list', {}, { dataRoot: bp.root })
      rec.readings.commit_B = { exit_code: okB.exit_code, code: okB.json?.error?.code ?? null }
      rec.readings.snapshot_counts = { before: b4.json?.versions?.length ?? null, after: after.json?.versions?.length ?? null }
      if (okB.exit_code !== 0) push('STO03-NEW-ATTEMPT', `新 attempt 的提交必须成功（正例），实得 exit=${okB.exit_code} / ${okB.json?.error?.code ?? '(无码)'}`)
      else if ((after.json?.versions?.length ?? 0) - (b4.json?.versions?.length ?? 0) !== 1) {
        push('STO03-ONE-SNAPSHOT', `同一天只该多出 1 个新快照，实得 ${b4.json?.versions?.length} → ${after.json?.versions?.length}`)
      }
      rec.readings.redo_entry_ambiguity = {
        note: '"手动重做"的**调用形状**（我这里用"再 claim 一次 + redo:true"）提案没有逐字冻结 ⇒ 若实现另有正式入口，请回组长冻形状；断言只要求"generation 递增 + 旧 token 被拒"这两件可证的事。',
      }

      // ═══════════════════════════════════════════════════════════════════════
      // T-MEM-07 · V8「真事务才追加」—— 拒绝 ⇒ `judged.jsonl` 一行都不许多
      //   定形：`.team/leader/2026-10-16/定形-T-MEM-07.md` · 契约：`.team/test/2026-10-16/契约-T-MEM-07.md` §2.4
      //   为什么挂在本用例：STO-03 就是"旧 attempt / 旧 token / 迟到 / 旧候选一律拒"那一条（拒绝矩阵的家）。
      //   🔴 **零追加断言不许空对空**：先造出一份**非空**索引，再逐条拒绝、逐次比三件套
      //      （sha256 + 字节 + 行数）。空文件对空文件永远相等 —— 那是假绿。
      // ═══════════════════════════════════════════════════════════════════════
      const judgedFile = path.join(bp.root, 'proposals', 'judged.jsonl')
      const redoEvidence = (verbatim, at) => ({
        kind: 'quote',
        verbatim,
        source_session_id: 'session-c0dabefd-13fe-4380-abdf-1cc1e52ea89a',
        occurred_at: at,
      })
      // ① 造非空索引：新一轮（redo）→ 冻 2 条候选 → judge-start → judge-commit（accepted 1 条）
      const cV8 = runBrain(CALL, claimPayload({
        owner_session: 'session-a-0000',
        redo: true,
        previous_attempt_id: 'attempt-0002',
        boss_redo_evidence: redoEvidence('（夹具·T-MEM-07）重做一次，给 V8 造一份非空索引', '2026-10-14T13:10:00+08:00'),
      }), { dataRoot: bp.root })
      const genV8 = cV8.json?.generation ?? null
      const attV8 = cV8.json?.attempt ?? null
      const freezeV8 = genV8 === null ? null : runBrain('candidates-freeze', { generation: genV8, candidate_ids: ['c-0001', 'c-0002'] }, { dataRoot: bp.root })
      const startV8 = attV8 === null ? null : runBrain('judge-start', { generation: genV8, attempt: attV8, token: 'tok-V8', job_id: 'job-memory-judge-V8' }, { dataRoot: bp.root })
      const commitV8 = (genV8 === null || attV8 === null) ? null : runBrain('judge-commit', mkCommit({
        generation: genV8, attempt: attV8, token: 'tok-V8',
        base_snapshot: okB.json?.new_snapshot ?? 'v1',
        entries_patch: [], accepted: ['c-0001'],
      }), { dataRoot: bp.root })
      const baseV8 = fileFactsOf(judgedFile)
      rec.readings.v8_baseline = {
        claim: cV8.exit_code, claim_code: cV8.json?.error?.code ?? null,
        freeze: freezeV8?.exit_code ?? null, start: startV8?.exit_code ?? null,
        commit: commitV8?.exit_code ?? null, commit_code: commitV8?.json?.error?.code ?? null,
        generation: genV8, attempt: attV8, judged: baseV8,
      }
      if (!baseV8.exists || baseV8.rows === 0) {
        push('V8-PRECONDITION', `拒绝矩阵跑之前必须先有一份**非空**的 \`judged.jsonl\`（否则"零追加"是空对空）：实得 ${JSON.stringify(baseV8)}；造索引那一轮 claim=${cV8.exit_code}/${cV8.json?.error?.code ?? '-'} freeze=${freezeV8?.exit_code ?? '-'} start=${startV8?.exit_code ?? '-'} commit=${commitV8?.exit_code ?? '-'}/${commitV8?.json?.error?.code ?? '-'} ⇒ **现在缺的是 opJudgeCommit 在事务成功之后那段追加**（契约 §2.3/§2.4）`)
      } else {
        /** 一次拒绝 = 一次 judge-commit + 前后三件套比对（`stage` 只给读数分栏，**不参与判定**）。 */
        const matrix = {}
        const runReject = (stage, label, over, want) => {
          const before = fileFactsOf(judgedFile)
          const res = runBrain('judge-commit', mkCommit(over), { dataRoot: bp.root })
          const after = fileFactsOf(judgedFile)
          matrix[`${stage} · ${label}`] = { want, exit_code: res.exit_code, code: res.json?.error?.code ?? null, before, after }
          if (res.exit_code === 0) {
            push('V8-ZERO-APPEND', `「${label}」必须被拒（${want}），实得 exit 0 —— 它成功了，所以这一格连"零追加"都判不了`)
          } else if (res.json?.error?.code !== want) {
            push('V8-ZERO-APPEND', `「${label}」的拒绝码应为 ${want}，实得 ${res.json?.error?.code ?? '(无码)'}`)
          }
          if (JSON.stringify(before) !== JSON.stringify(after)) {
            push('V8-ZERO-APPEND', `「${label}」被拒（${res.json?.error?.code ?? 'exit≠0'}）之后 \`judged.jsonl\` 竟然变了：${JSON.stringify(before)} → ${JSON.stringify(after)} —— 拒绝必须**一行都不许追加**（sha256 / 字节数 / 行数三样都要同）`)
          }
        }
        // ② 拒绝矩阵（一）：此刻 phase=awaiting_review_start ⇒ token / generation / attempt / phase 四条
        const rejectsA = [
          ['旧 token', { generation: genV8, attempt: attV8, token: 'tok-B' }, 'E_TXN_TOKEN'],
          ['generation 不对', { generation: genV8 + 1, attempt: attV8, token: 'tok-V8' }, 'E_CAS_STALE'],
          ['attempt 不对', { generation: genV8, attempt: attV8 + 1, token: 'tok-V8' }, 'E_TXN_TOKEN'],
          ['phase 不在 judging', { generation: genV8, attempt: attV8, token: 'tok-V8' }, 'E_STATE_PHASE'],
        ]
        // 🔴 **次序是这里最要命的东西**（2026-10-16 返修）：`judge-commit` 的拒绝次序是**冻结**的 ——
        //    token → generation/attempt → phase → 常识 → 快照 CAS ⇒ 前三道闸**只有拿着当前窗口那个 token
        //    才够得着**。任何"先把窗口换掉、再回头跑前三条"的写法，都会让 generation/phase 那几条撞在
        //    **第一道 token 闸**上（实测：`E_CAS_STALE` / `E_STATE_PHASE` 被读成 `E_TXN_TOKEN`）——
        //    那不是被测对象的毛病，是**测试把前提拆了**。⇒ 窗口 1 的四条**跑完**，才许开窗口 2。
        // ⚠️ 「phase 不在 judging」这一条**只能**在窗口 1 跑：窗口 2 开着的时候 phase 就是 `judging`，
        //    换哪个 token 都造不出这一格。
        for (const [label, over, want] of rejectsA) runReject('窗口1', label, over, want)
        // ③ 拒绝矩阵（二）：再开一个 judging 窗口 ⇒ 常识 / 基准快照 CAS 那两条
        //    （常识与 CAS 的检查排在 phase 之后，所以必须真的在 judging 里才够得着）
        const cV8b = runBrain(CALL, claimPayload({
          owner_session: 'session-a-0000',
          redo: true,
          previous_attempt_id: 'attempt-0003',
          boss_redo_evidence: redoEvidence('（夹具·T-MEM-07）再重做一次，量常识与快照 CAS 那两条', '2026-10-14T13:20:00+08:00'),
        }), { dataRoot: bp.root })
        const genV8b = cV8b.json?.generation ?? null
        const attV8b = cV8b.json?.attempt ?? null
        const startV8b = attV8b === null ? null : runBrain('judge-start', { generation: genV8b, attempt: attV8b, token: 'tok-V8b', job_id: 'job-memory-judge-V8b' }, { dataRoot: bp.root })
        const rejectsB = (genV8b === null || attV8b === null) ? [] : [
          ['常识哈希对不上（未确认）', { generation: genV8b, attempt: attV8b, token: 'tok-V8b', common_sense_sha256: 'e'.repeat(64) }, 'E_CS_UNCONFIRMED'],
          ['基准快照 CAS 过期', { generation: genV8b, attempt: attV8b, token: 'tok-V8b', base_snapshot: 'v0' }, 'E_CAS_STALE'],
        ]
        rec.readings.v8_window2 = {
          claim: cV8b.exit_code, claim_code: cV8b.json?.error?.code ?? null,
          start: startV8b?.exit_code ?? null, generation: genV8b, attempt: attV8b,
        }
        if (attV8b === null) {
          push('V8-ZERO-APPEND', `第二个 judging 窗口开不起来（claim=${cV8b.exit_code}/${cV8b.json?.error?.code ?? '-'}）⇒ 常识 / 基准快照 CAS 那两条拒绝**判不了**（它们排在 phase 之后）`)
        } else if (startV8b?.exit_code !== 0) {
          push('V8-ZERO-APPEND', `第二个 judging 窗口的 judge-start 必须成功（否则"窗口 2 的当前 token 是 tok-V8b"这个前提不成立，后面两条读到的拒绝码不可信），实得 exit=${startV8b?.exit_code} / ${startV8b?.json?.error?.code ?? '(无码)'}`)
        } else {
          for (const [label, over, want] of rejectsB) runReject('窗口2', label, over, want)
        }
        rec.readings.v8_rejects = matrix
        // ④ 阳性对照：同一个 judging 窗口里一次**合法**提交必须追加 ⇒ 证明"拒绝那几条没追加"不是"索引根本写不动"
        const curList = runBrain('snapshot-list', {}, { dataRoot: bp.root })
        const curVersion = curList.json?.current ?? null
        const freezeV8b = (genV8b === null) ? null : runBrain('candidates-freeze', { generation: genV8b, candidate_ids: ['c-0003'] }, { dataRoot: bp.root })
        const beforePos = fileFactsOf(judgedFile)
        const posV8 = (attV8b === null || freezeV8b === null) ? null : runBrain('judge-commit', mkCommit({
          generation: genV8b, attempt: attV8b, token: 'tok-V8b',
          base_snapshot: curVersion ?? 'v0',
          entries_patch: [], accepted: [],
        }), { dataRoot: bp.root })
        const afterPos = fileFactsOf(judgedFile)
        rec.readings.v8_positive = {
          freeze: freezeV8b?.exit_code ?? null,
          exit_code: posV8?.exit_code ?? null,
          code: posV8?.json?.error?.code ?? null,
          before: beforePos, after: afterPos,
        }
        if (posV8 === null || posV8.exit_code !== 0) {
          push('V8-ZERO-APPEND', `阳性对照：同一个 judging 窗口里一次**合法**提交必须成功（否则上面那六条"零追加"可能只是"命令坏了蒙对"），实得 exit=${posV8?.exit_code ?? '(没跑)'} / ${posV8?.json?.error?.code ?? '(无码)'}`)
        } else if (!afterPos.exists || afterPos.rows !== beforePos.rows + 1) {
          push('V8-ZERO-APPEND', `阳性对照：合法提交之后索引必须多 1 行（本轮冻了 1 条候选），实得 ${JSON.stringify(beforePos)} → ${JSON.stringify(afterPos)} —— 缺的是 opJudgeCommit 事务成功之后那段追加（拒绝时不许写、成功时必须写）`)
        }
      }

      caseFail(problems)
    })
  })

  test('STO-04 会话评审 + 技术评审各自独立 claim；同场重复拒；维护案 fence 不混用', async () => {
    await runCase('STO-04', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      rec.readings.staging = stagingReadings()
      // 🔴 两格两个工作区（"一格的几个输入各用各的根"）：
      //   · `wsParallel` 只跑 ①（并行两场 claim）；
      //   · `wsFields`   跑 ②~⑤ —— 这四格全都要求"这一天的两场 claim 已经成立"。
      // 以前五格共用一格、②~⑤ 借 ① 留下的现场 ⇒ ① 一失败，② 就报出**假红**
      // （"同一场重复 claim 竟然成功"），而真相是那一场 claim 根本没成立、压根谈不上"重复"。
      const wsParallel = freshWorkspace('STO-04', 'parallel')
      const wsFields = freshWorkspace('STO-04', 'fields')
      if (!requireLocal(problems, '本地 claim')) caseFail(problems)
      const call = (op, payload, extra = []) => runLocal('STO-04', op, payload, { workspace: wsFields, extra })
      const base = { project: 'harness', day: DAY, snapshot: 'v7', attempt: 1 }

      // ── ① 两场各自独立 claim，可并行 ───────────────────────────────────
      // 现场造两步：
      //   (a) 先用第三场（`memory-review`）claim 一次，把这一天的本地状态文件建出来；
      //   (b) 把这份状态垫到 ~4MB（见 `padLocalState`）。
      // 🔴 (b) 只解决一件事：**让"两场同时抢同一把锁"是确定的争用**（不是靠两个进程恰好同一微秒到达）。
      //    会话/技术两场 claim 共用同一把 day 锁（`lib/local-state.mjs` 的 `localLockPath`），
      //    不垫时那次读-改-写只有几百微秒；垫大之后持锁几十毫秒 ⇒ 后到的那一个**一定**落在前一个的
      //    临界区里（读数 `parallel_timing_ms` 里总有一场慢 35–60ms，就是它在等）。
      // ⚠️ **它不减偶发**（2026-10-16 实测：不垫 0.42% = 1200 跑红 5 · 垫大 0.33% = 300 跑红 1，
      //    统计上分不开）。原因：会踩中的窗口是"后到者的 open 落在先到者**放锁前那几微秒**"，
      //    与持锁多长无关；持锁变长只是把"一次冒险"换成"几次 20ms 间隔的重试冒险"。
      //    ⇒ 那条红是**被测对象的缺陷现形**（`E_LOCK_STALE` + 报文里点着 `E_DATA_MISSING`），不是本用例的毛病；
      //      真要让它是 0，只能修 `lib/atomic.mjs` 那两处（已报组长）。**5 次全绿不等于零概率。**
      // ⚠️ 垫的只是一段合法历史，**断言一条都没动、也没放宽**。
      const warm = runLocal('STO-04', 'local-claim', { ...base, field: 'memory-review', job_id: 'job-memory-review-1' }, { workspace: wsParallel })
      const statePath = path.join(wsParallel, '.team', 'state', 'local', `${DAY}.json`)
      const stateBefore = existsSync(statePath) ? readJson(statePath) : null
      if (warm.exit_code !== 0 || stateBefore === null) {
        push('STO04-SETUP', `① 的现场（这一天的本地状态文件）建不出来：warm claim exit=${warm.exit_code} / ${warm.json?.error?.code ?? '(无码)'}；状态文件${existsSync(statePath) ? '读不动' : '不在'}`)
        caseFail(problems)
      }
      const padded = padLocalState(stateBefore)
      writeFileSync(statePath, `${JSON.stringify(padded.state, null, 2)}\n`, 'utf8')
      const padBytes = readFileSync(statePath).length
      rec.readings.parallel_fixture = {
        warm_exit: warm.exit_code, pad_target_bytes: padded.target, pad_bytes: padBytes, pad_entries: padded.entries,
        note: '垫大只为一件事：让两场 claim 的读-改-写真的重叠（几十毫秒级），好让"同时抢同一把锁"是确定的争用。',
      }
      // 夹具守卫量在**跑之前**：跑完之后的状态是被测对象造的，拿它当守卫就是自证。
      if (padBytes < padded.target) {
        push('STO04-SETUP', `① 的夹具没生效：垫过之后的状态只有 ${padBytes} 字节（要 ≥ ${padded.target}）—— 那样两场 claim 会退化成"几百微秒的巧合争用"，本格的确定性就没了`)
        caseFail(problems)
      }

      const [rc, rt] = await Promise.all([
        runCliAsync('agenia-local.mjs', { op: 'local-claim', workspace: wsParallel, inFile: writeFixture('STO-04', 'claim-conversation', { ...base, field: 'conversation', job_id: 'job-conversation-review-1' }), testMode: true }, { env: process.env }),
        runCliAsync('agenia-local.mjs', { op: 'local-claim', workspace: wsParallel, inFile: writeFixture('STO-04', 'claim-technical', { ...base, field: 'technical', job_id: 'job-technical-review-1' }), testMode: true }, { env: process.env }),
      ])
      rec.readings.parallel_claims = [
        { field: 'conversation', exit_code: rc.exit_code, code: rc.json?.error?.code ?? null },
        { field: 'technical', exit_code: rt.exit_code, code: rt.json?.error?.code ?? null },
      ]
      // 这一对 ms 是"争用真的发生了"的读数；`stderr` 是红了之后**唯一**能看出锁的哪一步出问题的东西
      // （`E_LOCK_STALE` 的报文里点着 `E_DATA_MISSING` / `E_DATA_CORRUPT`，用例只记 code 就会把它丢掉）。
      rec.readings.parallel_timing_ms = [rc.ms ?? null, rt.ms ?? null]
      rec.readings.parallel_stderr = [String(rc.stderr ?? '').trim().slice(0, 400), String(rt.stderr ?? '').trim().slice(0, 400)]
      if (rc.exit_code !== 0 || rt.exit_code !== 0) {
        // 报文里带上**输了的那一场自己的 stderr**：`E_LOCK_STALE` 到底是"锁内容坏了（E_DATA_CORRUPT，
        // 别人正建着）"还是"锁内容坏了（E_DATA_MISSING，别人刚放掉）"，只有那句 stderr 说得清。
        // 只记 code 的话，这条红读起来就跟"随便什么并发问题"一模一样（F-35 就是这么被误判成"测试不稳"的）。
        const why = [rc, rt]
          .map((r, k) => (r.exit_code === 0 ? null : `${['会话', '技术'][k]}：${String(r.stderr ?? '').trim() || '(无 stderr)'}`))
          .filter(Boolean)
          .join(' ｜ ')
        push('STO04-PARALLEL', `会话评审与技术评审必须能**各自独立** claim（两把锁），实得 exit=${rc.exit_code}/${rt.exit_code}（${rc.json?.error?.code ?? '-'} / ${rt.json?.error?.code ?? '-'}）—— ${why}`)
      }

      // ── ②~⑤ 的前置：**这一格自己**把两场 claim 各顺序做一次 ──────────────
      // （前置自己建，红了就红在 STO04-SETUP 这**一条**上，不会再生出四条假报文。）
      const seqC = call('local-claim', { ...base, field: 'conversation', job_id: 'job-conversation-review-1' })
      const seqT = call('local-claim', { ...base, field: 'technical', job_id: 'job-technical-review-1' })
      rec.readings.fields_setup = [
        { field: 'conversation', exit_code: seqC.exit_code, code: seqC.json?.error?.code ?? null },
        { field: 'technical', exit_code: seqT.exit_code, code: seqT.json?.error?.code ?? null },
      ]
      if (seqC.exit_code !== 0 || seqT.exit_code !== 0) {
        push('STO04-SETUP', `②~⑤ 的前置没成立（会话/技术两场各顺序 claim 一次都必须成功）：conversation exit=${seqC.exit_code} / ${seqC.json?.error?.code ?? '(无码)'}；technical exit=${seqT.exit_code} / ${seqT.json?.error?.code ?? '(无码)'}`)
        rec.readings.fields_steps = {
          skipped: ['STO04-DUP', 'STO04-MIXED', 'STO04-ISOLATION', 'STO04-OLD-NOTICE'],
          note: '前置没成立 ⇒ 这四格一条都不判。判了只会产出假报文（例如"重复 claim 竟然成功"，而真相是那一场 claim 根本没成立）。',
        }
        caseFail(problems)
      }

      // ② 同一场重复 claim ⇒ E_CLAIM_HELD
      const dup = call('local-claim', { ...base, field: 'conversation', job_id: 'job-conversation-review-1', attempt: 2 })
      rec.readings.duplicate_claim = { exit_code: dup.exit_code, code: dup.json?.error?.code ?? null }
      if (dup.exit_code === 0) push('STO04-DUP', '同一场（同项目/日期/快照/字段）重复 claim 竟然成功 —— 必须 E_CLAIM_HELD')
      else if (dup.json?.error?.code !== 'E_CLAIM_HELD') push('STO04-DUP', `重复 claim 应以 E_CLAIM_HELD 拒绝，实得 ${dup.json?.error?.code}`)
      // ③ 维护案 fence 不许与本地场 claim 混用
      const mixed = call('local-claim', { ...base, field: 'memory-review', job_id: 'job-memory-review-1', maintenance_fence: { update_generation: 1, review_attempt: 1 } })
      rec.readings.mixed_fence = { exit_code: mixed.exit_code, code: mixed.json?.error?.code ?? null }
      if (mixed.exit_code === 0) push('STO04-MIXED', '把记忆复核的维护案 fence 塞进本地场 claim 竟然成功 —— 必须 E_CLAIM_MIXED')
      else if (mixed.json?.error?.code !== 'E_CLAIM_MIXED') push('STO04-MIXED', `混用 fence 应以 E_CLAIM_MIXED 拒绝，实得 ${mixed.json?.error?.code}`)
      // ④ 每场失败只影响该场
      const failed = call('local-fail', { ...base, field: 'conversation', failure_reason: '（夹具）会话评审作业退出码非 0' })
      rec.readings.local_fail = { exit_code: failed.exit_code, code: failed.json?.error?.code ?? null }
      const state = call('local-read', base)
      rec.readings.local_state = { exit_code: state.exit_code, conversation: state.json?.state?.conversation?.state ?? null, technical: state.json?.state?.technical?.state ?? null }
      // v1.14：「前置本不该失败」⇒ 红（`local-fail` / `local-read` 都是冻结 op，读不出来就没法判隔离）
      if (failed.exit_code !== 0) push('STO04-ISOLATION', `local-fail 必须成功（"一场失败只影响该场"押在它上面），实得 exit=${failed.exit_code} / ${failed.json?.error?.code ?? '(无码)'}`)
      if (state.exit_code !== 0) push('STO04-ISOLATION', `local-read 必须能读出来（同上），实得 exit=${state.exit_code} / ${state.json?.error?.code ?? '(无码)'}`)
      if (failed.exit_code === 0 && state.exit_code === 0) {
        const s = state.json?.state ?? {}
        if (s.conversation?.state !== 'failed') push('STO04-ISOLATION', `会话评审失败后它的状态应为 failed，实得 ${JSON.stringify(s.conversation?.state)}`)
        if (s.technical?.state === 'failed') push('STO04-ISOLATION', '会话评审失败把技术评审那场也带挂了 —— 每场失败只许影响自己那一场')
      }
      // ⑤ 旧 attempt 的通知不许覆盖
      if (requireNotify(problems, '旧 attempt 通知')) {
        const late = runCliSoft('bg-notify.mjs', {
          op: 'deliver', dataRoot: process.env[ENV.TEST_DATA_ROOT],
          extra: ['--status-root', path.join(wsFields, '.team'), '--job', 'conversation-review', '--job-id', 'job-conversation-review-OLD', '--state', 'done', '--result-file', writeFixture('STO-04', 'old-result', { ok: true })],
        })
        rec.readings.old_attempt_notice = { exit_code: late.exit_code, code: late.json?.error?.code ?? null }
        const state2 = call('local-read', base)
        rec.readings.old_attempt_state = { exit_code: state2.exit_code, code: state2.json?.error?.code ?? null, conversation: state2.json?.state?.conversation?.state ?? null }
        // v1.14：「前置本不该失败」⇒ 红（投完通知后本地状态必须读得出来）
        if (state2.exit_code !== 0) {
          push('STO04-OLD-NOTICE', `投完旧通知之后 \`local-read\` 必须能读出来（"旧 attempt 不许覆盖"押在它上面），实得 exit=${state2.exit_code} / ${state2.json?.error?.code ?? '(无码)'}`)
        } else if (state2.json?.state?.conversation?.state === 'done') {
          push('STO04-OLD-NOTICE', '旧 job id 的通知把会话评审那场推成了 done —— 旧 attempt 不许覆盖')
        }
      }
      rec.readings.claim_files = {
        note: '两把锁的落点由实现定（提案只写"两个节点两把锁"）；本用例只验"各自独立 + 重复拒 + 混用拒 + 失败隔离"四件事。',
      }
      rec.readings.pending_r1 = {
        status: 'PENDING',
        note: '两场**真并行跑完**（各自 job 真起、真回来、真写产物）在 R1-02/R1-05；本用例只到 claim/state 层。',
      }

      caseFail(problems)
    })
  })
})

// ── 小工具见文件顶部（`runCliSoft`）────────────────────────────────────────
