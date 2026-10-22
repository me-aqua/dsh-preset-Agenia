/**
 * READ-01 —— 读取义务（四份作业书 + 组长流程的必读输入清单/版本/哈希核对）。
 *
 * 冻结依据：契约 §6.13 READ-01 + 提案 §B1.3（`job-briefs/*.md` 不注入）+ 拍板 Q8（首行格式）
 * + v5 的"常识/快照/状态/路线"四样输入。
 *
 * 口径（A12）：静态层只能证明**那些义务被写下来了**（主题命中），证明不了执行。
 * 真实会话的读取日志由 R1/首次真实循环补 —— 契约 READ-01 自己就这么写的。
 */
import { before, describe, test } from 'node:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { FROZEN } from '../support/env.mjs'
import { caseFail, preflight, problem, runCase, stagingReadings } from '../support/evidence.mjs'
import { readStagedText, stagingExists, stagingPath } from '../support/sut.mjs'
import { listMd } from '../support/composition.mjs'

before(() => {
  preflight()
})

/**
 * 取一份 markdown 里**某一节**的行（从标题行起，到下一个 `## ` 标题之前）。
 * 找不到那一节 ⇒ `null` ⇒ 调用方按红处理（"这一节不见了"本来就是红，不许当成"没要求"）。
 */
const mdSection = (text, headingIncludes) => {
  const lines = text.split(/\r?\n/)
  const start = lines.findIndex((l) => /^##\s/.test(l) && l.includes(headingIncludes))
  if (start < 0) return null
  const end = lines.findIndex((l, i) => i > start && /^##\s/.test(l))
  return lines.slice(start, end < 0 ? lines.length : end)
}

/**
 * 每份作业书必须点名的四样输入 + 版本/哈希义务（契约 READ-01 逐条）。
 *
 * 🔴 针的形状：**不在整份文档上找 2 字泛词**，而是
 *   ① 先定位那份作业书的「必读输入清单」那一节；② 再在**那一节里**找"那件输入的最小完整说法"
 *   —— 一个路径段（`common-sense.md` / `snapshots\` / `state\update\` / `route\current.json`）
 *   或一个数据契约字段名（`common_sense_sha256` / `version`）。
 *
 * 为什么不能用 `常识` / `快照` / `状态` / `版本` 这类 2 字词：它们在同一份文档里到处都是
 * ⇒ 把清单里那一行**整行删掉**，针照样命中，判据绿着、义务已经没了（`mig-rules-10`：不能翻面的判据是装饰）。
 * 实测（2026-10-19 第 4 关复审 R-3 给的输入）：把 `job-briefs/memory-judge.md:26`（常识 = 必读输入之一）
 * 整行删掉，旧的 `anyOf` 六根针**一根都不响**（`常识` 还有 L49/L50/L51 三处）。
 *
 * 两个方向都要能答（都由 `f108-stale-criteria.cases.mjs` 真跑用例量过）：
 *   · **真删了义务会不会红？** `K21` 删常识行 · `K22` 删共享状态行 · `K23` 删快照行 · `K24` 删路线行
 *     ⇒ `BRIEF-INPUT` 红（节内找不到那个路径段）；
 *   · **合法改写会不会假红？** `A5` 换掉常识行"核对什么"那格的措辞、`A6` 把路径改成正斜杠
 *     ⇒ 仍然绿（针只认路径段/字段名，不认措辞、不认反斜杠）。
 *
 * ⚠️ 写下来的边界（别把它读强）：钉的是**节 + 路径/字段名**。所以
 *   · 把整节标题改掉（去掉「必读输入」）或换掉路径本身 ⇒ **同批改这根针**（那两件事本身就是改契约，不是改排版）；
 *   · 它证不了"那几行说得够清楚"（单元格措辞不在针里）—— 那部分靠人读，别把绿灯读成"文档写得好"。
 */
const INPUT_NEEDLES = [
  { id: '常识', re: /common-sense\.md/, why: '常识文件是必读输入之一（路径 `<DR>\\common-sense.md`）' },
  { id: '快照', re: /snapshots[\\/]/, why: '快照（memory 版本）是必读输入之一（路径 `memory\\snapshots\\<vN>.json`）' },
  { id: '共享状态', re: /state[\\/]update[\\/]/, why: '共享状态是必读输入之一（路径 `state\\update\\<day>.json`）' },
  { id: '路线', re: /route[\\/]current\.json/, why: '路线/current.json 必须被点名（"本作业不读"也要写下来 —— 不点名 = 没人说过它不许读）' },
  { id: '哈希', re: /common_sense_sha256/, why: '必须核对哈希：与共享状态里的 `common_sense_sha256` 逐字比（缺输入/坏哈希要显式停）' },
  { id: '版本', re: /`version`/, why: '必须带版本要求：读任务书点名的那一版，并核对 `version` 字段（不许自己挑版本）' },
]
/** 不许写的那种"保证"（契约 READ-01 明令禁止的措辞）。 */
const FORBIDDEN_CLAIMS = [
  ['全量始终在上下文', '不得把"压缩后仍在上下文"当保证'],
  ['始终在上下文', '不得把"压缩后仍在上下文"当保证'],
  ['上下文里永远有', '不得把"压缩后仍在上下文"当保证'],
]

describe('static · read-obligations (READ-01)', () => {
  test('READ-01 四份作业书（清单/版本/哈希）+ 组长侧（全文读 + 评前评后指纹两次）条款齐备', async () => {
    await runCase('READ-01', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      rec.readings.staging = stagingReadings()

      const briefsDir = stagingPath('job-briefs')
      const files = listMd(briefsDir)
      if (files === null) {
        push('SUT-SURFACE-MISSING', `缺 ${briefsDir} —— 四份作业书还没写（预期的首跑红）`)
      } else {
        for (const job of FROZEN.jobs) {
          const rel = `${job.role}.md`
          if (!files.includes(rel)) { push('BRIEF-MISSING', `缺作业书 job-briefs/${rel}`); continue }
          const text = readFileSync(path.join(briefsDir, rel), 'utf8')
          const first = text.split(/\r?\n/)[0] ?? ''
          // 拍板 Q8：首行强制 `# 作业书 · <角色>`
          if (first.trim() !== `# 作业书 · ${job.role}`) push('BRIEF-FIRSTLINE', `${rel} 首行必须恰为「# 作业书 · ${job.role}」（拍板 Q8），实得 ${JSON.stringify(first)}`)
          const hits = []
          const listSection = mdSection(text, '必读输入')
          if (listSection === null) {
            push('BRIEF-INPUT', `job-briefs/${rel} 里找不到「必读输入清单」那一节（「## …必读输入…」那个标题）—— 六样必读输入一个都无从核对（不是"没要求"）`)
          } else {
            for (const { id, re, why } of INPUT_NEEDLES) {
              if (listSection.some((l) => re.test(l))) hits.push(id)
              else push('BRIEF-INPUT', `job-briefs/${rel} 的「必读输入清单」那一节里找不到${id}（针 = ${re}）—— ${why}`)
            }
          }
          for (const [needle, why] of FORBIDDEN_CLAIMS) {
            if (text.includes(needle)) push('BRIEF-OVERCLAIM', `job-briefs/${rel} 里写了「${needle}」—— ${why}`)
          }
          rec.readings[`brief_${job.role}`] = { hits, first_line: first, sha256: undefined }
        }
      }

      // ── 组长那一侧：开工/快照后必须全文读 + 评前评后量两次数（契约 READ-01）──────
      if (!stagingExists('leader.md')) {
        push('SUT-SURFACE-MISSING', 'staged/leader.md 不在 ⇒ 组长读取义务无从检查（预期红）')
      } else {
        const leader = readStagedText('leader.md')
        /**
         * 组长那一侧的四根针：① 量什么 ② 量几次 ③ 用什么量 ④ 全文读。
         *
         * 义务的落点：`leader.md` §「评审前后，项目文件必须逐字不变」（**派之前量一次 · 收回来再量一次**、
         * **指纹认字节**、工具 `.tools/fingerprint.mjs` 只看 `CODE` 那一套）+ §「每天开工第一步」
         * （**一、读 `.team/leader/now.md` 全文**）。
         *
         * 🔴 针的形状：**锚到义务自己那一节、那一行**，不钉"整份文档上的字面邻接"。
         * 为什么不能钉字面邻接（2026-10-19 第 4 关复审 R-2）：这份文档是**人写的散文**，
         * 换个说法义务一点没少，而字面合取会当场红 —— 四个真例子，最硬的一个不是假设：
         *   · `work-guidelines.md:44` 改成「门禁装不上**时，注入器**必须出声」（义务一个字没少，`R1-GATE` 红）；
         *   · `leader.md:45` 加一个「的」：`.team/leader/now.md` 的全文`（`LEADER-READ` 红）；
         *   · `leader.md:36`/`:39` 换成这份仓库自己的口径「一个字节都不许变」/「指纹比的是字节」（红）；
         *   · `leader.md:38` 「派之前、收回来各量一遍」（`量一次` 没了，红）。
         * ⇒ 针改成：**节 + 正则** —— 允许中间夹少量字、允许词序、允许同义说法（`认字节`/`比的是字节`），
         *   但"那件义务还在不在"照样能翻面。
         * ⚠️ 假红是"删判据"最顺手的借口 —— 判据脆，下一个人看到红的第一反应不是"义务没了"。
         *
         * 两个方向（都由 `f108-stale-criteria.cases.mjs` 真跑用例量过）：
         *   · **真删了义务会不会红？** `K5`（整节删）· `K13`（只删「全文」两字）· `K15`（只删「两个读数」三字）
         *     · `K16`（删掉工具那半句）· `K19`（把"认字节"改成"认大小"：量错了东西）⇒ `LEADER-READ` 红；
         *   · **合法改写会不会假红？** `A2`（加「的」）· `A3`（换成本仓库自己的说法）· `A4`（各量一遍）⇒ 仍绿。
         *
         * 敢把针钉到这一级：`leader.md` 是 10-17 起的**冻结骨架**（一个字节都不许动，改它要老板点头）
         * ⇒ 它不属于"明天会变的东西"（`mig-test-criterion-drift-01`）。
         * ⚠️ 写下来的边界：节是按标题里的「评审前后」/「每天开工第一步」定位的 —— **改这两个标题
         *    就是同批改这根针**（那是改契约，不是改排版）。
         */
        const gateSection = mdSection(leader, '评审前后')
        const openSection = mdSection(leader, '每天开工第一步')
        const leaderReadNeedles = [
          {
            id: '量什么', heading: '评审前后', lines: gateSection,
            find: (l) => /指纹[^\n]{0,8}字节/.test(l),
            why: '组长必须被告知**量什么**：指纹量的是**字节**（不是行数/时间）—— `认字节` / `比的是字节` / `按字节` 都算',
          },
          {
            id: '量几次', heading: '评审前后', lines: gateSection,
            find: (l) => l.includes('派之前') && l.includes('收回来') && /两[个次条].{0,2}读数/.test(l),
            why: '组长必须被告知**量几次**：派之前 + 收回来两个时点各量一次，读数记下来（`各量一遍` 也算）',
          },
          {
            id: '用什么量', heading: '评审前后', lines: gateSection,
            find: (l) => l.includes('fingerprint.mjs'),
            why: '组长必须被告知**用什么量**：`.tools/fingerprint.mjs`（判 CODE 那一套），否则"核对"没有落点',
          },
          {
            id: '全文读', heading: '每天开工第一步', lines: openSection,
            find: (l) => /now\.md`[^\n]{0,4}全文/.test(l),
            why: '组长开工/快照后必须**全文读** `now.md`，不许只读摘要（「的全文」这种夹一个虚词也算）',
          },
        ]
        const leaderHits = []
        for (const { id, heading, lines, find, why } of leaderReadNeedles) {
          if (lines === null) {
            push('LEADER-READ', `staged/leader.md 里找不到「${heading}」那一节 ⇒ ${id}这根针无处落地（${why}）—— 整节被删/标题被改都是红`)
            continue
          }
          if (lines.some(find)) leaderHits.push(id)
          else push('LEADER-READ', `staged/leader.md 的「${heading}」那一节里找不到「${id}」那件事（${why}）—— 按行锚定找，措辞可以变、义务不能少`)
        }
        rec.readings.leader_hits = leaderHits
        for (const [needle, why] of FORBIDDEN_CLAIMS) {
          if (leader.includes(needle)) push('LEADER-OVERCLAIM', `staged/leader.md 里写了「${needle}」—— ${why}`)
        }
      }

      // ── 组员只拿指定输入：memberOrder 只许是 work-guidelines + memory + charter ──
      // 🔴 2026-10-16（票 `T-TEST-06` ①）：`memory` 进名单（共享记忆：**常识给两边**、长期记忆全条只给组长）。
      // 🔴 **这条白名单要留着**（它不是 change-detector —— 别按"每加一项就红"去删它）：
      //    它守的是**生产侧没守的那半** —— `inject.js::selfCheck` 只挡 `roster`/`board` 进 `memberOrder`，
      //    **不挡 `persona`/`me-aqua`/`leader`/`style`**（那四份的 `.md` 存在 ⇒ 一声不响 ⇒
      //    **组员会拿到「老板这个人」**）。⇒ "组员能拿到什么输入"是**安全边界**：
      //    加一项本来就该**有意识地**决定组员该不该拿。
      //    判据（一句话）：**加一个"合法的"注入项会不会红？** 会红 ⇒ 白名单（禁）；
      //    不会红、而越界会红 ⇒ 黑名单（对）。⇒ 本条属前者：它管的就是"**只许这几个**"。
      if (stagingExists('agent.cordis.yml')) {
        const { parseComposition, cfg } = await import('../support/composition.mjs')
        const rows = parseComposition(readStagedText('agent.cordis.yml'), 'staged').rows
        const inj = rows.find((r) => r.id === 'persona-injector')
        const memberOrder = inj ? cfg(inj, 'memberOrder') : null
        rec.readings.memberOrder = memberOrder
        if (!Array.isArray(memberOrder)) push('MEMBER-ORDER', `memberOrder 必须是数组，实得 ${JSON.stringify(memberOrder)}`)
        else {
          const extra = memberOrder.filter((k) => !['work-guidelines', 'memory', 'charter'].includes(k))
          if (extra.length > 0) push('MEMBER-ORDER', `组员只拿指定输入（work-guidelines + memory + charter），多出来的：${extra.join(', ')}`)
          for (const key of ['roster', 'board']) {
            if (memberOrder.includes(key)) push('MEMBER-ORDER', `memberOrder 里不许有 ${key}（那是只给组长的）`)
          }
          // 组长专属那四份**也不许**上 memberOrder —— 生产侧 `selfCheck` 挡不住它们（见上面那段 🔴），
          // 所以这一格是**独立的一条线**：不依赖"生产侧那条黑名单写对了没有"。
          for (const key of ['persona', 'me-aqua', 'leader', 'style']) {
            if (memberOrder.includes(key)) push('MEMBER-ORDER', `memberOrder 里不许有 ${key}（那是**只给组长**的：她是谁 / 老板是谁 / 怎么带队 / 怎么说话 —— 上给组员等于把组长的身份与老板的画像发下去）`)
          }
        }
      }

      rec.readings.r1_note = { note: '真实会话的读取日志只能 R1/首次真实循环补（契约 READ-01 的证据列如此）；本用例只证条款写下来了' }

      caseFail(problems)
    })
  })
})
