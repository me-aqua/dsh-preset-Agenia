/**
 * MJUDGE-01 —— **提案不许当 bug 报告**：两份判决岗说明书都得有那一节（+ 替换法 + 两个边界），
 * **复核岗一个字都不许带**。
 *
 * 冻结依据：定形 `.team/leader/2026-11-03/定形-提案不许当bug报告.md`（老板 2026-11-03 21:2x 插票）；
 * 老板原话（逐字）：
 *   「对了我想插一票，让每天的记忆复核加一个标准，如果一条提案"针对的是一个可以被一个或一组修复动作解决的问题"，
 *     那就不要通过，是提案的人把记忆当成反馈具体bug的地方了」 —— 21:24 更正：**这条只加在判决岗**，
 *   复核岗「只管维护、不评价判决质量」，**一个字都不改**。
 *
 * ── 被测树 = **现役** `presets/agenia`（与 `PRS-01..04` 同一个理由）──────────────────────────
 * 定形 §4「改动范围」点名的就是 `presets/agenia/team/memory-judge.md` +
 * `presets/agenia/job-briefs/memory-judge.md` —— 那两份**就是**注入到判决岗手里的那两份。
 * 打 staged 靶子会让"staged 改了、现役没改"变绿（而岗位读到的是现役那一份）；
 * 反过来"现役改了、staged 没跟上"由 `STAT-01`（`STAGED-LIVE-DRIFT`）与入口的 `F57-TARGET` 各管一次 ——
 * 本文件**不**再抄一份漂移判据。
 *
 * ── 这一条判什么（五面，各自一个码）────────────────────────────────────────────────
 * 只判**现役文本里有没有那几件事**，不判文义（静态层的能力上限，同 `STAT-04` / `READ-01`）。
 * 针的形状是「**一节 + 四个面**」：四个面必须落在**同一节**里 —— 那一节的标题点名「入库」
 * （`## 入库判据`；`进库` 也认），节内允许 `###` 子节。四个面各要一个**段落**（连续非空行）满足：
 *
 * | 面 | 码 | 段落里同时要有 |
 * | --- | --- | --- |
 * | A 一条提案**针对的是「一个或一组修复动作就能解决的问题」⇒ 拒绝**（不是接受） | `MJUDGE-RULE-SUBJECT` | `一个或一组修复动作` + 一个拒的词（拒绝 / 不进库 / 不通过 / 不收 / 驳回） |
 * | B **替换法**：换成「改（变）那一处」之后没话可说 ⇒ **缺陷报告** | `MJUDGE-DISCRIMINATOR` | `替换法` + `改(变)?那一处` + `缺陷报告`（`bug 报告` / `缺陷单` 也认） |
 * | C1 **一处具体读数本身不构成入库理由** | `MJUDGE-BOUNDARY-READING` | `读数` + 一个否定（不构成/不是/不算/不足以）+ `理由` 或 `入库`/`进库` |
 * | C2 **反例**：不许退化成「提到具体文件 / 具体数字就拒」 | `MJUDGE-BOUNDARY-CARVE-OUT` | 文件类词（文件/路径）+ 数字类词（数字/数值/条数/个数）+ 一个否定（不许/不得/不是/不能/禁止） |
 * | D **复核岗不许带**：那两句标记句**不许**出现在两份复核岗说明书里 | `MJUDGE-REVIEW-CARRIES-RULE` | —— （见下） |
 *
 * 没落成那一节（标题里没有「入库」）⇒ 只报 `MJUDGE-SECTION-MISSING`，四个面**不再逐条报**
 * （"整节还没写"与"写了但缺一条"是两种红因，别拿四条噪音盖住第一条）。
 * 文件读不到 ⇒ `MJUDGE-CHARTER-MISSING`。
 *
 * ── D 那一面（复核岗）为什么长这样 ────────────────────────────────────────────────
 * 老板 21:24 的更正是「**只加判决岗**，复核岗一个字都不改」。把它写成"两份复核说明书逐字节等于某个哈希"
 * 会把**与这条规矩无关**的合法改动也判红（那两份今天还在改），所以钉的是**这条规矩的标记句**：
 * `替换法` 与 `一个或一组修复动作` —— 将来谁把判决岗那一节**复制粘贴**进复核岗，这两个字面量就跟着过去 ⇒ 当场红。
 * 两句都进不去（今天全仓 `presets/agenia/**` 里两个都是 0 命中）⇒ 这一面今天**绿**，
 * 它红只可能是"有人把规矩搬到了复核岗"。
 *
 * ── 判据的可翻面性（**今天就证明，不等实现**）──────────────────────────────────────
 * 红必须只来自"文字还没写"。所以本用例体内带**一具合成的阳性对照 + 六把刀**（全程只在内存里，
 * 一个字节都不落盘），它们今天必须全绿：
 *   · `CONTROL` 一份照契约写的判决岗文本 ⇒ 0 问题（证明四个面**可以**同时成立 —— 判据不是永远红）；
 *   · `K1` 删掉替换法那一段 ⇒ **只**翻 `MJUDGE-DISCRIMINATOR`；
 *   · `K2` 删掉读数边界那一段 ⇒ **只**翻 `MJUDGE-BOUNDARY-READING`；
 *   · `K3` 删掉反例那一段 ⇒ **只**翻 `MJUDGE-BOUNDARY-CARVE-OUT`；
 *   · `K4` 把「拒绝，不进库」换成「接受，进库」⇒ **只**翻 `MJUDGE-RULE-SUBJECT`（"要拒"与"收"分得开）；
 *   · `K5` 标题去掉「入库」⇒ **只**翻 `MJUDGE-SECTION-MISSING`（且四个面不再各报一条）；
 *   · `K6` 把那一节粘进复核岗文本 ⇒ **只**翻 `MJUDGE-REVIEW-CARRIES-RULE`（D 那一面的阳性对照）。
 *   ⇒ 读到红时先看**这几条有没有红**：它们红了说明**尺子坏了**（`MJUDGE-CONTROL-FAIL` /
 *     `MJUDGE-KNIFE-NOT-FLIPPED` / `MJUDGE-KNIFE-OVERREACH`），不是"文字还没写"。
 *
 * ── 一件必须写下来的操作口径 ─────────────────────────────────────────────────────
 * `AGENIA_MJUDGE_CHARTER_ROOT`（**可选**，只给对照/刀用）：把被测根指到另一棵树上（拷一份再改）。
 * 它一被设置，本用例额外记一条 **`HOLD`**（`MJUDGE-CHARTER-ROOT-OVERRIDE`）——
 * 那一跑**不是**对现役 `presets/agenia` 的判据，**不许**被读成绿。全量跑不设它。
 */
import { before, describe, test } from 'node:test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PATHS } from '../support/env.mjs'
import { caseFail, caseHold, preflight, problem, runCase, sha256Text } from '../support/evidence.mjs'

before(() => {
  preflight()
})

// ─────────────────────────────────────────────────────────────────────────────
// 契约（手写自定形 §3，不从被测物反推）
// ─────────────────────────────────────────────────────────────────────────────

/** 两份**判决岗**说明书（定形 §4 逐字点名的两个落点，相对现役 `presets/agenia`）。 */
const JUDGE_FILES = ['team/memory-judge.md', 'job-briefs/memory-judge.md']
/** 两份**复核岗**说明书（老板 21:24 更正：这一票**一个字都不改**）。 */
const REVIEW_FILES = ['team/memory-review.md', 'job-briefs/memory-review.md']

/** 那一节的标题必须点名「入库」（`进库` 也认）—— 定形 §4 的措辞就是「加一节"入库判据"」。 */
const SECTION_WORD = /(入库|进库)/
/** 标题解析：`#`…`######` + 空白。 */
const HEADING = /^(#{1,6})\s+(.*)$/

/** 「一个或一组修复动作」—— 老板原话里那个**主语**，四个面与复核岗那一面共用这一根针。 */
const SUBJECT_NEEDLE = '一个或一组修复动作'
/** 「替换法」—— 定形 §3 那个**判别法**的名字；也是复核岗那一面的主标记句。 */
const DISCRIMINATOR_NAME = '替换法'
/** 复核岗那一面：**这条规矩的标记句**（将来整节复制粘贴 ⇒ 它们跟着过去）。 */
const RULE_MARKERS = [DISCRIMINATOR_NAME, SUBJECT_NEEDLE]

/** 四个面：每个都要**一个段落**里同时有那几样（段落 = 连续非空行 ⇒ 换行折行不算"没写在一起"）。 */
const FACES = [
  {
    code: 'MJUDGE-RULE-SUBJECT',
    id: 'A',
    what: '提案针对的是「一个或一组修复动作就能解决的问题」⇒ **拒绝**（不是接受）',
    hit: (para) => para.includes(SUBJECT_NEEDLE) && /(拒绝|不进库|不通过|不收|驳回)/.test(para),
    why: '老板原话那半句要**逐字**在（`一个或一组修复动作`），且落在**同一段**里的结论必须是"拒"，不是"收" —— '
      + '只写主语不写结论 = 读的人不知道这一条要把他怎么办',
  },
  {
    code: 'MJUDGE-DISCRIMINATOR',
    id: 'B',
    what: '替换法：换成「改（变）那一处」之后这句话就没话可说 ⇒ 那是**缺陷报告**',
    hit: (para) => para.includes(DISCRIMINATOR_NAME) && /改(变)?那一处/.test(para) && /(缺陷报告|bug\s*报告|缺陷单)/.test(para),
    why: '定形 §3 的判据有两个动作（`替换法` / `换成「改那一处」`）和一个结论（`缺陷报告`）；'
      + '少了结论 ⇒ 判据只剩"换个说法看看"，谁都不知道看出来之后该判什么；'
      + '这一段同时是复核岗那一面的主标记句（`替换法`）',
  },
  {
    code: 'MJUDGE-BOUNDARY-READING',
    id: 'C1',
    what: '**一处具体读数本身不构成入库理由**',
    hit: (para) => /读数/.test(para) && /不(构成|是|算|足以)/.test(para) && /(理由|入库|进库)/.test(para),
    why: '定形 §3 的第一个边界：一条具体读数（某天某某文件的 sha256、某次跑的条数）不构成入库理由，'
      + '它只有在**支撑一条判断**时才进 —— 少了它，判决岗会把"今天的读数"直接当"长期知识"收下',
  },
  {
    code: 'MJUDGE-BOUNDARY-CARVE-OUT',
    id: 'C2',
    what: '**反例必须成立**：这条判据不许退化成「提到具体文件 / 具体数字就拒」',
    /**
     * 两种常见写法都认（**同一段落里**，且必须带一个否定）：
     *   · 定形自己的措辞：`具体文件` + `具体数字`（`具体读数` 也认"数字"那一侧）；
     *   · 白话写法：文件类词 + 数字类词 + 一个"放之皆准"的量词（凡是 / 一律 / 任何 / 只要）。
     * ⚠️ 为什么不能只钉「文件类词 + 数字类词 + 否定」：**别的段落自己就带着这三样**
     *   （边界一那一句里有「某某文件」「跑的条数」、主语那一句里有「不许」）——
     *   那样这一面是**装饰**：把它删掉照样绿（本用例的刀 `K3` 当场咬到过这一形态，2026-11-03）。
     */
    hit: (para) => {
      if (!/(文件|路径)/.test(para)) return false
      if (!/(数字|数值|条数|个数|读数)/.test(para)) return false
      if (!/不(许|得|是|能)|禁止|别把/.test(para)) return false
      const ownPhrasing = /具体(文件|路径)/.test(para) && /具体(数字|数值|条数|个数|读数)/.test(para)
      const plainPhrasing = /(凡是|一律|任何|只要)/.test(para)
      return ownPhrasing || plainPhrasing
    },
    why: '定形 §3 的第二个边界（`mig-test-whitelist-vs-blacklist-01` 那一族：尺子要有取值域上的反面样本）：'
      + '没有这一条，判据会把「`inject.js` 的兜底名单不许分叉」这类**带具体文件名**的好知识一起判死 —— '
      + '那一族条目会被判据本身判死',
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// 量具（纯函数；被测树与对照组走**同一份**判定体 —— 这是"能翻面"的前提）
// ─────────────────────────────────────────────────────────────────────────────

/** 切出 markdown 的标题树：`[{level, text, line, body[]}]`；`body` 到**下一个同级或更高级**标题为止。 */
function headingsOf(text) {
  const lines = String(text).split(/\r?\n/)
  const marks = []
  for (let i = 0; i < lines.length; i += 1) {
    const m = HEADING.exec(lines[i])
    if (m !== null) marks.push({ level: m[1].length, text: m[2].trim(), line: i + 1, start: i })
  }
  return marks.map((mk, k) => {
    let end = lines.length
    for (let j = k + 1; j < marks.length; j += 1) {
      if (marks[j].level <= mk.level) { end = marks[j].start; break }
    }
    return { level: mk.level, text: mk.text, line: mk.line, body: lines.slice(mk.start + 1, end) }
  })
}

/** 段落 = 连续非空行（折行写法不算"没写在一起"；空行才是分段）。 */
function paragraphsOf(lines) {
  const out = []
  let cur = []
  for (const line of lines) {
    if (line.trim() === '') {
      if (cur.length > 0) { out.push(cur.join('\n')); cur = [] }
      continue
    }
    cur.push(line)
  }
  if (cur.length > 0) out.push(cur.join('\n'))
  return out
}

/**
 * 一份**判决岗**说明书的四张脸。
 * 找不到那一节 ⇒ **只**报 `MJUDGE-SECTION-MISSING`（整节没写 vs 写了缺一条，是两种红因）。
 */
function judgeCharterProblems(rel, text) {
  const out = []
  const push = (code, message) => out.push(problem(code, `[${rel}] ${message}`))
  const sections = headingsOf(text).filter((h) => SECTION_WORD.test(h.text))
  if (sections.length === 0) {
    push('MJUDGE-SECTION-MISSING', '找不到「入库」那一节（标题里要点名 `入库` / `进库`，例如 `## 入库判据`）—— '
      + '定形 §4 要的是**一节**，不是散在别处的几句话；四个面（主语/替换法/两个边界）都得落在这一节里')
    return out
  }
  const section = sections[0]
  const paras = paragraphsOf(section.body)
  for (const face of FACES) {
    if (!paras.some((p) => face.hit(p))) {
      push(face.code, `「${section.text}」（第 ${section.line} 行起）那一节里，${face.id} 那一面不在：${face.what}`
        + ` —— ${face.why}`)
    }
  }
  return out
}

/** 一份**复核岗**说明书：这条规矩的标记句**一个都不许有**（老板 21:24：复核岗一个字都不改）。 */
function reviewCharterProblems(rel, text) {
  const out = []
  const lines = String(text).split(/\r?\n/)
  for (const marker of RULE_MARKERS) {
    const at = lines.findIndex((l) => l.includes(marker))
    if (at >= 0) {
      out.push(problem('MJUDGE-REVIEW-CARRIES-RULE', `[${rel}:${at + 1}] 出现了这条规矩的标记句 ${JSON.stringify(marker)} —— `
        + '老板 2026-11-03 21:24 更正：这一票**只加在判决岗**（复核岗只管维护、不评价判决质量）。'
        + '把判决岗那一节复制粘贴到复核岗 = 这条更正被推翻'))
    }
  }
  return out
}

/** 四份文本 ⇒ 全部问题（被测树与每一把刀都走这一条路）。 */
function charterProblems({ judge, review }) {
  const out = []
  for (const [rel, text] of judge) out.push(...judgeCharterProblems(rel, text))
  for (const [rel, text] of review) out.push(...reviewCharterProblems(rel, text))
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// 合成对照（只在内存里；今天必须全绿 —— 否则红的是尺子，不是文字）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 照契约写的一份**合格**判决岗文本（A/B/C1/C2 四个面 + 那一节；D 不适用）。
 * 四个面**一段一条**（空行分隔）—— 这样"删掉某一段只翻那一面"才是量得出来的（`SYNTH_PARAS` 与它同源）。
 */
const SYNTH_PARAS = {
  subject: '- **提案不许当 bug 报告**：一条提案如果针对的是**一个或一组修复动作就能解决的问题** ⇒ **拒绝**，不进库。',
  discriminator: '- **替换法**：把这条东西换成「改变那一处」（改那一行 / 那个参数 / 那个工具）—— 换成之后这句话就没事可说了 ⇒ 它是**缺陷报告**，落点是 bug 台账，不是记忆库；改完之后它仍然是"下次做同类事要当心的判断" ⇒ 才算知识。',
  reading: '- **边界一：一处具体读数不构成入库理由。** 某天某某文件的 sha256、某次跑的条数，只有支撑一条判断时才进，而且判断本身要能离开那个读数独立成立。',
  carveOut: '- **边界二：反例必须成立。** 这条判据不许变成「凡是提到具体文件或具体数字的都拒」。',
}
const SYNTH_OK = [
  '# 合成 · 判决岗说明书（照契约写的最小实现）',
  '',
  '## 你负责什么',
  '',
  '判，然后落盘。',
  '',
  '## 入库判据（老板 2026-11-03 插票）',
  '',
  SYNTH_PARAS.subject,
  '',
  SYNTH_PARAS.discriminator,
  '',
  SYNTH_PARAS.reading,
  '',
  SYNTH_PARAS.carveOut,
  '',
  '## 收尾',
  '',
  '照实说。',
  '',
].join('\n')
const dropPara = (text, para) => text.split(para).join('')
/** 一份**复核岗**文本（干净的那一份：两个标记句都没有）。 */
const SYNTH_REVIEW_CLEAN = '# 合成 · 复核岗说明书\n\n## 你负责什么\n\n只维护，不评价判决质量。\n'

describe('static · mjudge01 · 提案不许当 bug 报告（MJUDGE-01）', () => {
  test('MJUDGE-01 两份判决岗说明书都带「入库判据」一节（主语+替换法+两个边界），复核岗一个字都不许带', async () => {
    await runCase('MJUDGE-01', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))

      /**
       * 被测根：缺省 = 现役 `presets/agenia`（定形 §4 点名的两个落点就在这棵树里）。
       * `AGENIA_MJUDGE_CHARTER_ROOT` 只给对照/刀用 —— 一被设置就记 HOLD（那一跑不是对现役的判据）。
       */
      const override = (process.env.AGENIA_MJUDGE_CHARTER_ROOT ?? '').trim()
      const root = override === '' ? PATHS.finalPreset : path.resolve(override)
      rec.readings.charter_root = root
      rec.readings.live_preset_root = PATHS.finalPreset
      rec.readings.root_override = override === '' ? null : override

      // ── ① 四份文本（缺一份就点名，不猜内容）────────────────────────────────
      const readOne = (rel) => {
        const abs = path.join(root, rel)
        if (!existsSync(abs)) {
          push('MJUDGE-CHARTER-MISSING', `${abs} 不在 —— 这一票要判的两份判决岗说明书之一是空的（复核岗那两份也要在，否则"没带"这一面判不了）`)
          return null
        }
        const text = readFileSync(abs, 'utf8')
        rec.readings[`sha256_${rel.replace(/[\\/.]/g, '_')}`] = sha256Text(text)
        return text
      }
      const judge = []
      const review = []
      for (const rel of JUDGE_FILES) {
        const text = readOne(rel)
        if (text !== null) judge.push([rel, text])
      }
      for (const rel of REVIEW_FILES) {
        const text = readOne(rel)
        if (text !== null) review.push([rel, text])
      }

      // ── ② 现役那四份文本：六个面（A/B/C1/C2 逐份 + D 逐份）─────────────────
      const live = charterProblems({ judge, review })
      rec.readings.live_problem_codes = live.map((p) => p.code)
      for (const p of live) problems.push(p)

      /**
       * ── ③ 量具自证（**今天必须全绿**）：阳性对照 + 六把刀 ─────────────────────
       * 红在下面这一节 ⇒ 尺子坏了，别去改说明书（`MJUDGE-CONTROL-FAIL` / `MJUDGE-KNIFE-*`）。
       */
      const codeSet = (list) => [...new Set(list.map((p) => p.code))].sort()
      const expectOne = (label, list, want) => {
        const got = codeSet(list)
        const where = label === null ? '' : `（${label}）`
        const wantArr = [...want].sort()
        if (JSON.stringify(got) === JSON.stringify(wantArr)) return
        if (got.length === 0) {
          push('MJUDGE-KNIFE-NOT-FLIPPED', `刀${where}没有咬到：期望 ${JSON.stringify(wantArr)}，实得 [] —— `
            + '这一面是**装饰**（写上去 / 删掉都不红）；先查量具，别去改说明书')
        } else if (wantArr.every((c) => got.includes(c)) && got.length > wantArr.length) {
          push('MJUDGE-KNIFE-OVERREACH', `刀${where}切宽了：期望 ${JSON.stringify(wantArr)}，实得 ${JSON.stringify(got)} —— `
            + '多翻的那几条不是这把刀该动的面（"哪一条坏了"会因此说不清）')
        } else {
          push('MJUDGE-KNIFE-WRONG-VECTOR', `刀${where}翻错了面：期望 ${JSON.stringify(wantArr)}，实得 ${JSON.stringify(got)}`)
        }
      }

      // 阳性对照：照契约写的合格文本 ⇒ 0 问题（证明六个面**可以**同时成立）
      const control = charterProblems({
        judge: JUDGE_FILES.map((rel) => [rel, SYNTH_OK]),
        review: REVIEW_FILES.map((rel) => [rel, SYNTH_REVIEW_CLEAN]),
      })
      if (control.length > 0) {
        push('MJUDGE-CONTROL-FAIL', `阳性对照（照契约写的最小实现）应当 0 问题，实得 ${JSON.stringify(control.map((p) => `${p.code}: ${p.message}`))} —— `
          + '这一条红说明**尺子写错了**：现役那几份即使照这样写也会判红')
      }

      const knifeOf = (text) => charterProblems({ judge: [['team/memory-judge.md', text]], review: [] })
      expectOne('K1 删掉替换法那一段', knifeOf(dropPara(SYNTH_OK, SYNTH_PARAS.discriminator)), ['MJUDGE-DISCRIMINATOR'])
      expectOne('K2 删掉读数边界那一段', knifeOf(dropPara(SYNTH_OK, SYNTH_PARAS.reading)), ['MJUDGE-BOUNDARY-READING'])
      expectOne('K3 删掉反例那一段', knifeOf(dropPara(SYNTH_OK, SYNTH_PARAS.carveOut)), ['MJUDGE-BOUNDARY-CARVE-OUT'])
      expectOne(
        'K4 「拒绝，不进库」换成「接受，进库」',
        knifeOf(SYNTH_OK.split(SYNTH_PARAS.subject).join(SYNTH_PARAS.subject.replace('⇒ **拒绝**，不进库。', '⇒ **接受**，进库。'))),
        ['MJUDGE-RULE-SUBJECT'],
      )
      expectOne(
        'K5 标题去掉「入库」',
        knifeOf(SYNTH_OK.replace('## 入库判据（老板 2026-11-03 插票）', '## 判据（老板 2026-11-03 插票）')),
        ['MJUDGE-SECTION-MISSING'],
      )
      // K6：D 那一面的阳性对照 —— 把判决岗那一节整段粘进复核岗，必须当场报
      expectOne(
        'K6 那一节被粘进复核岗',
        charterProblems({ judge: [], review: [['team/memory-review.md', `${SYNTH_REVIEW_CLEAN}\n${SYNTH_OK}`]] }),
        ['MJUDGE-REVIEW-CARRIES-RULE'],
      )

      // ── ④ 这一跑打的是哪棵树：指到别处 ⇒ 记 HOLD（不是绿）─────────────────────
      if (override !== '') {
        caseHold(rec, 'MJUDGE-CHARTER-ROOT-OVERRIDE', `这一跑的被测根是 ${root}（AGENIA_MJUDGE_CHARTER_ROOT），不是现役 ${PATHS.finalPreset} —— `
          + '读数只对这一棵树成立，不许当"现役判决岗说明书合格"的证据')
      }

      caseFail(problems)
    })
  })
})
