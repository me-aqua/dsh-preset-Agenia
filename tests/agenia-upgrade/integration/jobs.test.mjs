/**
 * JOB-01 / JOB-02 / JOB-03 / JOB-04 —— 后台作业状态机（集成 + 单元）。
 *
 * 冻结依据：契约 §6.6 + 提案 §B1.4（`bg-notify.mjs` 的三个 op、`job-mark`、退出码）
 * + §B1.6（**通知 / 丢通知 / 父死 / 时钟**四个接缝；锁与 CAS 不许 mock）+ §B3.6（`state/jobs/<job_id>.json` 的字段表）
 * + §4 常量（update **90** / local **45**，**不许出现 60**）+ 追加裁定 v1.2 **C-5**（`age >= lease` 即 stale）
 * + 追加裁定 v1.3（并发/锁/CAS ⇒ 4；状态不变量 ⇒ 6）。
 *
 * 口径：
 *   · 通知是**接缝**（`bg-notify --op deliver`），不是"父去轮询"—— 轮询式实现会在这里红；
 *   · 丢通知用 `--drop-notice`（**不许**用"不调用 notify"冒充，那样测不出"检测到未结"）；
 *   · 父死用 `--op parent-dead` 写 `parent_state:"dead"`，**不杀真实进程**；
 *   · "父不被阻塞 / 老板还能说话"只能 R1/GUI 验 ⇒ 那一条记 PENDING，不折成通过。
 */
import { before, describe, test } from 'node:test'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ENV, FROZEN } from '../support/env.mjs'
import { caseFail, preflight, problem, runCase, stagingReadings, writeJson } from '../support/evidence.mjs'
import { canonical, ensureMarkedDir } from '../support/root-guard.mjs'
import { brainPaths, loadStagedModule, readStagedText, runBrain, runCli, runLocal, stagingExists, writeFixture } from '../support/sut.mjs'

before(() => {
  preflight()
})

const DAY = '2026-10-14'

function caseBrainRoot(id, name) {
  const runRoot = canonical(process.env[ENV.RUN_ROOT])
  const root = ensureMarkedDir(path.join(runRoot, `brain-${id.toLowerCase()}-${name}`), {
    runRoot,
    runId: path.basename(runRoot),
    kind: 'agenia-test-brain-root',
  })
  return brainPaths({ ...process.env, [ENV.TEST_DATA_ROOT]: root })
}
function caseWorkspace(id, name) {
  const runRoot = canonical(process.env[ENV.RUN_ROOT])
  return ensureMarkedDir(path.join(runRoot, `ws-${id.toLowerCase()}-${name}`), {
    runRoot,
    runId: path.basename(runRoot),
    kind: 'agenia-test-workspace',
  })
}
const readJson = (file) => {
  try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return null }
}
const requireBrain = (problems, why) => {
  if (stagingExists('bin/agenia-brain.mjs')) return true
  problems.push(problem('SUT-SURFACE-MISSING', `staged/bin/agenia-brain.mjs 不在 ⇒ ${why} 拿不到（预期的首跑红）`))
  return false
}
const requireNotify = (problems, why) => {
  if (stagingExists('bin/bg-notify.mjs')) return true
  problems.push(problem('SUT-SURFACE-MISSING', `staged/bin/bg-notify.mjs 不在 ⇒ ${why} 拿不到（预期的首跑红）`))
  return false
}
/** 可注入时钟（提案 §B1.6）：写 `AGENIA_NOW_FILE` 一行 ISO。 */
function setNow(iso) {
  const file = process.env[ENV.NOW_FILE]
  if (!file) return { ok: false }
  writeJson(path.join(path.dirname(file), '.keep.json'), { note: 'mkdir 占位' })
  writeFileSync(file, `${iso}\n`, 'utf8')
  return { ok: true, iso }
}
/** 通知接缝（缺面不抛）。 */
const notify = (opts) => {
  try {
    return runCli('bg-notify.mjs', opts, { env: process.env })
  } catch (err) {
    return { exit_code: null, json: { error: { code: err?.code ?? 'THREW' } }, stdout: '', stderr: String(err.message) }
  }
}

describe('integration · jobs (JOB)', () => {
  test('JOB-01 完成由通知驱动；launch intent 先落盘；丢通知只检测未结', async () => {
    await runCase('JOB-01', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      rec.readings.staging = stagingReadings()
      const bp = caseBrainRoot('JOB-01', 'notify')
      const ws = caseWorkspace('JOB-01', 'notify')
      setNow('2026-10-14T12:00:00+08:00')
      if (!requireBrain(problems, '派工/状态')) caseFail(problems)
      const init = runBrain('init', {}, { dataRoot: bp.root })
      if (init.exit_code !== 0) { push('JOB01-INIT', `init 必须成功（正例），实得 exit=${init.exit_code} / ${init.json?.error?.code ?? '(无码)'}`); caseFail(problems) }
      const claim = runBrain('claim-update', { day: DAY, owner_project: 'harness', owner_session: 'session-p-0000' }, { dataRoot: bp.root })
      if (claim.exit_code !== 0) { push('JOB01-CLAIM', `claim-update 必须成功（正例），实得 exit=${claim.exit_code} / ${claim.json?.error?.code ?? '(无码)'}`); caseFail(problems) }
      const generation = claim.json?.generation ?? 1
      const attempt = claim.json?.attempt ?? 1
      const jobId = 'job-memory-judge-1'
      const start = runBrain('judge-start', { generation, attempt, token: 'tok', job_id: jobId }, { dataRoot: bp.root })
      rec.readings.judge_start = { exit_code: start.exit_code, code: start.json?.error?.code ?? null, judge_job_state: start.json?.judge_job_state ?? null }

      // ① launch intent 必须**先**落盘（job 记录带 parent/attempt/generation/state=running）
      const jobFile = bp.jobFile(jobId)
      const jobRec = readJson(jobFile)
      rec.readings.job_record = jobRec
      if (jobRec === null) {
        push('JOB01-LAUNCH', `judge-start 之后必须已有 job 记录 ${jobFile}（launch intent 先落盘，再起作业）`)
      } else {
        for (const key of ['schema', 'job_id', 'role', 'tool_name', 'attempt', 'generation', 'parent_session_id', 'parent_state', 'state', 'started_at', 'last_liveness_event_at', 'lease_minutes', 'result_path', 'failure_reason']) {
          if (!(key in jobRec)) push('JOB01-FIELDS', `job 记录缺 ${key}（提案 §B3.6 的字段表）`)
        }
        if (jobRec.state !== 'running') push('JOB01-LAUNCH', `刚派工时 job state 应为 running，实得 ${JSON.stringify(jobRec.state)}`)
        if (jobRec.lease_minutes !== FROZEN.leases.update) push('JOB01-LEASE', `job 侧租约应为 ${FROZEN.leases.update} 分钟，实得 ${JSON.stringify(jobRec.lease_minutes)}`)
      }
      // ② "派工后立即返回"：刚 start 完就读状态，job 不能已经 done（父没被阻塞等结果）
      rec.readings.immediate_state = { judge_job_state: start.json?.judge_job_state ?? null, started_at: jobRec?.started_at ?? null, finished_at: jobRec?.finished_at ?? null }
      if (jobRec && jobRec.finished_at !== null && jobRec.finished_at !== undefined) {
        push('JOB01-NONBLOCK', 'judge-start 立刻返回时 job 不该已经有 finished_at（那意味着前台等结果了）')
      }

      if (!requireNotify(problems, '通知接缝')) caseFail(problems)
      // ③ 通知到达 ⇒ 处理结果
      const resultFile = writeFixture('JOB-01', 'judge-result', { ok: true, role: 'memory-judge', new_snapshot: 'v1' })
      const delivered = notify({
        op: 'deliver', dataRoot: bp.root,
        extra: ['--status-root', path.join(ws, '.team'), '--job', 'memory-judge', '--job-id', jobId, '--state', 'done', '--result-file', resultFile],
      })
      rec.readings.delivered = { exit_code: delivered.exit_code, code: delivered.json?.error?.code ?? null }
      const afterDeliver = readJson(jobFile)
      rec.readings.after_deliver = afterDeliver ? { state: afterDeliver.state, finished_at: afterDeliver.finished_at, result_path: afterDeliver.result_path, last_liveness_event_at: afterDeliver.last_liveness_event_at } : null
      if (delivered.exit_code !== 0) push('JOB01-NOTIFY', `通知投递必须成功（正例），实得 exit=${delivered.exit_code} / ${delivered.json?.error?.code ?? '(无码)'}`)
      else if (afterDeliver && afterDeliver.state !== 'done') push('JOB01-NOTIFY', `通知到达后 job state 应为 done，实得 ${afterDeliver.state}`)
      // ④ liveness 是**事件式**：完成事件必须推进它
      if (afterDeliver && jobRec && afterDeliver.last_liveness_event_at === jobRec.last_liveness_event_at) {
        push('JOB01-LIVENESS', '完成事件没有推进 last_liveness_event_at —— liveness 必须在启动/阶段写出/完成/父处理/巡检时更新')
      }

      // ⑤ 丢通知：只检测未结，**不冒充完成**
      const job2 = 'job-memory-judge-2'
      runBrain('judge-start', { generation, attempt, token: 'tok2', job_id: job2 }, { dataRoot: bp.root })
      const dropped = notify({
        op: 'deliver', dataRoot: bp.root,
        extra: ['--status-root', path.join(ws, '.team'), '--job', 'memory-judge', '--job-id', job2, '--state', 'done', '--result-file', writeFixture('JOB-01', 'judge-result-2', { ok: true }), '--drop-notice'],
      })
      rec.readings.dropped = { exit_code: dropped.exit_code, code: dropped.json?.error?.code ?? null }
      const j2 = readJson(bp.jobFile(job2))
      const droppedNotice = path.join(bp.noticesDir, `dropped-${job2}.json`)
      rec.readings.dropped_evidence = { job2_state: j2?.state ?? null, notice_file: existsSync(droppedNotice) }
      if (dropped.exit_code !== 0) push('JOB01-DROP', `--drop-notice 必须成功（它是接缝），实得 exit=${dropped.exit_code} / ${dropped.json?.error?.code ?? '(无码)'}`)
      if (j2 && j2.state === 'done') push('JOB01-DROP', '丢通知之后 job 竟被标成 done —— 丢通知时下一开工**只能检测未结**，不许冒充完成')
      if (!existsSync(droppedNotice)) push('JOB01-DROP', `--drop-notice 必须留下痕迹 ${droppedNotice}（不许静默丢弃）`)
      // 读面：未结要在状态里看得出来
      const state = runBrain('state-read', {}, { dataRoot: bp.root })
      rec.readings.state_read = { exit_code: state.exit_code, code: state.json?.error?.code ?? null, phase: state.json?.state?.phase ?? null }
      if (state.exit_code === 0) {
        const st = state.json?.state ?? {}
        if (st.snapshot_available === true && st.phase === 'judging') push('JOB01-STATE', '出现了 judging && snapshot_available=true')
      }
      rec.readings.parent_not_blocked = {
        status: 'PENDING',
        note: '"父不被阻塞、派工后父还能继续收发消息、完成由通知而不是页面卡着等回来看得见" 只能在 R1-02/GUI-02 由人在界面确认（探针/日志不算）。',
      }
      caseFail(problems)
    })
  })

  test('JOB-02 失败/父死/未完成/超租约：failed|partial|未结，不自动重跑不冒充完成', async () => {
    await runCase('JOB-02', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      rec.readings.staging = stagingReadings()
      const bp = caseBrainRoot('JOB-02', 'failure')
      const ws = caseWorkspace('JOB-02', 'failure')
      setNow('2026-10-14T12:00:00+08:00')
      if (!requireBrain(problems, '失败/接手读数')) caseFail(problems)
      const init = runBrain('init', {}, { dataRoot: bp.root })
      if (init.exit_code !== 0) { push('JOB02-INIT', `init 必须成功（正例），实得 exit=${init.exit_code} / ${init.json?.error?.code ?? '(无码)'}`); caseFail(problems) }
      const claim = runBrain('claim-update', { day: DAY, owner_project: 'harness', owner_session: 'session-p-0000' }, { dataRoot: bp.root })
      if (claim.exit_code !== 0) { push('JOB02-CLAIM', `claim-update 必须成功（正例），实得 ${claim.exit_code} / ${claim.json?.error?.code ?? '(无码)'}`); caseFail(problems) }

      // ① 判决失败：job-mark 记 failed + 原因
      const jobId = 'job-memory-judge-1'
      runBrain('judge-start', { generation: 1, attempt: 1, token: 'tok', job_id: jobId }, { dataRoot: bp.root })
      const reason = '（夹具）判决作业退出码非 0'
      const marked = runBrain('job-mark', { job: 'judge', job_id: jobId, state: 'failed', result_path: null, exit_code: 2, failure_reason: reason }, { dataRoot: bp.root })
      rec.readings.job_mark = { exit_code: marked.exit_code, code: marked.json?.error?.code ?? null, job_state: marked.json?.job_state ?? null }
      const j = readJson(bp.jobFile(jobId))
      rec.readings.failed_job = j ? { state: j.state, failure_reason: j.failure_reason } : null
      if (marked.exit_code !== 0) push('JOB02-MARK', `job-mark(failed) 必须成功（正例），实得 ${marked.exit_code} / ${marked.json?.error?.code ?? '(无码)'}`)
      else if (j && (j.state !== 'failed' || j.failure_reason !== reason)) {
        push('JOB02-FAILED', `失败状态必须落成 state=failed + failure_reason 原样保留，实得 state=${j.state} reason=${JSON.stringify(j.failure_reason)}`)
      }
      // ② 已发布快照仍可用（失败不许把快照锁死）
      const snap = runBrain('snapshot-read', {}, { dataRoot: bp.root })
      rec.readings.snapshot_after_failure = { exit_code: snap.exit_code, code: snap.json?.error?.code ?? null }
      if (snap.exit_code !== 0) push('JOB02-SNAPSHOT', `判决失败之后已发布的快照必须仍然可读，实得 exit=${snap.exit_code} / ${snap.json?.error?.code ?? '(无码)'}`)

      // ③ 父死接缝 ⇒ parent_state=dead；下一 owner 接手仍看得到失败原因
      if (requireNotify(problems, '父死接缝')) {
        const livenessFile = path.join(ws, 'parent-liveness.json')
        const dead = notify({ op: 'parent-dead', extra: ['--parent-session-id', 'session-p-0000', '--liveness-file', livenessFile] })
        rec.readings.parent_dead = { exit_code: dead.exit_code, code: dead.json?.error?.code ?? null }
        if (dead.exit_code !== 0) push('JOB02-PARENT-DEAD', `bg-notify --op parent-dead 必须成功（接缝），实得 ${dead.exit_code} / ${dead.json?.error?.code ?? '(无码)'}`)
        const lv = readJson(livenessFile)
        rec.readings.parent_state = lv?.parent_state ?? null
        if (lv && lv.parent_state !== 'dead') push('JOB02-PARENT-DEAD', `父死接缝必须写 parent_state:"dead"，实得 ${JSON.stringify(lv.parent_state)}`)
      }
      // 下一 owner 读（另一个 project/session）—— 失败原因不许丢
      const nextState = runBrain('state-read', {}, { dataRoot: bp.root })
      rec.readings.next_owner_read = { exit_code: nextState.exit_code, code: nextState.json?.error?.code ?? null, failure_reason: nextState.json?.state?.failure_reason ?? null, phase: nextState.json?.state?.phase ?? null }
      if (nextState.exit_code === 0) {
        const st = nextState.json?.state ?? {}
        const asText = JSON.stringify(st)
        if (!asText.includes(reason)) push('JOB02-NEXT-OWNER', '下一 owner 读状态时看不到 failure_reason —— 失败原因必须保留可见（要人工处理）')
      }
      // ④ 不自动重跑 / 不自动杀 job：一次读操作不许产生新 job
      const jobsBefore = listJobs(bp)
      runBrain('state-read', {}, { dataRoot: bp.root })
      const jobsAfter = listJobs(bp)
      rec.readings.jobs = { before: jobsBefore, after: jobsAfter }
      if (JSON.stringify(jobsBefore) !== JSON.stringify(jobsAfter)) push('JOB02-NO-RETRY', `读一次状态就多出了 job：${JSON.stringify(jobsBefore)} → ${JSON.stringify(jobsAfter)} —— 不许自动重跑`)

      // ⑤ 超租约：liveness 落后 120 分钟（> update 90）⇒ 未结/stale，不许当完成
      const job3 = 'job-memory-judge-3'
      runBrain('judge-start', { generation: 1, attempt: 1, token: 'tok3', job_id: job3 }, { dataRoot: bp.root })
      writeJson(bp.jobFile(job3), { ...(readJson(bp.jobFile(job3)) ?? {}), state: 'running', last_liveness_event_at: '2026-10-14T10:00:00+08:00' })
      setNow('2026-10-14T12:00:00+08:00')
      const staleRead = runBrain('state-read', {}, { dataRoot: bp.root })
      const j3 = readJson(bp.jobFile(job3))
      rec.readings.stale_job = { state: j3?.state ?? null, age_minutes: 120, lease: FROZEN.leases.update }
      if (j3 && j3.state === 'done') push('JOB02-LEASE', '超过租约（120 > 90 分钟）的 job 不许被当成完成')
      rec.readings.not_killed = { note: '本用例从头到尾没有"杀 job"的动作，也不断言实现会杀 —— 契约要求的是**不自动杀**；读面必须显示未结/stale。' }
      rec.readings.pending_r1 = {
        status: 'PENDING',
        note: '"父死之后下一 owner 生成失败摘要卡、老板在界面看到、不丢 failure_reason" 的**可见面**归 GUI-06/R1-04；这里只验状态与字段。',
      }
      caseFail(problems)
    })
  })

  test('JOB-03 快照已发布而复核失败：本地双评审仍可启动，partial 可见，缺失能补起', async () => {
    await runCase('JOB-03', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      rec.readings.staging = stagingReadings()
      const bp = caseBrainRoot('JOB-03', 'partial')
      const ws = caseWorkspace('JOB-03', 'partial')
      setNow('2026-10-14T12:00:00+08:00')
      if (!requireBrain(problems, '快照/状态')) caseFail(problems)
      if (!stagingExists('bin/agenia-local.mjs')) push('SUT-SURFACE-MISSING', 'staged/bin/agenia-local.mjs 不在 ⇒ 本地双评审的 claim 拿不到（预期的首跑红）')
      const init = runBrain('init', {}, { dataRoot: bp.root })
      if (init.exit_code !== 0) { push('JOB03-INIT', `init 必须成功（正例），实得 ${init.exit_code} / ${init.json?.error?.code ?? '(无码)'}`); caseFail(problems) }
      runBrain('claim-update', { day: DAY, owner_project: 'harness', owner_session: 'session-p-0000' }, { dataRoot: bp.root })
      runBrain('judge-start', { generation: 1, attempt: 1, token: 'tok', job_id: 'job-memory-judge-1' }, { dataRoot: bp.root })
      const commit = runBrain('judge-commit', {
        generation: 1, attempt: 1, token: 'tok', base_snapshot: 'v0',
        entries_patch: [{ kind: 'add', entry: { id: 'm-00000001', type: 'general', text: '（夹具）', raw: 0.5, imp_share: 1, fresh_share: 1, double_low_streak: 0, is_double_low: false, last_evidence_review: DAY, known_from: 'fixture', created_at: '2026-10-14T00:00:00+08:00', type_changed_at: null } }],
        accepted: [], maintenance_decisions: [],
        common_sense_sha256: init.json?.common_sense_sha256 ?? 'a'.repeat(64),
        report: {},
      }, { dataRoot: bp.root })
      rec.readings.commit = { exit_code: commit.exit_code, code: commit.json?.error?.code ?? null, snapshot_available: commit.json?.snapshot_available ?? null, phase: commit.json?.phase ?? null }
      if (commit.exit_code !== 0) { push('JOB03-COMMIT', `判决提交必须成功（正例），实得 ${commit.exit_code} / ${commit.json?.error?.code ?? '(无码)'}`); caseFail(problems) }

      // ① 复核失败（partial）之后，本地两场**仍然可启动**（快照不被 reviewing/partial 锁死）
      if (stagingExists('bin/agenia-local.mjs')) {
        const conv = runLocalSoft('JOB-03', 'local-claim', { project: 'harness', day: DAY, snapshot: 'v1', field: 'conversation', attempt: 1, job_id: 'job-conversation-review-1' }, ws)
        const tech = runLocalSoft('JOB-03', 'local-claim', { project: 'harness', day: DAY, snapshot: 'v1', field: 'technical', attempt: 1, job_id: 'job-technical-review-1' }, ws)
        rec.readings.claims_after_partial = [
          { field: 'conversation', exit_code: conv.exit_code, code: conv.json?.error?.code ?? null },
          { field: 'technical', exit_code: tech.exit_code, code: tech.json?.error?.code ?? null },
        ]
        if (conv.exit_code !== 0 || tech.exit_code !== 0) {
          push('JOB03-NOT-LOCKED', `快照已发布（phase=${commit.json?.phase}）时本地两场必须能启动，实得 exit=${conv.exit_code}/${tech.exit_code}（${conv.json?.error?.code ?? '-'} / ${tech.json?.error?.code ?? '-'}）—— 不许因为 reviewing/partial 把快照锁死`)
        }
        // ② partial / 失败必须对老板**可见**
        const fail = runLocalSoft('JOB-03', 'local-fail', { project: 'harness', day: DAY, snapshot: 'v1', field: 'conversation', failure_reason: '（夹具）会话评审失败' }, ws)
        rec.readings.local_fail = { exit_code: fail.exit_code, code: fail.json?.error?.code ?? null }
        const health = runLocalSoft('JOB-03', 'health', { project: 'harness', day: DAY }, ws)
        rec.readings.health = { exit_code: health.exit_code, code: health.json?.error?.code ?? null, status: health.json?.health?.status ?? null, reasons: health.json?.health?.reasons ?? null }
        // 🔴 裁定 v1.13 ②③：「期望必须存在」前置 —— health 读不出来时，"失败必须可见"这条**不许静默跳过**
        if (health.exit_code !== 0 || typeof health.json?.health?.status !== 'string') {
          push('JOB03-HEALTH-UNREADABLE', `本地评审失败之后 health 必须能读出来（"失败必须对老板可见"这条全押在它上面），实得 exit=${health.exit_code} / status=${JSON.stringify(health.json?.health?.status)} / code=${health.json?.error?.code ?? '(无码)'}`)
        } else if (health.json.health.status === 'GREEN') {
          push('JOB03-VISIBLE', '本地评审失败之后 health 仍是 GREEN —— partial/失败必须对老板可见')
        }
        // ③ 缺失的那一场能补起（重查点补启动）
        const retry = runLocalSoft('JOB-03', 'local-claim', { project: 'harness', day: DAY, snapshot: 'v1', field: 'conversation', attempt: 2, job_id: 'job-conversation-review-2' }, ws)
        rec.readings.reclaim = { exit_code: retry.exit_code, code: retry.json?.error?.code ?? null }
        if (retry.exit_code !== 0) push('JOB03-RECHECK', `失败之后重查点必须能**补起**这一场（新 attempt 再 claim），实得 ${retry.exit_code} / ${retry.json?.error?.code ?? '(无码)'}`)
      }
      rec.readings.recheck_pending = {
        status: 'PENDING',
        note: '"下一次老板开口 / 下一关前的重查点 R-A/B/C" 是**流程触发**（谁在什么时候重查）⇒ 自动层只能证"补得起来"；真触发归 JOB-01 的通知路与 R1。',
      }
      caseFail(problems)
    })
  })

  test('JOB-04 liveness 事件式：89/90/91 边界（update 90 / local 45）、无定时器、旧通知被 fence', async () => {
    await runCase('JOB-04', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      rec.readings.staging = stagingReadings()

      // ① 纯函数：`age >= lease` 即 stale（C-5 / 追加裁定 v1.2），update 90 与 local 45 分列
      const lib = await loadStagedModule('lib/health.mjs', ['staleVerdict'])
      rec.readings.health_lib = { surfaceMissing: lib.surfaceMissing, missing: lib.missing }
      if (lib.surfaceMissing) push('SUT-SURFACE-MISSING', 'staged/lib/health.mjs 不在 ⇒ liveness 阈值判定拿不到（预期的首跑红）')
      else if (typeof lib.mod?.staleVerdict === 'function') {
        const base = Date.parse('2026-10-14T12:00:00+08:00')
        const rows = {}
        for (const lease of [FROZEN.leases.update, FROZEN.leases.local]) {
          for (const age of [lease - 1, lease, lease + 1]) {
            let out = null
            try { out = lib.mod.staleVerdict(new Date(base - age * 60000).toISOString(), new Date(base).toISOString(), lease) } catch (err) { push('JOB04-STALE', `staleVerdict 抛错（lease=${lease} age=${age}）：${String(err.message).slice(0, 140)}`); continue }
            rows[`lease=${lease}/age=${age}`] = { stale: out?.stale ?? null, ageMinutes: out?.ageMinutes ?? null }
            const want = age >= lease
            if (out?.stale !== want) push('JOB04-STALE', `lease=${lease}、年龄 ${age} ⇒ stale 应为 ${want}（C-5：age >= lease 即过期），实得 ${out?.stale}`)
          }
        }
        rec.readings.stale_matrix = rows
      }

      // ② 跑起来的那一侧：job 的 liveness 由**事件**推进（不是定时器）
      const bp = caseBrainRoot('JOB-04', 'liveness')
      setNow('2026-10-14T12:00:00+08:00')
      if (!requireBrain(problems, 'job liveness')) caseFail(problems)
      const init = runBrain('init', {}, { dataRoot: bp.root })
      if (init.exit_code !== 0) { push('JOB04-INIT', `init 必须成功（正例），实得 ${init.exit_code} / ${init.json?.error?.code ?? '(无码)'}`); caseFail(problems) }
      runBrain('claim-update', { day: DAY, owner_project: 'harness', owner_session: 'session-p-0000' }, { dataRoot: bp.root })
      const jobId = 'job-memory-judge-1'
      runBrain('judge-start', { generation: 1, attempt: 1, token: 'tok', job_id: jobId }, { dataRoot: bp.root })
      const t0 = readJson(bp.jobFile(jobId))?.last_liveness_event_at ?? null
      const marked = runBrain('job-mark', { job: 'judge', job_id: jobId, state: 'done', result_path: 'state/jobs/x.result.json', exit_code: 0, failure_reason: null }, { dataRoot: bp.root })
      const t1 = readJson(bp.jobFile(jobId))?.last_liveness_event_at ?? null
      rec.readings.liveness_events = { start: t0, after_mark: t1, mark_exit: marked.exit_code }
      if (marked.exit_code === 0 && t0 !== null && t1 !== null && t1 < t0) push('JOB04-LIVENESS', `完成事件把 last_liveness_event_at 往回写了（${t0} → ${t1}）`)
      // 时间推进到 +90/+91 分钟：stale（用纯函数判，落在这里做端到端读数）
      rec.readings.lease_constants = FROZEN.leases

      // ③ 代码里不许有"定时心跳"
      const scanned = []
      for (const rel of ['lib/liveness.mjs', 'lib/state.mjs', 'lib/local-state.mjs', 'lib/health.mjs', path.join('bin', 'bg-notify.mjs')]) {
        if (!stagingExists(rel)) continue
        scanned.push(rel)
        const text = readStagedText(rel)
        text.split(/\r?\n/).forEach((line, i) => {
          if (/^\s*(\/\/|\*|#)/.test(line)) return
          if (/setInterval\s*\(/.test(line)) push('JOB04-TIMER', `${rel}:${i + 1} 出现 setInterval —— liveness 是**事件式**的，不许定时心跳：${line.trim().slice(0, 120)}`)
          if (/每\s*5\s*分钟|every\s*5\s*min/i.test(line)) push('JOB04-TIMER', `${rel}:${i + 1} 出现"每 5 分钟"这类定时描述：${line.trim().slice(0, 120)}`)
          if (/lease/i.test(line) && /\b60\b/.test(line)) push('JOB04-LEASE-60', `${rel}:${i + 1} 出现 60 分钟的租约旧值（冻结：update 90 / local 45）：${line.trim().slice(0, 120)}`)
        })
      }
      rec.readings.timer_scan = scanned
      if (scanned.length === 0) push('SUT-SURFACE-MISSING', 'staged 里没有可扫的 lib/bin 文件 ⇒ 定时器与租约常量无从检查（预期红）')

      // ④ 旧通知被 fence（迟到的 job 结果不许改状态）
      if (requireNotify(problems, '旧通知 fence')) {
        const ws = caseWorkspace('JOB-04', 'fence')
        const before = readJson(bp.jobFile(jobId))
        const late = notify({
          op: 'deliver', dataRoot: bp.root,
          extra: ['--status-root', path.join(ws, '.team'), '--job', 'memory-judge', '--job-id', 'job-memory-judge-OLD', '--state', 'done', '--result-file', writeFixture('JOB-04', 'old', { ok: true })],
        })
        rec.readings.late_notice = { exit_code: late.exit_code, code: late.json?.error?.code ?? null }
        const after = readJson(bp.jobFile(jobId))
        if (JSON.stringify(before) !== JSON.stringify(after)) push('JOB04-FENCE', '一个不存在的旧 job id 的通知改动了当前 job 的记录 —— 旧通知必须被 fence')
        if (late.exit_code === 0) push('JOB04-FENCE', '对未知/旧 job id 的投递竟然成功了 —— 应当被 fence（E_JOB_UNKNOWN / E_JOB_FENCE_STALE）')
      }
      rec.readings.parent_handling = {
        note: '"父处理"也是一个 liveness 事件（B3.6 的字段说明）：本用例把可观测的事件点（start / mark / 通知）串起来读；父进程真死的那条在 JOB-02。',
      }
      caseFail(problems)
    })
  })
})

// ── 小工具 ─────────────────────────────────────────────────────────────────
const runLocalSoft = (caseId, op, payload, ws) => {
  try {
    return runLocal(caseId, op, payload, { workspace: ws })
  } catch (err) {
    return { exit_code: null, json: { error: { code: err?.code ?? 'THREW' } }, stdout: '', stderr: String(err.message) }
  }
}
function listJobs(bp) {
  try {
    return readdirSync(bp.jobsDir).sort()
  } catch {
    return []
  }
}
