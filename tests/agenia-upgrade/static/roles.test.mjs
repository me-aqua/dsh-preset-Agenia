/**
 * REV-02 —— 四角色工具面 / 写边界（静态角色矩阵 + `officeBoundVerdict` 单测）。
 *
 * 冻结依据：契约 §6.7 REV-02 + 提案 §B1.5（`officeBoundVerdict` 签名与返回）+ §B2.2/§B2.3（四行 job、
 * `officeBound` —— 契约原文写"恰 4 个"，2026-10-16 两批移出之后**只剩 1 个：`review`**；
 * 为什么移、代价是什么见 `CHARTER_NEEDLES` 前面那段 🔴）+ §B2.4（四份角色说明书；评审类首行标"一次性作业"）
 * + 拍板 I6/I7。
 *
 * 两条口径写死在这里，免得被读成更强的证明：
 *   · **无 shell 的判定**在自动层只有两条腿：① `officeBoundVerdict` 对 `bash`/`pwsh` 都拒（单测）
 *     ② 受限角色都在 `officeBound` 名单里。**真实"工具单里没有 shell"只能 R1 验**（契约明写）。
 *   · 角色说明书只做**主题命中**（A12：静态只能到"命中/缺失"层，文义靠人读）。
 *     针都是契约 REV-02 自己点名的那些义务，不另加要求。
 *
 * ⚠️ `officeBoundVerdict` 的语义是"把现有内联判定抽成纯函数，语义一字不改"（提案 §B1.5），
 * 所以这里的用例形状是**从活体只读核出来的**（`WRITE_TARGET` / `SHELL` / `resolve(cwd,target)` 再判 `.team/`）。
 */
import { before, describe, test } from 'node:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { FROZEN, PATHS } from '../support/env.mjs'
import { caseFail, preflight, problem, runCase, stagingReadings } from '../support/evidence.mjs'
import { importStaged, readStagedText, stagingExists, stagingPath } from '../support/sut.mjs'
import { cfg, listMd, memberAnnotations, memberPresetIdFor, parseComposition } from '../support/composition.mjs'
import { optionalEnv } from '../support/env.mjs'

before(() => {
  preflight()
})

/** 四类一次性作业的角色（= 四条 job 行）。 */
const JOB_ROLES = FROZEN.jobs.map((j) => j.role)
/**
 * 🔴 2026-10-16：原来这里有一个 `const NEW_OFFICE_ROLES = ['conversation-review']`，**整条删掉**。
 *
 * 为什么删、而不是留个空数组：空数组 `for...of` 什么都不做 ⇒ **它绿着，却什么也没查**，
 * 正是这一票要治的形状（"静默失效的检查，和通过的检查长得一模一样"）。
 *
 * 它原来钉的是"这个角色必须在 `officeBound` 里"（B2.3）。而老板 2026-10-16 一天里把两个都移出了：
 * 上午 `memory-review`（原话「那就给复核加个权限吧」）· 下午 `conversation-review`
 * （原话「你自己改就行，需要给什么命令行权限的就给」）—— 前者要做容量预测、后者要核三样 SHA256，
 * 而那道门禁**同时把命令行也拿掉了** ⇒ 那个"核"是空话，判据退化成"信别人给的数"。
 * ⇒ **四条 job 角色现在一个都不在名单里**，手抄的"必须在内"名单没有成员可装。
 *
 * 正反两半现在**从冻结表推**，不再手抄角色名（手抄名单正是"一进一出、条数不变"那类漏检的源头）：
 *   · 正向：`FROZEN.staged.officeBoundRoles` 里每个角色都必须在 yml 的 `officeBound` 里；
 *   · 反向：`FROZEN.jobs` 那四个 job 角色**一个都不许**在 `officeBound` 里。
 */
/** 评审类（B2.4：首行标"一次性作业"）。 */
const REVIEW_ROLES = ['memory-review', 'conversation-review', 'technical-review']

/**
 * 角色说明书要命的主题针（针都来自契约 REV-02 逐条点名的义务）。
 *
 * 🔴 2026-10-16：`memory-review` / `conversation-review` 第一根针**翻面**了。
 *   旧针是 `[['无命令行', '没有命令行'], '…必须拿不到 shell']` —— 它**两头都绿**：
 *   改前绿（说明书真写着"没有命令行"），**改后也绿**（新说明书里那句"诚实口径"仍然引用着
 *   "officeBound 曾经只保证**没有命令行** + 写只落 .team/"）。
 *   ⇒ 旧针不是"过期"，是**根本分不出新旧**（实测见 `.team/test/2026-10-16/_evidence/needle-flip-check.mjs` 的读数）。
 *
 *   新针钉两件**说明书必须说出口**的事，且两根针在旧版说明书上**都必红**：
 *     ① `你有命令行` —— 她现在被告知自己有 shell（旧文写的是"你**没**有命令行"，
 *        "你没" ≠ "你有"，所以这个串在旧版里**不可能**命中；也不可以用裸 `命令行` 或 `bash`：
 *        旧文那句"`bash` / `pwsh` 都拿不到"里两个词都在 ⇒ 又成了假绿）。
 *     ② `是纪律，不是门禁` —— 代价明说：门禁没了，写边界只剩纪律（老板要求写清"两件保护都没了"）。
 *   翻面办法（都量过，见上面那份读数）：① 把 `你有命令行` 改回 `你没有命令行` ⇒ 针红；
 *   ② 删掉"从今天起，下面这几条是纪律，不是门禁"那一行 ⇒ 针红。
 */
const CHARTER_NEEDLES = {
  'memory-review': [
    [['你有命令行'], '记忆复核**现在有命令行**（她要在自动层做容量预测，手算算不准 —— 2026-10-16 老板把它移出了 officeBound）'],
    [['是纪律，不是门禁'], '写边界只剩**纪律**：门禁没了，说明书必须把这句代价说出来（2026-10-16 移出 officeBound 的代价）'],
    [['.team'], '写只能落 .team/'],
    [['路线'], '评审角色不能写路线'],
    [['长期记忆'], '复核不能直接改长期记忆'],
    [['组长', '导入'], '旧 attempt 候选交组长导入'],
  ],
  'conversation-review': [
    [['你有命令行'], '会话评审**现在有命令行**（她的作业书要求必核三样 SHA256，算不出哈希那份"核"就是空话 —— 2026-10-16 老板把它移出了 officeBound）'],
    [['是纪律，不是门禁'], '写边界只剩**纪律**：门禁没了，说明书必须把这句代价说出来（2026-10-16 移出 officeBound 的代价）'],
    [['.team'], '写只能落 .team/'],
    [['路线'], '评审角色不能写路线'],
  ],
  'technical-review': [
    [['生产'], '技术评审不许改生产'],
    [['不改', '不写', '只读', '不许改'], '同一句里要有"不改/只读"这类否定'],
    [['CODE', '指纹', '哈希'], '前后 CODE 哈希不变这条要求要写进作业书'],
  ],
  'memory-judge': [
    [['长期记忆'], '记忆判决是唯一能写长期记忆的角色'],
    [['受控', '命令', 'CLI', 'agenia-brain'], '只能经受控命令写长期记忆'],
  ],
}

describe('static · roles (REV-02)', () => {
  test('REV-02 四角色工具面/写边界/CODE 不变；无 shell；越界写一律拒', async () => {
    await runCase('REV-02', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      rec.readings.staging = stagingReadings()

      // ── ① 静态角色矩阵（staged 组合 + 角色文件）────────────────────────
      let office = null
      if (stagingExists('agent.cordis.yml')) {
        const compRaw = readStagedText('agent.cordis.yml')
        const rows = parseComposition(compRaw, 'staged').rows
        const byId = new Map(rows.map((r) => [r.id, r]))
        const inj = byId.get('persona-injector')
        office = inj ? cfg(inj, 'officeBound') : null
        rec.readings.officeBound = office
        if (!Array.isArray(office) || office.length !== FROZEN.staged.officeBound) push('OFFICE-BOUND', `officeBound 必须恰为 ${FROZEN.staged.officeBound} 项，实得 ${JSON.stringify(office)}`)
        // ── 正向：冻结名单里的受限角色都必须在 yml 的 officeBound 里 ────────────
        // 名单本身逐字对在 STAT-02；这里防的是"yml 少一个"（少一个 ⇒ 那个岗位静默地不再受限）。
        for (const role of FROZEN.staged.officeBoundRoles) {
          if (!Array.isArray(office) || !office.includes(role)) push('OFFICE-BOUND', `${role} 必须在 officeBound 里（冻结名单 officeBoundRoles=${JSON.stringify(FROZEN.staged.officeBoundRoles)}）`)
        }
        // ── 反向：四个 job 角色**一个都不许**在 officeBound 里 ──────────────────
        // 🔴 2026-10-16 一天里移出两个，理由同一个：门禁一次拿掉两样（命令行 + 写面），而它们只要那"一样"才算得出来。
        //    · 上午 `memory-review`（原话「那就给复核加个权限吧」）—— 要做容量预测；
        //    · 下午 `conversation-review`（原话「你自己改就行，需要给什么命令行权限的就给」）—— 要核三样 SHA256。
        // 成员级判据（只数条数的话，"同样 1 项的一进一出"会漏过去 —— 见 `mig-rules-18`）。
        for (const role of JOB_ROLES) {
          if (Array.isArray(office) && office.includes(role)) {
            push('OFFICE-BOUND', `${role} **不许**在 officeBound 里（2026-10-16 老板拍板：这四类一次性作业都要 shell —— 复核做容量预测、会话评审核三样 SHA256、技术评审跑测试、判决要写共享脑）`)
          }
        }
        // ── 台账 ↔ 名单 自洽：`FROZEN.jobs[].officeBound` 原来是**死常量**（`env.mjs` 自己写着"没有任何断言读它"）──
        // 【钉什么】每条 job 行台账写的 `officeBound`，必须与它在 `FROZEN.staged.officeBoundRoles` 里在不在**一致**。
        // 【为什么】两张冻结表分叉 = 这一票反复撞的形状（改了生产侧/一张表，另一张没跟）。
        // 【怎么翻面】把 `tool-job-conversation-review` 那条台账改回 `true`（名单不动）⇒ 当场红。
        for (const job of FROZEN.jobs) {
          const inFrozenList = FROZEN.staged.officeBoundRoles.includes(job.role)
          if (job.officeBound !== inFrozenList) {
            push('OFFICE-BOUND', `冻结表自相矛盾：${job.id}.officeBound=${job.officeBound}，而 officeBoundRoles=${JSON.stringify(FROZEN.staged.officeBoundRoles)} ${inFrozenList ? '含' : '不含'} ${job.role}`)
          }
        }
        // 四条 job 行的 persona 标记、toolName、agentPreset、否定项
        // 🔴 2026-10-19（0.2.1 迁移）：人格与否定项**不再是 config 里的键**（`persona` / `toolFilter`
        //    写着它们整行报迁移错），改由行上方的两句注释表达：
        //      `# @member-persona 【组员:<角色>】…` · `# @member-deny <名字>`
        //    生成器按它们给那一份组员预设写 `persona.prefix` 与注入器的 `proposalFile: false`。
        //    判据跟着"义务的落点"走，**没有放宽**：标记少了 ⇒ 作业会以为自己是组长，拿组长那份注入；
        //    判决岗的 `proposal_file` 少了 ⇒ 判决岗就能自己提候选（老板 2026-10-17 明确不许）。
        const ann = memberAnnotations(compRaw)
        for (const job of FROZEN.jobs) {
          const row = byId.get(job.id)
          if (!row) { push('JOB-ROW', `缺 job 行 ${job.id}`); continue }
          const mark = ann.get(job.id) ?? { persona: undefined, deny: [] }
          if (typeof mark.persona !== 'string' || !mark.persona.startsWith(`【组员:${job.role}】`)) {
            push('ROLE-MARK', `${job.id}: 行上方必须有 \`# @member-persona 【组员:${job.role}】…\`（0.2.1 的人格来源；实得 ${JSON.stringify(mark.persona)?.slice(0, 80)}）`)
          }
          if (cfg(row, 'toolName') !== job.toolName) push('JOB-TOOLNAME', `${job.id}: toolName 实得 ${JSON.stringify(cfg(row, 'toolName'))}`)
          if (cfg(row, 'maxDepth') !== FROZEN.jobMaxDepth) push('JOB-MAXDEPTH', `${job.id}: maxDepth 实得 ${JSON.stringify(cfg(row, 'maxDepth'))}，冻结 ${FROZEN.jobMaxDepth}`)
          // 组员预设 id 的公式（生成器与组合必须同形）：`agenia-<toolName 下划线换横线>`。
          // ⚠️ 公式**只有一份实现**（`support/composition.mjs::memberPresetIdFor`）——
          //    `composition.test.mjs` 的 `TEAM-AGENTPRESET` / `SUBAGENT-AGENTPRESET` 也调它
          //    （评审 `F-109` 第 4 关 `M-4`：同一件义务不许有两份算式）。
          const wantPreset = memberPresetIdFor(job.toolName)
          if (cfg(row, 'agentPreset') !== wantPreset) {
            push('JOB-AGENTPRESET', `${job.id}: agentPreset 必须是 ${wantPreset}（生成器按公式算的组员预设 id），实得 ${JSON.stringify(cfg(row, 'agentPreset'))}`)
          }
          // 否定项：判决岗 `proposal_file`，其余空表（旧口径"四行 deny 恰为 [workflow, ralph]"已随 0.2.1 作废 ——
          // 那两样是**结构性没有**（组员预设整个 delegation 组不搬），不需要 deny 名单）
          const wantDeny = [...(FROZEN.jobMemberDeny[job.id] ?? [])].sort()
          const gotDeny = [...mark.deny].sort()
          if (JSON.stringify(gotDeny) !== JSON.stringify(wantDeny)) {
            push('JOB-MEMBER-DENY', `${job.id}: \`# @member-deny\` 的期望是 ${JSON.stringify(wantDeny)}，实得 ${JSON.stringify(gotDeny)}（只有判决岗该 deny proposal_file；其余三行多写 = 那个岗位提不了候选）`)
          }
          for (const dead of FROZEN.memberPresetForbidden) {
            if (gotDeny.includes(dead)) push('JOB-MEMBER-DENY', `${job.id}: deny 里写了 ${dead} —— 它在组员预设里结构性不存在（委派组整个不搬），写它只会让整行启动失败`)
          }
        }
        // 阳性对照：这个提取器**分得清行**（4 条作业拿到 4 个不同的标记；否则上面那几条就是在瞎绿）
        const marks = FROZEN.jobs.map((j) => (ann.get(j.id) ?? {}).persona ?? '').map((p) => /【组员:([^】]+)】/.exec(p)?.[1] ?? null)
        rec.readings.job_role_marks = marks
        if (new Set(marks.filter(Boolean)).size !== marks.filter(Boolean).length) {
          push('ROLE-MARK', `提取器把不同的作业行读成了同一个人格标记（${JSON.stringify(marks)}）—— 判据会瞎绿`)
        }
      } else {
        push('SUT-SURFACE-MISSING', 'staged 还没有 agent.cordis.yml —— 角色矩阵无从对账（预期的首跑红）')
      }

      // ── ② 9 份角色说明书 + 4 份作业书 ───────────────────────────────────
      const teamDir = stagingPath('team')
      const briefsDir = stagingPath('job-briefs')
      const teamFiles = listMd(teamDir)
      if (teamFiles === null) push('SUT-SURFACE-MISSING', `缺 ${teamDir}`)
      else {
        for (const role of [...JOB_ROLES, ...FROZEN.teamRoles.filter((r) => !JOB_ROLES.includes(r))]) {
          if (!teamFiles.includes(`${role}.md`)) push('CHARTER-MISSING', `缺角色说明书 team/${role}.md`)
        }
        for (const role of REVIEW_ROLES) {
          if (!teamFiles.includes(`${role}.md`)) continue
          const first = readFileSync(path.join(teamDir, `${role}.md`), 'utf8').split(/\r?\n/)[0] ?? ''
          rec.readings[`firstline_${role}`] = first
          if (!first.includes('一次性')) push('CHARTER-FIRSTLINE', `team/${role}.md 首行没标"一次性"（B2.4：评审类首行标一次性作业），实得 ${JSON.stringify(first)}`)
        }
        // 主题针
        for (const [role, needles] of Object.entries(CHARTER_NEEDLES)) {
          if (!teamFiles.includes(`${role}.md`)) continue
          const text = readFileSync(path.join(teamDir, `${role}.md`), 'utf8')
          const hits = []
          for (const [anyOf, why] of needles) {
            if (anyOf.some((n) => text.includes(n))) hits.push(anyOf[0])
            else push('CHARTER-NEEDLE', `team/${role}.md 里找不到 ${JSON.stringify(anyOf)} 里的任何一个（${why}）`)
          }
          rec.readings[`charter_hits_${role}`] = hits
        }
      }
      if (!stagingExists('job-briefs')) push('SUT-SURFACE-MISSING', `缺 ${briefsDir}（四份一次性作业书是不注入的，另放一处）—— staging 未实现，预期红`)
      else {
        const briefFiles = listMd(briefsDir) ?? []
        for (const role of JOB_ROLES) if (!briefFiles.includes(`${role}.md`)) push('CHARTER-MISSING', `缺作业书 job-briefs/${role}.md`)
      }

      // ── ③ officeBoundVerdict 单测（写边界 + 无 shell + 落点计算）────────
      if (!stagingExists('inject.js')) {
        push('SUT-SURFACE-MISSING', 'staged/inject.js 不在 ⇒ officeBoundVerdict 拿不到（预期的首跑红）')
        caseFail(problems)
      }
      const mod = await importStaged('inject.js')
      const verdictFn = mod.officeBoundVerdict
      if (typeof verdictFn !== 'function') {
        push('SUT-SURFACE-MISSING', 'staged/inject.js 没有导出 officeBoundVerdict（拍板 Q1 冻了命名 export）')
        caseFail(problems)
      }
      const boundSet = new Set(FROZEN.staged.officeBoundRoles)
      const ws = optionalEnv('AGENIA_TEST_WORKSPACE') ?? PATHS.repo
      const agentAt = (cwd) => ({ id: 'agent-1', session: { header: { cwd } } })
      const at = agentAt(ws)
      const v = (role, toolName, args, agent = at) => {
        const out = verdictFn(role, toolName, args, agent, boundSet)
        if (out === null || out === undefined) return { kind: 'allow', code: null, message: '' }
        if (typeof out === 'object' && typeof out.code === 'string') return { kind: 'reject', code: out.code, message: String(out.message ?? '') }
        return { kind: 'shape', code: null, message: JSON.stringify(out)?.slice(0, 120) }
      }
      const matrix = {}

      // ③-1 无 shell：受限角色 bash/pwsh 都拒（**两个都写**，别按平台二选一）
      for (const role of FROZEN.staged.officeBoundRoles) {
        for (const shell of FROZEN.officeBoundSemantics.shellTools) {
          const r = v(role, shell, { command: 'echo x' })
          matrix[`${role}/${shell}`] = { kind: r.kind, code: r.code }
          if (r.kind !== 'reject') push('OFFICE-SHELL', `${role} 调 ${shell} 必须被拒（${FROZEN.officeBoundCodes.shell}），实得 ${r.kind}/${r.code}`)
          else {
            if (r.code !== FROZEN.officeBoundCodes.shell) push('OFFICE-SHELL-CODE', `${role} 调 ${shell} 的拒绝码应为 ${FROZEN.officeBoundCodes.shell}，实得 ${r.code}`)
            if (!r.message.includes(`${FROZEN.officeBoundMessagePrefix}${role}）`)) {
              push('OFFICE-SHELL-MSG', `${role} 的报文里没有「${FROZEN.officeBoundMessagePrefix}${role}）」这个前缀（AGENTS.md 3e 的判据：门禁报文一定带它，别的 Error 不算）`)
            }
          }
        }
      }
      // ③-2 不在名单里的角色 / 认不出角色 ⇒ 放行（这道边界用来挡几个岗位，绝不能把组长挡住）
      // 🔴 2026-10-16 两批：`memory-review`（上午，「那就给复核加个权限吧」）与
      //    `conversation-review`（下午，「你自己改就行，需要给什么命令行权限的就给」）都移出了名单
      //    ⇒ 四类一次性作业**全部**必须被放行（shell 与越界写都放行）。这条是把那两次拍板变成常驻判据：
      //    哪天有人把其中任何一个塞回 officeBound，这里当场红。
      //    ⚠️ 名单**从 `FROZEN.jobs` 推**，不手抄（手抄就会重演"移出一个、漏改一处 ⇒ 假红或假绿"）。
      for (const role of [...JOB_ROLES, 'dev', undefined, null, 'not-a-role']) {
        for (const toolName of ['bash', 'pwsh', 'write']) {
          const r = v(role, toolName, { file_path: path.join(PATHS.repo, 'x.txt') })
          matrix[`${String(role)}/${toolName}`] = { kind: r.kind, code: r.code }
          if (r.kind !== 'allow') push('OFFICE-FALSE-POSITIVE', `角色 ${String(role)} 不在 officeBound ⇒ 调 ${toolName} 必须放行，实得 ${r.kind}/${r.code}`)
        }
      }
      // ③-3 写边界：落点算在 .team/ 里 ⇒ 放行；落点在外面 ⇒ 拒；**`..` 穿越按落点算**
      const writeCases = [
        ['组内', path.join(ws, '.team', 'review', 'note.md'), 'allow'],
        ['组内相对', '.team/review/note.md', 'allow'],
        ['项目根', path.join(ws, 'presets', 'agenia', 'inject.js'), 'reject'],
        ['穿越出组', path.join(ws, '.team', 'review', '..', '..', 'x.txt'), 'reject'],
        ['穿越字符串', '.team/review/../../x.txt', 'reject'],
        ['另一盘', 'C:\\Windows\\Temp\\x.txt', 'reject'],
        ['空目标', '', 'reject'],
      ]
      for (const [label, target, want] of writeCases) {
        const r = v('review', 'write', { file_path: target })
        matrix[`write/${label}`] = { kind: r.kind, code: r.code, target }
        if (want === 'allow' && r.kind !== 'allow') push('OFFICE-WRITE', `受限角色写「${label}」（${target}）应当放行，实得 ${r.kind}/${r.code}`)
        if (want === 'reject' && r.kind !== 'reject') push('OFFICE-WRITE', `受限角色写「${label}」（${target}）应当被拒 ${FROZEN.officeBoundCodes.write}，实得 ${r.kind}/${r.code}`)
        if (want === 'reject' && r.kind === 'reject' && r.code !== FROZEN.officeBoundCodes.write) {
          push('OFFICE-WRITE-CODE', `写越界的拒绝码应为 ${FROZEN.officeBoundCodes.write}，实得 ${r.code}`)
        }
      }
      // `edit` 也受同一条边界（它是另一半写入通道）—— 受限角色**从冻结名单里取**。
      // 🔴 2026-10-16：这里原来写死了 `memory-review`（注释说"拿一个**在编**的受限角色"），
      //    而老板当天把 `memory-review` 移出了 officeBound ⇒ 写死的那个名字当场变成**假红**
      //    （它测到的是"名单外的角色被放行"，不是这条边界）。⇒ 改成从 `officeBoundRoles` 取，
      //    名单怎么变都不用再改这里；取不到就报出来（不许静默跳过这条判据）。
      const boundRoleForEdit = FROZEN.staged.officeBoundRoles[0]
      if (typeof boundRoleForEdit !== 'string' || boundRoleForEdit === '') {
        push('OFFICE-WRITE', 'FROZEN.staged.officeBoundRoles 空 —— `edit` 那条判据没有可用的在编受限角色')
      } else {
        const editOut = v(boundRoleForEdit, 'edit', { file_path: path.join(ws, 'AGENTS.md') })
        matrix['edit/项目根'] = { kind: editOut.kind, code: editOut.code, role: boundRoleForEdit }
        if (editOut.kind !== 'reject') push('OFFICE-WRITE', `受限角色 ${boundRoleForEdit} edit 项目文件应当被拒，实得 ${editOut.kind}/${editOut.code}`)
      }
      // ③-4 只读/无关工具不受影响
      for (const toolName of ['read', 'present', 'todo_write', 'job_output', 'skill']) {
        const r = v('review', toolName, { file_path: path.join(ws, 'AGENTS.md') })
        matrix[`unrelated/${toolName}`] = { kind: r.kind, code: r.code }
        if (r.kind !== 'allow') push('OFFICE-UNRELATED', `受限角色用 ${toolName}（只读/无关）必须放行，实得 ${r.kind}/${r.code}`)
      }
      // ③-5 判据翻面：同一条边界的两侧都成立（有 cwd 才算得出落点，别把"算不出来"当通过）
      const flip = {
        inOffice: v('review', 'write', { file_path: path.join(ws, '.team', 'x.md') }).kind,
        outOffice: v('review', 'write', { file_path: path.join(ws, 'x.md') }).kind,
        unbounded: v('test', 'write', { file_path: path.join(ws, 'x.md') }).kind,
      }
      rec.readings.flip = flip
      if (!(flip.inOffice === 'allow' && flip.outOffice === 'reject' && flip.unbounded === 'allow')) {
        push('OFFICE-FLIP', `写边界判据没有翻面：${JSON.stringify(flip)}`)
      }
      rec.readings.matrix = matrix
      rec.readings.no_shell_caveat = {
        note: '自动层只能证"门禁对 bash/pwsh 都拒 + 冻结名单里的受限角色（2026-10-16 起只剩 review）都在 officeBound 名单里"；真实"工具单里没有 shell"只能 R1-02 验（契约 REV-02 明文）。',
      }

      caseFail(problems)
    })
  })
})
