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

/** 每份作业书必须点名的四样输入 + 版本/哈希义务（契约 READ-01 逐条）。 */
const INPUT_NEEDLES = [
  [['常识'], '常识文件是必读输入之一'],
  [['快照'], '快照（memory 版本）是必读输入之一'],
  [['状态'], '共享状态是必读输入之一'],
  [['路线'], '路线/current.json 是必读输入之一'],
  [['sha256', 'SHA256', '哈希'], '必须核对哈希（缺输入/坏哈希要显式停）'],
  [['版本'], '必须带版本要求'],
]
/** 不许写的那种"保证"（契约 READ-01 明令禁止的措辞）。 */
const FORBIDDEN_CLAIMS = [
  ['全量始终在上下文', '不得把"压缩后仍在上下文"当保证'],
  ['始终在上下文', '不得把"压缩后仍在上下文"当保证'],
  ['上下文里永远有', '不得把"压缩后仍在上下文"当保证'],
]

describe('static · read-obligations (READ-01)', () => {
  test('READ-01 四份作业书 + 组长流程的必读输入清单/版本/哈希核对条款齐备', async () => {
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
          for (const [anyOf, why] of INPUT_NEEDLES) {
            if (anyOf.some((n) => text.includes(n))) hits.push(anyOf[0])
            else push('BRIEF-INPUT', `job-briefs/${rel} 里找不到 ${JSON.stringify(anyOf)} 里的任何一个（${why}）`)
          }
          for (const [needle, why] of FORBIDDEN_CLAIMS) {
            if (text.includes(needle)) push('BRIEF-OVERCLAIM', `job-briefs/${rel} 里写了「${needle}」—— ${why}`)
          }
          rec.readings[`brief_${job.role}`] = { hits, first_line: first, sha256: undefined }
        }
      }

      // ── 组长那一侧：开工/快照后必须全文读 + 核对哈希（契约 READ-01）──────
      if (!stagingExists('leader.md')) {
        push('SUT-SURFACE-MISSING', 'staged/leader.md 不在 ⇒ 组长读取义务无从检查（预期红）')
      } else {
        const leader = readStagedText('leader.md')
        const leaderHits = []
        for (const [anyOf, why] of [
          [['哈希', 'sha256', 'SHA256'], '组长必须核对哈希'],
          [['全文读', '读全文', '全文'], '组长开工/快照后必须全文读，不许只读摘要'],
        ]) {
          if (anyOf.some((n) => leader.includes(n))) leaderHits.push(anyOf[0])
          else push('LEADER-READ', `staged/leader.md 里找不到 ${JSON.stringify(anyOf)} 里的任何一个（${why}）`)
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
