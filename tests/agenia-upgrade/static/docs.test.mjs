/**
 * STAT-04 / DOC-01 —— 文档与阶段账。
 *
 * 静态层的**能力上限**说在前面：文档用例只能做到"**命中/缺失清单**"（契约 STAT-04 的证据列
 * 就是这么写的）—— 它证明不了文义，只证明那些必须出现的字面量在、必须消失的旧口径不在。
 * 所以每一条断言都写成"指名道姓的针"，而不是"读起来对不对"。
 *
 * ⚠️ **本文件出现活体路径是故意的**：`README.md` / `.team/leader/now.md`
 *    不在 `presets/agenia/` 里，staging 不镜像它们 ⇒ 它们只能按项目根读。
 *    预设自己的那几份（leader.md / work-guidelines.md / 说明.md）走 staging（被测对象永远是 staging）。
 *
 * 🔴 **2026-10-19（`F-110`）—— 8 条判据的靶子搬家，义务一条没删**：
 *    原来有 3 条钉在"**某一份文件里必须有某个词**"（`leader.md 五关` / `work-guidelines.md 回执` /
 *    `work-guidelines.md distribution`），另有 5 条钉在 `AGENTS.md`。
 *    · 前 3 条：`F-76`（2026-10-18）之后注入是**按 `leaderOrder` 把多份 .md 拼成一个整体**贴给模型的，
 *      **模型不关心是哪一份** ⇒ 靶子改成**注入面**（范围见 `support/docs-surface.mjs`：
 *      由被测组合的 `leaderOrder` 算出来，**不是全仓任意处**）。
 *    · **`distribution`** 是我们自己发明的英文词：**文档一次没写过**（`pinned` 钉在会变的东西上不算，
 *      钉一个不存在的词更不算）⇒ 认中文「四类分布」（英文写法也认，词形不是义务）。
 *    · 后 5 条：`AGENTS.md` 是 **1 字节占位 + `.gitignore:58` 忽略 + `git ls-files` 不认**，
 *      载体本身不存在 ⇒ 靶子换成真正承载它的地方：**四条 job 行的载体是组合**（`agent.cordis.yml`
 *      的 `- id: tool-job-<角色>` 那一行，且必须**开着**），**`job-briefs/` 的载体是注入面**。
 *      `AGENTS.md` 那两条 `mustNot`（"差异是六项" / "必须正好是上面这六项"）**已删**，
 *      整条 spec 也一并从 `DOC_SPECS` 去掉 —— **空转的判据不是判据**（`mig-rules-10`），
 *      且**载体不存在**（`AGENTS.md` 1 字节 + `.gitignore:58` 忽略）。
 */
import { before, describe, test } from 'node:test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { FROZEN, PATHS } from '../support/env.mjs'
import { caseFail, caseHold, preflight, problem, runCase, sha256Text, sha256File, stagingReadings, oracleReadings } from '../support/evidence.mjs'
import { readStagedText, stagingExists } from '../support/sut.mjs'
import { CODES as SURFACE_CODES, INJECTED_OBLIGATIONS, injectedSurfaceProblems, jobRowProblems, leaderInjectionSurface, syntheticComposition } from '../support/docs-surface.mjs'

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
      // ⚠️ 「五关」与「回执」**不再钉在这一份上**：那是"注入面里说了没有"那一族
      //    （`INJECTED_OBLIGATIONS`）—— 同一段注入文字由多份 .md 拼成，模型不关心是哪一份。
    ],
    mustNot: [['enableRunInBackground', '把 config 键当成调用参数写进了给模型的文档（拍板 I1）']],
  },
  {
    rel: 'work-guidelines.md',
    root: 'staged',
    must: [
      ['大阶段', '路线层级：目标 → 大阶段 → 任务 → 五关'],
      ['任务', '路线层级：目标 → 大阶段 → 任务 → 五关'],
      ['run_in_background', '后台 guard 的调用参数'],
      // ⚠️ 「五关」「回执」「distribution」三条搬进注入面那一族（见文件头 🔴）：
      //    前两条是"哪一份"的问题，第三条钉的是一个**文档从未写过的英文词**。
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
  // 🔴 `AGENTS.md` **不在这个清单里**（`F-110` · 2026-10-19，第 4 关评审 `B-2` 落盘）：
  //    原来那 5 条 `must`（4 条 job 行 + `job-briefs/`）已搬到真正承载它们的地方
  //    （四条作业行 → 组合；`job-briefs/` → 注入面，见下面 `F-110` 那一段），
  //    剩下那两条 `mustNot`（"差异是六项" / "必须正好是上面这六项"）已删，**整条 spec 一并去掉**：
  //    **空转的判据不是判据**（`mig-rules-10`），且**载体不存在**（`AGENTS.md` 1 字节 + `.gitignore:58` 忽略）。
  {
    rel: 'AGENTS.local.md',
    root: 'repo',
    must: [],
    mustNot: [['tool-job-', '本机事实文件里出现了 job 工具名 —— B2.4 说本轮 AGENTS.local.md 不该动']],
  },
  {
    rel: '.team/leader/now.md',
    root: 'repo',
    // 🔴 这一页**每天开工重写** ⇒ 断言**不许钉它今天写了什么**，也不许钉它的形状/措辞
    //    （`work-guidelines.md:82` 只写"第一行永远是写下它的那一天"）。形态判据见 `nowFormProblems()`：
    //    只要求首行有一个**真实存在的 ISO 日期**。
    //    ⚠️ 路线层级那套词**没有丢**：`leader.md` / `work-guidelines.md` 两份**冻结**文档上照样钉着
    //      （见上面两条 spec）—— 从活页上撤掉，不是从判据里撤掉。
    must: [],
    mustNot: [],
    form: 'now-first-line',
  },
]

/**
 * `now.md` 的**形态**判据（`T-TEST-04`）—— 钉那条规矩（`work-guidelines.md:82`）：
 * **「第一行永远是写下它的那一天」**。两条实质：
 *   ① 首行里有一个 ISO 日期（`YYYY-MM-DD`）—— **形状随意**（`# now（…）` / `# 组长 now · …` / 裸日期都行）；
 *   ② 那个日期必须**真的存在**（`2026-02-31` / `2026-13-01` 不算 —— 造出来再读回去比年月日）。
 *
 * 🔴 判据**不许要求日期以外的任何东西**：`work-guidelines.md:82` 只写了"第一行是那一天"，
 *    "日期之外还得有一句话"没有任何文档承载 ⇒ `# 2026-10-19` 这种**只有日期**的页是**绿**。
 *    判据自己发明格式/措辞要求 = `T-TEST-09`（把"提及"当"声明"）那个病。
 *
 * @returns {Array<{code:string,message:string}>} 空数组 = 形态合格
 */
function nowFormProblems(text) {
  const out = []
  const first = String(text ?? '').split(/\r?\n/).find((l) => l.trim() !== '') ?? ''
  const trimmed = first.trim()
  if (trimmed === '') {
    out.push({
      code: 'DOC-FORM-NOW-HEAD',
      message: 'now.md 整页是空的（一个非空行都没有）—— 队伍规矩：第一行永远是它被写下的那一天',
    })
    return out
  }
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(trimmed)
  if (m === null) {
    out.push({
      code: 'DOC-FORM-NOW-HEAD',
      message: `now.md 第一行没有 ISO 日期（\`YYYY-MM-DD\`）—— 队伍规矩：第一行永远是它被写下的那一天。`
        + `**形状不限**，但那个日期必须在。实得：${JSON.stringify(trimmed.slice(0, 120))}`,
    })
    return out
  }
  // 日期必须是**真的那一天**。
  // ⚠️ 只 `Date.parse()` 不够：V8 会把 `2026-02-31` **滚成** `2026-03-03`（实测），
  //    于是"不存在的日期"永远绿着 —— 那又是一条翻不了面的判据。这里做过一遍
  //    「造出来 → 再读回去，年月日必须一模一样」，`2026-02-31` / `2026-13-01` 都当场红。
  const y = Number(m[1])
  const mo = Number(m[2])
  const da = Number(m[3])
  const day = new Date(Date.UTC(y, mo - 1, da))
  if (Number.isNaN(day.getTime()) || day.getUTCFullYear() !== y || day.getUTCMonth() !== mo - 1 || day.getUTCDate() !== da) {
    out.push({ code: 'DOC-FORM-NOW-DATE', message: `now.md 第一行那个日期不是合法日期：${m[0]}（不存在的日子 / 月份越界）` })
  }
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
        // ── 形态判据（`T-TEST-04`）：**不钉内容、不钉形状**，只钉"首行有那一天" ──────────────
        // 🔴 判据自己也要有阳性对照：每个方向**各量一次**（都在用例内部跑 —— 活体那一页是组长的
        //    文件，测试岗没有它的写权限）。
        //   ① **首行没有日期**（含整页空行）⇒ 必须红（`DOC-FORM-NOW-HEAD`）；
        //   ② **首行有日期、日期之后什么都没有** ⇒ 必须**绿** —— 判据不许要求日期以外的字
        //      （`work-guidelines.md:82` 没写"还得有一句话"）；日期不存在（`2026-02-31` /
        //      月份越界 `2026-13-01`）⇒ 必须红（`DOC-FORM-NOW-DATE`）；
        //   ③ **合法形状**（只要求日期在）⇒ 0 问题 —— 而且**两种形状都得绿**：
        //      `# now（…）` 与组长实际写的 `# 组长 now · 日期（…）`。只放嘴上不放判据里，等于没放开。
        if (spec.form === 'now-first-line') {
          const caseNoDate = { text: '# 今天的事\n\n- 手头：……\n', want: ['DOC-FORM-NOW-HEAD'] }
          const caseOnlyDate = { text: '# 2026-10-19\n', want: [] }
          const caseEmptySlot = { text: '# now（2026-10-19 · ）\n', want: [] }
          const caseBlank = { text: '\n   \n\n', want: ['DOC-FORM-NOW-HEAD'] }
          const caseBadDate = { text: '# 2026-02-31 · 不存在的日子\n', want: ['DOC-FORM-NOW-DATE'] }
          const caseBadMonth = { text: '# 2026-13-01 · 不存在的月份\n', want: ['DOC-FORM-NOW-DATE'] }
          const caseFreeform = { text: '# 组长 now · 2019-01-01（傍晚 · 一句跟今天毫无关系的话）\n\n- 随便什么正文\n- 另一个大阶段：脑暴\n', want: [] }
          const caseCanon = { text: '# now（2019-01-01 · 一句完全不同的话，跟今天毫无关系）\n\n- 随便什么正文\n', want: [] }
          const controls = [
            ['①没有日期', caseNoDate],
            ['①整页空行', caseBlank],
            ['②只有日期、日期之后什么都没有（绿）', caseOnlyDate],
            ['②旧形状的空槽 `# now（日期 · ）`（只有日期 ⇒ 绿）', caseEmptySlot],
            ['②日期不存在（2026-02-31）', caseBadDate],
            ['②月份越界（2026-13-01）', caseBadMonth],
            ['③合法·组长那种形状', caseFreeform],
            ['③合法·`# now（…）` 形状', caseCanon],
          ].map(([name, c]) => ({ name, want: c.want, got: nowFormProblems(c.text).map((p) => p.code) }))
          rec.readings.now_form_control = {
            controls,
            note: '①没有日期/整页空 ⇒ DOC-FORM-NOW-HEAD ②只有日期/空槽 ⇒ 0 问题（判据不许要求日期以外的字）'
              + ' ②日期不存在/月份越界 ⇒ DOC-FORM-NOW-DATE ③合法形状（形状随意）⇒ 0 问题',
          }
          for (const c of controls) {
            if (JSON.stringify(c.got) !== JSON.stringify(c.want)) {
              push('DOC-FORM-CONTROL',
                `形态判据自控失败：${c.name} 期望 ${JSON.stringify(c.want)}，实得 ${JSON.stringify(c.got)}`
                + '（两个方向必须各自翻面：没日期要红、日期不存在要红；有日期就得绿 —— 不许要求日期以外的字）')
            }
          }
          const formProblems = nowFormProblems(text)
          rec.readings.docs[spec.rel].form = { kind: spec.form, problems: formProblems.map((p) => p.code) }
          for (const p of formProblems) push(p.code, p.message)
        }
      }

      // ── 注入面 / 载体（`F-110`）—— 8 条原来钉在"某一份文件"上的义务 ──────────────────
      // 🔴 判据问的是「**这件事在模型真的看得见的地方说了吗**」，不是「某一份文件里有没有某个词」。
      //    范围由**被测组合**的 `leaderOrder` 算出来 —— 不是全仓任意处，也不是这里硬编的名单。
      const compositionText = stagingExists('agent.cordis.yml') ? readStagedText('agent.cordis.yml') : null
      const surfaceInfo = leaderInjectionSurface(compositionText)
      const surfaceDocs = {}
      for (const rel of surfaceInfo.surface) surfaceDocs[rel] = stagingExists(rel) ? readStagedText(rel) : null
      if (surfaceInfo.problems.length > 0) {
        for (const p of surfaceInfo.problems) push(p.code, p.message)
      } else {
        for (const p of injectedSurfaceProblems({ docs: surfaceDocs, surface: surfaceInfo.surface }).problems) push(p.code, p.message, p.detail)
      }
      const jobVerdict = jobRowProblems({ compositionText, jobs: FROZEN.jobs, docs: surfaceDocs, surface: surfaceInfo.surface })
      for (const p of jobVerdict.problems) push(p.code, p.message, p.detail)

      // 读数：这一族判据**看的是哪几份**、每一条在哪儿命中 —— 红的时候要能一眼看出靶子对不对
      rec.readings.injection_surface = {
        leader_order: surfaceInfo.order,
        surface: surfaceInfo.surface,
        computed_keys: FROZEN.staged.computedOrderKeys,
        parse_warnings: surfaceInfo.warnings,
        files: Object.fromEntries(surfaceInfo.surface.map((rel) => [rel, {
          exists: typeof surfaceDocs[rel] === 'string',
          chars: typeof surfaceDocs[rel] === 'string' ? surfaceDocs[rel].length : null,
        }])),
        obligations: INJECTED_OBLIGATIONS.map((ob) => ({
          id: ob.id,
          name: ob.name,
          forms: ob.forms.map((re) => String(re)),
          said_in: surfaceInfo.surface.filter((rel) => typeof surfaceDocs[rel] === 'string' && ob.forms.some((re) => re.test(surfaceDocs[rel]))),
        })),
        note: '搜索范围 = 组合 `leaderOrder` 里那几份 .md（`memory`/`roster`/`board` 是算出来的，不是文件）；'
          + '**不是全仓任意处** —— 说明.md / README.md / 代码里的同名字样都不算。',
      }
      rec.readings.job_rows = {
        rows: jobVerdict.readings.rows,
        note: '四条一次性作业的载体 = 组合里 `- id: tool-job-<角色>` 那一行（必须开着）。'
          + '原来这 4 条钉在 `AGENTS.md` 的能力差异表上（1 字节占位 + .gitignore:58 忽略 ⇒ 永远够不着）。'
          + '`said_in` 只记录、不判红：调用名那一半由 `leader.md` 那 4 条老针守着（那里更严，能单独翻面）。',
      }

      // 🔴 自控（`mig-rules-14`：阳/阴两向都要各量一次）。同一个判据函数喂三份**合成注入面**：
      //   ① 每条义务的 `sample` 都放进注入面 ⇒ **0 问题**（绿的那一头）；
      //   ② 注入面一份都不说 ⇒ 4 条 `DOC-INJECTED-UNSAID`；
      //   ③ 那些词**只放进不在注入面的那一份**（`说明.md`，活体里它真有 job-briefs ×3）⇒ **仍然 4 条全红**
      //      —— 这一格就是"不许退化成全仓任意处找得到"的判据自己。（③ 失败 = 靶子塌成了"到处都算"。）
      //   另外每条的 `sample` 必须被它自己的 `forms` 命中：样本连自己都命不中，说明这条义务的正则写坏了，
      //      那时候"永远绿"和"从来没人说过"长得一模一样。
      //   ⚠️ 自控里的组合用**合成**的（四条行都在、都开着）：真组合被刀改过时不许把自控格带红 ——
      //      那是树的问题，不是判据翻面能力的证据（`S5`/`S6`/`S9` 第一次跑就是这样）。
      for (const ob of INJECTED_OBLIGATIONS) {
        if (!ob.forms.some((re) => re.test(ob.sample))) {
          push('DOC-SURFACE-CONTROL', `「${ob.name}」的自控样本 ${JSON.stringify(ob.sample)} 连它自己的 forms 都命不中（正则写坏了 ⇒ 这条义务永远绿）`)
        }
      }
      {
        const synthSurface = surfaceInfo.surface.length > 0 ? surfaceInfo.surface : ['leader.md', 'work-guidelines.md']
        const synthComposition = syntheticComposition(FROZEN.jobs)
        const words = INJECTED_OBLIGATIONS.map((ob) => ob.sample).join(' ')
        const allSaid = Object.fromEntries(synthSurface.map((rel) => [rel, `合成注入面：${words}\n`]))
        const noneSaid = Object.fromEntries(synthSurface.map((rel) => [rel, '这里什么也没有。\n']))
        const saidOutside = { ...noneSaid, '说明.md': `合成注入面（不在 leaderOrder 里）：${words}\n` }
        const judge = (docs) => [
          ...injectedSurfaceProblems({ docs, surface: synthSurface }).problems,
          ...jobRowProblems({ compositionText: synthComposition, jobs: FROZEN.jobs }).problems,
        ].map((p) => p.code).sort()
        const wantRed = Array(INJECTED_OBLIGATIONS.length).fill(SURFACE_CODES.injectedUnsaid).sort()
        const controls = [
          { name: '①每条样本都放进注入面 ⇒ 绿', want: [], got: judge(allSaid) },
          { name: '②注入面一份都不说 ⇒ 每条各自点名', want: wantRed, got: judge(noneSaid) },
          { name: '③样本只放在不在注入面的 `说明.md` 里 ⇒ 仍然全红（不算说了）', want: wantRed, got: judge(saidOutside) },
        ]
        rec.readings.injection_control = {
          surface: synthSurface,
          controls,
          note: '自控用**合成**组合（四条 job 行都在、都开着）——真组合被刀改过时不许把自控格带红。'
            + '③ 是"靶子只认注入面"的那一格：同一批词放进非注入面的一份，判据不许变绿。',
        }
        for (const c of controls) {
          if (JSON.stringify(c.got) !== JSON.stringify(c.want)) {
            push('DOC-SURFACE-CONTROL', `注入面判据自控失败：${c.name} —— 期望 ${JSON.stringify(c.want)}，实得 ${JSON.stringify(c.got)}`)
          }
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
