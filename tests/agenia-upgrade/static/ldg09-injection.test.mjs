/**
 * `LDG-09` —— **注入的配置侧腿**：`presets/agenia/决策账本.md` 在、且在注入名单里（构案 0012 §②-5/§⑥）。
 *
 * 契约：`.team/test/2026-11-15/CONTRACT-0012.md` §8（两处载体 · 读数自报 · `INJECTION-*` 码）。
 *
 * 🔴 **这一格判的是配置，不是注入结果**：
 *   - 配置侧（机器）：文档在盘上 + 非空壳 + 同时出现在 `agent.cordis.yml` 的 `leaderOrder`
 *     与 `inject.js` 的 `DEFAULT_LEADER_ORDER` + `@roster` 声明里；
 *   - 结果侧（人）：重启客户端后**由人起一次会话**，看它有没有真读到（0012 验收表「注入」那一行）。
 *   读数里那句 `scope_line` 就是防"把配置绿读成已经注入过"的落点（缺 ⇒ `INJECTION-SCOPE-NOT-DECLARED`）。
 *
 * 纯判据，**不跑产品**：所以它在 Gate 2 就已经能工作；今天红的是**真树那一腿**（制度文档还没写）。
 */
import path from 'node:path'
import { before, test } from 'node:test'
import { PATHS } from '../support/env.mjs'
import { caseFail, preflight, problem, runCase } from '../support/evidence.mjs'
import { buildScene, injectionReading, writeSceneFile } from '../support/three-books.mjs'

before(() => {
  preflight()
})

/** 一份合法的制度文档（≥200 字符，去空白后）。 */
const DOC_TEXT = [
  '# 决策账本（三册）',
  '',
  '这个工作区的账本是三册同级的：`账本/产品/` 是老板发的决议，`账本/构案/` 是我怎么落地，',
  '`账本/缺陷/` 是每天一个 JSON 事件流（只追加、现状靠折叠）。',
  '',
  '规矩：产品一条一 md、没有父；构案一条一 md、必须有父；缺陷一天一个 JSON，不许改写。',
  '三张 INDEX.md 都是机器派生的，手改当场红（跑 `presets/agenia/bin/决议-check.mjs --op index` 重写）。',
  '缺账本（有 `.team/` 没 `账本/`）⇒ `LEDGER-NOT-INITIALISED`，先跑 `--op init` 建骨架。',
].join('\n')

const CORDIS_OK = ['persona-injector:', '  config:', '    leaderOrder:', '      - leader', '      - 决策账本', '      - work-guidelines'].join('\n')
const INJECT_OK = [
  '/** @roster memory=present style=absent leader=present work-guidelines=present persona=present 决策账本=present */',
  "const DEFAULT_LEADER_ORDER = ['leader', '决策账本', 'work-guidelines', 'memory', 'persona']",
].join('\n')

/** 造一个"假仓库"：三份载体各一段文本（刀在这里切，真树零字节）。 */
function fakeRepo(caseId, tag, { doc = DOC_TEXT, cordis = CORDIS_OK, inject = INJECT_OK } = {}) {
  const scene = buildScene({ caseId, tag, withLedger: false })
  const files = []
  if (doc !== null) files.push({ rel: 'presets/agenia/决策账本.md', text: doc })
  if (cordis !== null) files.push({ rel: 'presets/agenia/agent.cordis.yml', text: cordis })
  if (inject !== null) files.push({ rel: 'presets/agenia/inject.js', text: inject })
  for (const f of files) writeSceneFile(scene.root, f.rel, f.text)
  return scene.root
}

// ── LDG-09 ──────────────────────────────────────────────────────────────
test('LDG-09 注入（配置侧）：决策账本.md 在且在两处注入名单里；读数自报"判配置非注入结果"', async () => {
  await runCase('LDG-09', async (rec) => {
    const problems = []
    const push = (code, msg, detail) => problems.push(problem(code, msg, detail))

    // ── ① 真树：三份载体都在、都对 ─────────────────────────────────────────────
    const real = injectionReading()
    rec.readings.real = real
    if (!real.doc_present) {
      push('INJECTION-DOC-MISSING', `[真树] ${path.join('presets', 'agenia', '决策账本.md')} 不在盘上（契约 §8）`)
    } else if (!real.doc_ok) {
      push('INJECTION-DOC-MISSING', `[真树] presets/agenia/决策账本.md 是空壳（去空白后 ${real.doc_chars} 字符，契约 §8 要 ≥ 200）`)
    }
    if (!real.roster_ok) {
      const missing = []
      if (!real.cordis_ok) missing.push('agent.cordis.yml 的 leaderOrder 里没有 `- 决策账本` 那一行')
      if (!real.inject_const_hit) missing.push('inject.js 的 DEFAULT_LEADER_ORDER 里没有 `决策账本`')
      push('INJECTION-ROSTER-MISSING', `[真树] 注入名单缺这一处：${missing.join(' / ')}（契约 §8：两处载体都要）`)
    }
    if (!real.roster_decl_ok) {
      push('INJECTION-ROSTER-MISSING', '[真树] inject.js 的 `@roster` 声明里没有 `决策账本=present` —— SURF-02 的口径：声明必须机读，散文不算')
    }
    // 🔴 读数自报：这一格判配置，不判注入结果
    if (!(String(real.scope_line).includes('判配置') && String(real.scope_line).includes('不是注入结果'))) {
      push('INJECTION-SCOPE-NOT-DECLARED', `[读数] scope_line 必须自报"判配置 / 不是注入结果"，实得 ${JSON.stringify(real.scope_line)}`)
    }

    // ── ② 假仓库：同一个判据的五个面（三个载体各缺一处 ⇒ 各自的码；好的一份必须绿）────
    {
      const good = injectionReading({ repo: fakeRepo('LDG-09', 'fake-good') })
      rec.readings.fake_good = good
      if (!(good.doc_ok && good.roster_ok && good.roster_decl_ok)) {
        push('KNIFE-NO-BITE', `[LDG-09/fake-good] 假仓库里三份载体都写对了，判据却说不行：${JSON.stringify({ doc: good.doc_ok, roster: good.roster_ok, decl: good.roster_decl_ok })}`)
      }
    }
    {
      // 刀 K14：只在 yml 里加、inject.js 没加 ⇒ ROSTER-MISSING（两处载体缺一处就红）
      const cut = injectionReading({ repo: fakeRepo('LDG-09', 'k14-yml-only', { inject: "const DEFAULT_LEADER_ORDER = ['leader', 'work-guidelines']" }) })
      rec.readings.k14 = cut
      if (cut.roster_ok) push('KNIFE-NO-BITE', '[LDG-09/k14] inject.js 里删掉 `决策账本`，判据仍说名单齐 —— 刀不咬（契约 §8）')
    }
    {
      // 另一个方向：只在 inject.js 里加、yml 没加
      const cut = injectionReading({ repo: fakeRepo('LDG-09', 'k14-cordis', { cordis: CORDIS_OK.replace('      - 决策账本\n', '') }) })
      rec.readings.k14_cordis = cut
      if (cut.roster_ok) push('KNIFE-NO-BITE', '[LDG-09/k14-cordis] agent.cordis.yml 里删掉那一行，判据仍说名单齐 —— 刀不咬')
    }
    {
      // `@roster` 声明缺 ⇒ 走另一条码（不是"名单缺"，是"没声明"）
      const cut = injectionReading({ repo: fakeRepo('LDG-09', 'no-decl', { inject: "const DEFAULT_LEADER_ORDER = ['leader', '决策账本']" }) })
      rec.readings.no_decl = cut
      if (cut.roster_decl_ok) push('KNIFE-NO-BITE', '[LDG-09/no-decl] 删掉 `@roster` 那一行声明，判据仍说声明在 —— 刀不咬')
      if (!cut.inject_const_hit) push('KNIFE-NO-BITE', '[LDG-09/no-decl] 常量里还在 `决策账本`，判据却说不在 —— 判据读错了地方')
    }
    {
      // 空壳文档 ⇒ 码（不是"文件不在"那一条）
      const cut = injectionReading({ repo: fakeRepo('LDG-09', 'doc-shell', { doc: '# 决策账本\n\n待补。\n' }) })
      rec.readings.doc_shell = cut
      if (cut.doc_ok) push('KNIFE-NO-BITE', '[LDG-09/doc-shell] 空壳文档（去空白后不足 200 字符）被判成"在且够" —— 刀不咬')
      if (!cut.doc_present) push('KNIFE-NO-BITE', '[LDG-09/doc-shell] 文件明明在，判据说不在 —— 判据读错了地方')
    }

    caseFail(problems)
  })
})

/** 真树那三份文件的路径（读数用；判据在 `injectionReading` 里）。 */
export const INJECTION_FILES = {
  doc: path.join(PATHS.repo, 'presets', 'agenia', '决策账本.md'),
  cordis: path.join(PATHS.repo, 'presets', 'agenia', 'agent.cordis.yml'),
  inject: path.join(PATHS.repo, 'presets', 'agenia', 'inject.js'),
}
