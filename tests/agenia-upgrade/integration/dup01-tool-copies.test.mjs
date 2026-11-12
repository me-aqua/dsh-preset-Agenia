/**
 * `DUP-01` —— **同一个工具的第二个拷贝**（史山清查 A1 · Gate 2）。
 *
 * 契约：`.team/test/2026-11-12/CONTRACT-史山清查-A1.md`（唯一出处：口径 / 五条腿 / 刀 / 控制 / 分母）。
 * 定形：`.team/leader/2026-11-12/定形-A1-三份死拷贝.md`。
 * 量具：`support/duplicate-tools.mjs`（扫描面 / 工具键 / 判词只有那一份）。
 *
 * ## 病（2026-11-12 21:3x 现量；Gate 3 已删）
 * `.tools/agenia-install.mjs` 与 `presets/agenia/bin/install.mjs` 逐字节相同（44,986 B）·
 * `.tools/agenia-rollback.mjs` 与 `bin/rollback.mjs` 逐字节相同（39,778 B）·
 * `.tools/agenia-release-scan.mjs` 是 `bin/release-scan.mjs` 的**陈旧副本**（36,104 vs 38,749 B）。
 * 活引用 0（代码 / 文档 / 判据 / 当时的抽屉都没人指它们）——三份都是死拷贝，Gate 3 删。
 * 三对旧名的来历见定形 §一 与 Gate 2 读数（`dup01-gate2-full4`）；**不是**从 `install.mjs` 那张表读出来的
 * （Gate 3 之后那张表是恒等映射，见契约 §0.3）。
 *
 * ## 五条腿（一条用例 = 一格；腿不是格，分母只 +1）
 *   · **A 真树绿**：`<repo>/.tools` 与 `<repo>/presets/agenia/bin` 两个扫描面，**0 对**同名工具；
 *     读数印出**两个目录 + 各几份 `*.mjs`**（缺目录 / 空目录 ⇒ 红 `DUP-SCAN-DIR` / `DUP-SCAN-EMPTY`，
 *     否则"0 对"是真空真）。
 *     - **控制**：把真树两个目录的 `*.mjs` 镜像到运行根（不带那三份旧名）⇒ **绿**，两份数 > 0；
 *     - **刀**：往镜像里放回三份旧名（两份逐字节相同 + 一份截短的分叉）⇒ **红**，恰好 3 对，
 *       其中恰好 1 对 `bytes_equal:false`。这刀就是"有人把死拷贝放回去"的那一刻。
 *       ⚠️ 腿 A 打**真树**：Gate 3 删之前它红（3 对，点名六个路径与大小），删之后它绿。这一格的
 *       红/绿就是验收口径里的"红前绿后"。
 *   · **B 副本红**：运行根里的 scratch 树（`.tools` 一份无关工具 + `bin/install.mjs` 一份）先扫 ⇒ 绿（控制）；
 *     把 `bin/install.mjs` **逐字节**复制成 `.tools/agenia-install.mjs` ⇒ **红**，恰好 1 对，
 *     报文/读数**点名两边路径与大小**（两处大小相同、`bytes_equal:true`）；删掉副本 ⇒ 又绿（刀）。
 *   · **C 分叉红**：同一份逐字节副本先红（对照：红不是来自"大小不同"）；
 *     把副本字节改长 ⇒ **仍然红**，`bytes_equal:false`，读数里**两个大小不同**（陈旧副本的形状）；
 *     删掉副本 ⇒ 绿（刀）。这一条防的就是"只判逐字节相同"的假判据。
 *   · **D 阴性对照**：`.tools/agenia-alpha.mjs` + `bin/beta.mjs`（两个不同的工具）⇒ **绿**，
 *     两个扫描面各 1 份（证明绿不是因为"目录里没东西"）；再放一对**同名 `.py`**（`.tools/alpha.py` +
 *     `bin/alpha.py`）⇒ 仍绿（扫描面是 `*.mjs`，不是"什么重名都算"）；
 *     **刀**：加一份 `bin/alpha.mjs`（与 `.tools/agenia-alpha.mjs` 归一后同名）⇒ **红**，恰好 1 对
 *     —— 证明这一格判的是**工具键**（旧名 `agenia-` 归一），不是"两边有文件就绿"。
 *   · **E 发布源只许指 live `bin/`**：读 `<repo>/presets/agenia/bin/install.mjs` 的 `opPublishStaged` 体
 *     ⇒ **0 处 `.tools` 段**、列出的源名字都在 live `bin/` 里（Gate 3 的 repoint 不许被改回去）。
 *     **控制**：真树那一份必须找到 op、源名单非空；**刀**：把 op 里的源路径改回 `'.tools'` 的 scratch 副本
 *     ⇒ **红**（`DUP-PUBLISH-TOOLS` 恰好 1 条），而名字仍然都在 live bin（红只来自那一段）。
 *
 * ## 期望读数
 *   · **Gate 2（三份死拷贝还在）**：`DUP-01` 红在 `DUP-TOOL-COPY` × 3（真树三对）⇒ 套件
 *     `217 · RED 1 / GREEN 215 / HOLD 1`（`BOOT-02` 仍是老板搁置的那一格）。
 *   · **Gate 3 之后（今天）**：`DUP-01` 绿（真树 0 对，两个扫描面 13 / 7 份；腿 E 0 处 `.tools`）⇒ 套件
 *     `217 · RED 0 / GREEN 216 / HOLD 1`。
 */
import { test } from 'node:test'
import path from 'node:path'
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { caseFail, problem, runCase, runId, runRoot } from '../support/evidence.mjs'
import { PATHS } from '../support/env.mjs'
import { ensureMarkedDir } from '../support/root-guard.mjs'
import { TOTAL } from '../support/registry.mjs'
import { scanToolCopies, toolCopyVerdict, TOOL_COPY_SCAN, publishStagedSourceReading, publishStagedSourceVerdict } from '../support/duplicate-tools.mjs'

/** Gate 2 那三对旧名 —— 来历：定形 §一（2026-11-12 的现量）与 Gate 2 读数（`dup01-gate2-full4`）；口径见契约 §0.3。 */
const LEGACY_PAIRS = [
  { tools: 'agenia-install.mjs', bin: 'install.mjs' },
  { tools: 'agenia-rollback.mjs', bin: 'rollback.mjs' },
  { tools: 'agenia-release-scan.mjs', bin: 'release-scan.mjs' },
]

/** 本格所有夹具都住在运行根里（`<run-root>/fixtures/dup01/<tag>`）—— 不碰真树的 `.tools` / `presets`。 */
function fixtureRoot(tag) {
  const dir = path.join(runRoot(), 'fixtures', 'dup01', tag)
  const base = path.resolve(runRoot())
  // 先解析绝对路径 → 校验在运行根之下（`ensureMarkedDir` 自己再校验一次）→ 建目录 + marker。
  const made = ensureMarkedDir(dir, { runRoot: runRoot(), runId: runId(), kind: 'agenia-test-root' })
  if (!isUnder(made, base)) throw new Error(`DUP01-FIXTURE-ESCAPE: 夹具根跑到运行根之外：${made}（运行根 ${base}）`)
  return made
}

/**
 * 删一份夹具文件（契约 §2.5）：先解析绝对路径 → 校验在夹具根 / 运行根之下 → 校验夹具根带
 * `.agenia-test-root` marker，才允许删。`ENV-02` 的 `DELETE-NO-MARKER` 会看 `rmSync` 前 12 行里
 * 有没有 marker 字样 —— 这里做的是**真校验**，不是写一句注释骗扫描器。
 */
function removeFixtureFile(file, root) {
  const resolved = path.resolve(file)
  const marker = path.join(path.resolve(root), '.agenia-test-root')
  if (!isUnder(resolved, root) || !isUnder(resolved, runRoot())) {
    throw new Error(`DUP01-DELETE-OUTSIDE: 拒绝删除夹具根 / 运行根之外的路径：${resolved}`)
  }
  let markerOk = false
  try {
    markerOk = statSync(marker).isFile()
  } catch {
    markerOk = false
  }
  if (!markerOk) throw new Error(`DUP01-DELETE-NO-MARKER: 夹具根没有 marker（${marker}）—— 拒绝删除`)
  rmSync(resolved)
}

/** 往 scratch 树里写一份文件（自动建父目录）。 */
function put(root, rel, bytes) {
  const file = path.join(root, ...rel.split('/'))
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, bytes)
  return file
}

/** 把**真树** `bin/<name>` 的字节复制进 scratch 树的 `bin/<name>`。 */
function stageRealBin(root, name) {
  const from = path.join(PATHS.repo, 'presets', 'agenia', 'bin', name)
  const buf = readFileSync(from)
  const to = put(root, `presets/agenia/bin/${name}`, buf)
  return { from, to, size: statSync(from).size }
}

/** 真树某一侧的顶层 `*.mjs` 文件名（按名字排序）。 */
function realMjsNames(relDir) {
  return readdirSync(path.join(PATHS.repo, ...relDir.split('/')), { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.mjs'))
    .map((e) => e.name)
    .sort()
}

/** 读数里那份"哪棵树"的自证（`cand-20261108-0241`）：路径必须落在它自己声明的 root 下面。 */
function isUnder(child, parent) {
  const a = path.resolve(child).toLowerCase()
  const b = path.resolve(parent).toLowerCase()
  return a === b || a.startsWith(`${b}${path.sep}`)
}

/** 收窄成可落盘的读数（不把整份 reading 之外的东西塞进来）。 */
function summarize(reading) {
  return {
    root: reading.root,
    rule: reading.rule,
    line: reading.line,
    dirs: reading.dirs.map((d) => ({ id: d.id, rel: d.rel, abs: d.abs, exists: d.exists, read_error: d.read_error, mjs_count: d.mjs_count })),
    counts: reading.counts,
    copies: reading.copies,
  }
}

/** 一对拷贝的报文/读数必须点名两边的**路径与大小**。 */
function namesBothSides(text, pair) {
  const t = String(text ?? '')
  return t.includes(pair.tools.path) && t.includes(pair.bin.path)
    && t.includes(String(pair.tools.size)) && t.includes(String(pair.bin.size))
}

test('DUP-01 同名工具的第二个拷贝：真树 0 对（印两个扫描面份数）· 副本红（点名两边路径与大小）· 分叉仍红 · 异名阴性绿', async () => {
  await runCase('DUP-01', async (rec) => {
    const problems = []
    const push = (code, message, detail) => problems.push(problem(code, message, detail))
    const forward = (verdict, leg) => {
      for (const p of verdict.problems) push(p.code, `[${leg}] ${p.message}`, p.detail)
    }
    const expectGreen = (verdict, leg, reading) => {
      if (verdict.verdict !== 'GREEN') {
        push('DUP01-EXPECTED-GREEN', `[${leg}] 这一份该绿，判成 ${verdict.verdict}：${verdict.problems.map((p) => `${p.code}: ${p.message}`).join(' · ')}`,
          { line: reading?.line ?? null })
      }
    }

    // ══ 腿 A · 真树：0 对 + 两个扫描面各几份 ══════════════════════════════════════════════
    const real = scanToolCopies({ root: PATHS.repo })
    const realVerdict = toolCopyVerdict(real)
    rec.readings.real_tree = {
      ...summarize(real),
      verdict: realVerdict.verdict,
      problem_codes: realVerdict.problems.map((p) => p.code),
    }
    // 扫描面形状：必须是两个目录、名字逐字、只有 `*.mjs`、份数非零。
    if (real.dirs.length !== TOOL_COPY_SCAN.length) {
      push('DUP01-SCAN-SHAPE', `[腿A] 扫描面必须恰好 ${TOOL_COPY_SCAN.length} 个，实得 ${real.dirs.length}：${real.dirs.map((d) => d.rel).join(' · ')}`)
    } else {
      const [toolsDir, binDir] = real.dirs
      if (toolsDir.rel !== '.tools' || binDir.rel !== 'presets/agenia/bin') {
        push('DUP01-SCAN-SHAPE', `[腿A] 扫描面写歪了：${toolsDir.rel} / ${binDir.rel}（要 .tools 与 presets/agenia/bin）`)
      }
      for (const d of real.dirs) {
        if (!d.mjs_names.every((n) => n.endsWith('.mjs'))) {
          push('DUP01-SCAN-SUFFIX', `[腿A] ${d.rel} 的扫描面里混进了非 .mjs：${d.mjs_names.filter((n) => !n.endsWith('.mjs')).join(' · ')}`)
        }
      }
      // 「0 对」必须和两个份数一起出现（口径边界：否则它是真空真）。
      for (const d of real.dirs) {
        if (!real.line.includes(d.rel)) push('DUP01-LINE-DIRS', `[腿A] 读数没印出扫描目录 ${d.rel}：${real.line}`)
        const countText = `${d.mjs_count} 份 .mjs`
        if (!real.line.includes(countText)) push('DUP01-LINE-COUNT', `[腿A] 读数没印出 ${d.rel} 的份数（"${countText}"）：${real.line}`)
      }
    }
    if (path.resolve(real.root) !== path.resolve(PATHS.repo)) {
      push('DUP01-SCAN-TREE', `[腿A] 真树读数不是在真树上量的：reading.root=${real.root} · PATHS.repo=${PATHS.repo}`)
    }
    forward(realVerdict, '腿A 真树')

    // 腿 A 的控制 + 刀：真树两目录的镜像（运行根里，不碰真树）。
    const mirror = fixtureRoot('real-mirror')
    for (const name of realMjsNames('presets/agenia/bin')) {
      put(mirror, `presets/agenia/bin/${name}`, readFileSync(path.join(PATHS.repo, 'presets', 'agenia', 'bin', name)))
    }
    const legacyToolsNames = new Set(LEGACY_PAIRS.map((p) => p.tools))
    for (const name of realMjsNames('.tools')) {
      if (legacyToolsNames.has(name)) continue // 镜像的是"删干净"那一侧；旧名由刀放回去
      put(mirror, `.tools/${name}`, readFileSync(path.join(PATHS.repo, '.tools', name)))
    }
    const mirrorClean = scanToolCopies({ root: mirror })
    const mirrorCleanVerdict = toolCopyVerdict(mirrorClean)
    rec.readings.real_mirror_clean = { ...summarize(mirrorClean), verdict: mirrorCleanVerdict.verdict, problem_codes: mirrorCleanVerdict.problems.map((p) => p.code) }
    expectGreen(mirrorCleanVerdict, '腿A 控制（干净镜像）', mirrorClean)
    if (mirrorClean.copies.length !== 0) {
      push('DUP01-MIRROR-CLEAN', `[腿A 控制] 干净镜像里不该有拷贝，实得 ${mirrorClean.copies.length} 对`)
    }
    for (const d of mirrorClean.dirs) {
      if (!d.exists || d.mjs_count === 0) {
        push('DUP01-MIRROR-CLEAN', `[腿A 控制] 干净镜像的扫描面 ${d.rel} 是空的 / 不在（${d.mjs_count} 份）—— 绿会变成真空真`)
      }
    }
    // 刀：把三份旧名放回去。两份逐字节相同，第三份截短（陈旧副本的形状）。
    for (const pair of LEGACY_PAIRS) {
      const buf = readFileSync(path.join(PATHS.repo, 'presets', 'agenia', 'bin', pair.bin))
      const body = pair.bin === 'release-scan.mjs' ? buf.subarray(0, Math.max(1, buf.length - 2048)) : buf
      put(mirror, `.tools/${pair.tools}`, body)
    }
    const mirrorDisease = scanToolCopies({ root: mirror })
    const mirrorDiseaseVerdict = toolCopyVerdict(mirrorDisease)
    rec.readings.real_mirror_disease = { ...summarize(mirrorDisease), verdict: mirrorDiseaseVerdict.verdict, problem_codes: mirrorDiseaseVerdict.problems.map((p) => p.code) }
    if (mirrorDiseaseVerdict.verdict !== 'RED') {
      push('DUP01-MIRROR-DISEASE', `[腿A 刀] 放回三份旧名之后必须红，实得 ${mirrorDiseaseVerdict.verdict} —— 刀不咬，这一格就守不住复发`)
    }
    if (mirrorDisease.copies.length !== LEGACY_PAIRS.length) {
      push('DUP01-MIRROR-DISEASE', `[腿A 刀] 应当恰好 ${LEGACY_PAIRS.length} 对，实得 ${mirrorDisease.copies.length}：${mirrorDisease.copies.map((c) => c.key).join(' · ')}`)
    }
    const diseaseEqual = mirrorDisease.copies.filter((c) => c.bytes_equal === true).length
    const diseaseForked = mirrorDisease.copies.filter((c) => c.bytes_equal === false).length
    if (diseaseEqual !== 2 || diseaseForked !== 1) {
      push('DUP01-MIRROR-DISEASE', `[腿A 刀] 形状应当是"两份逐字节相同 + 一份已分叉"，实得相同 ${diseaseEqual} / 分叉 ${diseaseForked}`)
    }
    for (const pair of mirrorDisease.copies) {
      if (!isUnder(pair.tools.path, mirror) || !isUnder(pair.bin.path, mirror)) {
        push('DUP01-MIRROR-TREE', `[腿A 刀] 拷贝读数指到了镜像之外：${pair.tools.path} / ${pair.bin.path}（镜像 ${mirror}）`)
      }
      if (!namesBothSides(mirrorDisease.line, pair)) {
        push('DUP01-LINE-PAIR', `[腿A 刀] 读数没点名这一对的两边路径与大小：${pair.key} —— ${mirrorDisease.line}`)
      }
    }

    // ══ 腿 B · 副本红：逐字节复制 ⇒ 红；删掉 ⇒ 绿（控制 + 刀）════════════════════════════
    const copyRoot = fixtureRoot('copy')
    const stagedInstall = stageRealBin(copyRoot, 'install.mjs')
    put(copyRoot, '.tools/unrelated-tool.mjs', 'export const unrelated = true\n')
    const copyBaseline = scanToolCopies({ root: copyRoot })
    const copyBaselineVerdict = toolCopyVerdict(copyBaseline)
    rec.readings.copy_baseline = { ...summarize(copyBaseline), verdict: copyBaselineVerdict.verdict }
    expectGreen(copyBaselineVerdict, '腿B 控制（加副本之前）', copyBaseline)
    const copyPath = put(copyRoot, '.tools/agenia-install.mjs', readFileSync(stagedInstall.to))
    const copyRead = scanToolCopies({ root: copyRoot })
    const copyVerdict = toolCopyVerdict(copyRead)
    rec.readings.copy_red = { ...summarize(copyRead), verdict: copyVerdict.verdict, problem_codes: copyVerdict.problems.map((p) => p.code) }
    if (copyVerdict.verdict !== 'RED') {
      push('DUP01-COPY-NOT-RED', `[腿B] 把 bin/install.mjs 复制成 .tools/agenia-install.mjs 之后必须红，实得 ${copyVerdict.verdict}`)
    }
    if (copyRead.copies.length !== 1) {
      push('DUP01-COPY-SHAPE', `[腿B] 应当恰好 1 对，实得 ${copyRead.copies.length}`)
    } else {
      const pair = copyRead.copies[0]
      if (pair.key !== 'install.mjs' || pair.match !== 'legacy-prefix') {
        push('DUP01-COPY-KEY', `[腿B] 键应当是 install.mjs（旧名归一），实得 key=${pair.key} / match=${pair.match}`)
      }
      if (pair.tools.size !== stagedInstall.size || pair.bin.size !== stagedInstall.size) {
        push('DUP01-COPY-SIZE', `[腿B] 两边大小都应当是 ${stagedInstall.size} B，实得 ${pair.tools.size} / ${pair.bin.size}`)
      }
      if (pair.bytes_equal !== true) {
        push('DUP01-COPY-BYTES', `[腿B] 逐字节复制出来的副本必须 bytes_equal:true，实得 ${JSON.stringify(pair.bytes_equal)}`)
      }
      if (!isUnder(pair.tools.path, copyRoot) || !isUnder(pair.bin.path, copyRoot)) {
        push('DUP01-COPY-TREE', `[腿B] 读数指到了 scratch 之外：${pair.tools.path} / ${pair.bin.path}`)
      }
      if (!namesBothSides(copyVerdict.problems.map((p) => p.message).join('\n'), pair)) {
        push('DUP01-COPY-MESSAGE', `[腿B] 红报文没点名两边路径与大小：${copyVerdict.problems.map((p) => p.message).join(' · ')}`)
      }
      if (!namesBothSides(copyRead.line, pair)) {
        push('DUP01-COPY-LINE', `[腿B] 读数没点名两边路径与大小：${copyRead.line}`)
      }
    }
    removeFixtureFile(copyPath, copyRoot)
    const copyAfter = scanToolCopies({ root: copyRoot })
    const copyAfterVerdict = toolCopyVerdict(copyAfter)
    rec.readings.copy_after_knife = { ...summarize(copyAfter), verdict: copyAfterVerdict.verdict }
    expectGreen(copyAfterVerdict, '腿B 刀（删掉副本）', copyAfter)
    if (copyAfter.copies.length !== 0) {
      push('DUP01-COPY-KNIFE-DEAD', `[腿B 刀] 删掉副本之后仍读到 ${copyAfter.copies.length} 对 —— 刀没咬，这一格判的不是"副本在不在"`)
    }

    // ══ 腿 C · 分叉红：同名但字节不同 ⇒ 仍红，且读数印出两个不同的大小 ═══════════════════════
    const forkRoot = fixtureRoot('fork')
    const stagedForkBin = stageRealBin(forkRoot, 'install.mjs')
    put(forkRoot, '.tools/unrelated-tool.mjs', 'export const unrelated = true\n')
    const forkPath = put(forkRoot, '.tools/agenia-install.mjs', readFileSync(stagedForkBin.to))
    const forkIdentical = scanToolCopies({ root: forkRoot })
    const forkIdenticalVerdict = toolCopyVerdict(forkIdentical)
    rec.readings.fork_identical = { ...summarize(forkIdentical), verdict: forkIdenticalVerdict.verdict }
    if (forkIdenticalVerdict.verdict !== 'RED') {
      push('DUP01-FORK-CONTROL', `[腿C 对照] 逐字节相同的副本必须先红（对照），实得 ${forkIdenticalVerdict.verdict}`)
    }
    if (forkIdentical.copies.length !== 1 || forkIdentical.copies[0].bytes_equal !== true) {
      push('DUP01-FORK-CONTROL', `[腿C 对照] 逐字节副本那一跑应当是 1 对且 bytes_equal:true，实得 ${forkIdentical.copies.length} 对 / ${JSON.stringify(forkIdentical.copies[0]?.bytes_equal)}`)
    }
    const forkBytes = Buffer.from('\n// dup01: this copy has forked from bin/install.mjs\n', 'utf8')
    writeFileSync(forkPath, Buffer.concat([readFileSync(stagedForkBin.to), forkBytes]))
    const forkRead = scanToolCopies({ root: forkRoot })
    const forkVerdict = toolCopyVerdict(forkRead)
    rec.readings.fork_red = { ...summarize(forkRead), verdict: forkVerdict.verdict, problem_codes: forkVerdict.problems.map((p) => p.code) }
    if (forkVerdict.verdict !== 'RED') {
      push('DUP01-FORK-NOT-RED', `[腿C] 同名但已分叉的副本必须**仍然红**，实得 ${forkVerdict.verdict} —— 只判逐字节相同的判据会把它放过去（陈旧副本）`)
    }
    if (forkRead.copies.length !== 1) {
      push('DUP01-FORK-SHAPE', `[腿C] 应当恰好 1 对，实得 ${forkRead.copies.length}`)
    } else {
      const pair = forkRead.copies[0]
      if (pair.bytes_equal !== false) {
        push('DUP01-FORK-BYTES', `[腿C] 改长之后必须 bytes_equal:false，实得 ${JSON.stringify(pair.bytes_equal)}`)
      }
      if (pair.sizes_equal !== false) {
        push('DUP01-FORK-SIZES', `[腿C] 改长之后两边大小必须不同，实得 sizes_equal=${JSON.stringify(pair.sizes_equal)}`)
      }
      if (pair.tools.size !== stagedForkBin.size + forkBytes.length) {
        push('DUP01-FORK-SIZE', `[腿C] 副本大小应当是 ${stagedForkBin.size + forkBytes.length} B（${stagedForkBin.size}+${forkBytes.length}），实得 ${pair.tools.size}`)
      }
      if (!namesBothSides(forkRead.line, pair)) {
        push('DUP01-FORK-LINE', `[腿C] 读数没印出两个不同的大小：${forkRead.line}`)
      }
      if (!forkRead.line.includes(String(pair.tools.size)) || !forkRead.line.includes(String(pair.bin.size))) {
        push('DUP01-FORK-LINE', `[腿C] 读数里两个大小没有同时出现：${forkRead.line}`)
      }
    }
    removeFixtureFile(forkPath, forkRoot)
    const forkAfter = scanToolCopies({ root: forkRoot })
    const forkAfterVerdict = toolCopyVerdict(forkAfter)
    rec.readings.fork_after_knife = { ...summarize(forkAfter), verdict: forkAfterVerdict.verdict }
    expectGreen(forkAfterVerdict, '腿C 刀（删掉分叉副本）', forkAfter)

    // ══ 腿 D · 阴性对照：两个不同的工具 ⇒ 绿；同名 .py 仍绿；加同名 .mjs ⇒ 红（刀）════════════
    const negativeRoot = fixtureRoot('negative')
    put(negativeRoot, '.tools/agenia-alpha.mjs', 'export const tool = "alpha"\n')
    put(negativeRoot, 'presets/agenia/bin/beta.mjs', 'export const tool = "beta"\n')
    put(negativeRoot, '.tools/alpha.py', 'print("alpha")\n') // 同名但非 .mjs：不在扫描面
    put(negativeRoot, 'presets/agenia/bin/alpha.py', 'print("alpha")\n')
    const negativeRead = scanToolCopies({ root: negativeRoot })
    const negativeVerdict = toolCopyVerdict(negativeRead)
    rec.readings.negative = { ...summarize(negativeRead), verdict: negativeVerdict.verdict, problem_codes: negativeVerdict.problems.map((p) => p.code) }
    expectGreen(negativeVerdict, '腿D 阴性对照', negativeRead)
    if (negativeRead.copies.length !== 0) {
      push('DUP01-NEGATIVE-NOT-GREEN', `[腿D] 两个不同名的工具 + 同名 .py 必须 0 对，实得 ${negativeRead.copies.length} 对`)
    }
    for (const d of negativeRead.dirs) {
      if (d.mjs_count !== 1) push('DUP01-NEGATIVE-COUNT', `[腿D] ${d.rel} 应当恰好 1 份 .mjs（证明绿不是空目录），实得 ${d.mjs_count}`)
    }
    if (!negativeRead.line.includes('1 份 .mjs')) {
      push('DUP01-NEGATIVE-LINE', `[腿D] 读数没印出份数：${negativeRead.line}`)
    }
    put(negativeRoot, 'presets/agenia/bin/alpha.mjs', 'export const tool = "alpha canonical but forked"\n')
    const negativeKnife = scanToolCopies({ root: negativeRoot })
    const negativeKnifeVerdict = toolCopyVerdict(negativeKnife)
    rec.readings.negative_knife = { ...summarize(negativeKnife), verdict: negativeKnifeVerdict.verdict, problem_codes: negativeKnifeVerdict.problems.map((p) => p.code) }
    if (negativeKnifeVerdict.verdict !== 'RED') {
      push('DUP01-NEGATIVE-KNIFE-DEAD', `[腿D 刀] 放一份与 .tools/agenia-alpha.mjs 归一后同名的 bin/alpha.mjs ⇒ 必须红，实得 ${negativeKnifeVerdict.verdict} —— 刀不咬，D 的绿就可能是"两边都不看"`)
    }
    if (negativeKnife.copies.length !== 1) {
      push('DUP01-NEGATIVE-KNIFE', `[腿D 刀] 应当恰好 1 对，实得 ${negativeKnife.copies.length}`)
    } else if (negativeKnife.copies[0].key !== 'alpha.mjs' || negativeKnife.copies[0].match !== 'legacy-prefix') {
      push('DUP01-NEGATIVE-KNIFE', `[腿D 刀] 键应当是 alpha.mjs（旧名归一），实得 ${JSON.stringify({ key: negativeKnife.copies[0].key, match: negativeKnife.copies[0].match })}`)
    }

    // ══ 腿 E · publish-staged 的源名单只许指向 live bin（不许再有 .tools 段）══════════════════
    //    Gate 3（1195352/d91ba39）把 opPublishStaged 的源从 `<repo>/.tools/agenia-*.mjs` 重指到
    //    `<repo>/presets/agenia/bin/*.mjs`。这一腿钉住它：op 体内 0 处 `.tools` 段 + 源名字都在 live bin。
    const publishBin = path.join(PATHS.repo, 'presets', 'agenia', 'bin')
    const publishInstall = path.join(publishBin, 'install.mjs')
    const publishReal = publishStagedSourceReading({ file: publishInstall, liveBinDir: publishBin })
    const publishRealVerdict = publishStagedSourceVerdict(publishReal)
    rec.readings.publish_staged_real = {
      ...publishReal,
      verdict: publishRealVerdict.verdict,
      problem_codes: publishRealVerdict.problems.map((p) => p.code),
    }
    forward(publishRealVerdict, '腿E publish-staged')
    //    控制：真树那一步的读数必须自证"找到了 op、源名单非空、没有 .tools 段" —— 前两条由上面转发的判词管，
    //    这里只留一条**不转发**的读数断言：`'bin'` 段在（源不是从别处取的）。它只作读数，不作红因：
    //    实现若把 `'bin'` 收进常量，这一条不该假红。
    //    （真树是绿的 ⇒ `forward` 已经保证 op 找到 / 名单非空 / .tools 段 0 处。）
    //    刀：把真源码逐字节复制到运行根，在 op 体内把源路径改回 `.tools` ⇒ 必须红；名字仍然都在 live bin
    //    （证明红只来自那一段，不是"名字丢了"带出来的）。
    const publishRoot = fixtureRoot('publish-staged')
    const publishSourceText = readFileSync(publishInstall, 'utf8')
    const PUBLISH_ANCHOR = "path.join(repoV.path, 'presets', 'agenia', 'bin', srcName)"
    const publishAnchorCount = publishSourceText.split(PUBLISH_ANCHOR).length - 1
    rec.readings.publish_staged_knife = { anchor: PUBLISH_ANCHOR, anchor_count: publishAnchorCount }
    if (publishAnchorCount !== 1) {
      push('DUP01-PUBLISH-ANCHOR', `[腿E 刀] 刀的锚点在 \`${publishInstall}\` 里必须**恰好 1 处**，实得 ${publishAnchorCount} 处 —— 锚点不在，刀不咬`)
    } else {
      const knifeInstall = put(publishRoot, 'install.mjs.with-dot-tools.mjs',
        publishSourceText.replace(PUBLISH_ANCHOR, "path.join(repoV.path, '.tools', srcName)"))
      const publishKnife = publishStagedSourceReading({ file: knifeInstall, liveBinDir: publishBin })
      const publishKnifeVerdict = publishStagedSourceVerdict(publishKnife)
      rec.readings.publish_staged_knife.reading = {
        ...publishKnife,
        verdict: publishKnifeVerdict.verdict,
        problem_codes: publishKnifeVerdict.problems.map((p) => p.code),
      }
      if (publishKnifeVerdict.verdict !== 'RED') {
        push('DUP01-PUBLISH-KNIFE-DEAD', `[腿E 刀] 把源路径改回 \`.tools\` 之后必须红，实得 ${publishKnifeVerdict.verdict} —— 刀不咬，这一腿守不住 repoint`)
      }
      if (publishKnife.tools_segments.length !== 1) {
        push('DUP01-PUBLISH-KNIFE', `[腿E 刀] 刀应当恰好留 1 处 .tools 段，实得 ${publishKnife.tools_segments.length} 处`)
      }
      if (publishKnife.missing_live.length !== 0 || publishKnife.source_names.length !== publishReal.source_names.length) {
        push('DUP01-PUBLISH-KNIFE-NOISE', `[腿E 刀] 刀只许翻 .tools 那一面：源名字必须仍与真树同一份（真树 ${publishReal.source_names.join(' · ')} / 刀 ${publishKnife.source_names.join(' · ')}）`)
      }
    }

    rec.readings.expected = {
      denominator: TOTAL,
      gate2_red: 'RED · DUP-TOOL-COPY × 3（真树三对：install / rollback 逐字节相同 · release-scan 已分叉）—— 红前读数见 log.md §10',
      gate3_green: 'GREEN · 真树 0 对（.tools 13 份 / bin 7 份）+ 腿 E 0 处 .tools 段',
      note: '套件那一行以入口的 F57-SETTLE 为准（契约 §3）；这里只记这一格的期望，不重复结算',
    }
    caseFail(problems)
  })
})
