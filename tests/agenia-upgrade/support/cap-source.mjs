/**
 * **容量参考线的「哪一侧给的」** —— 三级候选（工作区 / 生成器那棵树 / cwd）与它们的现场。
 *
 * 两个用例共用（`CSRC-01` 三级各一个值 · `CSRC-02` 第三级单独的正样本），
 * 契约：`.team/test/2026-11-02/CONTRACT-REVIEW-20261102.md` §2。
 *
 * 为什么单开一份而不是塞进 `card-surface.mjs`：
 *   · `card-surface.mjs` 是 C2 六格的共用夹具体（`CARD-01`…`CARD-06` 都在读它）；
 *     这两个格子要的东西（一份**生成器副本 + 三个候选的在场/缺席**）只在**这一族**里成立，
 *     往 C2 的共用件里加会把"三级回退"变成 C2 六格也得维护的第二份现场。
 *   · 但**候选次序与形状**只有一份：它照抄 `daily-cards.py::read_capacity()` 的三行
 *     （工作区 → `dirname(dirname(__file__))` → `os.getcwd()`）与 `route_source_path()` 的同形，
 *     本文件是那份形状的**测试侧镜像**；实现侧挪了位置，这里的 `candidateAt()` 要同批改。
 *
 * 🔴 每个候选的 `CAP_COUNT` / `CAP_CHARS` **故意三个值都不一样**：
 *    卡片上那两个数因此能反过来指名"是哪一份给的"—— 只断言"读到 200/80000"分不出级别
 *    （2026-11-02 现量：三级今天都读得到，缺的是**卡片说不说得出是哪一级**）。
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  DAY, NOW, cardFile, copyGeneratorInto, generatorScriptPath, makeCardRoots, memorySourceAt, readCapConstants,
  readCard, routeLedger, runCards, sha256Of, writeDataRoot, writeLocal, writeRoute, writeRouteSource,
  localState,
} from './card-surface.mjs'

/** 三级候选的名字（次序 = `read_capacity()` 的候选次序，**不是**随便排的）。 */
export const LEVELS = Object.freeze(['workspace', 'generator', 'cwd'])

/** 每一级的两个数（**互不相同**；值本身没有含义，含义在"哪一级"里）。 */
export const CAP_VALUES = Object.freeze({
  workspace: { count: 311, chars: 31313 },
  generator: { count: 322, chars: 32323 },
  cwd: { count: 333, chars: 33333 },
})

/** 快照的实际占用（与参考线是两个数，混起来就是把上限当占用）。 */
export const SNAPSHOT_TOTALS = Object.freeze({ count: 73, chars: 4321 })

/** 一份 `memory.mjs` 夹具正文 —— 形状必须与 `read_capacity()` 的正则（`^const CAP_COUNT`）逐字对得上。 */
function memorySourceText({ count, chars }) {
  return [
    '// 夹具：容量参考线（三级候选各一份，两个值故意互不相同）',
    `const CAP_COUNT = ${count}`,
    `const CAP_CHARS = ${String(chars).replace(/\B(?=(\d{3})+(?!\d))/g, '_')}`,
    '',
  ].join('\n')
}

/** 写一份 `memory.mjs` 到 `<root>/presets/agenia/lib/memory.mjs`（返回路径）。 */
export function writeCapSourceAt(root, caps) {
  const file = memorySourceAt(root)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, memorySourceText(caps), 'utf8')
  return file
}

/** 路径比较口径（Windows 不分大小写；分隔符统一成正斜杠）。 */
export const normPath = (p) => String(p ?? '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()

/**
 * 造一个"只有某一级有 `memory.mjs`"的现场，并跑一次真生成器。
 *
 * @param {{caseId: string, tag: string, level: 'workspace'|'generator'|'cwd', day?: string, nowIso?: string}} input
 * @returns {{
 *   level: string, roots: object, run: object, card: object,
 *   expected: {file: string, caps: {count: number, chars: number}, root: string},
 *   sides: Array<{level: string, file: string, exists: boolean}>,
 *   script: {file: string, copied: boolean, same_as_production: boolean|null},
 * }}
 */
export function capSourceScene({ caseId, tag, level, day = DAY, nowIso = NOW }) {
  if (!LEVELS.includes(level)) throw new Error(`capSourceScene：level 只认 ${LEVELS.join(' / ')}，实得 ${JSON.stringify(level)}`)
  const roots = makeCardRoots(caseId, tag)
  // 生成器站的位置：workspace 那一级用生产那份（`here` = 仓库根）；另两级用**副本**。
  const copyRoot = path.join(roots.runRoot, 'cap-source-generator', `${String(caseId).toLowerCase()}-${tag}`)
  const cwdDir = level === 'workspace' ? path.join(roots.runRoot, 'cap-source-cwd', `${String(caseId).toLowerCase()}-${tag}`) : path.join(copyRoot, 'cwd')
  mkdirSync(cwdDir, { recursive: true })
  let script = { file: generatorScriptPath(), copied: false, same_as_production: null }
  if (level !== 'workspace') {
    const file = copyGeneratorInto(copyRoot)
    script = { file, copied: true, same_as_production: sha256Of(file) === sha256Of(generatorScriptPath()) }
  }
  // 三级的落点：只有 `level` 那一级有文件，另两级**一个字节都不写**（夹具自证靠 `sides`）。
  const rootsOfLevel = { workspace: roots.ws, generator: copyRoot, cwd: cwdDir }
  const expectedFile = writeCapSourceAt(rootsOfLevel[level], CAP_VALUES[level])
  // 账本 / 数据根 / 复核节点 / route.mjs：让卡出得来，且失败不会停在别的错误码上
  // （`cand-20261020-0078`：要证明 A 在挡，先把也会挡它的 B 调成不挡）。
  writeDataRoot(roots.dr, { day, totals: { ...SNAPSHOT_TOTALS } })
  writeRoute(roots.ws, routeLedger({ tickets: [] }))
  writeLocal(roots.ws, day, localState({ day, technical: 'done', conversation: 'done' }))
  writeRouteSource(roots.ws)
  const run = runCards(roots, { day, nowIso, script: script.copied ? script.file : null, cwd: cwdDir })
  const card = readCard(cardFile(roots.ws, day))
  return {
    level,
    roots,
    run,
    card,
    expected: { file: expectedFile, caps: { ...CAP_VALUES[level] }, root: rootsOfLevel[level] },
    sides: LEVELS.map((name) => ({ level: name, file: memorySourceAt(rootsOfLevel[name]), exists: existsSync(memorySourceAt(rootsOfLevel[name])) })),
    script,
    cwd: cwdDir,
  }
}

/** 卡上 `capacity.*` 那几格（原始值，不做归一）。 */
export function capCells(card) {
  const c = card?.cells ?? {}
  return {
    count: c['capacity.count'],
    chars: c['capacity.chars'],
    cap_count: c['capacity.cap_count'],
    cap_chars: c['capacity.cap_chars'],
    source: c['capacity.source'],
    state: c['capacity.state'],
    cap_source: c['capacity.cap_source'],
    cap_source_present: Object.prototype.hasOwnProperty.call(c, 'capacity.cap_source'),
  }
}

/**
 * 这一级那份 `memory.mjs` 里的两个数（**从输入解析**，不从卡的输出反推）。
 * 解析不出来 ⇒ `ok:false`（夹具红：那一份文件形状变了，别把它读成"卡印错了"）。
 */
export function expectedCaps(scene) {
  return readCapConstants(scene.expected.file)
}

/** 生成器副本与生产逐字节相同吗（副本必须是同一把尺子，只是换了站的位置）。 */
export function scriptSameAsProduction(scene) {
  if (!scene.script.copied) return null
  return sha256Of(scene.script.file) === sha256Of(generatorScriptPath())
}
