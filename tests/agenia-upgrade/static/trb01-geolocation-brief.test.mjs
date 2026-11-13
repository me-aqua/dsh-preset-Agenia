/**
 * TRB-01 / TRB-02 —— `F-167`：作业书「地基」那一段必须被**判据**咬住，而且**别人改成反面话必须红**。
 * 定形 `.team/leader/2026-11-08/定形-batch9.md`；技术契约 `.team/test/2026-11-08/CONTRACT-batch9.md` §二。
 *
 * ── 咬哪一份（决定 + 理由）──────────────────────────────────────────────────
 * **两边都咬**（契约 §2.1）：
 *   · `TRB-01` = 作业书 `presets/agenia/job-briefs/technical-review.md` 的 `## 三、地基…` 段；
 *   · `TRB-02` = 说明书 `presets/agenia/team/technical-review.md` 的
 *     `## 一、生产**只读** —— 这是你这一票的地基` 段。
 * 说明书那份是**注入**的（上岗时真正进提示词的是它），作业书那份是**派工时读**的（`作业书不进提示词`）。
 * 两份各有一个变体 ⇒ 只咬一份，另一份被改成反面话时没有任何判据会红 —— 那正是 `F-167` 要治的病。
 * 两份的措辞不同 ⇒ 各写一套 clause 针（`TRB-01` 有 `判不了` / `live.moved: null` / "N ≠ 分歧" 三格，
 * `TRB-02` 没有；读数里明写这个不对称）。
 *
 * ── 取样两端钉死（`cand-20261025-0363`）────────────────────────────────────
 * 起点 = 标题行本身（`^## ` 且含 `地基`）；终点 = **下一个** `^## ` 标题之前（不含）。
 * 标题不见了 ⇒ `TRB-SECTION-MISSING`（红；不许当成"没要求"）。
 *
 * ── 每条 clause = 正向证据 + 反面禁词（不是"关键词出现即绿"）──────────────────
 * 反面话故意复用**同样的关键词**（副本 / equal / 活树 / N / 判不了 它都有）；判据红在**方向**上：
 * `B2` 要求 `before_sha256`/`after_sha256` **同一行**都量在副本上（不是"同一节里出现过副本"）；
 * `B3` 要 `活树…不算/不在…本轮`；`B4` 要 `必须报…活树…N 处`；`B5` 要 `判不了` + `不许写 0` + `live.moved: null`；
 * `B6` 要 `≠…分歧`；`B7` 要 `改副本…作废` + `交活前…after_sha256`。
 * 每条 clause 同时带**反面禁词**（`量在活树` / `⇒ 作废` / `不必报` / `没有基线…写 0` / `就是…分歧` / `可以改副本` …）。
 *
 * ── 翻面证明（每次跑都真跑；**在副本里**，产品零字节）────────────────────────
 *   ① 把整段替换成 `OPPOSITE_*` ⇒ 同一个 `checkDoc()` 必须红，且**逐 clause** 都红（读数记 codes）；
 *   ② 还原 ⇒ 0 problem（绿）；
 *   ③ 合法改写（同义换词 / 加"的" / 换标点）⇒ 仍 0 problem（`TRB-LEGAL-REWRITE` 红了 = 针太脆，先修针）；
 *   ④ 单句刀（每条 clause 一把）⇒ **只**翻那一条（多翻 = `TRB-KNIFE-VECTOR`）。
 *
 * ── 判什么 / 不判什么（scope note）────────────────────────────────────────────
 * **判**：那一段**文字的方向**（每条义务在、且没有被写成反面）+ 逐条翻身。
 * **不判**：① 技术复盘那一票**实际有没有**按这段做（那是 `REV-04`/`REV-05` 与回执的事）；
 *   ② 那一段以外的措辞（输入清单 / 交活 / 代码美学）；③ 文字写得好不好、够不够清楚。
 * **绿的边界**："绿 = 这 7（作业书）/ 4（说明书）条义务在那一段里以正确方向写下来了"，不是"复盘岗会照做"。
 * **读哪棵树**：`<repo>/presets/agenia/...`（现役；副本里跑时 `REPO_ROOT` 跟着跑的那棵树走）。
 * staged 与现役的差由入口的 `F57-TARGET` 单独管，本格不混。
 *
 * ── 本文件**同时**装 0010 · 删除优先的三条腿（2026-11-13；下面的 `DELETE_FIRST_*` 那一段）──────────────
 * 宿主：并进 `TRB-01` 这一格（不新开用例 ID —— 0007/0010 冻的是「分母 218 不破」）。
 * 为什么是这一格：0010 的五处载体里有一处就是 `job-briefs/technical-review.md`，而这一格的题目正是
 * 「作业书里的义务有没有被**判据**咬住」；把"删除优先"另开一格会让"作业书条款"有两个答案。
 * 代价：这一格的登记行与标题都点名两段（§三 地基 + 0010 删除优先），不让名字比它量的面窄。
 * 三条腿各留一个码（`DEL-PRIORITY-*` / `DEL-SLOT-*` / `DEL-ORDER-*`），并用**变异体**证明各自能单独翻面。
 */
import { before, test } from 'node:test'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { caseFail, preflight, problem, runCase, runRoot } from '../support/evidence.mjs'

before(() => preflight())

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..', '..', '..')
const sha256Text = (s) => createHash('sha256').update(s, 'utf8').digest('hex')

const DOCS = {
  brief: {
    id: 'TRB-01',
    rel: 'presets/agenia/job-briefs/technical-review.md',
    /** 起点：`## 三、地基…`（`###` 不算边界）。 */
    heading: /^##\s+三、地基/,
    clauses: [
      {
        id: 'B1',
        title: '评的是提交的**只读副本**，不是活树 —— 代码根 + `<commit>` + 副本**三样都要**（F6：防"任一命中就绿"）',
        positive: (sec) => {
          const line = sec.lines.find((l) => /代码根/.test(l) && /commit/i.test(l) && /(只读副本|副本)/.test(l))
          return line === undefined ? null : line
        },
        anti: [
          { re: /(?<!不)读\s*(活树|工作树|工作区)\s*(当|作为|做)\s*代码根/, why: '代码根被写成"读活树当代码根"' },
          { re: /代码根\s*(就是|是|=)\s*(活树|工作树|工作区)/, why: '代码根被写成活树/工作区' },
        ],
      },
      {
        id: 'B2',
        title: '`before_sha256` / `after_sha256` 都量在**副本**上；`equal` 只回答副本有没有被改',
        positive: (sec) => {
          const line = sec.lines.find((l) => /before_sha256/.test(l) && /after_sha256/.test(l)
            && /副本/.test(l) && /(量在|在副本上)/.test(l) && /equal/.test(l))
          return line === undefined ? null : line
        },
        anti: [
          { re: /量(在)?\s*(活树|工作树)/, why: '"量在活树（工作树）"' },
          { re: /(活树|工作树)\s*上\s*(量|算)/, why: '"在活树上量/算"' },
        ],
      },
      {
        id: 'B3',
        title: '活树在窗口里动 ⇒ **不在本轮效力范围内**（不是作废、不是你的事）',
        positive: (sec) => sec.lines.find((l) => /活树/.test(l) && /(不在|不算)/.test(l) && /(本轮|你|效力)/.test(l)) ?? null,
        anti: [
          { re: /活树[^。\n]{0,24}(⇒|→)[^。\n]{0,8}作废/, why: '"活树动了 ⇒ 作废"' },
          { re: /(?<!不)算你的事/, why: '"活树动算你的事"' },
          { re: /活树[^。\n]{0,12}(要重审|重开一轮)/, why: '"活树动了要重审"' },
        ],
      },
      {
        id: 'B4',
        title: '报告里**必须报一句**"派工后活树有 N 处变动"（N 由活树基线比出来）',
        positive: (sec) => {
          const has = (re) => sec.lines.some((l) => re.test(l))
          if (!has(/必须|务必|要|得/)) return null
          if (!has(/报/)) return null
          if (!has(/活树/)) return null
          if (!has(/N\s*处/)) return null
          if (!has(/基线|live-baseline/)) return null
          return 'section-level'
        },
        anti: [
          { re: /(不必|不用|不要|无需|别提|不许报)[^。\n]{0,12}报?[^。\n]{0,12}活树/, why: '"不必报活树…"' },
          { re: /活树[^。\n]{0,12}(不必|不用|不要|无需|别提)/, why: '"活树…不必提"' },
        ],
      },
      {
        id: 'B5',
        title: '没有基线 ⇒ 写"**判不了**"，**不许写 0**；校验器那侧是 `live.moved: null`',
        positive: (sec) => {
          const text = sec.lines.join('\n')
          if (!/判不了/.test(text)) return null
          if (!/(没有基线|没给基线|缺基线)/.test(text)) return null
          if (!/不许写\s*0/.test(text)) return null
          if (!/live\.moved/.test(text) || !/null/.test(text)) return null
          return 'section-level'
        },
        anti: [
          { re: /没有基线[^。\n]{0,12}(写|算|记|当)[^。\n]{0,4}0/, why: '"没有基线就写 0"' },
          { re: /缺[^。\n]{0,6}基线[^。\n]{0,12}0\s*处/, why: '"缺基线 ⇒ 0 处"' },
        ],
      },
      {
        id: 'B6',
        title: '"活树动了 N 处" ≠ "副本与活树的分歧"（分歧里装着从来没进过提交的文件）',
        positive: (sec) => sec.lines.find((l) => /活树/.test(l) && /(≠|不等于|不是)/.test(l) && /分歧/.test(l)) ?? null,
        anti: [
          { re: /活树[^。\n]{0,16}(就是|等于|=)[^。\n]{0,10}分歧/, why: '"活树动了 N 处就是分歧"' },
        ],
      },
      {
        id: 'B7',
        title: '不许动副本；改了 ⇒ `equal:false` ⇒ 这一票作废；交活前在副本上算 `after_sha256`',
        positive: (sec) => {
          const text = sec.lines.join('\n')
          if (!/(改|动)[^。\n]{0,8}副本[^。\n]{0,24}(作废|equal\s*[:：]?\s*false)/.test(text)) return null
          if (!/交活前/.test(text)) return null
          if (!/after_sha256/.test(text)) return null
          return 'section-level'
        },
        anti: [
          { re: /(可以|允许|能)\s*(改|动)\s*(那份)?副本/, why: '"可以改那份副本"' },
          { re: /改[^。\n]{0,8}副本[^。\n]{0,8}(没关系|重算就行)/, why: '"改副本没关系/重算就行"' },
        ],
      },
    ],
  },
  charter: {
    id: 'TRB-02',
    rel: 'presets/agenia/team/technical-review.md',
    heading: /^##\s+一、生产/,
    clauses: [
      {
        id: 'C1',
        title: '生产代码与 `tests/**` 都不许改（"改一行让它过"= 伪造）',
        positive: (sec) => {
          const text = sec.lines.join('\n')
          if (!/生产代码不许改/.test(text)) return null
          if (!/tests\/\*\*/.test(text)) return null
          if (!/跑/.test(text) || !/测试/.test(text)) return null
          return 'section-level'
        },
        anti: [{ re: /(可以|允许)\s*(改|动)\s*生产代码/, why: '"生产代码可以改"' }],
      },
      {
        id: 'C2',
        title: '副本前后 CODE 指纹必须相同；两个哈希都量在**同一份副本**上',
        positive: (sec) => {
          const text = sec.lines.join('\n')
          if (!/副本[^。\n]{0,12}CODE 指纹/.test(text)) return null
          if (!/必须[^。\n]{0,4}相同/.test(text)) return null
          if (!/before_sha256/.test(text) || !/after_sha256/.test(text)) return null
          if (!/(同一份副本|那份副本|都量在)/.test(text)) return null
          return 'section-level'
        },
        anti: [
          { re: /量(在)?\s*(活树|工作树)/, why: '"量在活树（工作树）"' },
          { re: /(before_sha256|after_sha256)[^。\n]{0,16}量在[^。\n]{0,8}活树/, why: '"哈希量在活树上"' },
        ],
      },
      {
        id: 'C3',
        title: '活树在窗口里动**不算作废**、**不在本轮效力范围内**',
        positive: (sec) => sec.lines.find((l) => /活树/.test(l) && (/不算作废/.test(l) || (/不在/.test(l) && /本轮/.test(l)))) ?? null,
        anti: [
          { re: /(?<!不)算作废/, why: '"活树动算作废"' },
          { re: /活树[^。\n]{0,16}(⇒|→)[^。\n]{0,8}作废/, why: '"活树动了 ⇒ 作废"' },
          { re: /(?<!不)算你的事/, why: '"活树动算你的事"' },
        ],
      },
      {
        id: 'C4',
        title: '报告里**必须报一句**"活树动了 N 处"',
        positive: (sec) => sec.lines.find((l) => /必须报/.test(l) && /活树/.test(l) && /N\s*处/.test(l)) ?? null,
        anti: [{ re: /(不必|不用|不要|别提|无需)[^。\n]{0,12}活树/, why: '"不必报活树…"' }],
      },
    ],
  },
}

/** 一份文档的取样：`{start,end,lines,heading,raw}`；标题不在 ⇒ `null`。 */
function sectionOf(text, heading) {
  const lines = text.split(/\r?\n/)
  const start = lines.findIndex((l) => heading.test(l))
  if (start < 0) return null
  let end = lines.length
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^##\s/.test(lines[i])) { end = i; break }
  }
  const body = lines.slice(start, end)
  return { start, end, lines: body, heading: lines[start], raw: body.join('\n') }
}

/** 把整段换成另一段（保留它前面/后面的行）。 */
function replaceSection(text, heading, replacement) {
  const lines = text.split(/\r?\n/)
  const start = lines.findIndex((l) => heading.test(l))
  if (start < 0) return null
  let end = lines.length
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^##\s/.test(lines[i])) { end = i; break }
  }
  const before = lines.slice(0, start)
  const after = lines.slice(end)
  return [...before, ...replacement.trimEnd().split('\n'), ...after].join('\n')
}

/**
 * 一个判据读一份文档：section 取样 → 逐 clause 的正向/反面。返回 `{problems, clauses, section}`。
 * **不抛**：读不到也是 problems。
 */
function checkDoc(kind, text) {
  const def = DOCS[kind]
  const problems = []
  const clauses = {}
  const sec = sectionOf(text, def.heading)
  if (sec === null) {
    problems.push({ code: 'TRB-SECTION-MISSING', clause: 'SECTION', why: `${def.rel} 里找不到标题为「## …地基…」的那一段 —— 七条义务一个都无从核对（不是"没要求"）` })
    return { problems, clauses, section: null }
  }
  for (const clause of def.clauses) {
    const hit = clause.positive(sec)
    const antiHits = clause.anti.map((a) => ({ ...a, hit: a.re.exec(sec.raw) })).filter((a) => a.hit !== null)
    clauses[clause.id] = {
      ok: hit !== null && antiHits.length === 0,
      positive_hit: hit === null ? null : String(hit).slice(0, 200),
      anti_hits: antiHits.map((a) => ({ why: a.why, text: String(a.hit[0]).slice(0, 200) })),
    }
    if (hit === null) {
      problems.push({ code: `TRB-${clause.id}-MISSING`, clause: clause.id, why: `${def.rel} 的「地基」段里读不到这条义务：${clause.title}` })
    }
    for (const a of antiHits) {
      problems.push({ code: `TRB-${clause.id}-OPPOSITE`, clause: clause.id, why: `${def.rel} 的「地基」段里出现了反面话（${a.why}）：${String(a.hit[0]).slice(0, 200)}` })
    }
  }
  return { problems, clauses, section: sec }
}

/** 反面话（整段；故意复用同样的关键词 —— 证明判据不是"关键词出现即绿"）。 */
const OPPOSITE_BRIEF = `## 三、地基：\`equal\` 量在**活树**上；活树在动算你的事，而且别提

- 代码根 = 活树（工作区），不看提交，也不用副本。
- \`before_sha256\` / \`after_sha256\` 都量在活树上；\`equal\` = 两者逐字相同，它回答"活树还是不是派工那一刻那份"。
- 活树在窗口里动了 ⇒ 这一轮作废（并行是常态，所以要重审）。
- 不必报活树动了几处：那是你的成绩，不是你的责任，别提。
- 没有基线就写 0；判不了就不用写，写 0 也行。
- "活树动了 N 处"就是"副本与活树的分歧"。
- 可以改那份副本：改了以后重算一次就行。`

const OPPOSITE_CHARTER = `## 一、生产**只读** —— 这是你这一票的地基

- 生产代码可以改、\`tests/**\` 也可以改：跑不过就改一行让它过。
- 副本前后 CODE 指纹不必相同：\`before_sha256\` 量在活树上、\`after_sha256\` 量在副本上就行。
- 活树在窗口里动了就算作废 —— 那在本轮的效力范围内；活树动算你的事。
- 不必报活树动了几处。`

/** 逐 clause 的单句刀：锚点必须**恰好 1 处**（不是 ⇒ `TRB-KNIFE-ANCHOR`）。 */
const KNIVES = {
  brief: [
    { clause: 'B1', anchor: '代码根 = 任务书点名的 `<commit>` 的一份**只读副本**', replace: '代码根 = 当前工作区' },
    { clause: 'B2', anchor: '`before_sha256` / `after_sha256` 都量在**副本**上', replace: '`before_sha256` / `after_sha256` 都量在**活树**上' },
    { clause: 'B3', anchor: '**活树在窗口里动了 ⇒ 不在本轮**的效力范围内', replace: '**活树在窗口里动了 ⇒ 这一轮作废**' },
    { clause: 'B4', anchor: '报告里**必须报一句**', replace: '报告里**不必报**' },
    { clause: 'B5', anchor: '**不许写 0**（校验器那一边是 `live.moved: null` + 一句说法）。', replace: '**写 0 也行**。' },
    { clause: 'B6', anchor: '**"活树动了 N 处" ≠ "副本与活树的分歧"**', replace: '**"活树动了 N 处" 就是 "副本与活树的分歧"**' },
    { clause: 'B7', anchor: '- 交活前：在副本上算一遍 `after_sha256`', replace: '- 交活时不用再算哈希了' },
  ],
  charter: [
    { clause: 'C1', anchor: '**生产代码不许改**，`tests/**` 也不许改', replace: '**生产代码可以改**，`tests/**` 也不许改' },
    { clause: 'C2', anchor: '**副本前后 CODE 指纹必须相同**', replace: '**副本前后 CODE 指纹不必相同**' },
    { clause: 'C3', anchor: '**活树在窗口里动了不算作废**', replace: '**活树在窗口里动了就算作废**' },
    { clause: 'C4', anchor: '但报告里必须报一句"活树动了 N 处"', replace: '但报告里不必报"活树动了 N 处"' },
  ],
}

/** 合法改写（同义换词 / 加"的" / 换标点）：必须仍然绿 —— 否则针太脆，先修针。 */
const LEGAL_REWRITES = {
  brief: [
    ['`before_sha256` / `after_sha256` 都量在', '`before_sha256` 与 `after_sha256` 都量在'],
    ['N 由校验器拿派工那一刻的活树基线', 'N 由校验器用派工那一刻的活树基线'],
    ['**活树在窗口里动了 ⇒ 不在本轮**的效力范围内', '**活树在窗口里动了 ⇒ 不在本轮的效力范围内**'],
  ],
  charter: [
    ['派工时拿到的那份只读副本', '派工时拿到的那一份只读副本'],
    ['交活前在**同一份副本**上算', '交活前在**同一份副本**里算'],
    ['那不在本轮的效力范围内', '那不在本轮的效力范围以内'],
  ],
}

/** 计数（逐字）：子串出现几次（刀/合法改写的锚点必须恰好 1 处）。 */
const countOf = (text, needle) => text.split(needle).length - 1

/** 把一份文档的读数（怎么读、读的是谁）记下来。 */
function docReading(kind, text, sec) {
  return {
    kind,
    rel: DOCS[kind].rel,
    sha256: sha256Text(text),
    heading: sec?.heading ?? null,
    section_lines: sec === null ? null : sec.lines.length,
    section_sha256: sec === null ? null : sha256Text(sec.raw),
    bytes: Buffer.byteLength(text, 'utf8'),
  }
}

/** 在运行根里写一份副本（本格**只**写这里；产品零字节）。 */
function writeCopy(caseId, name, text) {
  const dir = path.join(runRoot(), 'trb', caseId)
  mkdirSync(dir, { recursive: true })
  const file = path.join(dir, name)
  writeFileSync(file, text, 'utf8')
  return file
}

/**
 * 一条用例的两半：真文档必须绿 + 翻面/还原/合法改写/单句刀。
 * `rec.readings` 记：读的是哪一份（sha256 / 段行数）、翻面后的 codes、每把刀翻的 clause 集合。
 * `extra`：同一格里的**追加腿**（0010 删除优先那三条）—— 与上面的 TRB 腿共用同一个 `runCase`，
 * 不另开用例 ID（分母 218 不破）。它拿 `(rec, push)`，红因都落进同一个 `problems`。
 */
function runDocCase(caseId, kind, extra = null) {
  return async () => {
    await runCase(caseId, async (rec) => {
      const problems = []
      const push = (code, message, detail) => problems.push(problem(code, message, detail))
      const rel = DOCS[kind].rel
      const file = path.join(REPO, rel)
      if (!existsSync(file)) {
        push('TRB-READ-UNREADABLE', `${rel} 不在 ⇒ 这一格判不了（不是"没要求"）`)
        caseFail(problems)
      }
      const original = readFileSync(file, 'utf8')
      const beforeSha = sha256Text(original)
      const real = checkDoc(kind, original)
      rec.readings.doc = docReading(kind, original, real.section)
      rec.readings.coverage = 'both（TRB-01 作业书 + TRB-02 说明书；契约 §2.1）'
      rec.readings.real = { codes: real.problems.map((p) => p.code), clauses: real.clauses }
      for (const p of real.problems) push(p.code, p.why)

      // ① 反面整段 ⇒ 必须红（且逐 clause 都红）。
      const flipKind = kind === 'brief' ? OPPOSITE_BRIEF : OPPOSITE_CHARTER
      const flipped = replaceSection(original, DOCS[kind].heading, flipKind)
      if (flipped === null) {
        push('TRB-SECTION-MISSING', `${rel} 的「地基」标题不见了 —— 连翻面都做不成`)
      } else {
        writeCopy(caseId, `${kind}.flip.md`, flipped)
        const flip = checkDoc(kind, flipped)
        const flippedClauses = [...new Set(flip.problems.map((p) => p.clause))].sort()
        const wantClauses = DOCS[kind].clauses.map((c) => c.id).sort()
        rec.readings.flip = { codes: flip.problems.map((p) => p.code), flipped_clauses: flippedClauses, want_clauses: wantClauses }
        if (flip.problems.length === 0) {
          push('TRB-FLIP-NOT-RED', `[${caseId}] 整段换成反面话，判据仍然是绿的 —— 这一段没有被咬住（翻面证明失败）`)
        }
        const notFlipped = wantClauses.filter((c) => !flippedClauses.includes(c))
        if (notFlipped.length > 0) {
          push('TRB-FLIP-PARTIAL', `[${caseId}] 反面话只翻了 ${JSON.stringify(flippedClauses)}，这几条没翻：${JSON.stringify(notFlipped)} —— 那几条义务没人守`)
        }
        // ② 还原 ⇒ 必须绿。
        const restored = replaceSection(flipped, DOCS[kind].heading, sectionOf(original, DOCS[kind].heading).raw)
        writeCopy(caseId, `${kind}.restored.md`, restored)
        const back = checkDoc(kind, restored)
        rec.readings.restored = { codes: back.problems.map((p) => p.code) }
        if (back.problems.length !== 0) {
          push('TRB-RESTORE-NOT-GREEN', `[${caseId}] 把原文换回去，判据仍然红：${back.problems.map((p) => p.code).join(',')}`)
        }
      }

      // ③ 合法改写 ⇒ 仍绿（否则针太脆）。
      for (const [anchor, replacement] of LEGAL_REWRITES[kind]) {
        const count = countOf(original, anchor)
        if (count !== 1) {
          push('TRB-LEGAL-ANCHOR', `[${caseId}] 合法改写的锚点 "${anchor}" 出现 ${count} 次（必须恰好 1 次）—— 文档换过写法，这条改写要同批更新`)
          continue
        }
        const text = original.replace(anchor, replacement)
        const out = checkDoc(kind, text)
        if (out.problems.length !== 0) {
          push('TRB-LEGAL-REWRITE', `[${caseId}] 合法改写（${JSON.stringify(anchor)} → ${JSON.stringify(replacement)}）被判红：${out.problems.map((p) => p.code).join(',')} —— 针太脆，先修针`)
        }
      }

      // ④ 单句刀：一条 clause 一把，各只翻那一条。
      for (const knife of KNIVES[kind]) {
        const count = countOf(original, knife.anchor)
        if (count !== 1) {
          push('TRB-KNIFE-ANCHOR', `[${caseId}/${knife.clause}] 刀的锚点出现 ${count} 次（必须恰好 1 次）：${JSON.stringify(knife.anchor)}`)
          continue
        }
        const text = original.replace(knife.anchor, knife.replace)
        const out = checkDoc(kind, text)
        const clauses = [...new Set(out.problems.map((p) => p.clause))].sort()
        rec.readings[`knife_${knife.clause}`] = { codes: out.problems.map((p) => p.code), clauses }
        if (clauses.length !== 1 || clauses[0] !== knife.clause) {
          push('TRB-KNIFE-VECTOR', `[${caseId}/${knife.clause}] 这把刀只该翻 ${knife.clause}，实得 ${JSON.stringify(clauses)}（codes=${JSON.stringify(out.problems.map((p) => p.code))}）`)
        }
      }

      // ⑤ 产品零字节（这一格只读真文件、只写运行根）。
      if (sha256Text(readFileSync(file, 'utf8')) !== beforeSha) {
        push('TRB-LIVE-TOUCHED', `[${caseId}] ${rel} 在跑动中被改了 —— 本格只许读它`)
      }

      // ⑥ 0010 · 删除优先的三条腿（同一格；不新开用例 ID）。
      if (extra !== null) await extra(rec, push)

      caseFail(problems)
    })
  }
}

// ── 0010 · 删除优先（构案 `决议/构案/0010-评审删除优先.md` §② / §⑤ / 验收口径）────────────────────
/**
 * 五处载体、同一段文字。这一段在 `0261c70` 落四处、`eb22836` 补第五处（`team/design.md`）⇒
 * **"红先"不能靠"功能没做"**：本块用**变异体**（删 / 挪 / 换行）证明每条腿能单独翻面；五份原件是阳性对照。
 *
 * 三条腿（各一个码前缀，红的时候一眼看得出是哪一条）：
 *   · 腿 1 `DEL-PRIORITY-*`：优先级句那一**整行**（`trim()` 后逐字相等）五份各恰好 1 次。
 *     `MISSING` = 整行不在；`DRIFT` = 那一行还在、但不是逐字那一行（行尾加字）；`DUPLICATE` = 整行出现多次。
 *     子串命中不算命中（`countOf` 的教训：行尾追加「（时间紧可跳过）」仍是 1 次）。
 *   · 腿 2 `DEL-SLOT-*`：那一段里有 `删除可行性` 那一格，且两种形状都是**完整形状**
 *     （`可整删（证据：…）` / `删不掉（因为：…）`：前缀 + `…` + 收尾 `）`）、「未验」兜底、「每条发现」范围。
 *     **外加合成报告样本**的判据（`DEL-SAMPLE-*`）：三种合法报告形状（`### 发现` 块 / 表格 / 零条发现声明）
 *     都收；粗体标签、全角冒号、Windows 反斜杠路径也收；缺格 / 留空 / 抄占位符 / 只写"看起来没人用"
 *     各自一条红、**点名那条发现**。
 *     ⚠️ **判的是合成样本，不是真报告**：今天没有技术评审报告，本腿也**不要求**它存在；真报告那一层由
 *     下一次技术评审按新格式交（构案 §⑥ / 验收口径「行为」行），本腿不声称它已经发生。
 *   · 腿 3 `DEL-ORDER-*`：**整段的五行顺序**（第 1 行「第一问 + 删得掉就整删」/ 第 2 行证据 /
 *     第 3 行优先级 / 第 4 行三支候选 + 第一格 / 第 5 行 `删除可行性`）；段 = 前后都到空行的连续非空行块，
 *     段内不许夹别的行、也不许被空行断开。三支候选的**第一格**取「第一格必须是」后面第一个「」并做**等值**
 *     比较（不是拿整段尾巴 `includes`）。「改成……」**不许**排在「删得掉就整删」之前（整份文件量）。
 *
 * 每条腿的"只翻自己"由 `legs` 对账：刀落下去以后**另两腿必须 0 条**。唯一的例外是"删掉一行"那两把刀：
 * 删一行必然让那一段不再是五行 ⇒ 顺序腿同红；例外不靠嘴说，逐把写进 `also`（声明会同红的码），
 * 未声明的同红 ⇒ `DEL-KNIFE-LEAK`，声明了却不同红 ⇒ `DEL-KNIFE-VECTOR`（刀没落到该落的地方）。
 *
 * 🔴 本块**不**做的事（写出来，别让绿读成"评审会照做"）：
 *   · 不判真报告（没有；合成样本只证明那一格**可核对**，且只收三种常见形状 —— 真报告的 Markdown 形状
 *     在 `job-briefs/technical-review.md` 的「交活」里没有规定，这一格不替它发明格式）；
 *   · 不判「删不掉（因为：…）」里的依赖有没有点到 `file:line` —— 构案 RC-4 只是**反悔条件**（未触发），
 *     不替它提前加码；只判样本里「可整删」的证据不是空话（`file:line` 或 `0 处`，验收口径「行为」行）；
 *     段落本身只说「证据给到调用方 / 可达性」，**样本更严**——这个粒度差写在读数 `sample.note` 里；
 *   · **不**做整段逐字相等：那会把三腿耦合成一条（删任一句 ⇒ 整段不等 ⇒ 三腿同红）。五份整段的 sha256
 *     进读数，分叉由人看一眼；逐字面钉优先级句（腿 1）、两种形状（腿 2）、五行顺序与第一格（腿 3）。
 *   · 不改 `presets/**`：三份「交活」清单 + `findings.json` 单条 finding 字段里的 `删除可行性`（评审 F7）
 *     今天**不在产品文字里**；本块只把它记成读数（`readings.deliverables`），要补的是产品侧一行，归组长。
 */
const DELETE_FIRST_PARAGRAPH = [
  '**第一问：这块该不该存在。** 删得掉就整删 —— 判据是「删掉之后当前功能一行不变」，',
  '证据给到调用方 / 可达性（谁在用、哪条路会走到），不是「看起来没人用」。',
  '优先级固定 **删除 > 修改 > 新增**：能整删的，不许写成「改成……」的备选之一；',
  '给三种候选时，第一格必须是「整块删掉」那一支。',
  '每条发现必须带一格 `删除可行性`：`可整删（证据：…）` / `删不掉（因为：…）`；填不出来的按「未验」记。',
].join('\n')
/** 派工卡给的独立摘要（209 字 / 557 B，LF 行尾）。它是**期望侧**的冻结值，不是拿产品算的。 */
const DELETE_FIRST_SHA256 = 'a18655e77ae27f48339be2a59420ebe4222017b772298e84b76ebfc36c5f35ea'
const DELETE_FIRST_LINES = DELETE_FIRST_PARAGRAPH.split('\n')
/** 起点用**短语**（不是整行）：合法改写第一行时仍定位得到；整行是腿 1 的冻结面，不拿它当取样锚。 */
const DELETE_FIRST_START = '第一问：这块该不该存在'
/** 那一格的名字（段落里的术语；三份交活清单也用它）。 */
const DELETE_FIRST_SLOT_NAME = '删除可行性'
const DELETE_FIRST_PRIORITY_LINE = DELETE_FIRST_LINES[2]
const DELETE_FIRST_SLOT_LINE = DELETE_FIRST_LINES[4]
/**
 * 段内每一行的**位置**（1-based）与定位锚。锚只回答"这一行是不是它"；
 * 措辞面归腿 1（优先级整行）与腿 2（两种形状），不在这里再钉一遍。
 */
const DELETE_FIRST_LINE_SLOTS = [
  { line: 1, label: '第一问 + 删得掉就整删', anchors: ['第一问：这块该不该存在', '删得掉就整删'] },
  { line: 2, label: '证据 / 可达性', anchors: ['证据给到调用方', '可达性'] },
  { line: 3, label: '优先级固定', anchors: ['优先级固定'] },
  { line: 4, label: '给三种候选时 + 第一格必须是', anchors: ['给三种候选时', '第一格必须是'] },
  { line: 5, label: '删除可行性 + 未验', anchors: ['删除可行性', '未验'] },
]
/** 五处载体（构案 §② 的名单；顺序 = 读数里的顺序）。 */
const DELETE_FIRST_CARRIERS = [
  'presets/agenia/team/review.md',
  'presets/agenia/job-briefs/technical-review.md',
  'presets/agenia/job-briefs/conversation-review.md',
  'presets/agenia/team/dev.md',
  'presets/agenia/team/design.md',
]

/**
 * 取「删除优先」那一段：包含 `第一问…` 短语的**那一个非空行块**（前后都扩到空行）。
 * 找不到 ⇒ `null`（调用方按红处理 —— "段不见了"不是"没要求"）。
 * 取样口径：行按 `\r?\n` 切（CRLF 与 LF 视为同一行）；比较的是**行文本**，整份文件的字节不等不是这一格的事。
 * ⚠️ 块的长度本身就是判据的一部分：夹进来的行会让块变长，中间的空行会把块切断（见腿 3）。
 */
function deleteFirstBlockOf(text) {
  const lines = text.split(/\r?\n/)
  const marker = lines.findIndex((l) => l.includes(DELETE_FIRST_START))
  if (marker < 0) return null
  let start = marker
  while (start > 0 && lines[start - 1].trim() !== '') start -= 1
  let end = marker
  while (end < lines.length && lines[end].trim() !== '') end += 1
  const body = lines.slice(start, end)
  return { start, end, lines: body, raw: body.join('\n') }
}

/** 一条腿的 problems 分开收：刀落下去时才能证明"只翻自己"。 */
function deleteFirstProblems(rel, text) {
  const legs = { priority: [], slot: [], order: [] }
  const block = deleteFirstBlockOf(text)
  if (block === null) {
    return {
      block,
      legs,
      problems: [problem('DEL-PARA-MISSING', `${rel} 里找不到「删除优先」那一段（起点短语 = 「${DELETE_FIRST_START}」）—— 三条腿都无从核对（不是"没要求"）`)],
    }
  }

  // ── 腿 1：优先级句**整行**逐字、恰好 1 次（子串命中不算；行尾加字 ⇒ DRIFT）──────────
  const allLines = text.split(/\r?\n/)
  const wholeHits = allLines.filter((l) => l.trim() === DELETE_FIRST_PRIORITY_LINE).length
  const drifted = allLines.filter((l) => l.includes(DELETE_FIRST_PRIORITY_LINE) && l.trim() !== DELETE_FIRST_PRIORITY_LINE)
  if (wholeHits === 0) {
    if (drifted.length > 0) {
      legs.priority.push(problem('DEL-PRIORITY-DRIFT', `${rel} 里那条优先级句在、但**不是整行逐字**：有 ${drifted.length} 行含它却多了/少了字（实得 ${JSON.stringify(drifted[0].trim())}；期望整行 ${JSON.stringify(DELETE_FIRST_PRIORITY_LINE)}）`))
    } else {
      legs.priority.push(problem('DEL-PRIORITY-MISSING', `${rel} 里没有那条优先级句（整行逐字：${JSON.stringify(DELETE_FIRST_PRIORITY_LINE)}）`))
    }
  } else if (wholeHits > 1) {
    legs.priority.push(problem('DEL-PRIORITY-DUPLICATE', `${rel} 里那条优先级句整行出现 ${wholeHits} 次（只许 1 次）`))
  } else if (drifted.length > 0) {
    legs.priority.push(problem('DEL-PRIORITY-DRIFT', `${rel} 里有一行整行逐字，另有一行**含**它却走样了（实得 ${JSON.stringify(drifted[0].trim())}）—— 同一句话出现了第二个走样的副本`))
  }

  // ── 腿 2a：`删除可行性` 那一格在那一段里（两种完整形状 + 未验兜底 + 每条发现）────────────
  const spec = deletionSampleSpec()
  const slotLines = block.lines.filter((l) => l.includes(DELETE_FIRST_SLOT_NAME))
  if (slotLines.length === 0) {
    legs.slot.push(problem('DEL-SLOT-MISSING', `${rel} 的删除优先那一段里没有 \`${DELETE_FIRST_SLOT_NAME}\` 那一格 —— 每条发现的处置没有落点`))
  } else if (slotLines.length > 1) {
    legs.slot.push(problem('DEL-SLOT-DUPLICATE', `${rel} 的删除优先那一段里有 ${slotLines.length} 行都写着「${DELETE_FIRST_SLOT_NAME}」（那一格只该有一行）`))
  } else {
    const line = slotLines[0]
    const missing = []
    if (!line.includes('每条发现')) missing.push('「每条发现」的范围')
    if (!line.includes('未验')) missing.push('「未验」兜底')
    if (missing.length > 0) {
      legs.slot.push(problem('DEL-SLOT-FORM', `${rel} 的 \`${DELETE_FIRST_SLOT_NAME}\` 那一行缺 ${JSON.stringify(missing)} —— 这一格要能填、也要能说"填不出来"（实得 ${JSON.stringify(line)}）`))
    }
    const incomplete = [spec.deletable.form, spec.keep.form].filter((form) => !line.includes(form))
    if (incomplete.length > 0) {
      legs.slot.push(problem('DEL-SLOT-SHAPE', `${rel} 的 \`${DELETE_FIRST_SLOT_NAME}\` 那一行缺完整形状 ${JSON.stringify(incomplete)} —— 两种形状都要带中间的 \`…\` 与收尾 ${JSON.stringify(spec.deletable.suffix)}（只写前缀不算；实得 ${JSON.stringify(line)}）`))
    }
  }

  // ── 腿 3a：整段的**五行顺序**（行号固定；段内不许夹行、不许被空行断开）──────────────
  const shape = []
  if (block.lines.length !== DELETE_FIRST_LINES.length) {
    shape.push(`段有 ${block.lines.length} 行（要恰好 ${DELETE_FIRST_LINES.length} 行：段内不许夹别的行，也不许被空行断开）`)
  }
  for (const at of DELETE_FIRST_LINE_SLOTS) {
    const line = block.lines[at.line - 1]
    const missingAnchors = at.anchors.filter((a) => typeof line !== 'string' || !line.includes(a))
    if (missingAnchors.length > 0) {
      shape.push(`第 ${at.line} 行应是「${at.label}」（缺 ${JSON.stringify(missingAnchors)}）${typeof line === 'string' ? `，实得 ${JSON.stringify(line)}` : '，段里没有这一行'}`)
    }
  }
  if (shape.length > 0) {
    legs.order.push(problem('DEL-ORDER-LINES', `${rel} 的删除优先那一段不是五行的固定顺序（1 第一问 / 2 证据 / 3 优先级 / 4 三支候选第一格 / 5 ${DELETE_FIRST_SLOT_NAME}）：${shape.join('；')}`))
  }
  // ── 腿 3b：「改成……」**整份文件**量（把那一行挪到段上方也逃不掉）────────────────────
  const rewriteAt = text.indexOf('改成……')
  const deleteAt = text.indexOf('删得掉就整删')
  if (rewriteAt >= 0 && deleteAt >= 0 && rewriteAt < deleteAt) {
    legs.order.push(problem('DEL-ORDER-REWRITE-FIRST', `${rel} 里「改成……」排在「删得掉就整删」之前（${rewriteAt} < ${deleteAt}）—— 能整删的不许被写成先改`))
  }
  // ── 腿 3c：三支候选的**第一格**逐字（取「第一格必须是」后面第一个「」，等值比较）──────────
  const candidateLine = block.lines.find((l) => l.includes('第一格必须是'))
  if (candidateLine !== undefined) {
    const tail = candidateLine.slice(candidateLine.indexOf('第一格必须是') + '第一格必须是'.length)
    const firstSlot = /^[^「]*「([^」]*)」/.exec(tail)
    const first = firstSlot === null ? null : firstSlot[1].trim()
    if (first === null) {
      legs.order.push(problem('DEL-ORDER-FIRST-SLOT', `${rel} 的三支候选那一行没说第一格是哪一个（「第一格必须是」后面要写一个「…」）：${JSON.stringify(candidateLine)}`))
    } else if (first !== '整块删掉') {
      legs.order.push(problem('DEL-ORDER-FIRST-SLOT', `${rel} 的三支候选第一格是「${first}」，不是「整块删掉」：${JSON.stringify(candidateLine)}`))
    }
  }
  return { block, legs, problems: [...legs.priority, ...legs.slot, ...legs.order] }
}

/**
 * 腿 2b 的**合成报告样本**判据（判样本，不判真报告）。
 * 那一格的**名字与两种形状从期望段里取**（`DELETE_FIRST_SLOT_LINE` 的反引号片段），
 * 不在测试里另写一份报告格式 —— 格式的唯一出处还是构案那一段。
 */
function deletionSampleSpec() {
  const forms = [...DELETE_FIRST_SLOT_LINE.matchAll(/`([^`]+)`/g)].map((m) => m[1])
  const deletable = forms.find((f) => f.startsWith('可整删'))
  const keep = forms.find((f) => f.startsWith('删不掉'))
  const split = (form) => ({ form, prefix: form.split('…')[0], suffix: form.slice(form.lastIndexOf('…') + 1) })
  return { slot: forms[0], deletable: split(deletable), keep: split(keep) }
}

/**
 * 一条发现的「那一格」行：`- 删除可行性: v` / `- **删除可行性**：v` / `删除可行性：v` 都收
 * （粗体标签、全角冒号是报告里常见的写法；收了它们不等于放宽值的要求）。
 */
function sampleSlotLineRe(slot) {
  const name = slot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^\\s*(?:[-*+]\\s*)?(?:\\*\\*)?${name}(?:\\*\\*)?\\s*[:：]\\s*(.*)$`)
}

/** 表格报告：表头要有 `发现`/`id` 列与槽名列；分隔行跳过，缺格记 `null`、空格记 `''`。 */
function sampleTableFindings(lines, spec) {
  const cells = (l) => l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|')
    .map((c) => c.trim().replace(/^\*\*(.*)\*\*$/, '$1').trim())
  const headerAt = lines.findIndex((l) => /^\s*\|/.test(l)
    && cells(l).some((c) => c === spec.slot)
    && cells(l).some((c) => /^(发现|id)$/i.test(c)))
  if (headerAt < 0) return null
  const header = cells(lines[headerAt])
  const idCol = header.findIndex((c) => /^(发现|id)$/i.test(c))
  const slotCol = header.findIndex((c) => c === spec.slot)
  const out = []
  for (let i = headerAt + 1; i < lines.length; i += 1) {
    if (!/^\s*\|/.test(lines[i])) break
    const row = cells(lines[i])
    if (row.every((c) => /^:?-{2,}:?$/.test(c) || c === '')) continue
    const id = row[idCol]
    if (id === undefined || id === '') continue
    const cell = row[slotCol]
    out.push({ id, value: cell === undefined ? null : cell })
  }
  return out
}

/**
 * 合成报告的**三种合法形状**（都收，别让"样本过"变成"只有我这一种写法过"）：
 *   ① `### 发现 <id>` 块（每块一行那一格）；② Markdown 表格；③ **零条发现**声明
 *      （`presets/agenia/team/technical-review.md:6`：零条也是一份合法结果）。
 * 三种都不是 ⇒ `DEL-SAMPLE-SHAPE`（判不了就是红，不是"零条发现"）。
 * 值的三态：缺格 / 留空 / `未验` / 两种形状（可整删的证据要 `file:line` 或 `0 处`，反斜杠路径也收）。
 */
function deletionSampleProblems(text, spec = deletionSampleSpec()) {
  const problems = []
  const lines = text.split(/\r?\n/)
  const slotRe = sampleSlotLineRe(spec.slot)
  const collected = []
  // ① `### 发现 <id>` 块
  const heads = []
  lines.forEach((l, i) => {
    const m = /^###\s+发现\s+(\S+)\s*$/.exec(l)
    if (m !== null) heads.push({ id: m[1], at: i })
  })
  for (let k = 0; k < heads.length; k += 1) {
    const { id, at } = heads[k]
    const end = k + 1 < heads.length ? heads[k + 1].at : lines.length
    const body = lines.slice(at + 1, end)
    const hit = body.find((l) => slotRe.test(l))
    collected.push({ id, value: hit === undefined ? null : slotRe.exec(hit)[1] })
  }
  let shape = 'heading-blocks'
  // ② Markdown 表格
  if (collected.length === 0) {
    const rows = sampleTableFindings(lines, spec)
    if (rows !== null) {
      collected.push(...rows)
      shape = 'table'
    }
  }
  // ③ 零条发现
  if (collected.length === 0) {
    if (/(零条发现|0\s*条发现|findings\s*[:：]\s*\[\s*\])/.test(text)) {
      return { findings: [], problems, shape: 'zero-findings' }
    }
    return {
      findings: [],
      problems: [problem('DEL-SAMPLE-SHAPE', '[合成报告样本] 既没有「### 发现 <id>」块、也没有带那一格的表格、也没有「零条发现」声明 —— 判不了就是红（别把"没读到"读成"零条发现"）')],
      shape: 'not-a-report',
    }
  }
  const findings = []
  for (const { id, value } of collected) {
    const finding = { id, state: null, value }
    findings.push(finding)
    if (value === null) {
      problems.push(problem('DEL-SAMPLE-SLOT-MISSING', `[合成报告样本] 发现 ${id} 没有「${spec.slot}」那一格 —— 每条发现都必须带它`))
      continue
    }
    const v = value.trim().replace(/^`([^`]*)`$/, '$1').trim()
    finding.value = v
    if (v === '') {
      problems.push(problem('DEL-SAMPLE-UNFILLED', `[合成报告样本] 发现 ${id} 的「${spec.slot}」是空的 —— 填不出来要写「未验」，不许留空`))
    } else if (v === '未验') {
      finding.state = 'unverified'
    } else {
      const pick = (form) => (v.startsWith(form.prefix) && v.endsWith(form.suffix)
        ? v.slice(form.prefix.length, v.length - form.suffix.length).trim()
        : null)
      const deletable = pick(spec.deletable)
      const keep = pick(spec.keep)
      const payload = deletable ?? keep
      if (payload === null) {
        problems.push(problem('DEL-SAMPLE-FORM', `[合成报告样本] 发现 ${id} 的「${spec.slot}」不是 \`${spec.deletable.form}\` 也不是 \`${spec.keep.form}\`（实得 ${JSON.stringify(v)}）`))
      } else if (payload === '' || payload === '…') {
        problems.push(problem('DEL-SAMPLE-PLACEHOLDER', `[合成报告样本] 发现 ${id} 的「${spec.slot}」只抄了格式里的占位符 \`…\` —— 那不是证据`))
      } else if (deletable !== null) {
        finding.state = 'deletable'
        if (!/([A-Za-z0-9_./\\-]+:\d+)|(0\s*处)/.test(deletable)) {
          problems.push(problem('DEL-SAMPLE-EVIDENCE', `[合成报告样本] 发现 ${id} 写了「可整删」，证据却既没有 \`file:line\` 也没有「0 处」：${JSON.stringify(deletable)} —— 「看起来没人用」不算证据`))
        }
      } else {
        finding.state = 'keep'
      }
    }
  }
  return { findings, problems, shape }
}

/** 合成报告样本（判的是**样本**；`slots` 里 `null` = 那一条发现故意不带这一格）。 */
const deletionSampleReport = (slots) => [
  '# 技术评审（合成样本 · 不是真报告）',
  '',
  ...slots.flatMap(([id, slot]) => [
    `### 发现 ${id}`,
    '- 严重度: P2',
    '- 证据: `presets/agenia/foo.mjs:12`',
    '- 摘要: （合成样本）一条发现',
    ...(slot === null ? [] : [`- 删除可行性: ${slot}`]),
    '',
  ]),
].join('\n')

/** 表格形状的合成报告（`F9`：报告没规定 Markdown 形状 ⇒ 表格也是一份合法交活）。 */
const deletionSampleTable = () => [
  '# 技术评审（合成样本 · 表格形状）',
  '',
  '| 发现 | 严重度 | 证据 | 删除可行性 |',
  '|---|---|---|---|',
  '| F1 | P2 | `presets/agenia/foo.mjs:12` | 可整删（证据：`presets/agenia/foo.mjs:12` 无调用方） |',
  '| F2 | P2 | `presets/agenia/bar.mjs:7` | 删不掉（因为：`presets/agenia/bar.mjs:7` 在调用） |',
  '| F3 | P3 | — | 未验 |',
  '',
].join('\n')

/**
 * 刀 = 对**真文字的副本**做一次删 / 挪 / 换行。落点必须**恰好 1 次**（不是 ⇒ `DEL-KNIFE-ANCHOR`，
 * 不许把"刀没落下去"读成"翻面能力"）。段内操作只在那一个 5 行块里动（刀不许悄悄改别的行）。
 */
function applyDeleteFirstKnife(text, knife) {
  const lines = text.split(/\r?\n/)
  if (knife.op === 'remove-line') {
    const count = lines.filter((l) => l === knife.line).length
    if (count !== 1) return { ok: false, why: `锚点行出现 ${count} 次（要恰好 1 次）：${JSON.stringify(knife.line)}` }
    return { ok: true, text: lines.filter((l) => l !== knife.line).join('\n') }
  }
  const block = deleteFirstBlockOf(text)
  if (block === null) return { ok: false, why: '删除优先那一段找不到（起点短语不见了）—— 刀无处落' }
  const inBlock = (line) => {
    const hits = block.lines.map((l, i) => [l, block.start + i]).filter(([l]) => l === line)
    return hits.length === 1 ? hits[0][1] : null
  }
  const target = inBlock(knife.line ?? knife.a)
  if (target === null) return { ok: false, why: `刀的行在段内不是恰好 1 次：${JSON.stringify(knife.line ?? knife.a)}` }
  const replaceBlock = (body) => [...lines.slice(0, block.start), ...body, ...lines.slice(block.end)].join('\n')
  switch (knife.op) {
    case 'append-suffix': {
      const next = lines.slice()
      next[target] = next[target] + knife.suffix
      return { ok: true, text: next.join('\n') }
    }
    case 'replace-line': {
      const next = lines.slice()
      next[target] = knife.to
      return { ok: true, text: next.join('\n') }
    }
    case 'move-to-end':
      return { ok: true, text: replaceBlock([...block.lines.filter((l) => l !== knife.line), knife.line]) }
    case 'swap': {
      const other = inBlock(knife.b)
      if (other === null) return { ok: false, why: `另一行在段内不是恰好 1 次：${JSON.stringify(knife.b)}` }
      const next = lines.slice()
      const keep = next[target]
      next[target] = next[other]
      next[other] = keep
      return { ok: true, text: next.join('\n') }
    }
    case 'insert-after': {
      const next = lines.slice()
      next.splice(target + 1, 0, knife.insert)
      return { ok: true, text: next.join('\n') }
    }
    case 'move-above': {
      if (inBlock(knife.anchor) === null) return { ok: false, why: `落点行在段内不是恰好 1 次：${JSON.stringify(knife.anchor)}` }
      const body = block.lines.filter((l) => l !== knife.line)
      body.splice(body.indexOf(knife.anchor), 0, knife.line)
      return { ok: true, text: replaceBlock(body) }
    }
    default:
      return { ok: false, why: `未知刀型：${knife.op}` }
  }
}

/**
 * 刀表。`want` = 这把刀**自己那条腿**该出的码；`also` = 同一次里**声明**会一起红的别的腿
 * （只有"删掉一行"那一族需要：删一行必然让那一段不再是五行）。没有声明就同红 ⇒ `DEL-KNIFE-LEAK`。
 */
const DELETE_FIRST_KNIVES = [
  {
    id: 'priority-gone',
    leg: 'priority',
    carrier: 'presets/agenia/team/review.md',
    op: 'remove-line',
    line: DELETE_FIRST_PRIORITY_LINE,
    want: ['DEL-PRIORITY-MISSING'],
    also: { order: ['DEL-ORDER-LINES'] },
    why: '删掉一行 ⇒ 那一段只剩 4 行，顺序腿必然同红（不是漏）',
  },
  {
    id: 'priority-drift',
    leg: 'priority',
    carrier: 'presets/agenia/team/review.md',
    op: 'append-suffix',
    line: DELETE_FIRST_PRIORITY_LINE,
    suffix: '（时间紧可跳过）',
    want: ['DEL-PRIORITY-DRIFT'],
    why: '那一行还在、还是第 3 行，只是不是整行逐字 ⇒ 只翻腿 1 的 DRIFT',
  },
  {
    id: 'slot-gone',
    leg: 'slot',
    carrier: 'presets/agenia/team/design.md',
    op: 'remove-line',
    line: DELETE_FIRST_SLOT_LINE,
    want: ['DEL-SLOT-MISSING'],
    also: { order: ['DEL-ORDER-LINES'] },
    why: '删掉第 5 行 ⇒ 段只剩 4 行，顺序腿必然同红（不是漏）',
  },
  {
    id: 'slot-shape',
    leg: 'slot',
    carrier: 'presets/agenia/team/design.md',
    op: 'replace-line',
    line: DELETE_FIRST_SLOT_LINE,
    to: DELETE_FIRST_SLOT_LINE.replace('）', '').replace('）', ''),
    want: ['DEL-SLOT-SHAPE'],
    why: '两种形状各去掉收尾 `）` ⇒ 形状不完整（第 5 行仍在、仍在第 5 行）',
  },
  {
    id: 'priority-to-end',
    leg: 'order',
    carrier: 'presets/agenia/team/review.md',
    op: 'move-to-end',
    line: DELETE_FIRST_PRIORITY_LINE,
    want: ['DEL-ORDER-LINES'],
    why: '优先级行挪到段尾 ⇒ 段还是五行，但第 3 行不再是它',
  },
  {
    id: 'swap-3-4',
    leg: 'order',
    carrier: 'presets/agenia/team/review.md',
    op: 'swap',
    a: DELETE_FIRST_PRIORITY_LINE,
    b: DELETE_FIRST_LINES[3],
    want: ['DEL-ORDER-LINES'],
    why: '优先级行与三支候选行对调 ⇒ 第 3 / 第 4 行都错位',
  },
  {
    id: 'interleave',
    leg: 'order',
    carrier: 'presets/agenia/team/review.md',
    op: 'insert-after',
    line: DELETE_FIRST_LINES[1],
    insert: '（临时插进段落的一行）',
    want: ['DEL-ORDER-LINES'],
    why: '段内夹一行 ⇒ 段变成六行且后面三行整体错位',
  },
  {
    id: 'first-slot-first',
    leg: 'order',
    carrier: 'presets/agenia/team/review.md',
    op: 'replace-line',
    line: DELETE_FIRST_LINES[3],
    to: '给三种候选时，第一格必须是「保留原样」，第二格必须是「整块删掉」那一支。',
    want: ['DEL-ORDER-FIRST-SLOT'],
    why: '第一格换成「保留原样」、第二格才是整删 ⇒ 只翻第一格那条',
  },
  {
    id: 'rewrite-first',
    leg: 'order',
    carrier: 'presets/agenia/job-briefs/conversation-review.md',
    op: 'move-above',
    line: DELETE_FIRST_PRIORITY_LINE,
    anchor: DELETE_FIRST_LINES[0],
    want: ['DEL-ORDER-LINES', 'DEL-ORDER-REWRITE-FIRST'],
    why: '优先级行挪到段首 ⇒ 行序错 + 「改成……」抢先（整份文件量）',
  },
  {
    id: 'candidate-first',
    leg: 'order',
    carrier: 'presets/agenia/job-briefs/technical-review.md',
    op: 'move-above',
    line: DELETE_FIRST_LINES[3],
    anchor: DELETE_FIRST_LINES[0],
    want: ['DEL-ORDER-LINES'],
    why: '三支候选行挪到段首 ⇒ 段还是五行，但第 1 / 3 / 4 行都错位',
  },
]

/** 合成样本：合法形状 + 五种反面 + 一种"不是报告"。`want` 是**恰好**的码集。 */
const DELETE_FIRST_SAMPLES = [
  {
    id: 'good',
    text: deletionSampleReport([
      ['F1', '可整删（证据：0 处调用；`grep -n "foo" presets/**` 零命中）'],
      ['F2', '删不掉（因为：`presets/agenia/bar.mjs:7` 在调用）'],
      ['F3', '未验'],
    ]),
    want: [],
  },
  {
    id: 'zero-findings',
    text: '# 技术评审（合成样本 · 零条发现）\n\n零条发现（`findings: []`）。查了 `presets/agenia/` 与 `tests/`。\n',
    want: [],
  },
  { id: 'table', text: deletionSampleTable(), want: [] },
  {
    id: 'bold-fullwidth',
    text: [
      '# 技术评审（合成样本 · 粗体标签 + 全角冒号）',
      '',
      '### 发现 F1',
      '- **严重度**: P2',
      '- **删除可行性**：可整删（证据：0 处调用）',
      '',
      '### 发现 F2',
      '- **删除可行性**：删不掉（因为：`presets/agenia/bar.mjs:7` 在调用）',
      '',
    ].join('\n'),
    want: [],
  },
  {
    id: 'fullwidth-colon',
    text: deletionSampleReport([
      ['F1', '可整删（证据：0 处调用）'],
      ['F2', '删不掉（因为：`presets/agenia/bar.mjs:7` 在调用）'],
      ['F3', '未验'],
    ]).replaceAll('- 删除可行性: ', '- 删除可行性：'),
    want: [],
  },
  {
    id: 'windows-path',
    text: deletionSampleReport([
      ['F1', '可整删（证据：presets\\agenia\\foo.mjs:12 无调用方）'],
      ['F2', '删不掉（因为：presets\\agenia\\bar.mjs:7 在调用）'],
      ['F3', '未验'],
    ]),
    want: [],
  },
  {
    id: 'missing-slot',
    text: deletionSampleReport([
      ['F1', '可整删（证据：0 处调用）'],
      ['F2', null],
      ['F3', '未验'],
    ]),
    want: ['DEL-SAMPLE-SLOT-MISSING'],
    names: 'F2',
  },
  {
    id: 'blank-slot',
    text: deletionSampleReport([['F1', '可整删（证据：0 处调用）'], ['F2', ''], ['F3', '未验']]),
    want: ['DEL-SAMPLE-UNFILLED'],
    names: 'F2',
  },
  {
    id: 'placeholder',
    text: deletionSampleReport([['F1', '可整删（证据：0 处调用）'], ['F2', '可整删（证据：…）'], ['F3', '未验']]),
    want: ['DEL-SAMPLE-PLACEHOLDER'],
    names: 'F2',
  },
  {
    id: 'no-evidence',
    text: deletionSampleReport([['F1', '可整删（证据：0 处调用）'], ['F2', '可整删（证据：看起来没人用）'], ['F3', '未验']]),
    want: ['DEL-SAMPLE-EVIDENCE'],
    names: 'F2',
  },
  { id: 'not-a-report', text: '# 今天的日志\n\n今天没人评审，我也没看代码。\n', want: ['DEL-SAMPLE-SHAPE'] },
]

/**
 * 评审的交活字段（`F7`）：三份清单 + `findings.json` 的单条 finding 都该有那一格。
 * 🔴 **这一格只记读数、不判产品**：`presets/**` 不在测试岗写区 —— 今天四处交活清单都没有那一格（读数里是 `false`），
 * 要补的是产品侧一行，归组长另起一条改 `presets/agenia/{job-briefs,team}`；本块不替它把产品判红。
 */
const REVIEW_DELIVERABLE_EXPECTATIONS = [
  {
    key: 'technical-review · 交活（报告里逐条发现）',
    rel: 'presets/agenia/job-briefs/technical-review.md',
    heading: /^##\s+四、交活/,
    fields: ['id', '严重度', '证据', '摘要', '删除可行性'],
  },
  {
    key: 'technical-review · findings.json 单条 finding',
    rel: 'presets/agenia/job-briefs/technical-review.md',
    heading: /^###\s+`技术评审\.findings\.json` 的字段/,
    fields: ['id', 'title', 'severity', 'evidence', 'summary', '删除可行性'],
  },
  {
    key: 'conversation-review · 交活',
    rel: 'presets/agenia/job-briefs/conversation-review.md',
    heading: /^##\s+四、交活/,
    fields: ['窗口', '读了哪些源', '逐条观察与建议', '判不了的条目', '草稿目录与文件 SHA256', '删除可行性'],
  },
  {
    key: 'team/review · 交回组长',
    rel: 'presets/agenia/team/review.md',
    heading: /^##\s+交回组长/,
    fields: ['判词', '每条的判据', '删除可行性'],
  },
]

/** 0010 的三条腿（并进 `TRB-01` 那一格；产品零字节，刀与样本都只写运行根）。 */
async function deleteFirstLegs(rec, push) {
  const readings = {
    contract: '构案 0010 §② / §⑤ / §六；本文件 `DELETE_FIRST_*` 那一段（r1 修：F1 行序 / F2 第一格 / F3 整行 / F10 形状 / F9 样本 / F7 交活读数 + 第五处载体）',
    expected_sha256: sha256Text(DELETE_FIRST_PARAGRAPH),
    expected_sha256_pinned: DELETE_FIRST_SHA256,
    expected_slots: DELETE_FIRST_LINE_SLOTS.map((s) => ({ line: s.line, label: s.label })),
    carriers: {},
    knives: {},
    sample: {},
    deliverables: {},
  }
  rec.readings.delete_first = readings
  // 期望侧自检：常量必须与派工卡给的独立摘要一致（复制错一个字，这里先红；别等五份产品去证明它）。
  if (readings.expected_sha256 !== DELETE_FIRST_SHA256) {
    push('DEL-EXPECTED-DRIFT', `期望段常量的 sha256 = ${readings.expected_sha256}，派工卡给的是 ${DELETE_FIRST_SHA256} —— 期望文本被改过（不是产品的问题）`)
  }

  // ── ① 五份原件：阳性对照（必须 0 problem），同时记整段 sha256 / 行号 / 整行命中 ────────────
  const original = {}
  for (const rel of DELETE_FIRST_CARRIERS) {
    const file = path.join(REPO, rel)
    if (!existsSync(file)) {
      push('DEL-CARRIER-MISSING', `${rel} 不在 ⇒ 这一份的删除优先无从核对（不是"没要求"）`)
      continue
    }
    const text = readFileSync(file, 'utf8')
    original[rel] = { text, sha256: sha256Text(text) }
    const out = deleteFirstProblems(rel, text)
    for (const p of out.problems) push(p.code, p.message, { carrier: rel })
    const lines = text.split(/\r?\n/)
    readings.carriers[rel] = {
      sha256: original[rel].sha256,
      paragraph_start_line: out.block === null ? null : out.block.start + 1,
      paragraph_lines: out.block === null ? null : out.block.lines.length,
      paragraph_sha256: out.block === null ? null : sha256Text(out.block.raw),
      priority_whole_hits: lines.filter((l) => l.trim() === DELETE_FIRST_PRIORITY_LINE).length,
      priority_embedded_hits: lines.filter((l) => l.includes(DELETE_FIRST_PRIORITY_LINE)).length,
      codes: out.problems.map((p) => p.code),
    }
  }
  readings.carriers_note = '五份整段的 sha256 记在这里（同一段文字 ⇒ 同值）；分叉由人看一眼。'
    + '逐字面钉三样：优先级句整行（腿 1）、两种完整形状（腿 2）、五行顺序 + 第一格（腿 3）。'

  // ── ② 腿 2b：合成报告样本（判样本，不判真报告）────────────────────────────
  for (const sample of DELETE_FIRST_SAMPLES) {
    writeCopy('TRB-01', `delete-first.sample-${sample.id}.md`, sample.text)
    const out = deletionSampleProblems(sample.text)
    const codes = out.problems.map((p) => p.code)
    readings.sample[sample.id] = {
      want: sample.want,
      codes,
      shape: out.shape,
      states: out.findings.map((f) => `${f.id}:${f.state}`),
      names_wanted: sample.names === undefined ? null : out.problems.every((p) => p.message.includes(sample.names)),
    }
    if (JSON.stringify(codes) !== JSON.stringify(sample.want)) {
      push('DEL-SAMPLE-CONTROL', `[合成报告样本/${sample.id}] 期望 ${JSON.stringify(sample.want)}，实得 ${JSON.stringify(codes)}（读数 ${JSON.stringify(out.findings)}）`)
    }
    if (sample.names !== undefined && !out.problems.every((p) => p.message.includes(sample.names))) {
      push('DEL-SAMPLE-CONTROL', `[合成报告样本/${sample.id}] 红因必须点名那条发现 ${sample.names}，实得 ${JSON.stringify(out.problems.map((p) => p.message))}`)
    }
  }
  readings.sample.note = '判的是**合成样本**，不是真报告：本腿只收三种报告形状（发现块 / 表格 / 零条发现声明），'
    + '粗体标签 / 全角冒号 / 反斜杠路径也收；真报告的 Markdown 形状在交活清单里没有规定，这一格不替它发明格式，'
    + '也不证明评审会照做。证据粒度上，段落只说「调用方 / 可达性」，样本要 `file:line` 或 `0 处`（更严）——'
    + '这个差是卡的判据与段落之间的粒度差，归第 4/5 关的人眼。'

  // ── ③ 交活字段（F7）：只记读数，不判产品 ──────────────────────────────────
  for (const item of REVIEW_DELIVERABLE_EXPECTATIONS) {
    const file = path.join(REPO, item.rel)
    const sec = existsSync(file) ? sectionOf(readFileSync(file, 'utf8'), item.heading) : null
    readings.deliverables[item.key] = {
      carrier: item.rel,
      expected_fields: item.fields,
      section_found: sec !== null,
      slot_listed: sec !== null && sec.raw.includes(DELETE_FIRST_SLOT_NAME),
    }
  }
  readings.deliverables_note = '四处「交活」清单今天都没有 `删除可行性` 那一格（读数 `slot_listed:false`）—— 这是评审 F7 的缺口；'
    + '测试岗不改 `presets/**`，补产品文字那一行归组长（另起一条）。本块只把缺口记成读数，不判产品红。'

  // ── ④ 刀：每把只翻自己那条腿（`also` 里声明的例外也要真红）─────────────────────
  for (const knife of DELETE_FIRST_KNIVES) {
    const base = original[knife.carrier]
    if (base === undefined) {
      push('DEL-KNIFE-ANCHOR', `[${knife.id}] ${knife.carrier} 没读到（上面已报 DEL-CARRIER-MISSING）—— 刀无处落`)
      continue
    }
    const mutated = applyDeleteFirstKnife(base.text, knife)
    if (!mutated.ok) {
      push('DEL-KNIFE-ANCHOR', `[${knife.id}] ${knife.carrier}：${mutated.why} —— 刀没落下去，这条"能翻面"不算证据`)
      continue
    }
    writeCopy('TRB-01', `delete-first.knife-${knife.id}.md`, mutated.text)
    const out = deleteFirstProblems(knife.carrier, mutated.text)
    const codes = out.problems.map((p) => p.code)
    const also = knife.also ?? {}
    const allowed = new Set(Object.values(also).flat())
    const foreign = {}
    for (const leg of ['priority', 'slot', 'order']) {
      if (leg === knife.leg) continue
      const legCodes = out.legs[leg].map((p) => p.code)
      if (legCodes.length > 0) foreign[leg] = legCodes
    }
    readings.knives[knife.id] = {
      carrier: knife.carrier,
      leg: knife.leg,
      op: knife.op,
      want: knife.want,
      also: knife.also ?? null,
      why: knife.why,
      codes,
      foreign_leg_codes: foreign,
      names_carrier: out.problems.every((p) => p.message.includes(knife.carrier)),
    }
    const wantAll = [...knife.want, ...Object.values(also).flat()].sort()
    if (JSON.stringify([...codes].sort()) !== JSON.stringify(wantAll)) {
      push('DEL-KNIFE-VECTOR', `[${knife.id}] 这把刀该红 ${JSON.stringify(wantAll)}（含 also 里声明的），实得 ${JSON.stringify(codes)}（报文 ${JSON.stringify(out.problems.map((p) => p.message))}）`)
    }
    const undeclared = Object.entries(foreign)
      .flatMap(([leg, legCodes]) => legCodes.filter((c) => !(also[leg] ?? []).includes(c)).map((c) => `${leg}:${c}`))
    if (undeclared.length > 0) {
      push('DEL-KNIFE-LEAK', `[${knife.id}] 这把刀把别的腿也带红了（没在 also 里声明）：${JSON.stringify(undeclared)} —— 三条腿不是各自能单独翻面`)
    }
    if (!out.problems.every((p) => p.message.includes(knife.carrier))) {
      push('DEL-KNIFE-UNNAMED', `[${knife.id}] 红因没有点名文件 ${knife.carrier}（实得 ${JSON.stringify(out.problems.map((p) => p.message))}）`)
    }
  }

  // ── ⑤ 产品零字节：这一格只读真文件、只写运行根 ────────────────────────────────
  for (const rel of DELETE_FIRST_CARRIERS) {
    const base = original[rel]
    if (base === undefined) continue
    if (sha256Text(readFileSync(path.join(REPO, rel), 'utf8')) !== base.sha256) {
      push('DEL-LIVE-TOUCHED', `${rel} 在跑动中被改了 —— 本格只许读它`)
    }
  }
}

test('TRB-01 作业书 `job-briefs/technical-review.md` §三「地基」：七条义务逐句咬住 + 整段反面话必红（副本里翻面、还原变绿）· 另 0010 删除优先三腿（五处同文 / 五行顺序 + 第一格逐字 / 那一格在合成样本里可核对）', runDocCase('TRB-01', 'brief', deleteFirstLegs))
test('TRB-02 说明书 `team/technical-review.md` §一「地基」：四条义务逐句咬住 + 整段反面话必红（副本里翻面、还原变绿）', runDocCase('TRB-02', 'charter'))
