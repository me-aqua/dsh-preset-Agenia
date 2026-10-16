/**
 * STAT-04 / DOC-01 —— 文档与阶段账。
 *
 * 静态层的**能力上限**说在前面：文档用例只能做到"**命中/缺失清单**"（契约 STAT-04 的证据列
 * 就是这么写的）—— 它证明不了文义，只证明那些必须出现的字面量在、必须消失的旧口径不在。
 * 所以每一条断言都写成"指名道姓的针"，而不是"读起来对不对"。
 *
 * ⚠️ **本文件出现活体路径是故意的**：`AGENTS.md` / `README.md` / `.team/leader/now.md`
 *    不在 `presets/agenia/` 里，staging 不镜像它们 ⇒ 它们只能按项目根读。
 *    预设自己的三份（leader.md / work-guidelines.md / 说明.md）走 staging（被测对象永远是 staging）。
 */
import { before, describe, test } from 'node:test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { FROZEN, PATHS } from '../support/env.mjs'
import { caseFail, caseHold, preflight, problem, runCase, sha256Text, sha256File, stagingReadings, oracleReadings } from '../support/evidence.mjs'
import { readStagedText, stagingExists } from '../support/sut.mjs'

before(() => {
  preflight({ calibrateLive: true })
})

/** 每份文档要查的针：`must` 必须出现；`mustNot` 必须消失（旧口径）。 */
const DOC_SPECS = [
  {
    rel: 'leader.md',
    root: 'staged',
    must: [
      ['job_memory_judge', '四类一次性作业的工具名（role → job_* 映射表）'],
      ['job_memory_review', '四类一次性作业的工具名（role → job_* 映射表）'],
      ['job_conversation_review', '四类一次性作业的工具名（role → job_* 映射表）'],
      ['job_technical_review', '四类一次性作业的工具名（role → job_* 映射表）'],
      ['memory-review', '四作业的角色标记'],
      ['conversation-review', '四作业的角色标记'],
      ['technical-review', '四作业的角色标记'],
      ['run_in_background', '调用参数名（拍板 I1：不许与 config 键 enableRunInBackground 混写）'],
      ['后台', '一律后台这条硬规则'],
      ['一次性', '四作业是一次性、不是常驻编制'],
      ['五关', '四作业不是五关环节'],
      ['回执', '技术复盘的组长处置回执职责'],
    ],
    mustNot: [['enableRunInBackground', '把 config 键当成调用参数写进了给模型的文档（拍板 I1）']],
  },
  {
    rel: 'work-guidelines.md',
    root: 'staged',
    must: [
      ['大阶段', '路线层级：目标 → 大阶段 → 任务 → 五关'],
      ['任务', '路线层级：目标 → 大阶段 → 任务 → 五关'],
      ['五关', '路线层级：目标 → 大阶段 → 任务 → 五关'],
      ['run_in_background', '后台 guard 的调用参数'],
      ['回执', '技术回执'],
      ['distribution', '四类分布的字段/口径指针'],
    ],
    mustNot: [],
  },
  {
    rel: '说明.md',
    root: 'staged',
    must: [
      ['bin/', '新目录 bin/'],
      ['lib/', '新目录 lib/'],
      ['job-briefs/', '新目录 job-briefs/'],
    ],
    mustNot: [],
  },
  {
    rel: 'README.md',
    root: 'repo',
    must: [
      ['bin/', '新目录 bin/'],
      ['lib/', '新目录 lib/'],
      ['job-briefs/', '新目录 job-briefs/'],
    ],
    mustNot: [],
  },
  {
    rel: 'AGENTS.md',
    root: 'repo',
    must: [
      ['tool-job-memory-judge', '能力差异表要按新计数改（4 条 job 行）'],
      ['tool-job-memory-review', '能力差异表要按新计数改（4 条 job 行）'],
      ['tool-job-conversation-review', '能力差异表要按新计数改（4 条 job 行）'],
      ['tool-job-technical-review', '能力差异表要按新计数改（4 条 job 行）'],
      ['job-briefs', '不注入的作业书目录'],
    ],
    mustNot: [
      ['差异是六项', '能力差异表还写着"差异是六项"（新计数是 10 项 / 42 行）'],
      ['必须正好是上面这六项', 'onlyInAgenia 的期望还写着"正好是上面这六项"'],
    ],
  },
  {
    rel: 'AGENTS.local.md',
    root: 'repo',
    must: [],
    mustNot: [['tool-job-', '本机事实文件里出现了 job 工具名 —— B2.4 说本轮 AGENTS.local.md 不该动']],
  },
  {
    rel: '.team/leader/now.md',
    root: 'repo',
    // 🔴 2026-10-16（票 `T-TEST-04` · 技术评审 F6）：这一页**每天开工重写** ⇒ 断言**不许钉它今天写了什么**。
    //    原来钉的是「大阶段」「五关」两个**词** —— 那与"今天她写没写这两个字"等价，红绿**不由代码决定**。
    //    ⚠️ 路线层级那套词**没有丢**：`leader.md` / `work-guidelines.md` 两份**冻结**文档上照样钉着
    //      （见上面两条 spec）—— 从活页上撤掉，不是从判据里撤掉。
    //    ⇒ 改成钉**形态**：第一行必须是 `# now（YYYY-MM-DD · 一句话）` 那个固定形状
    //      （队伍规矩：`now.md` 的第一行永远是**它被写下的那一天**）。她随便重写照旧绿；
    //      把形状写坏（没有标题行 / 没有日期 / 日期不成形）才红。
    must: [],
    mustNot: [],
    form: 'now-first-line',
  },
]

/**
 * `now.md` 的**形态**判据（`T-TEST-04`）—— **只看形状，不看内容**。
 *
 * 队伍规矩（`work-guidelines.md` / `AGENTS.md`）：`now.md` 的**第一行永远是它被写下的那一天**，
 * 格式固定：`# now（YYYY-MM-DD · 一句话说清手头这件事）`。
 * 这条判据与"今天她写了什么"**无关**：日期是哪一天不管、那"一句话"是什么不管；
 * 变的只有形状（有没有那一行、日期成不成 `YYYY-MM-DD`、括号与分隔符在不在）。
 *
 * @returns {Array<{code:string,message:string}>} 空数组 = 形态合格
 */
function nowFormProblems(text) {
  const out = []
  const first = String(text ?? '').split(/\r?\n/).find((l) => l.trim() !== '') ?? ''
  const m = /^#\s*now\s*[（(]\s*(\d{4}-\d{2}-\d{2})\s*[·・]\s*(.+?)\s*[）)]\s*$/.exec(first.trim())
  if (m === null) {
    out.push({
      code: 'DOC-FORM-NOW-HEAD',
      message: `now.md 第一行不是 \`# now（YYYY-MM-DD · 一句话）\` 那个固定形状（队伍规矩：第一行永远是它被写下的那一天）。实得：${JSON.stringify(first.trim().slice(0, 120))}`,
    })
    return out
  }
  const day = Date.parse(`${m[1]}T00:00:00Z`)
  if (Number.isNaN(day)) out.push({ code: 'DOC-FORM-NOW-DATE', message: `now.md 第一行那个日期不是合法日期：${m[1]}` })
  return out
}

function readDoc(spec, problems) {
  if (spec.root === 'staged') {
    if (!stagingExists(spec.rel)) {
      problems.push(problem('DOC-MISSING', `staged 还没有 ${spec.rel}（staging 未实现 ⇒ 预期红）`))
      return null
    }
    return readStagedText(spec.rel)
  }
  const abs = path.join(PATHS.repo, spec.rel)
  try {
    return readFileSync(abs, 'utf8')
  } catch {
    problems.push(problem('DOC-MISSING', `读不到 ${abs}`))
    return null
  }
}

describe('static · docs', () => {
  test('STAT-04 文档清单同批口径一致（新计数 / 后台 guard / 回执 / 分布 / 旧口径退役）', async () => {
    await runCase('STAT-04', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      rec.readings.staging = stagingReadings()
      rec.readings.docs = {}

      for (const spec of DOC_SPECS) {
        const text = readDoc(spec, problems)
        if (text === null) continue
        const hits = []
        const misses = []
        for (const [needle, why] of spec.must) {
          if (text.includes(needle)) hits.push(needle)
          else { misses.push(needle); push('DOC-NEEDLE-MISSING', `${spec.rel} 缺少必须出现的「${needle}」（${why}）`) }
        }
        const stale = []
        for (const [needle, why] of spec.mustNot) {
          if (text.includes(needle)) { stale.push(needle); push('DOC-STALE', `${spec.rel} 里还留着旧口径「${needle}」：${why}`) }
        }
        rec.readings.docs[spec.rel] = {
          root: spec.root,
          sha256: spec.root === 'staged' ? null : sha256File(path.join(PATHS.repo, spec.rel)),
          hits,
          misses,
          stale,
        }
        // ── 形态判据（`T-TEST-04`）：**不钉内容**，只钉形状 ──────────────────────
        // 🔴 判据自己也要有阳性对照：`nowFormProblems()` 先在一段**形状坏掉的样例**上跑，
        //    必须报出问题 —— 否则"形态判据"可能是个永远绿的摆设。
        if (spec.form === 'now-first-line') {
          // 【怎么翻面】两条对照，**都在用例内部**（活体那一页是组长的文件，测试岗没有它的写权限）：
          //   ① **内容无关**：同一形状、**完全不同的内容**（另一个日期、另一句话、另一段正文）⇒ 必须 0 问题。
          //   ② **形状坏掉**：没有 `# now（日期 · 一句话）` 首行 ⇒ 必须报 `DOC-FORM-NOW-HEAD`。
          const formProbe = nowFormProblems('# 今天的事\n\n- 手头：……\n')
          const formSameShapeOtherContent = nowFormProblems('# now（2019-01-01 · 一句完全不同的话，跟今天毫无关系）\n\n- 随便什么正文\n- 另一个大阶段：脑暴\n')
          rec.readings.now_form_control = {
            same_shape_other_content_problems: formSameShapeOtherContent.map((p) => p.code),
            broken_sample_problems: formProbe.map((p) => p.code),
            note: '① 同形状换内容必须 0 问题（内容无关）② 没有 `# now（日期 · 一句话）` 首行必须报 DOC-FORM-NOW-HEAD',
          }
          if (formSameShapeOtherContent.length !== 0) {
            push('DOC-FORM-CONTROL', `形态判据自控失败：**同形状、换内容**的样例（另一个日期、另一句话）竟然被判出问题 ${JSON.stringify(formSameShapeOtherContent.map((p) => p.code))} —— 那说明这条判据还在钉内容`)
          }
          if (formProbe.length === 0) {
            push('DOC-FORM-CONTROL', '形态判据自控失败：一段**没有** `# now（YYYY-MM-DD · …）` 首行的样例竟然被判成合格 —— 这条判据抓不到它本来要抓的东西')
          }
          const formProblems = nowFormProblems(text)
          rec.readings.docs[spec.rel].form = { kind: spec.form, problems: formProblems.map((p) => p.code) }
          for (const p of formProblems) push(p.code, p.message)
        }
      }

      // 文档清单里**路径没冻结**的几项：只记读数，不判红（裁定 A7：记录，不判红）
      rec.readings.docs_unresolved = FROZEN.docsUnresolved.map((name) => ({ name, note: '没有任何冻结页给出它的路径；Phase 3 文档对齐时再冻（裁定 A7）—— 不自己造路径、不判红' }))
      rec.readings.restart_card = {
        path: FROZEN.restartCard,
        exists: existsSync(FROZEN.restartCard),
        sha256: existsSync(FROZEN.restartCard) ? sha256File(FROZEN.restartCard) : null,
        note: '裁定 A7：重启卡路径已有 ⇒ 只记录、不判红',
      }

      // 「旧每日检查退役」这条**没有可指名的字面量**（裁定 A8：记录，不判红）—— 只记读数
      rec.readings.retired_daily_check = {
        note: '裁定 A8：旧"每日检查退役"暂无可指名字面量；Phase 3 文档对齐时冻结载体与措辞再加断言 ⇒ 现在只记录',
      }
      rec.readings.ruling_notes = {
        A9: 'check-notes 旧口径用四条必须消失的字面量判（裁定 A9 已认可）',
        A10: '历史 GO 的 occurred_at=null + note 算过；"必须含时间"只适用于实现后新发生的切换（裁定 A10 = 拍板 Q4）',
        A12: 'STAT-04/DOC-01 只能到"命中/缺失"层；文义正确性最终靠人读/GUI',
      }

      // 不得声称未实现的功能已完成：任何一行做出完成断言，同一行必须有否定词
      for (const spec of DOC_SPECS) {
        const text = readDoc(spec, [])
        if (!text) continue
        const bad = text
          .split(/\r?\n/)
          .map((l, i) => [i + 1, l])
          .filter(([, l]) => /已(经)?实现/.test(l) && !/没有|未|尚未|还没/.test(l))
        if (bad.length > 0) push('DOC-OVERCLAIM', `${spec.rel} 有 ${bad.length} 行像是在声称功能已实现（同句没有否定词）：第 ${bad.map(([n]) => n).join(', ')} 行`)
      }

      caseFail(problems)
    })
  })

  test('DOC-01 老板阅读版 / now / log 与 v5、当前阶段、GO 状态一致', async () => {
    await runCase('DOC-01', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      rec.readings.oracle = oracleReadings()

      const readLive = (abs) => {
        try {
          return readFileSync(abs, 'utf8')
        } catch (err) {
          push('DOC-MISSING', `读不到 ${abs}：${err.message}`)
          return null
        }
      }
      const reading = readLive(FROZEN.docConsistency.readingVersion)
      const now = readLive(FROZEN.docConsistency.leaderNow)
      const log = readLive(FROZEN.docConsistency.leaderLog)
      rec.readings.sha256 = {
        reading_version: reading ? sha256Text(reading) : null,
        leader_now: now ? sha256Text(now) : null,
        leader_log: log ? sha256Text(log) : null,
      }
      for (const [label, text] of [['老板阅读版', reading], ['leader/now.md', now], ['leader/log.md', log]]) {
        if (text && text.includes('B02501C54CAE3741533F961763AC5B57F655B19D9579578F7129C85D7D092C55')) rec.readings[`${label}_binds_v5_sha`] = true
      }

      // ① 阅读版必须引 v5 / 窄评审结论
      if (reading) {
        if (!/v5/.test(reading)) push('DOC-V5', '老板阅读版没有引 v5')
        if (!/窄评/.test(reading)) push('DOC-V5', '老板阅读版没有引窄评审的结论')
        for (const needle of ['仍等老板施工 GO', '还差施工 GO', '还没有施工 GO', '未给施工 GO', '没有施工 GO']) {
          if (reading.includes(needle)) push('DOC-STALE', `老板阅读版还写着「${needle}」—— now 说已经进入执行一，两边打架`)
        }
      }

      // ② now 内部的阶段账不许自相矛盾。
      //    判据（2026-10-14 收紧过一次，来历记在这里）：**先算出每一行"声称的当前阶段"，再要求全部一致**。
      //    第一版太粗 —— 它把「当前大阶段**已从**计划阶段**切到**执行一」这种**交接句**也当成了第二个当前值；
      //    组长修好第 8 行之后它还会误报。⚠️ 收紧不许把原缺陷放过：原缺陷是
      //    「第 8 行声称**计划**、第 18 行声称**执行一**」—— 两条**声称**不一致，下面照样抓得到
      //    （自控：`stageClaims()` 先在一段**复现原缺陷的样例**上跑，必须判矛盾）。
      const STAGE_KEYWORDS = ['讨论', '计划', '执行一', '执行二', '脑暴', '试用']
      const stageClaims = (text) =>
        text
          .split(/\r?\n/)
          .map((l, i) => [i + 1, l])
          .filter(([, l]) => /当前(项目)?阶段|当前大阶段/.test(l))
          .map(([n, line]) => {
            const cut = line.indexOf('切到')
            if (cut >= 0) {
              const after = line.slice(cut + 2, cut + 26)
              const found = STAGE_KEYWORDS.filter((k) => after.includes(k))
              return { line: n, claimed: found.length === 1 ? found[0] : null, via: 'transition-target', found, text: line.trim().slice(0, 120) }
            }
            const found = STAGE_KEYWORDS.filter((k) => line.includes(k))
            return { line: n, claimed: found.length === 1 ? found[0] : null, via: found.length === 0 ? 'no-stage' : found.length === 1 ? 'keyword' : 'ambiguous', found, text: line.trim().slice(0, 120) }
          })
      // 自控：一段复现原缺陷的样例必须被判矛盾
      const CONTROL_OLD = ['- 当前项目阶段：**Agenia 升级 · 计划阶段**。', '- **当前大阶段已从“计划阶段”切到“执行一（停机安装之前）”。**'].join('\n')
      const CONTROL_NEW = ['- 当前项目阶段：**Agenia 升级 · 执行一（停机安装之前）**。', '- **当前大阶段已从“计划阶段”切到“执行一（停机安装之前）”。**'].join('\n')
      const claimsOf = (t) => stageClaims(t).map((c) => c.claimed)
      const controlOld = claimsOf(CONTROL_OLD)
      const controlNew = claimsOf(CONTROL_NEW)
      rec.readings.stage_judge_control = { old_defect_claims: controlOld, fixed_claims: controlNew }
      if (new Set(controlOld.filter(Boolean)).size < 2) {
        push('STAGE-JUDGE-CONTROL', `阶段判据自控失败：复现原缺陷的样例（第 8 行"计划阶段" + 第 18 行"切到执行一"）应当被判成两个不同的当前值，实得 ${JSON.stringify(controlOld)} —— 这条判据现在抓不到它本来要抓的东西`)
      }
      if (new Set(controlNew.filter(Boolean)).size !== 1 || controlNew.includes(null)) {
        push('STAGE-JUDGE-CONTROL', `阶段判据自控失败：修订后的 two-line 样例（两行都说执行一）应当只有一个当前值，实得 ${JSON.stringify(controlNew)}`)
      }
      if (now) {
        const claims = stageClaims(now)
        rec.readings.leader_now_stage_lines = claims.map((c) => `${c.line}: [${c.via}] claimed=${c.claimed} ← ${c.text}`)
        const noStage = claims.filter((c) => c.claimed === null)
        const distinct = [...new Set(claims.map((c) => c.claimed).filter(Boolean))]
        if (claims.length === 0) {
          // 🔴 `T-TEST-04`（技术评审 F6）：**"这一页今天没写阶段"不是代码缺陷** —— 它是"她今天写了什么"。
          //    这条原来推的是 `STAGE-MISSING`（红），于是 DOC-01 的红绿由"开工第一步写了哪几个字"决定
          //    （实测：2026-10-16 那一跑就因为它红）。⇒ 改成第三态 **HOLD**（明写、**不算绿**）。
          //    ⚠️ 收紧的那两条（自称矛盾 / 认不出唯一大阶段）**照旧红** —— 那是这一页**自己跟自己打架**，
          //    与它今天写的是哪个阶段无关，属于形态/一致性，不是内容。
          caseHold(rec, 'STAGE-ABSENT',
            'leader/now.md 今天一行阶段声明都没有 —— 这一格**判不了**（"她今天写了什么"不是代码缺陷）。'
            + '**不是绿**；要判阶段，看下面那两条（自相矛盾 / 认不出唯一大阶段）或者路线状态 `route/current.json`。')
        }
        for (const c of noStage) {
          push(c.via === 'no-stage' ? 'STAGE-MISSING' : 'STAGE-AMBIGUOUS', `leader/now.md 第 ${c.line} 行声明了当前阶段但认不出唯一的大阶段（${c.via}）：${c.text}`)
        }
        if (distinct.length > 1) {
          push('STAGE-CONTRADICTION', `leader/now.md 的当前阶段声称不一致：${claims.filter((c) => c.claimed).map((c) => `第 ${c.line} 行=${c.claimed}`).join('、')} —— 同一页只能有一个当前值`)
        }
      }

      // ③ GO 证据：原话 + 来源会话 + 时间（拍板 Q4：历史这一条允许 occurred_at=null，但必须有 note）
      const goQuote = 'you have the go. don\'t let me down my good girl'
      const both = `${now ?? ''}\n${log ?? ''}`
      if (!both.includes(goQuote)) push('GO-QUOTE', 'now/log 里找不到施工 GO 的老板原话（逐字）')
      if (!/session-[0-9a-f-]{8,}/.test(both)) push('GO-SESSION', 'GO 证据缺来源会话 id（形如 session-…）')
      const hasIso = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(both)
      const hasNote = /(区间|时刻未|未捕获|未持久化|未落下)/.test(both)
      rec.readings.go_evidence = { has_iso_time: hasIso, has_time_note: hasNote }
      if (!hasIso && !hasNote) push('GO-TIME', 'GO 证据既没有精确时刻、也没有"时刻未捕获 + 区间"的说明（拍板 Q4：null 必须配 note，不许编时间）')

      // ④ log 尾部不许还停在"等 GO"（GO 记录之后出现旧结论就是没同步）
      if (log) {
        const lines = log.split(/\r?\n/)
        const goIdx = lines.findIndex((l) => l.includes(goQuote))
        if (goIdx < 0) push('GO-QUOTE', 'log 里没有 GO 原话 —— 阶段切换的老板证据没落档')
        else {
          const staleAfter = lines
            .map((l, i) => [i + 1, l])
            .filter(([n, l]) => n > goIdx + 1 && /等老板施工 GO|还差施工 GO|仍等施工 GO/.test(l))
          rec.readings.log_lines_after_go = lines.length - goIdx - 1
          if (staleAfter.length > 0) {
            push('LOG-STALE', `log 在 GO 记录（第 ${goIdx + 1} 行）之后还写着「等 GO」：第 ${staleAfter.map(([n]) => n).join(', ')} 行`)
          }
        }
        if (!/执行一/.test(log.slice(Math.max(0, log.indexOf(goQuote))))) {
          push('LOG-STAGE', 'log 在 GO 记录之后没有写阶段切到执行一')
        }
      }

      // ⑤ updater 未实现时，GO 的机器可读 evidence 只能记 PENDING（不许拿它冒充已完成）
      rec.readings.go_machine_evidence = {
        note: '拍板 Q4 冻结了 evidence 形状（`.team/route/evidence/tr-20261014-01.json`），但路线 updater 还没实现 ⇒ 这一条保持 PENDING，不计绿也不计红',
        route_root_exists: existsSync(PATHS.realRouteRoot),
      }

      caseFail(problems)
    })
  })
})
