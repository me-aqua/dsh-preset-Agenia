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
 */
function runDocCase(caseId, kind) {
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
      caseFail(problems)
    })
  }
}

test('TRB-01 作业书 `job-briefs/technical-review.md` §三「地基」：七条义务逐句咬住 + 整段反面话必红（副本里翻面、还原变绿）', runDocCase('TRB-01', 'brief'))
test('TRB-02 说明书 `team/technical-review.md` §一「地基」：四条义务逐句咬住 + 整段反面话必红（副本里翻面、还原变绿）', runDocCase('TRB-02', 'charter'))
