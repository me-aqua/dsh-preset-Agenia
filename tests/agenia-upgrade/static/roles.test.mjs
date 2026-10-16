/**
 * REV-02 —— 四角色工具面 / 写边界（静态角色矩阵 + `officeBoundVerdict` 单测）。
 *
 * 冻结依据：契约 §6.7 REV-02 + 提案 §B1.5（`officeBoundVerdict` 签名与返回）+ §B2.2/§B2.3（四行 job、
 * officeBound 恰 4 个）+ §B2.4（四份角色说明书；评审类首行标"一次性作业"）+ 拍板 I6/I7。
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
import { cfg, listMd, parseComposition } from '../support/composition.mjs'
import { optionalEnv } from '../support/env.mjs'

before(() => {
  preflight()
})

/** 四类一次性作业的角色（= 四条 job 行）。 */
const JOB_ROLES = FROZEN.jobs.map((j) => j.role)
/** 受限写边界的两个新角色（B2.3）。 */
const NEW_OFFICE_ROLES = ['conversation-review']
/** 评审类（B2.4：首行标"一次性作业"）。 */
const REVIEW_ROLES = ['memory-review', 'conversation-review', 'technical-review']

/** 角色说明书要命的主题针（针都来自契约 REV-02 逐条点名的义务）。 */
const CHARTER_NEEDLES = {
  'memory-review': [
    [['无命令行', '没有命令行'], '记忆复核必须拿不到 shell（它只写本组抽屉）'],
    [['.team'], '写只能落 .team/'],
    [['路线'], '评审角色不能写路线'],
    [['长期记忆'], '复核不能直接改长期记忆'],
    [['组长', '导入'], '旧 attempt 候选交组长导入'],
  ],
  'conversation-review': [
    [['无命令行', '没有命令行'], '会话评审必须拿不到 shell'],
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
        const rows = parseComposition(readStagedText('agent.cordis.yml'), 'staged').rows
        const byId = new Map(rows.map((r) => [r.id, r]))
        const inj = byId.get('persona-injector')
        office = inj ? cfg(inj, 'officeBound') : null
        rec.readings.officeBound = office
        if (!Array.isArray(office) || office.length !== FROZEN.staged.officeBound) push('OFFICE-BOUND', `officeBound 必须恰为 ${FROZEN.staged.officeBound} 项，实得 ${JSON.stringify(office)}`)
        for (const role of NEW_OFFICE_ROLES) {
          if (!Array.isArray(office) || !office.includes(role)) push('OFFICE-BOUND', `${role} 必须在 officeBound 里（B2.3：它只能写 .team/ 且没有命令行）`)
        }
        // 🔴 `memory-review` 2026-10-16 起也在"不许"这一列：老板上午亲口拍「那就给复核加个权限吧」
        //    ⇒ 她**不许**再出现在 officeBound 里。这条与 `NEW_OFFICE_ROLES` 那半合起来，
        //    把"名单里该有谁"钉成**成员级**判据（只数条数的话，同样 2 项的一进一出会漏过去）。
        for (const role of ['memory-judge', 'technical-review', 'memory-review']) {
          if (Array.isArray(office) && office.includes(role)) push('OFFICE-BOUND', `${role} **不许**在 officeBound 里（B2.3：判决要写共享脑、技术评审要跑测试 ⇒ 需要 shell/全工具）`)
        }
        // 四条 job 行的 persona 标记与 toolName
        for (const job of FROZEN.jobs) {
          const row = byId.get(job.id)
          if (!row) { push('JOB-ROW', `缺 job 行 ${job.id}`); continue }
          const persona = cfg(row, 'persona')
          if (typeof persona !== 'string' || !persona.startsWith(`【组员:${job.role}】`)) push('ROLE-MARK', `${job.id}: persona 必须以 【组员:${job.role}】 开头`)
          if (cfg(row, 'toolName') !== job.toolName) push('JOB-TOOLNAME', `${job.id}: toolName 实得 ${JSON.stringify(cfg(row, 'toolName'))}`)
          // 四行 job 的 toolFilter 恰为 [workflow, ralph] —— 所以"无 shell"不可能靠 toolFilter 实现
          const tf = cfg(row, 'toolFilter')
          const deny = tf instanceof Map ? tf.get('deny') : undefined
          if (JSON.stringify(deny) !== JSON.stringify(FROZEN.jobToolFilterDeny)) {
            push('JOB-TOOLFILTER', `${job.id}: toolFilter.deny 必须恰为 ${JSON.stringify(FROZEN.jobToolFilterDeny)}（写 pwsh/bash 会因平台二选一让整行启动失败 —— AGENTS.md 3e）`)
          }
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
      // 🔴 `memory-review` 2026-10-16 起**也在这一列** —— 老板亲口拍「那就给复核加个权限吧」
      //    ⇒ 她**必须**被放行（shell 与越界写都放行）。这条是把那条拍板变成常驻判据：
      //    哪天有人把她塞回 officeBound，这里当场红。
      for (const role of ['memory-judge', 'technical-review', 'memory-review', 'dev', undefined, null, 'not-a-role']) {
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
        note: '自动层只能证"门禁对 bash/pwsh 都拒 + 受限角色都在 officeBound 名单里"；真实"工具单里没有 shell"只能 R1-02 验（契约 REV-02 明文）。',
      }

      caseFail(problems)
    })
  })
})
