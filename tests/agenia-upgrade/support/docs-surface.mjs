/**
 * **注入面判据**（`F-110` · 2026-10-19）—— 「这件事在**给模型看的注入文字**里说了吗」。
 *
 * ## 为什么单开这一份
 *
 * `STAT-04` 原来把几条义务钉在**某一份文件**上（`leader.md 里必须有『五关』`、
 * `work-guidelines.md 里必须有『回执』`）。可 2026-10-18（`F-76`）之后，
 * 注入是**按 `agent.cordis.yml` 的 `leaderOrder` 把多份 `.md` 拼成一个整体**贴给模型的
 * （`presets/agenia/inject.js` 每轮读一遍、按序 concat，`leader` 与 `work-guidelines` **各两遍**）——
 * **模型不关心那句话在哪一份里**。义务搬家之后，钉在"某一份"上的判据就会永久红，
 * 那不是东西坏了，是判据的靶子过期了。
 *
 * ⇒ 这一族判据的**搜索范围 = 组合声明的 `leaderOrder` 里那几份 `.md`**：
 *   · **不是**"全仓任意处找得到"（那是"到处都算"，等于没有靶子）；
 *   · **也不是**一份硬编的名单 —— 范围由**被测组合**算出来（组合改了 `leaderOrder`，判据跟着看新的一批）。
 *   · 算出来的项（共享脑 / 名册 / 进度板）**不是文件** ⇒ 不在范围里；名单只有一份：
 *     `FROZEN.staged.computedOrderKeys`（`env.mjs`）。
 *
 * ## 每条义务都带一个 `sample`
 *
 * `sample` 是一个**字面样本**（不含正则元字符），`forms` 必须能命中它 —— 用例会拿它做自控：
 * 样本连自己都命不中，说明这条义务的正则写坏了（那时候"永远绿"与"从来没人说过"长得一模一样）。
 *
 * 判据只管"**这件事**有没有出现在注入面"：**词形不是义务**（`五关` / `五道关` 都认，
 * `四类分布` / `distribution` 都认）—— 义务是"报告里有这一项"、"这五关说清楚了"。
 *
 * ## 这一份判**两族**，不是一族
 *
 *   · `injectedSurfaceProblems` —— "这件事在注入面里说了吗"（`五关` / `回执` / `四类分布` / `job-briefs/`）；
 *   · `jobRowProblems` —— "这四条作业能力的**载体**在不在、开着没有"（原来是 `AGENTS.md` 的能力差异表）。
 * 两族的范围不同：前者是**注入面**，后者是**组合**（机器可读的那一份）。别混。
 */
import { parseComposition, disabledKind } from './composition.mjs'
import { FROZEN } from './env.mjs'

/**
 * `leaderOrder` 里**不是文件**的项（算出来的正文：共享脑 / 名册 / 进度板）。
 *
 * ⚠️ **只有一份源**：`env.mjs` 的 `FROZEN.staged.computedOrderKeys`（`env.mjs:5` 那条
 *    「测试不许在别处再抄一份」）—— 这里只取值，不写字面量。
 * ⚠️ 它比生产侧 `presets/agenia/inject.js:1283` 的 `NON_FILE_KEYS` **少一个 `charter`**，
 *    **这是故意的，别补齐成 `charter.md`**：`charter` 只对组员有效，
 *    `leaderOrder` 里出现它**本身就是错误**（`presets/agenia/inject.js:1313-1317`）；
 *    生产那张表判的是「这个 key 要不要去找 `<key>.md`」（组长 / 组员两个 order 走同一段
 *    `selfCheck()`），与这里「**组长**的注入面由哪几份 `.md` 拼成」**不是同一个问题**。
 */
const COMPUTED_ORDER_KEYS = FROZEN.staged.computedOrderKeys

export const CODES = {
  compositionMissing: 'DOC-COMPOSITION-MISSING',
  surfaceMissing: 'DOC-SURFACE-MISSING',
  injectedUnsaid: 'DOC-INJECTED-UNSAID',
  jobRowMissing: 'DOC-JOBROW-MISSING',
  jobRowDisabled: 'DOC-JOBROW-DISABLED',
}

/**
 * 从组合文本里读出**组长那份注入面**：`persona-injector.config.leaderOrder` 里的 `.md` 文件名单。
 *
 * @param {string|null|undefined} compositionText 被测组合（staged 的 `agent.cordis.yml`）
 * @returns {{order: string[]|null, surface: string[], warnings: string[], problems: Array<{code:string,message:string}>}}
 */
export function leaderInjectionSurface(compositionText) {
  const problems = []
  if (typeof compositionText !== 'string' || compositionText.trim() === '') {
    problems.push({ code: CODES.surfaceMissing, message: '读不到组合（agent.cordis.yml）⇒ 注入面不成立，这一族判不了' })
    return { order: null, surface: [], warnings: [], problems }
  }
  let parsed
  try {
    parsed = parseComposition(compositionText, '<staged>/agent.cordis.yml')
  } catch (err) {
    problems.push({ code: CODES.surfaceMissing, message: `组合解析崩了（${err?.message ?? err}）⇒ 注入面不成立` })
    return { order: null, surface: [], warnings: [], problems }
  }
  const injector = parsed.rows.find((r) => r.id === 'persona-injector')
  const order = injector?.config instanceof Map ? injector.config.get('leaderOrder') : undefined
  if (!Array.isArray(order) || order.length === 0) {
    problems.push({
      code: CODES.surfaceMissing,
      message: '组合里读不到 `persona-injector.config.leaderOrder`（空 / 不是列表 / 那一行不在）⇒ 注入面不成立；'
        + '这一族判据是"注入面里说了没有"，**没有注入面就判不了**，也不许算绿',
    })
    return { order: null, surface: [], warnings: parsed.warnings, problems }
  }
  const keys = [...new Set(order.filter((k) => typeof k === 'string'))]
  const surface = keys.filter((k) => !COMPUTED_ORDER_KEYS.includes(k)).map((k) => `${k}.md`)
  if (surface.length === 0) {
    problems.push({ code: CODES.surfaceMissing, message: `\`leaderOrder\` 里一份 .md 都没有（全是算出来的项：${JSON.stringify(keys)}）⇒ 注入面是空的` })
  }
  return { order: keys, surface, warnings: parsed.warnings, problems }
}

/**
 * 「**注入面里说了没有**」这一族的义务表。
 *
 * `forms` 里每一格都是"这件事"的一种**合法写法**；命中任意一格就算说了。
 * `sample` 是一个必须被 `forms` 命中的字面样本（用例拿它自控，见文件头）。
 */
export const INJECTED_OBLIGATIONS = [
  {
    id: 'five-gates',
    name: '五关',
    sample: '五道关',
    forms: [/五道关/, /五关/],
    why: '路线层级（目标 → 大阶段 → 任务 → 五关）与"五关串行"是**同一件事**的两种写法：'
      + '定形/契约与测试/实现/独立评审/验收 这五关挂在任务上。原来钉 `leader.md`，实际写在 `work-guidelines.md`；'
      + '两份都是每一轮**同一段注入文字**。',
  },
  {
    id: 'review-receipt',
    name: '回执',
    sample: '回执',
    forms: [/回执/],
    why: '技术评审交回 findings 之后，**处置回执由组长写**（每条发现恰好一个落点）。'
      + '原来钉 `work-guidelines.md`，实际写在 `leader.md`；两份都是每一轮同一段注入文字。',
  },
  {
    id: 'memory-report-sections',
    name: '四类分布',
    sample: '四类分布',
    // 🔴 词形不是义务：中文「四类分布」与字段/口径指针的英文写法都算说了。
    //    这一格原来是 `distribution` —— 那个词**文档一次没写过**（判据自己发明的要求）。
    forms: [/四类分布/, /distribution/],
    why: '记忆更新报告里要有**四类分布**这一项（判决 / 四类分布 / 复核的预测 / 处置与原文 / 待你拍）。'
      + '原来钉 `work-guidelines.md` 且钉的是一个英文词 —— 文档从未使用过那个词；这句话在 `leader.md`。',
  },
  {
    id: 'job-briefs-dir',
    name: 'job-briefs/',
    sample: 'job-briefs',
    forms: [/job-briefs/],
    why: '四类一次性作业的**作业书目录 `job-briefs/<角色>.md` 不注入**，叫它的时候要连活儿一起交过去。'
      + '原来钉 `AGENTS.md`（1 字节占位 + `.gitignore:58` 忽略）；模型真正读得到它的地方是注入面（`leader.md`）。',
  },
]

/**
 * 逐条判「注入面里说了没有」。
 *
 * @param {{docs: Record<string,string|null|undefined>, surface: string[], obligations?: typeof INJECTED_OBLIGATIONS}} args
 * @returns {{problems: Array<{code:string,message:string,detail:object|null}>, readings: object}}
 *   空 `problems` = 每一条都在注入面里说了
 */
export function injectedSurfaceProblems({ docs, surface, obligations = INJECTED_OBLIGATIONS }) {
  const problems = []
  const rows = []
  if (!Array.isArray(surface) || surface.length === 0) {
    problems.push({
      code: CODES.surfaceMissing,
      message: '注入面是空的（`leaderOrder` 里一份 .md 都没有）⇒ 「这件事在注入面说了吗」判不了 —— 空面不许当成绿',
      detail: { surface: [], computed: COMPUTED_ORDER_KEYS },
    })
    return { problems, readings: { surface: [], computed_keys: COMPUTED_ORDER_KEYS, obligations: [] } }
  }
  for (const ob of obligations) {
    const hits = surface.filter((rel) => {
      const text = docs?.[rel]
      return typeof text === 'string' && ob.forms.some((re) => re.test(text))
    })
    rows.push({ id: ob.id, name: ob.name, forms: ob.forms.map((re) => String(re)), said_in: hits })
    if (hits.length === 0) {
      problems.push({
        code: CODES.injectedUnsaid,
        message: `注入面里没有任何一份说到「${ob.name}」—— 模型根本看不到这件事。`
          + `搜索范围（组合的 \`leaderOrder\` 那几份）：${surface.map((rel) => `${rel}=${typeof docs?.[rel] === 'string' ? '0 命中' : '不在'}`).join('、')}。`
          + `为什么是这里：${ob.why}`,
        detail: { obligation: ob.id, surface, forms: ob.forms.map((re) => String(re)) },
      })
    }
  }
  return { problems, readings: { surface, computed_keys: COMPUTED_ORDER_KEYS, obligations: rows } }
}

/**
 * 四条一次性作业的**载体**判据（原 `AGENTS.md` 能力差异表那 4 行 job 行）。
 *
 * 判的是：**组合里有这一行、而且开着**（关掉的行不注册那个工具名 —— `disabled` 的行等于没有）。
 *
 * 🔴 **这里故意不判"注入面说得出调用名"**：那件事已经由 `leader.md` 的 4 条老针守着
 *    （`DOC_SPECS` 里 `job_memory_judge` / `job_memory_review` / `job_conversation_review` /
 *    `job_technical_review` 那 4 条）—— 而"注入面里 ≥1 份说了"比"就得在 `leader.md` 里"**更松**，
 *    松的那条永远不会先红（`mig-rules-10`：不能单独翻面的判据是装饰）。
 *    ⇒ 那两个数只当**读数**记下来（`said_in`），红绿灯归 `leader.md` 那 4 条老针。
 *
 * @param {{compositionText: string|null|undefined, jobs: Array<{id:string,toolName:string,role:string}>,
 *          docs?: Record<string,string|null|undefined>, surface?: string[]}} args
 * @returns {{problems: Array<{code:string,message:string,detail:object|null}>, readings: object}}
 */
export function jobRowProblems({ compositionText, jobs, docs = {}, surface = [] }) {
  const problems = []
  const rows = []
  const wreck = (code, message, detail = null) => ({ problems: [...problems, { code, message, detail }], readings: { rows, aborted: code } })
  if (typeof compositionText !== 'string' || compositionText.trim() === '') {
    return wreck(CODES.compositionMissing, '读不到被测组合（agent.cordis.yml）⇒ 四条作业行的载体判不了（它们住在组合里）')
  }
  let parsed
  try {
    parsed = parseComposition(compositionText, '<staged>/agent.cordis.yml')
  } catch (err) {
    return wreck(CODES.compositionMissing, `组合解析崩了（${err?.message ?? err}）⇒ 四条作业行的载体判不了`)
  }
  const said = (toolName) => (Array.isArray(surface) ? surface : [])
    .filter((rel) => typeof docs?.[rel] === 'string' && docs[rel].includes(toolName))
  for (const job of jobs) {
    const row = parsed.rows.find((r) => r.id === job.id)
    const kind = row === undefined ? 'missing' : disabledKind(row)
    rows.push({ id: job.id, toolName: job.toolName, row_state: kind, said_in: said(job.toolName) })
    if (row === undefined) {
      problems.push({
        code: CODES.jobRowMissing,
        message: `组合里没有 \`- id: ${job.id}\` 这一行 —— 这条作业能力的**载体**不在；`
          + '原来这条判据钉在 `AGENTS.md` 的能力差异表上（那份是 1 字节占位、还被 .gitignore 忽略），'
          + '真正承载它的是组合里那一行',
        detail: { job: job.id, toolName: job.toolName },
      })
      continue
    }
    if (kind !== 'none') {
      problems.push({
        code: CODES.jobRowDisabled,
        message: `组合里 \`${job.id}\` 这一行**关着**（disabled=${kind}）—— 关掉的行不注册 \`${job.toolName}\`，`
          + '模型手里根本没有这个工具，文档说它有就是空话',
        detail: { job: job.id, disabled: kind },
      })
    }
  }
  return { problems, readings: { rows, note: '`said_in` 只记录、不判红（那一半归 `leader.md` 的 4 条老针：那里更严，能单独翻面）' } }
}

/**
 * **只给自控用的**合成组合：四条 job 行都在、都开着。
 *
 * 为什么自控不拿真组合：真组合被刀改过（行删了 / 关了）的时候，自控若拿它当真值，
 * "①样本都在 ⇒ 绿"那一格会跟着红 —— 那是**树**的问题，不是判据翻面能力的证据。
 * （`S5`/`S6`/`S9` 第一次跑就是这么把三个自控格带红的；实测。）
 */
export function syntheticComposition(jobs) {
  return jobs.map((job) => [
    `- id: ${job.id}`,
    '  name: \'@deepseek-ai/dsh-tool-subagent\'',
    '  config:',
    '    provider: spawn',
    `    toolName: ${job.toolName}`,
    '    maxDepth: 1',
    `    agentPreset: agenia-job-${job.role}`,
    '',
  ].join('\n')).join('\n')
}
