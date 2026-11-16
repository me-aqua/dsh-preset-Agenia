/**
 * `FCAP-01` · **文件长度上限（构案 0016）的红/绿四条腿** —— 第 4 关 r2 · M-4。
 *
 * 病根（`.team/review/2026-11-16/评审报告-0016-文件长度上限.md` §二 M-4）：
 *   这一族的红/绿只活在 `.tools/check-notes.mjs` 内部，`tests/**` 里 **0** 条用例读它；
 *   899 行那把刀只记在 `.team/dev/2026-11-16/log.md`（人写的 = 说明，不是证据）。
 *   ⇒ 把 `crossed` 改成「全判」或把 `atHead` 写死 `0`，套件照样全绿，而这族判据静默失效。
 *
 * 这一格在**一份真副本**里真跑 `check-notes.mjs`（照 `mcr02-copy-needles.test.mjs` 的写法）：
 *   夹具 = 从**这一跑的树**（`import.meta.url` 推，不读 `PATHS.repo`）拷出的
 *          `presets/**`（不含 `.runtime`）+ `账本/**` + `CONTRACT.md` + `check-notes.mjs` 的模块闭包；
 *   副本落点 = `<运行根>/fixtures/fcap01-tree`（运行根在 `.team/` 下，副本不碰活树、也不碰评审副本）；
 *   每条腿只改这一份副本，然后**真跑** `node <副本>/.tools/check-notes.mjs`，从 stdout 的
 *   「文件长度」那一族里读红/绿与读数行 —— 不 import 内部函数、不复制上限表。
 *
 * 四条腿（M-4 卡面）+ 三条 M-1 腿（复审的洗白 / 变长 / 改名）：
 *   A `synthetic-899`   合成 899 行 `.mjs` ⇒ 代码类那一行**红**，且只红它；
 *   B `delete-green`    删掉那份 ⇒ 回到绿（存量 12 份仍是绿）；
 *   C `stock-green`     默认模式：12 份存量全绿、**无票的超**一份都没有（12 = 0016 §① 的 11 + r2 的 `说明.md`）；
 *   D `all-reds-stock`  `--all` 红的**恰好是** C 那 12 份（集合相等；红的是 3 条类检查，不是 12 条检查）；
 *   E `commit-no-wash`  899 行**提交之后**仍然红（旧口径「HEAD 里就超 ⇒ 存量」已退役 —— M-1 的病）；
 *   F `growth-red`      存量 `inject.js` 长 1 行 ⇒ 红（长过冻结点；存量只许缩）；
 *   G `rename-red`      把存量 `packet.mjs` 改名成 `packet-renamed.mjs` 并提交 ⇒ 新路径红（债不许跟着改名搬走）。
 *
 * 三条 M-3 腿（复审 r2 的**三个漏口**；票 `bug-20261116-33`）—— 每种「应当红」的改法各一把刀，
 * 刀后**按原字节还原**（sha 相等）再跑一次确认回绿：
 *   H `m3-readme-two-rows` 把 0016 §② 的两行原样贴进 `README.md` ⇒ ② 红（它此前在 `capDocs` 之外）；
 *   I `m3-scheme-swap`     把 §② 两行的数字**对调** ⇒ ④ 红（旧口径比排序多重集，对调也相等）；
 *   J `m3-s17-glob`        把一个 glob 抄进 `CONTRACT.md` §17.7 ⇒ ③ 红（旧口径只切 §17.2）。
 *   ⚠️ 腿里要贴的「类 + 数」从**夹具里那份** `0016 §②` 读，测试里不抄上限（数字只有一处载体）。
 *
 * 🔴 覆盖边界（这一格**不判**什么）：
 *   · 不判 `check-notes` 其它族（宿主 / 团队账 / 三册……）：夹具只拷了 cap 族读得到的子树，
 *     其它族的红绿不是这一格的对象；这一格只从「文件长度」那一族取数。
 *   · 不判「该不该拆」的三种成因（那是 0016 §② 与票的事；报文里那段话由 `check-notes` 自己带）。
 *   · 不判活树：夹具是 `import.meta.url` 那棵树的拷贝，活树在窗口里动不影响这一格（副本模式天然如此）。
 */

import { before, describe, test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { caseFail, preflight, problem, runCase, runRoot } from '../support/evidence.mjs'

/**
 * 删除前的三道校验（契约 §2.5 同口径；`ENV-02` 认这个形状）：解析绝对路径 → 必须在运行根之下 →
 * 运行根必须带 marker。`buildFixture` 会递归删上一个同名目录，落点算错一次就删到别人的东西。
 */
function assertDeletable(target) {
  const abs = path.resolve(target)
  const root = path.resolve(runRoot())
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new Error(`FCAP-DELETE-OUTSIDE: ${abs} 不在运行根之下（${root}）`)
  }
  if (!existsSync(path.join(root, '.agenia-test-root'))) {
    throw new Error(`FCAP-DELETE-NO-MARKER: 运行根没有 .agenia-test-root（${root}）—— 删除前必须先证明这是测试根`)
  }
  return abs
}

before(() => {
  preflight()
})

/** 这一跑所在的树（副本模式 = 副本；活树模式 = 活树）—— 不从 `PATHS.repo` 推（那正是 F-169 钉的格）。 */
function suiteTree() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
}

/** 递归拷一棵子树，跳过 `.runtime/` 与 `node_modules/`（前者是数据、后者不进仓；cap 族本来也剔它们）。 */
function copySubset(src, dst) {
  cpSync(src, dst, {
    recursive: true,
    force: true,
    filter: (from) => {
      const rel = path.relative(src, from).replace(/\\/g, '/')
      if (rel === '.runtime' || rel.startsWith('.runtime/')) return false
      if (rel === 'node_modules' || rel.split('/').includes('node_modules')) return false
      return true
    },
  })
}

/**
 * 造夹具：**只拷 cap 族读得到的子树**（`presets/**` · `账本/**` · `CONTRACT.md` · `check-notes.mjs`
 * 的模块闭包 + oracle）。别的族在夹具里红不红不是这一格的对象（见文件头「覆盖边界」）。
 */
function buildFixture(root) {
  const tree = suiteTree()
  const fx = path.join(root, 'fixtures', 'fcap01-tree')
  // 删除纪律（契约 §2.5 / `ENV-02`）：删之前先过 `assertDeletable`（绝对路径 → marker → 在 RUN_ID 之下）。
  rmSync(assertDeletable(fx), { recursive: true, force: true })
  mkdirSync(fx, { recursive: true })
  copySubset(path.join(tree, 'presets'), path.join(fx, 'presets'))
  copySubset(path.join(tree, '账本'), path.join(fx, '账本'))
  cpSync(path.join(tree, 'CONTRACT.md'), path.join(fx, 'CONTRACT.md'))
  // M-3 腿 H 的落点：`README.md` 不在 cap 族的扫描面里（这正是漏口 1），刀要能往它身上贴两行。
  if (existsSync(path.join(tree, 'README.md'))) cpSync(path.join(tree, 'README.md'), path.join(fx, 'README.md'))
  // `check-notes.mjs` 有一处**无守卫**地读 `.gitignore`（第 1473 行；别处都带 `existsSync`）——
  // 夹具不拷它，整份体检会在 4c 之前抛 ENOENT（这一格要量的是 cap 族，不是夹具的缺角）。
  for (const name of ['.gitignore', '.gitattributes']) {
    if (existsSync(path.join(tree, name))) cpSync(path.join(tree, name), path.join(fx, name))
  }
  mkdirSync(path.join(fx, '.tools', 'lib'), { recursive: true })
  cpSync(path.join(tree, '.tools', 'check-notes.mjs'), path.join(fx, '.tools', 'check-notes.mjs'))
  cpSync(path.join(tree, '.tools', 'lib', 'f56-forward.mjs'), path.join(fx, '.tools', 'lib', 'f56-forward.mjs'))
  const oracle = path.join(tree, '.tools', '_staging', 'agenia-upgrade', 'oracle')
  if (existsSync(oracle)) {
    mkdirSync(path.join(fx, '.tools', '_staging', 'agenia-upgrade', 'oracle'), { recursive: true })
    for (const name of ['standard.patch.yml', 'provenance.json']) {
      if (existsSync(path.join(oracle, name))) {
        cpSync(path.join(oracle, name), path.join(fx, '.tools', '_staging', 'agenia-upgrade', 'oracle', name))
      }
    }
  }
  return fx
}

/** 子进程跑夹具里的 `check-notes`；`TEMP`/`TMP` 钉在运行根（C 盘一个字节都不写）。 */
function runCheckNotes(fx, { all = false } = {}) {
  const args = [path.join(fx, '.tools', 'check-notes.mjs')]
  if (all) args.push('--all')
  const tmp = path.join(runRoot(), 'tmp')
  mkdirSync(tmp, { recursive: true })
  const env = { ...process.env, TEMP: tmp, TMP: tmp }
  delete env.AGENIA_REPO_ROOT
  const r = spawnSync(process.execPath, args, {
    cwd: fx,
    encoding: 'utf8',
    timeout: 180000,
    maxBuffer: 64 * 1024 * 1024,
    env,
  })
  return { status: r.status, stdout: String(r.stdout ?? ''), stderr: String(r.stderr ?? '').slice(-800) }
}

/** 从 stdout 里取「文件长度」那一族：每行 = `ok/RED/HOLD + 行名 · 明细`，外加汇总读数行。
 *  ⚠️ 汇总读数行是 `console.log` 在 4c 里**当场**印的，位置在 `── 文件长度 ──` 这一族标题**之前**
 *  （族标题由脚本末尾的统一输出循环才印）—— 所以 summary 从整份 stdout 捞，不按族内位置找。 */
function capSection(stdout) {
  const lines = stdout.split(/\r?\n/)
  const start = lines.findIndex((l) => l.startsWith('── 文件长度 ──'))
  if (start < 0) return null
  const rows = []
  let summary = lines.find((l) => l.startsWith('  · 文件长度上限读数')) ?? null
  for (let i = start + 1; i < lines.length; i += 1) {
    const l = lines[i]
    if (l.startsWith('── ')) break
    const m = /^  (ok  |RED |HOLD) (.*)$/.exec(l)
    if (m === null) continue
    const body = m[2]
    const cut = body.indexOf('  ·  ')
    rows.push({ mark: m[1].trim(), name: cut < 0 ? body : body.slice(0, cut), detail: cut < 0 ? '' : body.slice(cut + 4) })
  }
  return { rows, summary }
}

/** 这一跑里**红**的路径（从红行的明细里抠；不读内部结构）。
 *  ⚠️ 红行明细的形状是 `… N 份：<path>（N 行；…）`：第一个路径前面粘着 `份：`（明细的分隔符是空格，
 *  正则从 `份` 起算）—— 这里只剥这个前缀，别把路径本身截掉。 */
function redPathsOf(section) {
  const out = new Set()
  for (const r of section.rows) {
    if (r.mark !== 'RED') continue
    for (const m of r.detail.matchAll(/([^\s（；]+)（(\d+) 行；/g)) {
      const rel = m[1].replace(/^份：/, '')
      if (rel !== '') out.add(rel)
    }
  }
  return [...out].sort()
}

/** 默认模式汇总行里的**存量路径**（「存量（有票，不判红）N 份：…」那一段；`--all` 是「存量（有票）N 份」）。 */
function stockPathsOf(section) {
  const line = section.summary ?? ''
  const m = /存量（有票[^）]*）\d+ 份：(.*)$/.exec(line)
  if (m === null) return []
  const tail = m[1].split(' · 超但无票')[0]
  return tail.split(' · ').map((s) => s.trim()).filter((s) => s !== '').sort()
}

/** 汇总行里的一个数（`超 12 份` / `越线（判红） 1 份` 的读法只在读数行里，不在别处再手写）。 */
function summaryCount(section, re) {
  const m = re.exec(section.summary ?? '')
  return m === null ? null : Number(m[1])
}

function git(fx, args) {
  const r = spawnSync('git', ['-c', 'user.name=FCAP-01', '-c', 'user.email=fcap01@example.invalid', ...args], {
    cwd: fx,
    encoding: 'utf8',
    timeout: 60000,
  })
  return { status: r.status, stdout: String(r.stdout ?? ''), stderr: String(r.stderr ?? '') }
}

/**
 * 0016 §② 的表行 `[标签, '**上限**']` —— **从夹具里那份决定文件读**。
 * 三把 M-3 刀要贴的是「真的那两行」：数字只能有一个载体（`FILE_CAP_TABLE` / §②），
 * 测试里再抄一份上限就变成第三个载体了。读不出来 ⇒ 由调用方按「腿造不出来」判红（不许静默跳过）。
 */
function schemeRowsOf(fx) {
  const file = path.join(fx, '账本', '构案', '0016-文件长度上限.md')
  if (!existsSync(file)) return []
  const text = readFileSync(file, 'utf8')
  const i = text.indexOf('## ②')
  if (i < 0) return []
  const j = text.indexOf('## ③', i)
  const s2 = j < 0 ? text.slice(i) : text.slice(i, j)
  return s2.split('\n')
    .filter((line) => line.trimStart().startsWith('|'))
    .map((line) => line.replace(/\s*\|\s*$/, '').split('|').slice(1).map((cell) => cell.trim()))
    .filter((cells) => cells.length >= 2 && /^\*\*\d+\*\*$/.test(cells[1]))
    .map(([label, cap]) => [label, cap])
}

const sha256Of = (abs) => createHash('sha256').update(readFileSync(abs)).digest('hex')

/** 「文件长度」那一族里某一条（按行名正则取）；没有 ⇒ `null`。 */
function capRowOf(section, re) {
  return section === null ? null : (section.rows.find((r) => re.test(r.name)) ?? null)
}

const KNIFE_REL = 'presets/agenia/lib/knife-file-cap-0016.mjs'
const KNIFE_LINES = 899
/** 存量总数（0016 §① 的 11 份 + 第 4 关 r2 补进来的 `说明.md`）—— 关一张票要同批改这一格。 */
const EXPECTED_STOCK = 12

describe('integration · 文件长度上限（FCAP）· 0016 的红/绿刀', () => {
  test('FCAP-01 真副本里跑 check-notes：899 红 / 删掉绿 / 12 份存量绿 / --all 恰好存量 / 提交洗不白 / 变长红 / 改名红', async () => {
    await runCase('FCAP-01', async (rec) => {
      const problems = []
      const push = (code, message, detail) => problems.push(problem(code, message, detail))
      const root = runRoot()
      const fx = buildFixture(root)
      rec.readings.fixture = { root: fx, source_tree: suiteTree(), copied: ['presets/** (minus .runtime)', '账本/**', 'CONTRACT.md', '.tools/check-notes.mjs + lib/f56-forward.mjs + oracle'] }

      // ── 0 · 夹具得先像一个仓库：git init + 一次提交（M-1 的「提交洗白」那条腿要有 HEAD 才量得到）──
      const init = git(fx, ['init', '-q'])
      const add = init.status === 0 ? git(fx, ['add', '-A']) : { status: 1 }
      const commit = add.status === 0 ? git(fx, ['commit', '-qm', 'fcap01 fixture']) : { status: 1 }
      rec.readings.git = { init: init.status, add: add.status, commit: commit.status, head: git(fx, ['rev-parse', 'HEAD']).stdout.trim() }
      if (init.status !== 0 || add.status !== 0 || commit.status !== 0) {
        push('FCAP-GIT', `夹具没建成一个 git 仓库（init=${init.status} add=${add.status} commit=${commit.status}）：${String(init.stderr || commit.stderr).slice(0, 300)} —— 这一格的前置条件不成立`)
        caseFail(problems)
        return
      }

      const readCap = (label, opts = {}) => {
        const run = runCheckNotes(fx, opts)
        const section = capSection(run.stdout)
        rec.readings[label] = {
          exit: run.status,
          rows: section === null ? null : section.rows.map((r) => ({ mark: r.mark, name: r.name, detail: r.detail.slice(0, 800) })),
          summary: section === null ? null : section.summary,
          red: section === null ? null : redPathsOf(section),
          stock: section === null ? null : stockPathsOf(section),
          stderr: run.stderr,
        }
        return { run, section }
      }

      // ── C · 基线（默认模式）：12 份存量全绿，无票的超一份都没有 ─────────────────────
      const base = readCap('baseline_default')
      if (base.section === null) {
        push('FCAP-NO-CAP-LINE', `默认跑没有打印「文件长度」那一族（exit=${base.run.status}）：夹具里 check-notes 没跑到 4c，或它的输出格式变了（stderr：${base.run.stderr}）`)
        caseFail(problems)
        return
      }
      const baseRed = redPathsOf(base.section)
      const baseStock = stockPathsOf(base.section)
      rec.readings.stock_expected = EXPECTED_STOCK
      if (baseRed.length !== 0) push('FCAP-BASELINE-RED', `默认模式本该全绿（12 份存量不判红），实得红：${baseRed.join(' · ')}`)
      if (baseStock.length !== EXPECTED_STOCK) push('FCAP-STOCK-COUNT', `默认模式存量应 ${EXPECTED_STOCK} 份，读数行给的是 ${baseStock.length} 份：${baseStock.join(' · ')}`)
      for (const anchor of ['presets/agenia/inject.js', 'presets/agenia/说明.md', 'CONTRACT.md']) {
        if (!baseStock.includes(anchor)) push('FCAP-STOCK-ANCHOR', `存量集合里没有 ${anchor}（说明.md 是 r2 补进面的那一份；没有它 ⇒ M-2 又漏了）`)
      }
      const baseOver = summaryCount(base.section, /超 (\d+) 份/)
      if (baseOver !== EXPECTED_STOCK) push('FCAP-OVER-COUNT', `默认模式「超」应 ${EXPECTED_STOCK} 份（= 存量、无无票超限），实得 ${baseOver}`)

      // ── D · --all：红的恰好是那 12 份（集合相等；3 条类检查红，不是 12 条）──────────────
      const all = readCap('all_audit', { all: true })
      if (all.section === null) {
        push('FCAP-NO-CAP-LINE', `--all 跑没有打印「文件长度」那一族（exit=${all.run.status}）`)
      } else {
        const allRed = redPathsOf(all.section)
        const allStock = stockPathsOf(all.section)
        const redClassRows = all.section.rows.filter((r) => r.mark === 'RED' && /上限 \d+ 行/.test(r.name)).length
        rec.readings.all_red_rows = redClassRows
        if (JSON.stringify(allRed) !== JSON.stringify(baseStock)) {
          push('FCAP-ALL-NOT-STOCK', `--all 红的不是默认模式的存量集合：all=${JSON.stringify(allRed)} / stock=${JSON.stringify(baseStock)}`)
        }
        if (allRed.length !== EXPECTED_STOCK) push('FCAP-ALL-COUNT', `--all 应红 ${EXPECTED_STOCK} 份，实得 ${allRed.length}：${allRed.join(' · ')}`)
        if (JSON.stringify(allStock.map((s) => s)) !== JSON.stringify(baseStock)) push('FCAP-ALL-STOCK-LINE', `--all 读数行里的存量集合与默认模式不一致：${JSON.stringify(allStock)} vs ${JSON.stringify(baseStock)}`)
        if (redClassRows !== 3) push('FCAP-ALL-ROWS', `--all 应红 3 条类检查（代码 / 说明书 / 契约），实得 ${redClassRows} 条 —— 「12 份」是文件数，不是红条数`)
      }

      // ── A · 899 行合成件 ⇒ 红，且只红它 ─────────────────────────────────────────────
      writeFileSync(path.join(fx, KNIFE_REL), `${Array.from({ length: KNIFE_LINES }, (_, i) => `// FCAP-01 knife line ${i + 1}`).join('\n')}\n`, 'utf8')
      const knife = readCap('knife_899')
      if (knife.section === null) {
        push('FCAP-NO-CAP-LINE', '加刀之后没有「文件长度」那一族')
      } else {
        const red = redPathsOf(knife.section)
        if (JSON.stringify(red) !== JSON.stringify([KNIFE_REL])) push('FCAP-KNIFE-NOT-RED', `899 行的合成件应让且只让它红，实得：${JSON.stringify(red)}`)
        if (summaryCount(knife.section, /超 (\d+) 份/) !== EXPECTED_STOCK + 1) push('FCAP-KNIFE-OVER', '899 行合成件没有把「超」的份数从 12 推到 13')
      }

      // ── E · 提交之后仍然红（旧口径的「commit 洗白」必须死）──────────────────────────
      const kAdd = git(fx, ['add', '-A'])
      const kCommit = kAdd.status === 0 ? git(fx, ['commit', '-qm', 'knife 899']) : { status: 1 }
      rec.readings.knife_commit = { add: kAdd.status, commit: kCommit.status, head: git(fx, ['rev-parse', 'HEAD']).stdout.trim() }
      if (kCommit.status !== 0) push('FCAP-GIT', `刀的提交没成功（add=${kAdd.status} commit=${kCommit.status}）`)
      const committed = readCap('knife_committed')
      if (committed.section === null) {
        push('FCAP-NO-CAP-LINE', '提交刀之后没有「文件长度」那一族')
      } else {
        const red = redPathsOf(committed.section)
        if (JSON.stringify(red) !== JSON.stringify([KNIFE_REL])) {
          push('FCAP-COMMIT-WASH', `899 行提交之后应仍然红且只红它 —— 实得 ${JSON.stringify(red)}（若为空，说明「HEAD 里就超 ⇒ 存量」又回来了）`)
        }
      }

      // ── B · 删掉刀 ⇒ 回到绿（不是「变成存量绿」）──────────────────────────────────
      rmSync(assertDeletable(path.join(fx, KNIFE_REL)), { force: true })
      git(fx, ['add', '-A'])
      git(fx, ['commit', '-qm', 'drop knife'])
      const deleted = readCap('knife_deleted')
      if (deleted.section === null) {
        push('FCAP-NO-CAP-LINE', '删刀之后没有「文件长度」那一族')
      } else {
        const red = redPathsOf(deleted.section)
        if (red.length !== 0) push('FCAP-DELETE-NOT-GREEN', `删掉 899 行合成件之后应回到绿，实得红：${JSON.stringify(red)}`)
        const stock = stockPathsOf(deleted.section)
        if (stock.length !== EXPECTED_STOCK) push('FCAP-DELETE-STOCK', `删刀之后存量应回到 ${EXPECTED_STOCK} 份，实得 ${stock.length}`)
      }

      // ── F · 存量长 1 行 ⇒ 红（长过冻结点；存量只许缩）──────────────────────────────
      const injectAbs = path.join(fx, 'presets', 'agenia', 'inject.js')
      const injectBefore = readFileSync(injectAbs, 'utf8')
      appendFileSync(injectAbs, '// FCAP-01 growth\n', 'utf8')
      const grown = readCap('stock_grown')
      if (grown.section === null) {
        push('FCAP-NO-CAP-LINE', '存量变长之后没有「文件长度」那一族')
      } else {
        const red = redPathsOf(grown.section)
        if (!red.includes('presets/agenia/inject.js')) push('FCAP-GROWTH-NOT-RED', `存量 inject.js 长 1 行应红，实得：${JSON.stringify(red)}`)
        const detail = grown.section.rows.find((r) => r.mark === 'RED')?.detail ?? ''
        if (!/冻结点|比 HEAD 长/.test(detail)) push('FCAP-GROWTH-WHY', `变长的红因没说是「长过冻结点 / 比 HEAD 长」：${detail.slice(0, 400)}`)
      }
      writeFileSync(injectAbs, injectBefore, 'utf8') // 还原（下一腿要拿另一份存量改名：`inject.js` 被 check-notes 的 preset 族无守卫地读，不能挪）

      // ── G · 改名 ⇒ 新路径红（债不许跟着改名搬走）──────────────────────────────────
      // 拿 `presets/agenia/lib/packet.mjs`（1695 行，票 `-22`）：`check-notes` 不读它，
      // 挪走那份之后体检还能跑到「文件长度」那一族（`inject.js` 被 preset 族读，挪了会 ENOENT）。
      const mv = git(fx, ['mv', 'presets/agenia/lib/packet.mjs', 'presets/agenia/lib/packet-renamed.mjs'])
      const mvCommit = mv.status === 0 ? git(fx, ['commit', '-qm', 'rename packet']) : { status: 1 }
      rec.readings.rename = { mv: mv.status, commit: mvCommit.status }
      if (mv.status !== 0 || mvCommit.status !== 0) {
        push('FCAP-GIT', `改名没做成（mv=${mv.status} commit=${mvCommit.status}）`)
      } else {
        const renamed = readCap('renamed')
        const red = renamed.section === null ? null : redPathsOf(renamed.section)
        if (red === null) {
          push('FCAP-NO-CAP-LINE', '改名之后没有「文件长度」那一族')
        } else {
          if (!red.includes('presets/agenia/lib/packet-renamed.mjs')) push('FCAP-RENAME-NOT-RED', `改名后的新路径应红（旧票指旧路径），实得：${JSON.stringify(red)}`)
          if (red.includes('presets/agenia/lib/packet.mjs')) push('FCAP-RENAME-OLD', `旧路径已不在盘上却仍被点红：${JSON.stringify(red)}`)
          const stock = stockPathsOf(renamed.section) ?? []
          if (stock.includes('presets/agenia/lib/packet-renamed.mjs')) push('FCAP-RENAME-STOCK', '改名后的新路径被当成存量（旧票跟过去了）—— 债不许跟着改名搬走')
        }
      }

      // ── H/I/J · M-3 的三个漏口（票 bug-20261116-33）：每种「应当红」的改法各一把刀 ──────────────
      //   刀的形状固定：改 → 跑（点名那一条红）→ **按原字节还原**（sha 相等）→ 再跑（回到绿）。
      //   三把刀都挂在**这个 case** 里（不新开 case ⇒ 分母不动）；刀只改夹具，不碰活树。
      const schemeAbs = path.join(fx, '账本', '构案', '0016-文件长度上限.md')
      const M3_ROWS = [['h', /上限表只有一处 ②/], ['i', /上限表只有一处 ④/], ['j', /上限表只有一处 ③/]]
      const schemeRows = schemeRowsOf(fx)
      rec.readings.m3_scheme_rows = schemeRows.length
      if (schemeRows.length < 2) {
        push('FCAP-M3-CANNOT-BUILD', `0016 §② 只读出 ${schemeRows.length} 行「标签 | **数**」—— 三把刀造不出来（决定文件的表格式变了；不许静默跳过）`)
      } else {
        /** 一把刀：改一份文件 → 量点名那一条红 → **按原字节还原** → 量回绿。 */
        const m3Knife = ({ code, label, abs, mutate, re, wantDetail }) => {
          const before = readFileSync(abs, 'utf8')
          const h0 = sha256Of(abs)
          const mutated = mutate(before)
          if (mutated === before) {
            push('FCAP-M3-CANNOT-BUILD', `M-3 刀 ${code} 没改成（落点不在）：${label} —— 不许当成"红了"或"绿了"`)
            return
          }
          writeFileSync(abs, mutated, 'utf8')
          const red = readCap(`m3_${code}_red`)
          const row = capRowOf(red.section, re)
          rec.readings[`m3_${code}_red_row`] = { mark: row?.mark ?? null, detail: (row?.detail ?? '').slice(0, 600) }
          if (red.section === null) {
            push('FCAP-NO-CAP-LINE', `M-3 刀 ${code} 之后没有「文件长度」那一族`)
          } else if (row === null) {
            push('FCAP-NO-CAP-LINE', `M-3 刀 ${code} 之后没有「${label}」那一行`)
          } else {
            if (row.mark !== 'RED') push(`FCAP-M3-${code.toUpperCase()}-NOT-RED`, `M-3 刀 ${code}（${label}）应把这一条打红 —— 实得 ${row.mark}：${row.detail.slice(0, 300)}`)
            if (wantDetail !== undefined && !wantDetail.test(row.detail)) push(`FCAP-M3-${code.toUpperCase()}-WHY`, `M-3 刀 ${code} 红了，但红因没点名「${wantDetail}」：${row.detail.slice(0, 300)}`)
            // 刀只许红这一条：另两条 M-3 行必须还是 ok（不拿别的红冒充这一刀）
            for (const [other, otherRe] of M3_ROWS) {
              if (other === code) continue
              const r2 = capRowOf(red.section, otherRe)
              if (r2 === null || r2.mark !== 'ok') push(`FCAP-M3-${code.toUpperCase()}-COLLATERAL`, `M-3 刀 ${code} 只该红「${label}」，可另一条也变成了 ${r2 === null ? '（没有这一行）' : r2.mark}`)
            }
          }
          writeFileSync(abs, before, 'utf8')
          if (sha256Of(abs) !== h0) push('FCAP-M3-REVERT', `M-3 刀 ${code} 还原后 sha 与改前不等 —— 字节没还原干净（${abs}）`)
          const back = readCap(`m3_${code}_back`)
          const backRow = capRowOf(back.section, re)
          rec.readings[`m3_${code}_back_row`] = { mark: backRow?.mark ?? null, detail: (backRow?.detail ?? '').slice(0, 600) }
          if (back.section === null) {
            push('FCAP-NO-CAP-LINE', `M-3 刀 ${code} 还原之后没有「文件长度」那一族`)
          } else if (backRow === null || backRow.mark !== 'ok') {
            push(`FCAP-M3-${code.toUpperCase()}-NOT-GREEN`, `M-3 刀 ${code} 还原之后「${label}」应回绿 —— 实得 ${backRow === null ? '（没有这一行）' : backRow.mark}：${(backRow?.detail ?? '').slice(0, 300)}`)
          }
        }

        // H · README.md 贴两行上限（漏口 1：这两个根此前在 `capDocs` 之外）
        m3Knife({
          code: 'h',
          label: '② 第二张表',
          abs: path.join(fx, 'README.md'),
          mutate: (before) => `${before}\n| ${schemeRows[0][0]} | ${schemeRows[0][1]} |\n| ${schemeRows[1][0]} | ${schemeRows[1][1]} |\n`,
          re: /上限表只有一处 ②/,
          wantDetail: /README\.md/,
        })
        // I · §② 两行数字对调（漏口 2：④ 旧口径只比排序多重集）
        m3Knife({
          code: 'i',
          label: '④ 逐类',
          abs: schemeAbs,
          mutate: (before) => {
            let out = before
            for (const [self, other] of [[0, 1], [1, 0]]) {
              out = out.replace(`| ${schemeRows[self][0]} | ${schemeRows[self][1]} |`, `| ${schemeRows[self][0]} | ${schemeRows[other][1]} |`)
            }
            return out
          },
          re: /上限表只有一处 ④/,
          wantDetail: /按类/,
        })
        // J · 把一个 glob 抄进 §17.7（漏口 3：③ 旧口径只切 §17.2）
        m3Knife({
          code: 'j',
          label: '③ glob',
          abs: path.join(fx, 'CONTRACT.md'),
          mutate: (before) => {
            const anchor = '- **不拆**任何文件：拆分是那批票的事，这一节只立判据与读数。'
            if (!before.includes(anchor)) return before
            return before.replace(anchor, `${anchor}\n- 判据只看 \`presets/agenia/team/*.md\` 这一面。`)
          },
          re: /上限表只有一处 ③/,
          wantDetail: /第二份适用面/,
        })
      }

      caseFail(problems)
    })
  })
})
