#!/usr/bin/env node
/**
 * `unmount-host-row` —— 把「某一行是宿主级」这个事实，在**它所有的载体上**一起改掉，并让生成器
 * 重新产出补丁；`--restore` 是它的逆。
 *
 * 一句话：宿主级这套设计有**两份文件、三处载体**（少改一处，生成器自己就拒）：
 *
 *   | 载体 | 文件 | `--apply` 之后 | `--restore` 之后 |
 *   | --- | --- | --- | --- |
 *   | A · 标记 | `presets/agenia/agent.cordis.yml` 的行块（`- id:` 的下一行、两格缩进） | `  # @host-level` 不在 | 在 |
 *   | B · 名单 | `.tools/make-bundle-patch.mjs` 的 `HOST_LEVEL_IDS` | id 不在里面 | 在里面 |
 *   | C · 行字段 | 同一行块（`config` 的兄弟键） | `  disabled: true` 在 | 不在 |
 *
 * 为什么 C 也在这条命令的范围里：生成器只放「关着的客户端 UI 行」进预设体
 * （`KNOWN_CLIENT_UI_IN_PRESET` 要 `{id, package, disabled: true}` 三格全中，`:143-150`；缺 C 就
 * `E_BUNDLE_CLIENT_UI_ENABLED`，`:450`）。撤下宿主级之后那一行就落回预设体，所以
 * `{insert: 0, preset_bodies: 2}` 这个落点**只有三处一起改才到得了**。
 *
 * ## 入口态（只认两个规范态；其余一律拒绝）
 *
 *   M（挂载）= A 在 · B 有 · C 没有；U（撤下）= A 不在 · B 没有 · C 有。
 *   `--apply` 只接 M、目标 U；`--restore` 只接 U、目标 M。入口已经是目标态时，要**两道签字**
 *   才敢报 `UMH-NOOP`：
 *     ① **落点**：盘上补丁的落点必须等于这一步的目标落点，否则 exit 1 + `E_UNMOUNT_PATCH_STALE`
 *        （"三处载体翻过了、补丁没跟着翻" —— 上一次跑到生成器那一步被打断）；
 *     ② **派生**：落点对了，再让生成器自己 `--check` 一次（**只读**、不写一个字节）：盘上补丁必须与
 *        "当前组合 + 名单"派生出来的那一份**逐字节相同**。这一道有**三个**出口，不许把前两个读成一个：
 *          · 读得出来 + 相同      ⇒ 签字通过（`UMH-NOOP`）；
 *          · 读得出来 + 不相同    ⇒ exit 1 + `E_UNMOUNT_PATCH_NOT_DERIVED`（半截 / 被换过的字节）；
 *          · **读不出来**          ⇒ exit 1 + `E_UNMOUNT_PATCH_UNREADABLE`（`EACCES` / `EBUSY` /
 *            被换成目录 …；报文点名是哪一种）。生成器自己的 `--check` 把"读不出来"折成"不相等"
 *            （`make-bundle-patch.mjs:1150-1156` 的 `catch { current = '' }`），所以本工具**自己**
 *            先读一次再判 —— 「我没有权限读」不是「你的补丁是伪造的」，值班的人该去修权限/占用，
 *            而不是重跑生成器。
 *        （落点是从文本里**读**出来的两个数，不是**派生**出来的字节：杀在生成器自己的写里会留下
 *        "两行 `- id` 都在、尾巴没了"的半截补丁，落点照样读作 `{0,2}`。）
 *   三个拒都是 `changed: 0`、一个字节都不写、不回滚（第二道只多跑一次只读的 `--check`）。
 *   其余六种组合 ⇒ **exit 2**、`changed: 0`、**一个字节都不写、生成器一次都不调用**，
 *   码点名是哪个载体不在位（`E_UNMOUNT_MARKER_MISSING` / `E_UNMOUNT_LIST_MISSING` /
 *   `E_UNMOUNT_ROW_DISABLED` / `E_UNMOUNT_ROW_NOT_DISABLED`）。
 *   拒绝必须发生在任何写之前：把前置检查外包给生成器 = 让一棵已经写了一半的树去抛，
 *   那时盘上的证据已经毁了。
 *
 * ## 一次 `--apply` / `--restore` 的次序
 *
 *   ① 三处载体先在**内存里**算好（算不出来 ⇒ 还没写就失败）；
 *   ② 写组合、写生成器；
 *   ③ **就地**跑 `<repo>/.tools/make-bundle-patch.mjs`（不 import 它 —— 它加载即 `build()` +
 *      `writeFileSync(TARGET, …)`；只读写它的文本）；
 *   ④ 回读补丁，自己数一遍落点，必须等于
 *      `--apply` 的 `{insert:0, preset_bodies:2}` / `--restore` 的 `{insert:1, preset_bodies:0}`；
 *      **no-op 那条路也数，而且数两遍**：先落点（不符 ⇒ exit 1 + `E_UNMOUNT_PATCH_STALE`），
 *      再跑一次 `<repo>/.tools/make-bundle-patch.mjs --check` 对账"补丁 = 派生物"
 *      （读得出来但不相同 ⇒ exit 1 + `E_UNMOUNT_PATCH_NOT_DERIVED`；读不出来 ⇒ exit 1 +
 *      `E_UNMOUNT_PATCH_UNREADABLE`）。三条都不写、不回滚；这一跑只多一次只读子进程。
 *   ⑤ 任一步失败 ⇒ 组合、生成器、补丁三份文件逐字节回到跑之前（补丁本来是派生物，回滚也要一起回，
 *      否则恢复后的载体与被污染的补丁对不上），exit 1 + `E_UNMOUNT_STEP_FAILED`。
 *
 * ## 写盘：一份文件是"原子换"的，不是原地覆写
 *
 *   组合与生成器（以及回滚时那三份）都用 `presets/agenia/lib/atomic.mjs` 的
 *   `writeFileAtomic(file, data)` 换上去：同目录临时件 → `fsync` → `rename`。
 *   为什么不用裸 `writeFileSync`：它先截断再顺序写，被杀在中间会把**一个文件**劈成两半
 *   （组合里标记已经删了、`disabled` 还没写上）—— 那正是"两份文件、三处载体"最坏的半截形状。
 *   这份依赖是**运行期**依赖（相对路径 import，不往上爬）：它跟生成器那三份一样，属于"这棵树里
 *   工具要读的文件"，所以判据的副本也带上它（`tests/agenia-upgrade/support/unmount-host-row.mjs`
 *   的 `copyFixture()`）—— 少这一份，副本里的工具会**加载即失败**（`ERR_MODULE_NOT_FOUND`）。
 *
 * ⚠️ 这几份文件的写**不是一次事务**：两次 rename 之间被杀仍会留下"两个一致、一个不一致"。
 *    **三种半截各有具名出口，没有一个会被记成 `UMH-NOOP` exit 0**：
 *      · 载体不一致（只写完一份）          ⇒ 入口态判出来：exit 2 + 点名的载体码；
 *      · 载体一致、补丁落点不对（旧补丁）  ⇒ exit 1 · `E_UNMOUNT_PATCH_STALE`；
 *      · 载体一致、落点对但补丁是半截 / 被换过的字节 ⇒ exit 1 · `E_UNMOUNT_PATCH_NOT_DERIVED`
 *        （只有生成器自己的 `--check` 看得见这一种：落点那两个数是从文本里读出来的，
 *        截断落在行边界上时它照样读作 `{0,2}`）。
 *    ⚠️ 生成器写补丁仍是它自己的 `writeFileSync`（不是原子的，本工具**不**替它写）：
 *    所以本工具保证的是"半截补丁不会被读成 no-op"，**不是**"半截补丁不会出现"。
 *    另一种残渣：被杀在 `writeFileAtomic` 的 write 与 rename 之间，目标文件还是旧字节
 *    （rename 没发生），只多一个 `<目标>.tmp-<pid>-<rand>` 临时件。本工具读完两份文本、
 *    判入口态之前先扫掉这三份目标的这种残渣：只删 **pid 已死** 的；pid 还活着的那一份可能是
 *    并发的一跑，不碰。所以 no-op / 拒绝 / 回滚的**产品字节**不变，清掉的只是本工具自己的残渣。
 *
 * ## 根在哪
 *
 * **只有 `--repo <root>`**：全部读写都在它里面。不从 `import.meta.url` 往上爬、不调 git、
 * 不看环境变量 —— 判据把它跑在**没有 `.git` 的副本**上，往上爬会写到活树。
 * 唯一的例外是**位置旁证**（`.team/state/unmount/<id>.json`）：那也在 `--repo` 里面，只是住在
 * 队伍工具状态那一层（见下节），不属于三份产品文件。
 *
 * ## 位置旁证：`--restore` 凭什么插回原位
 *
 *   `--apply` 在写任何产品字节之前，把 id 在名单里的**原始下标**写进
 *   `<repo>/.team/state/unmount/<id>.json`（`id` 按 `encodeURIComponent` 编码；`.team/` 是队伍
 *   工具状态、被 `.gitignore` 挡着，测试副本里没有它，工具自己建）：
 *
 *     { schema: 1, id, index, list_length, list_items: [...], applied_at }
 *
 *   `--restore` 读它，按那个下标插回原来的位置。旁证缺 / 读不出来 / 形状不对 / id 对不上 ⇒
 *   **退回表尾追加**，而且**在输出里说出来**（stdout 的 `restore_position.source` = `tail` +
 *   `reason`；人话同时走 stderr）—— 静默退回就是这一格的病。
 *   成功的那一次 `--restore` 删掉旁证（并清掉空出来的目录）；回滚时旁证也回到跑之前
 *   （本来没有就删掉），免得下一次 apply 读到别人的位置。
 *   旁证**不进** `changed` / `rollback.drifted`：那两格数的是三份**产品**文件。
 *
 * ## 用法与退出码
 *
 *   node .tools/unmount-host-row.mjs --repo <root> --id <row id> --apply
 *   node .tools/unmount-host-row.mjs --repo <root> --id <row id> --restore
 *
 *   0 成功（含 no-op）· 1 失败：`E_UNMOUNT_STEP_FAILED`（`rolled_back` 只认"回滚跑过、且三份逐字节
 *   回到跑之前"：回滚成功 ⇒ `true`；没做到 ⇒ `false` + `rollback.drifted` 点名；**还没写盘就失败** ⇒
 *   `false` + `rollback.nothing_written: true`）· `E_UNMOUNT_PATCH_STALE`
 *   （no-op 落点不符）· `E_UNMOUNT_PATCH_NOT_DERIVED`（no-op 落点对、但补丁读得出来且不是派生物：
 *   半截 / 被换过）· `E_UNMOUNT_PATCH_UNREADABLE`（补丁**读不出来**：`EACCES` / `EBUSY` / 被换成目录，
 *   报文点名机制）。后三个都是 `rolled_back: false`、这一跑一个字节都没写（第二个只多一次只读的
 *   `--check`）· 2 拒绝（入口态不是规范态）· 3 用法 / 环境
 *
 *   这条命令只改**盘上的三处载体与补丁**：撤 / 恢复之后面板在不在**不在这里判**——那一格是 R5 的
 *   实机验证（撤完要重启宿主客户端、恢复后再重启一次），本命令不读 GUI、不重启任何东西。
 *
 * stdout 恰好一行 JSON（`schema` / `action` / `id` / `repo` / `code` / `changed` /
 * `row_landing` / `carrier` / `failed_step` / `rolled_back` / `rollback` / `restore_position`）；人话走 stderr。
 *
 * `changed` 数的是**这一跑结束时仍与跑前快照不同的文件数**（组合 / 生成器 / 补丁三份逐字节比；
 * 不是"尝试写了几次"）—— 成功写盘 3、回滚成功 0、回滚没做到逐字节时 ≥ 1，那几份由 `rollback.drifted` 逐个点名。
 * `restore_position` 只在 `--apply` / `--restore` 真正跑成时非 null：`{ source: 'recorded' | 'sidecar' |
 * 'tail', index, list_length, reason? }` —— `recorded` = apply 记下的原下标，`sidecar` = restore 按旁证
 * 插回，`tail` = **没有可用旁证，退回表尾**（理由写在 `reason`）。
 *
 * 载体 B 的形状不钉：读的是 `HOST_LEVEL_IDS = … [ … ]` 这一个字面量，改的是它里面的项。
 * `--apply` 把 id 的**原始下标**记进位置旁证，`--restore` 按那个下标插回 —— 所以"来回一圈逐字节
 * 回原"不依赖名单里只有一条。
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmdirSync, statSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { writeFileAtomic } from '../presets/agenia/lib/atomic.mjs'

const EXIT = Object.freeze({ OK: 0, FAILED: 1, REFUSED: 2, USAGE: 3 })

/** 本工具碰的三份文件（相对 `--repo`）。 */
const REL = Object.freeze({
  composition: 'presets/agenia/agent.cordis.yml',
  generator: '.tools/make-bundle-patch.mjs',
  patch: 'presets/agenia/cordis.patch.yml',
})

/** 位置旁证的目录（`--repo` 相对）与**会自己清掉的层数**（unmount / state / .team）。 */
const SIDECAR_DIR = '.team/state/unmount'
const SIDECAR_TMP_LEVELS = 3

const MARKER_LINE = '  # @host-level'
/** 认与删**同一个谓词**：`readCarriers()` 认出哪几行，`editComposition()` 就只删那几行。 */
const MARKER_LINE_RE = /^ {2}#\s*@host-level\b/
const DISABLED_LINE = '  disabled: true'
const DISABLED_LINE_RE = /^ {2}disabled:\s*true\s*$/
/** 生成器的点名表字面量：前缀（到 `[`，含）+ 项列表 + `]`。 */
const LIST_RE = /(HOST_LEVEL_IDS\s*=\s*[^[]*\[)([\s\S]*?)\]/

/** 预设入口那一行的 `name`（补丁里用来区分"预设体"与"顶层 insert"）。 */
const REGISTRATION_NAME = '@deepseek-ai/dsh-agent-preset'

const indentOf = (line) => (/^[ ]*/.exec(line) ?? [''])[0].length

/** YAML 标量（只认这份组合里出现的形状：单/双引号、裸值、行尾注释）。 */
function plainScalar(raw) {
  const value = String(raw).trim()
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replace(/''/g, "'")
  if (value.startsWith('"') && value.endsWith('"')) {
    try { return JSON.parse(value) } catch { return value.slice(1, -1) }
  }
  return value.replace(/\s+#.*$/, '').trim()
}

// ── 参数 ──────────────────────────────────────────────────────────────────
/**
 * 只认这四样：`--repo <root>` / `--repo=<root>` · `--id <row id>` / `--id=<row id>` ·
 * `--apply` · `--restore`。多给 / 认不出的写法一律 usage（exit 3）——
 * 一个拼错的 `--restore` 不许静默变成"没给模式"。
 */
function parseArgv(argv) {
  const out = { mode: null, repo: null, id: null, errors: [] }
  const setOnce = (key, value, flag) => {
    if (out[key] !== null) out.errors.push(`${flag} 给了不止一次`)
    else out[key] = value
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i])
    if (arg === '--apply' || arg === '--restore') {
      const mode = arg.slice(2)
      if (out.mode !== null) out.errors.push(`--apply / --restore 只能给一个（已经给了 --${out.mode}）`)
      else out.mode = mode
      continue
    }
    if (arg === '--repo' || arg === '--id') {
      const value = i + 1 < argv.length ? String(argv[i + 1]) : null
      if (value === null || value.startsWith('--')) {
        out.errors.push(`${arg} 没有值`)
        continue
      }
      setOnce(arg.slice(2), value, arg)
      i += 1
      continue
    }
    const eq = /^--(repo|id)=([\s\S]*)$/.exec(arg)
    if (eq !== null) {
      const value = eq[2].trim()
      if (value === '') out.errors.push(`--${eq[1]}= 没有值`)
      else setOnce(eq[1], value, `--${eq[1]}=`)
      continue
    }
    out.errors.push(`不认识的参数：${arg}`)
  }
  return out
}

// ── 写盘：原子换一份文件（`presets/agenia/lib/atomic.mjs`）──────────────────
/**
 * 那个模块**不抛**：返回 `{ok:true, …}` 或 `{ok:false, code:'E_TXN_IO', message}`。
 * 这里只用它的两个实参形态（`writeFileAtomic(file, data)`，文本或 Buffer 都行；父目录它自己建），
 * 把"没写成"转成一次抛 —— 调用方（写载体 / 回滚）都包在同一条回滚账里，不许静默留下半截文件。
 */
function atomicWrite(file, data) {
  const result = writeFileAtomic(file, data)
  if (result.ok !== true) throw new Error(`${result.code ?? 'E_TXN_IO'}：${result.message ?? '原子写失败'}`)
}

// ── 位置旁证：`--apply` 记下原下标，`--restore` 按它插回 ────────────────────
/**
 * 旁证的落点（`--repo` 相对）：`.team/state/unmount/<encodeURIComponent(id)>.json`。
 *
 * 为什么在 `.team/` 里：那是**队伍工具状态**（被 `.gitignore` 挡着，不进提交、不进 CODE 指纹），
 * 而不是产品目录（`presets/` 与 `.tools/` 是可执行输入，账本不许住那儿）。
 * 编码 id：同一个 id 永远落同一份；`/` 这类分隔符不会把落点带出这一层。
 */
function sidecarPathOf(repo, id) {
  return path.join(repo, ...SIDECAR_DIR.split('/'), `${encodeURIComponent(id)}.json`)
}

/**
 * 清掉旁证之后空出来的目录（`unmount` → `state` → `.team`，最多三层）。
 * 只删**空**目录：真仓库里 `.team/state` 有别的账本、`.team` 有 README —— `rmdir` 会自己失败，
 * 那正是想要的（不碰别人的东西）。
 */
function pruneEmptyDirs(dir, levels = SIDECAR_TMP_LEVELS) {
  let cur = dir
  for (let i = 0; i < levels; i += 1) {
    try {
      rmdirSync(cur)
    } catch {
      return // 不空 / 不在 / 没权限 ⇒ 停在这里，别往上爬着删
    }
    cur = path.dirname(cur)
  }
}

/**
 * 读一份位置旁证。**读不出来 ≠ 没有旁证**，但两者的后果一样（退回表尾），
 * 所以 `reason` 必须说清是哪一种 —— 静默退回是这一格的病。
 *
 * @returns {{ok:true, index:number, list_length:number}|{ok:false, reason:string}}
 */
function readSidecar(file, id) {
  if (!existsSync(file)) return { ok: false, reason: `没有位置旁证（${SIDECAR_DIR}/${encodeURIComponent(id)}.json 不在）` }
  let raw
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'))
  } catch (err) {
    return { ok: false, reason: `位置旁证读不出来（${err?.code ?? err?.message ?? err}）` }
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: '位置旁证不是 JSON 对象' }
  if (raw.id !== id) return { ok: false, reason: `位置旁证记的是 ${JSON.stringify(raw.id)}，不是 ${JSON.stringify(id)}` }
  if (!Number.isInteger(raw.index) || raw.index < 0) return { ok: false, reason: `位置旁证的 index 不是非负整数（${JSON.stringify(raw.index)}）` }
  return { ok: true, index: raw.index, list_length: Number.isInteger(raw.list_length) ? raw.list_length : null }
}

/** 旁证只记"这一条原本在第几位"：原名单（保留引号写法）+ 时刻，读的人能自己核。 */
function sidecarRecordOf({ id, index, list, at }) {
  return {
    schema: 1,
    id,
    index,
    list_length: list.items.length,
    list_items: list.items,
    applied_at: at,
  }
}

/**
 * 清掉**上一次被杀时自己留下的临时件**：`writeFileAtomic` 的临时件名是
 * `<目标>.tmp-<pid>-<随机串>`（同目录，这样 `rename` 才是原子的）。
 *
 * 正常路径与回滚路径都不留残渣（失败分支自己 `unlink`）；只有被杀在 write 与 rename 之间才会
 * 剩一个。那一次 `rename` 没发生 ⇒ 目标文件还是旧字节，盘上多的只是一份垃圾。
 *
 * 只认这三份目标的同目录同名前缀，只删 **pid 已经不在** 的那一份：pid 还活着 ⇒ 可能是另一个
 * 正在写这一份文件的进程，删它等于拆并发保护（本工具没有锁，更不能顺手破坏别人的写）。
 *
 * @param {string[]} targets 三份目标的绝对路径
 * @returns {{removed:string[], kept:string[], failed:string[]}}
 */
function sweepTempResidue(targets) {
  const removed = []
  const kept = []
  const failed = []
  for (const target of targets) {
    const dir = path.dirname(target)
    const base = path.basename(target)
    let names = []
    try {
      names = readdirSync(dir)
    } catch {
      continue // 目录不在 ⇒ 没有可扫的
    }
    for (const name of names) {
      if (!name.startsWith(`${base}.tmp-`)) continue
      const hit = /^(\d+)-[0-9A-Za-z]+$/.exec(name.slice(base.length + '.tmp-'.length))
      if (hit === null) continue // 不是这个 writer 的形状 ⇒ 不碰
      const pid = Number(hit[1])
      if (!Number.isInteger(pid) || pid <= 0) continue
      let alive = true
      try {
        process.kill(pid, 0)
      } catch (err) {
        alive = err?.code === 'EPERM' // EPERM = 进程在、只是不归我管 ⇒ 算活着
      }
      if (alive) {
        kept.push(name)
        continue
      }
      try {
        unlinkSync(path.join(dir, name))
        removed.push(name)
      } catch (err) {
        failed.push(`${name}（${err?.code ?? 'UNKNOWN'}）`)
      }
    }
  }
  return { removed, kept, failed }
}

// ── 派生：生成器自己的 `--check`（只读）──────────────────────────────────
/**
 * 补丁这一份文件此刻**读不读得出来** —— 派生物判定的第三个出口。
 *
 * 为什么本工具要自己读一次：生成器 `--check` 里的 `catch { current = '' }` 把「读不出来」折成
 * 「不相等」（`make-bundle-patch.mjs:1150-1156`），而判据把 `--check` 的非零当成「不是派生物」。
 * 于是 `EACCES` / `EBUSY` / 被换成目录都会报成"你的补丁是伪造的" —— 一次失败归到了错的机制。
 * 三个出口各自有名字（读得出来+相同 / 读得出来+不同 / 读不出来），本函数负责第三格的**归因**。
 *
 * @param {string} abs
 * @returns {{readable:true, text:string}|{readable:false, mechanism:string, code:string|null}}
 */
function readPatchFile(abs) {
  let st
  try {
    st = statSync(abs)
  } catch (err) {
    return { readable: false, mechanism: `statSync ${err?.code ?? err?.message ?? err}`, code: err?.code ?? null }
  }
  if (st.isDirectory()) return { readable: false, mechanism: '这个路径现在是目录（补丁被换掉了）', code: 'EISDIR' }
  try {
    return { readable: true, text: readFileSync(abs, 'utf8') }
  } catch (err) {
    return { readable: false, mechanism: `readFileSync ${err?.code ?? err?.message ?? err}`, code: err?.code ?? null }
  }
}

/**
 * 盘上补丁是不是**当前组合 + 名单派生出来的那一份**。
 *
 * 跑的是生成器自己的 `--check`：它 `build()` 之后只把内存里那份文本与 `readFileSync(TARGET)`
 * 逐字节比（`--check` 那条路**不写文件**），所以这是一次只读调用 —— 与"写那条路"的生成器
 * 是同一个文件、同一条判据，不是本工具另造一个解析器。
 *
 * ⚠️ 这个返回值**只回答"读得出来 + 相等 / 读得出来 + 不相等"**：调用方必须先 `readPatchFile()`
 * 把"读不出来"那一格接走（它不在这里判，否则又折回一次失败的归因）。
 *
 * @param {{generatorAbs:string, repo:string}} spec
 * @returns {{ok:boolean, exit:number|null, detail:string}}
 */
function derivationCheck({ generatorAbs, repo }) {
  const check = spawnSync(process.execPath, [generatorAbs, '--check'], {
    cwd: repo,
    encoding: 'utf8',
    timeout: 180000,
    maxBuffer: 64 * 1024 * 1024,
  })
  if (check.error !== undefined) {
    return { ok: false, exit: null, detail: `起不来：${head(check.error?.message ?? check.error)}` }
  }
  if (check.status !== 0) {
    return {
      ok: false,
      exit: check.status,
      detail: head(check.stdout) || head(check.stderr)
        || `exit ${check.status}${check.signal ? ` signal=${check.signal}` : ''}`,
    }
  }
  return { ok: true, exit: 0, detail: '' }
}

// ── 文本：行块 / 三处载体 ──────────────────────────────────────────────────
/**
 * 行块：顶格 `- id: <id>` 那一行开始，到下一个顶格 `- ` 之前（含 EOF）。
 * @returns {{start:number, end:number}|null}  `end` 是**不含**
 */
function rowSpan(lines, id) {
  const start = lines.findIndex((line) => line.trim() === `- id: ${id}`)
  if (start < 0) return null
  let end = start + 1
  while (end < lines.length && !/^- /.test(lines[end])) end += 1
  return { start, end }
}

/** 点名表字面量：读出来的项（原始字符串，保留引号写法）+ 拼接用的位置。 */
function listLiteral(generatorText) {
  const hit = LIST_RE.exec(String(generatorText))
  if (hit === null) return null
  const items = hit[2].split(',').map((item) => item.trim()).filter((item) => item !== '')
  return { prefix: hit[1], items, body: hit[2], length: hit[0].length, index: hit.index }
}

/**
 * 三处载体的在 / 不在（外加 B 里这一项的下标 —— `--apply` 要把它记进位置旁证）。
 * @returns {{row_found:boolean, marker:boolean, disabled:boolean, listed:boolean, list_found:boolean,
 *            list_index:number|null, span:object|null, eol:string, lines:string[]}}
 */
function readCarriers({ compositionText, generatorText, id }) {
  const eol = compositionText.includes('\r\n') ? '\r\n' : '\n'
  const lines = compositionText.split(eol)
  const span = rowSpan(lines, id)
  const list = listLiteral(generatorText)
  const block = span === null ? [] : lines.slice(span.start, span.end)
  return {
    row_found: span !== null,
    marker: span !== null && block.some((line) => MARKER_LINE_RE.test(line)),
    disabled: span !== null && block.some((line) => DISABLED_LINE_RE.test(line)),
    listed: list !== null && list.items.some((item) => plainScalar(item) === id),
    list_found: list !== null,
    list_index: list === null ? null : list.items.findIndex((item) => plainScalar(item) === id),
    span,
    eol,
    lines,
  }
}

/**
 * 八种组合 → 两个规范态或一个具名拒绝。
 *
 * 优先级：① A 与 B 不一致 ⇒ 报**缺的那一个**；② 挂载态却关着；③ 撤下态却没关。
 * 不"顺手收拾"不一致的入口态 —— 那是工具替人决定要不要撤。
 *
 * @returns {{state:'M'|'U'}|{code:string, carrier:'marker'|'list'|'disabled'}}
 */
function classify({ marker, listed, disabled }) {
  if (marker !== listed) {
    return marker
      ? { code: 'E_UNMOUNT_LIST_MISSING', carrier: 'list' }
      : { code: 'E_UNMOUNT_MARKER_MISSING', carrier: 'marker' }
  }
  if (marker && disabled) return { code: 'E_UNMOUNT_ROW_DISABLED', carrier: 'disabled' }
  if (!marker && !disabled) return { code: 'E_UNMOUNT_ROW_NOT_DISABLED', carrier: 'disabled' }
  return { state: marker ? 'M' : 'U' }
}

/**
 * 组合侧的两处载体 —— **一张描述符表**（`bug-20261111-03` F6）。
 *
 * `apply` / `restore` 是同一骨架的镜像：目标态里**不该在**的那一行删掉、**该在**的那一行插上，
 * 只差"删哪一行、插哪一行、插在哪"。所以每一处载体在这里写一行：
 *   · `key` —— 这一处在 `changed` 里的名字（行块的两个格）；
 *   · `line` / `re` —— 要插的那一行 / 认要删的那一行的谓词（**同一份字面量**，别两处各写一个）；
 *   · `present` —— 它在**入口态**里是不是本来就在（`apply` 的入口是 M、`restore` 的入口是 U）：
 *     在 ⇒ 这一步删；不在 ⇒ 这一步插。目标态是镜像那一半，不需要第三个字段；
 *   · `at` —— 插哪儿：`after-id` = `- id:` 的下一行；`block-end` = 行块最后一个非空行之后。
 * 加第三种载体 = 加一行；两个循环、易错的"从后往前 splice"只在下面那一份实现里。
 */
const COMPOSITION_CARRIERS = Object.freeze([
  Object.freeze({ key: 'marker', line: MARKER_LINE, re: MARKER_LINE_RE, present: 'M', at: 'after-id' }),
  Object.freeze({ key: 'disabled', line: DISABLED_LINE, re: DISABLED_LINE_RE, present: 'U', at: 'block-end' }),
])

/**
 * 删掉行块里**所有**匹配 `re` 的行（从后往前，下标不漂）；返回删了几行。
 * `span` 每次现算：调用方可能刚刚改过这一块。
 */
function dropCarrierLines(lines, id, re) {
  const span = rowSpan(lines, id)
  if (span === null) throw new Error(`组合里没有 \`- id: ${id}\``)
  let dropped = 0
  for (let i = span.end - 1; i >= span.start; i -= 1) {
    if (re.test(lines[i])) {
      lines.splice(i, 1)
      dropped += 1
    }
  }
  return dropped
}

/** 把一行的描述符插进这一行块：`after-id` 紧接 `- id:`，`block-end` 在最后一个非空行之后。 */
function insertCarrierLine(lines, id, { line, at }) {
  const span = rowSpan(lines, id)
  if (span === null) throw new Error(`组合里没有 \`- id: ${id}\``)
  let index
  if (at === 'after-id') {
    index = span.start + 1
  } else {
    index = span.end - 1
    while (index > span.start && lines[index].trim() === '') index -= 1
    index += 1
  }
  lines.splice(index, 0, line)
}

/**
 * 组合侧的两处载体：按 `COMPOSITION_CARRIERS` 走一遍（删入口态里在的、插入口态里不在的）。
 * 只动这两行，其余字节原样保留；行尾换行跟原文一致（`eol`），所以 `--restore` 能逐字节回到 `--apply` 之前。
 *
 * 次序：**先删后插**（与两条腿原来的次序逐字节等价：删永远在前面，插的位置按改完之后的文本现算）。
 *
 * @returns {{text:string, changed:{marker:boolean, disabled:boolean}}}
 */
function editComposition({ carrier, id, mode }) {
  const { eol, lines, span } = carrier
  if (span === null) throw new Error(`组合里没有 \`- id: ${id}\``)
  const next = [...lines]
  const changed = { marker: false, disabled: false }
  const entryState = mode === 'apply' ? 'M' : 'U'
  for (const row of COMPOSITION_CARRIERS) {
    if (row.present === entryState) changed[row.key] = dropCarrierLines(next, id, row.re) > 0
  }
  for (const row of COMPOSITION_CARRIERS) {
    if (row.present !== entryState) {
      insertCarrierLine(next, id, row)
      changed[row.key] = true
    }
  }
  return { text: next.join(eol), changed }
}

/**
 * 生成器侧的点名表：拿掉（apply）/ 放回（restore）这一项。
 *
 * **定点改**那一个字面量，不整份重写 —— 判据会在生成器前面插一段见证抬头
 * （`UMH-05` 的注入器），整份重写会把抬头抹掉、失败注入就测不到任何东西。
 *
 * `--restore` 的落点是**位置旁证里的原下标**（`bug-20261110-16`）；没有可用旁证（`at === null`）
 * 才退回表尾**并说自己退回了**（`position.source = 'tail'`）—— 静默退回会让"精确的逆"在
 * 名单长到两条以上时悄悄不成立，而所有断言都还绿着。
 *
 * @param {string} generatorText
 * @param {string} id
 * @param {'apply'|'restore'} mode
 * @param {number|null} at 旁证里的原下标（只有 restore 用）
 * @returns {{text:string, changed:boolean, position:object|null, list:object}}
 */
function editList(generatorText, id, mode, at = null) {
  const list = listLiteral(generatorText)
  if (list === null) throw new Error('生成器里读不出 `HOST_LEVEL_IDS = … [ … ]` 这一个字面量')
  const found = list.items.findIndex((item) => plainScalar(item) === id)
  if (mode === 'apply' && found < 0) return { text: generatorText, changed: false, position: null, list }
  if (mode === 'restore' && found >= 0) return { text: generatorText, changed: false, position: null, list }
  let items
  let position
  if (mode === 'apply') {
    items = list.items.filter((_, index) => index !== found)
    position = { source: 'recorded', index: found, list_length: list.items.length }
  } else if (at === null) {
    // 没有可用旁证 ⇒ 退回表尾（与旧行为同形），但把"退回了"写在输出里。
    items = [...list.items, `'${id}'`]
    position = { source: 'tail', index: list.items.length, list_length: list.items.length }
  } else {
    const index = Math.min(at, list.items.length)
    items = [...list.items.slice(0, index), `'${id}'`, ...list.items.slice(index)]
    position = { source: 'sidecar', index, list_length: list.items.length }
  }
  const text = `${String(generatorText).slice(0, list.index)}${list.prefix}${items.join(', ')}]`
    + String(generatorText).slice(list.index + list.length)
  return { text, changed: true, position, list }
}

// ── 落点：只读生成器写出来的补丁文本（第二个读数，判据那边以补丁为准）──────────
/**
 * `row_landing` 的口径：补丁里 `id === <id>` 的行，`placement === 'insert'` 几条、
 * `in_preset_body === true` 几条。
 *
 * 判据的权威读法是 `tests/agenia-upgrade/support/client-ui-placement.mjs::describePlacement()`
 * （YAML 子树判位置）；这里是一个窄口径的行扫描器，只回答这两个数，产品工具不 import 测试支持。
 * 结构按生成器写出来的形状：顶层 `- insert:` 的直接成员是 4 格，预设体是 10 格。
 *
 * @returns {{insert:number, preset_bodies:number}}
 */
function rowLanding(patchText, id) {
  const lines = String(patchText).replace(/\r\n/g, '\n').split('\n')
  let topInsert = false
  let preset = null
  let insert = 0
  let presetBodies = 0
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (/^- insert:\s*(?:#.*)?$/.test(line)) { topInsert = true; preset = null; continue }
    if (/^- /.test(line)) { topInsert = false; preset = null; continue }
    const item = /^([ ]*)- (.*)$/.exec(line)
    if (item === null) continue
    const indent = item[1].length
    if (indent < 4) continue
    const isTopMember = indent === 4 && topInsert
    if (isTopMember) preset = null
    const idRaw = /^id:\s*(.+?)\s*$/.exec(item[2])?.[1] ?? null
    if (idRaw === null) continue
    const rowId = plainScalar(idRaw)
    // 行体：到下一个缩进 <= 本行的 `- ` 项为止（空行 / 注释跟着走）
    let end = i + 1
    while (end < lines.length) {
      const next = lines[end]
      if (next.trim() === '' || /^\s*#/.test(next)) { end += 1; continue }
      if (indentOf(next) <= indent) break
      end += 1
    }
    let name = null
    for (let j = i + 1; j < end; j += 1) {
      if (indentOf(lines[j]) !== indent + 2) continue
      const hit = new RegExp(`^ {${indent + 2}}name:\\s*(.+?)\\s*$`).exec(lines[j])
      if (hit !== null) { name = plainScalar(hit[1]); break }
    }
    if (isTopMember) preset = name === REGISTRATION_NAME ? rowId : null
    const placement = isTopMember ? 'insert' : indent > 4 ? (preset === null ? 'insert-nested' : 'preset-body') : 'other'
    if (rowId !== id) continue
    if (placement === 'insert') insert += 1
    else if (placement === 'preset-body') presetBodies += 1
  }
  return { insert, preset_bodies: presetBodies }
}

// ── 输出 ──────────────────────────────────────────────────────────────────
/** stdout 恰好一行 JSON；人话走 stderr。 */
function emit({ action, id, repo, code, changed, row_landing = null, carrier = null, failed_step = null, rolled_back = false, rollback = null, restore_position = null }, exit, human = null) {
  process.stdout.write(`${JSON.stringify({
    schema: 1,
    action,
    id,
    repo,
    code,
    changed,
    row_landing,
    carrier,
    failed_step,
    rolled_back,
    rollback,
    restore_position,
  })}\n`)
  if (human !== null) process.stderr.write(`${human}\n`)
  return exit
}

const head = (text, max = 900) => String(text ?? '').trim().split(/\r?\n/).slice(0, 6).join('\n').slice(0, max)

function usage(code, message, { action = null, id = null, repo = null }) {
  return emit({ action, id, repo, code, changed: 0 }, EXIT.USAGE, `${code} ${message}`)
}

// ── 主流程 ────────────────────────────────────────────────────────────────
function main() {
  const args = parseArgv(process.argv.slice(2))
  if (args.errors.length > 0) return usage('E_UNMOUNT_USAGE', args.errors.join('；'), args)
  if (args.mode === null) return usage('E_UNMOUNT_USAGE', '必须给 --apply 或 --restore（二选一）', args)
  if (args.repo === null) return usage('E_UNMOUNT_USAGE', '必须给 --repo <root>', args)
  if (args.id === null || args.id.trim() === '') return usage('E_UNMOUNT_USAGE', '必须给 --id <row id>', args)

  const id = args.id
  const repo = path.resolve(args.repo)
  const out = { action: args.mode, id, repo }
  const abs = {
    composition: path.join(repo, REL.composition),
    generator: path.join(repo, REL.generator),
    patch: path.join(repo, REL.patch),
  }
  if (!existsSync(repo) || !statSync(repo).isDirectory()) {
    return usage('E_UNMOUNT_REPO_MISSING', `--repo 指到的目录不存在：${repo}`, out)
  }
  for (const key of ['generator', 'composition']) {
    if (!existsSync(abs[key])) return usage('E_UNMOUNT_REPO_INVALID', `这棵树里缺 ${REL[key]}（${abs[key]}）`, out)
  }

  const base = {
    compositionText: readFileSync(abs.composition, 'utf8'),
    generatorText: readFileSync(abs.generator, 'utf8'),
  }
  const carrier = readCarriers({ ...base, id })
  if (!carrier.row_found) {
    return usage('E_UNMOUNT_UNKNOWN_ID', `组合里根本没有 \`- id: ${id}\` 这一行 —— 不许静默当 no-op`, out)
  }
  if (!carrier.list_found) {
    return usage('E_UNMOUNT_LIST_UNREADABLE', `生成器里读不出 \`HOST_LEVEL_IDS = … [ … ]\` 这一个字面量`, out)
  }

  // 判入口态之前先扫掉**自己上一次被杀**留下的临时件（只删这三份目标的、只删 pid 已死的）。
  // 它是残渣，不是证据；留着会让"文件集合"比产品应有的多一份。清不掉也不拦这一跑（只出声）。
  const swept = sweepTempResidue([abs.composition, abs.generator, abs.patch])
  if (swept.removed.length > 0) {
    process.stderr.write(`清掉上一次被杀留下的临时件 ${swept.removed.length} 个：${swept.removed.join(' · ')}\n`)
  }
  if (swept.failed.length > 0) {
    process.stderr.write(`临时件没清掉（不影响这一跑的判断）：${swept.failed.join(' · ')}\n`)
  }

  const verdict = classify(carrier)
  if (verdict.state === undefined) {
    return emit({
      ...out,
      code: verdict.code,
      changed: 0,
      carrier: verdict.carrier,
    }, EXIT.REFUSED, `${verdict.code} 入口态不是规范态（载体 ${verdict.carrier} 不在位）；`
      + '没有写任何字节，也没有调用生成器。')
  }

  // 入口已经是这一步的目标态 ⇒ 可能是 no-op。**不写、不跑写那条路的生成器**；先读盘上那份补丁。
  // 但"已经在目标态"这句话要**两道签字**：
  //   ① 落点：补丁的落点必须就是这一步的目标落点，否则那是「载体翻过了、补丁没跟着翻」
  //      （上一次跑到 ③ 被打断 / 并发的两个 --apply）；
  //   ② 派生：落点对**不等于**补丁是对的 —— 落点是从文本里读出来的两个数，杀在生成器自己的
  //      writeFileSync 里会留下"两行 `- id` 都在、尾巴没了"的半截补丁，落点照样读作 {0,2}。
  //      所以再让生成器自己 `--check` 一次（只读）：盘上那份必须与当前组合 + 名单派生的逐字节相同。
  // 🔴 ② 有三个出口，**读不出来**要先于"不相等"接走（`bug-20261111-02`）：生成器自己的 `--check`
  //    把读失败折成 `current = ''` ⇒ `same:false`，照它报就变成"你的补丁是伪造的"。
  // 三个拒都是 exit 1、一个字节都没写（第二道只多一次只读子进程），所以都不回滚。
  const target = args.mode === 'apply' ? 'U' : 'M'
  const want = args.mode === 'apply'
    ? { insert: 0, preset_bodies: 2 }
    : { insert: 1, preset_bodies: 0 }
  if (verdict.state === target) {
    if (!existsSync(abs.patch)) {
      return usage('E_UNMOUNT_PATCH_MISSING', `入口已经是目标态，但补丁文件不在：${abs.patch} —— 落点判不了`, out)
    }
    // 第三格先判：补丁读不出来 ⇒ 那是"判不了它是不是派生物"，不是"它不是派生物"。
    const readable = readPatchFile(abs.patch)
    if (!readable.readable) {
      return emit({
        ...out,
        code: 'E_UNMOUNT_PATCH_UNREADABLE',
        changed: 0,
        row_landing: null,
        failed_step: 'patch',
      }, EXIT.FAILED, `E_UNMOUNT_PATCH_UNREADABLE 入口已经是 --${args.mode} 的目标态，但盘上补丁**读不出来**：`
        + `${readable.mechanism}（${abs.patch}）—— 判不了它是不是"当前组合 + 名单"派生出来的。`
        + '这是读/占用/路径的问题，**不是**"补丁被伪造"：别急着重派生，先看权限与占用（或那个路径还是不是文件）。'
        + '没有写任何字节，也没有调用生成器。')
    }
    const landing = rowLanding(readable.text, id)
    if (landing.insert !== want.insert || landing.preset_bodies !== want.preset_bodies) {
      return emit({
        ...out,
        code: 'E_UNMOUNT_PATCH_STALE',
        changed: 0,
        row_landing: landing,
        failed_step: 'patch',
      }, EXIT.FAILED, `E_UNMOUNT_PATCH_STALE 入口已经是 --${args.mode} 的目标态，但盘上补丁的落点是 `
        + `${JSON.stringify(landing)}，不是 ${JSON.stringify(want)} —— 载体翻过了、补丁没跟着翻`
        + '（上一次跑到生成器那一步被打断，或补丁被换过）。没有写任何字节，也没有调用生成器：'
        + `重派生一次（node .tools/make-bundle-patch.mjs），或 --restore 退回挂载态再重来。`)
    }
    const derived = derivationCheck({ generatorAbs: abs.generator, repo })
    if (!derived.ok) {
      // 生成器跑失败了，再探一次"现在读不读得出来"：读不出来 ⇒ 归因到 unreadable（可能是那一次
      // `--check` 期间被占用 / 被换掉）；读得出来 ⇒ 才是"不是派生物"。
      const after = readPatchFile(abs.patch)
      if (!after.readable) {
        return emit({
          ...out,
          code: 'E_UNMOUNT_PATCH_UNREADABLE',
          changed: 0,
          row_landing: landing,
          failed_step: 'patch',
        }, EXIT.FAILED, `E_UNMOUNT_PATCH_UNREADABLE 入口已经是 --${args.mode} 的目标态、落点也读作 `
          + `${JSON.stringify(landing)}，但补丁**读不出来**：${after.mechanism}（${abs.patch}）。`
          + '判不了它是不是派生物；这是读/占用/路径的问题，不是"补丁被伪造"。没有写任何字节，也没有回滚。')
      }
      return emit({
        ...out,
        code: 'E_UNMOUNT_PATCH_NOT_DERIVED',
        changed: 0,
        row_landing: landing,
        failed_step: 'patch',
      }, EXIT.FAILED, `E_UNMOUNT_PATCH_NOT_DERIVED 入口已经是 --${args.mode} 的目标态、盘上补丁的落点也读作 `
        + `${JSON.stringify(landing)}，但那份补丁**不是**"当前组合 + 名单"派生出来的`
        + `（\`--check\` exit ${derived.exit}：${derived.detail || '无输出'}）—— 它是半截 / 被换过的字节`
        + '（杀在生成器自己的写里就会这样）。没有写任何字节，也没有回滚；只读地跑了一次 `--check`。'
        + `修法：重派生（node .tools/make-bundle-patch.mjs），然后再跑这次 --${args.mode}。`)
    }
    return emit({ ...out, code: 'UMH-NOOP', changed: 0, row_landing: landing }, EXIT.OK,
      `UMH-NOOP 入口已经是 --${args.mode} 的目标态；没有写任何字节（落点 ${JSON.stringify(landing)}`
      + ' · 补丁读得出来 · 生成器 `--check` exit 0）。')
  }

  // ① 三处改动先在内存里算好：任何一处算不出来 ⇒ 还没写就失败。
  //    restore 的插回位置只来自**位置旁证**（apply 记下的原下标）；没有可用旁证 ⇒ 退回表尾，
  //    并在 `restore_position` 与 stderr 里说出来（`bug-20261110-16`）。
  const sidecarAbs = sidecarPathOf(repo, id)
  let sidecarBefore = null
  try {
    if (existsSync(sidecarAbs)) sidecarBefore = readFileSync(sidecarAbs)
  } catch (err) {
    // 读不出来就当成"没有旁证"（restore 会退回表尾并说出来）；但这一句要出声，别让权限问题消失。
    process.stderr.write(`位置旁证读不出来（${err?.code ?? err?.message ?? err}）：${sidecarAbs}\n`)
  }
  const sidecarAt = args.mode === 'restore' ? readSidecar(sidecarAbs, id) : null
  let compositionEdit
  let listEdit
  try {
    compositionEdit = editComposition({ carrier, id, mode: args.mode })
    listEdit = editList(base.generatorText, id, args.mode, sidecarAt?.ok === true ? sidecarAt.index : null)
  } catch (err) {
    // 上面那两个编辑函数只改字符串、不碰盘 ⇒ 到这一刻盘上还是跑之前的样子：没有可回滚的东西。
    // `rolled_back` 只认"回滚跑过、且三份逐字节回到跑之前"，所以这一支是 `false`（报 `true` 是谎）；
    // `nothing_written` 把"一个字节都没写"写在明面上，`changed: 0` 才有据可查。
    return emit({
      ...out,
      code: 'E_UNMOUNT_STEP_FAILED',
      changed: 0,
      failed_step: 'marker',
      rolled_back: false,
      rollback: { ok: true, drifted: [], nothing_written: true },
    }, EXIT.FAILED, `E_UNMOUNT_STEP_FAILED 还没写盘就失败了（载体文本改不动）：${head(err?.message ?? err)}`
      + '—— 一个字节都没写，没有可回滚的东西（`rolled_back: false`）。')
  }
  // 🔴 **退回表尾必须出声**：旁证没给可用下标时 `editList()` 的 `position.source` 是 `tail`。
  if (args.mode === 'restore' && listEdit.position !== null && listEdit.position.source === 'tail') {
    process.stderr.write(`没有可用的位置旁证：${sidecarAt?.reason ?? 'restore 不需要旁证'} ⇒ `
      + '退回表尾追加（原下标不知道；名单里不止一条时，恢复后的顺序可能与 --apply 之前不同）\n')
  }

  // 回滚账：两份载体文件 + 补丁（补丁是派生物，失败时一起回，别留下与载体对不上的字节）。
  const snapshot = {
    composition: readFileSync(abs.composition),
    generator: readFileSync(abs.generator),
    patch: existsSync(abs.patch) ? readFileSync(abs.patch) : null,
  }
  /**
   * 三份目标与跑前快照的**逐字节**比对 —— `changed` 与 `rollback.drifted` 的**唯一来源**
   * （成功路径与回滚账共用这一个比较器，别在别处再写一遍）。
   *
   * 返回 repo 相对的路径，按 `REL` 的顺序（组合 / 生成器 / 补丁）。读不出来（权限没了 / 被换成目录）
   * 也算掉队：「证不成一致」与「不一致」在回滚账里是同一个答案 —— 这一份得有人去看。
   */
  const driftFromSnapshot = () => {
    const drifted = []
    for (const key of ['composition', 'generator', 'patch']) {
      let same
      try {
        same = snapshot[key] === null
          ? !existsSync(abs[key])
          : existsSync(abs[key]) && readFileSync(abs[key]).equals(snapshot[key])
      } catch {
        same = false
      }
      if (!same) drifted.push(REL[key])
    }
    return drifted
  }

  /**
   * 旁证也回到跑之前（本来没有 ⇒ 删掉并清空目录）。它**不进** `changed` / `drifted`：
   * 那两格数的是三份产品文件；旁证是队伍工具状态（见文件头「位置旁证」）。
   */
  const restoreSidecar = () => {
    try {
      if (sidecarBefore === null) {
        if (existsSync(sidecarAbs)) unlinkSync(sidecarAbs)
        pruneEmptyDirs(path.dirname(sidecarAbs))
      } else {
        atomicWrite(sidecarAbs, sidecarBefore)
      }
      return ''
    } catch (err) {
      return `；位置旁证没回到跑之前：${String(err?.message ?? err)}`
    }
  }

  const rollback = (failedStep, detail) => {
    let why = ''
    try {
      atomicWrite(abs.composition, snapshot.composition)
      atomicWrite(abs.generator, snapshot.generator)
      if (snapshot.patch === null) {
        if (existsSync(abs.patch)) unlinkSync(abs.patch)
      } else {
        atomicWrite(abs.patch, snapshot.patch)
      }
    } catch (err) {
      why = `；回滚本身失败：${String(err?.message ?? err)}`
    }
    why += restoreSidecar()
    // 回滚账在 **emit 这一刻现量**：`changed` 就是"还与跑前不同"的文件数 —— 回滚半路抛了也要数，
    // 否则 JSON 说 `changed: 0`、盘上却留着改过的字节，读的人会当场相信前一句。
    const drifted = driftFromSnapshot()
    const ok = drifted.length === 0
    return emit({
      ...out,
      code: 'E_UNMOUNT_STEP_FAILED',
      changed: drifted.length,
      failed_step: failedStep,
      rolled_back: ok,
      rollback: { ok, drifted },
    }, EXIT.FAILED, `E_UNMOUNT_STEP_FAILED 失败步骤 ${failedStep}：${detail}${why}`
      + `（${ok ? '三份文件已逐字节回到跑之前' : `回滚没做到逐字节 — 立刻人工看，这三份仍与跑前不同：${drifted.join(' · ')}`}）`)
  }

  // ①′ `--apply` 先记位置旁证（在任何产品字节之前；原子写，写不出来 ⇒ 还没写产品就不做）。
  if (args.mode === 'apply' && Number.isInteger(carrier.list_index) && carrier.list_index >= 0) {
    try {
      atomicWrite(sidecarAbs, `${JSON.stringify(sidecarRecordOf({
        id,
        index: carrier.list_index,
        list: listEdit.list,
        at: new Date().toISOString(),
      }), null, 2)}\n`)
    } catch (err) {
      return emit({
        ...out,
        code: 'E_UNMOUNT_STEP_FAILED',
        changed: 0,
        failed_step: 'state',
        rolled_back: false,
        rollback: { ok: true, drifted: [], nothing_written: true },
      }, EXIT.FAILED, `E_UNMOUNT_STEP_FAILED 记不下原位置（${sidecarAbs}）：${String(err?.message ?? err)}`
        + '—— 没有这份旁证，`--restore` 就回不到原位；所以产品字节一个都没写（`rolled_back: false`）。')
    }
  }

  // ② 写载体（两份都原子换：被杀在中间不会把一份文件劈成两半）。写失败也走同一条回滚。
  try {
    atomicWrite(abs.composition, compositionEdit.text)
    atomicWrite(abs.generator, listEdit.text)
  } catch (err) {
    return rollback('generator', `写载体文件失败：${String(err?.message ?? err)}`)
  }

  // ③ 就地跑生成器（不 import：它加载即 build() + writeFileSync）。
  const gen = spawnSync(process.execPath, [abs.generator], {
    cwd: repo,
    encoding: 'utf8',
    timeout: 180000,
    maxBuffer: 64 * 1024 * 1024,
  })
  if (gen.error !== undefined || gen.status !== 0) {
    return rollback('generator', `生成器 exit=${gen.status}${gen.signal ? ` signal=${gen.signal}` : ''}`
      + `：${head(gen.stderr) || head(gen.stdout) || String(gen.error ?? '')}`)
  }

  // ④ 自证落点：只认生成器写出来的那份补丁文本。读不出来 = 落点判不了（归因到"读不出来"，
  //    不折成"落点没翻面"），回滚仍要把三份与旁证带回去。
  if (!existsSync(abs.patch)) return rollback('verify', `生成器 exit 0，但补丁文件不在：${abs.patch}`)
  const written = readPatchFile(abs.patch)
  if (!written.readable) return rollback('verify', `生成器 exit 0，但补丁读不出来：${written.mechanism}（${abs.patch}）`)
  const landing = rowLanding(written.text, id)
  if (landing.insert !== want.insert || landing.preset_bodies !== want.preset_bodies) {
    return rollback('verify', `落点没翻面：补丁文本读出 ${JSON.stringify(landing)}，期望 ${JSON.stringify(want)}`)
  }

  // ⑤ 成功：`--restore` 把旁证删掉（并清空目录）；删不掉只出声，不把一次成功的恢复判成失败
  //    —— 产品字节已经对了，留着的那份旁证下一次 `--apply` 会覆盖它。
  if (args.mode === 'restore' && sidecarBefore !== null) {
    try {
      unlinkSync(sidecarAbs)
      pruneEmptyDirs(path.dirname(sidecarAbs))
    } catch (err) {
      process.stderr.write(`位置旁证没删掉（不影响这一跑的恢复）：${sidecarAbs}（${err?.code ?? err?.message ?? err}）\n`)
    }
  }

  // 成功这一路也现量（不是数"改了几处载体"）：`changed` 只有一个口径 —— 跑完之后仍与跑前不同的文件数。
  const changed = driftFromSnapshot().length
  const tailNote = listEdit.position !== null && listEdit.position.source === 'tail'
    ? `；**没有可用位置旁证，退回表尾追加**（${sidecarAt?.reason ?? '无旁证'}）`
    : ''
  return emit({
    ...out,
    code: args.mode === 'apply' ? 'UMH-APPLIED' : 'UMH-RESTORED',
    changed,
    row_landing: landing,
    restore_position: listEdit.position,
  }, EXIT.OK, `${args.mode === 'apply' ? 'UMH-APPLIED' : 'UMH-RESTORED'} 三处载体已改，`
    + `生成器 exit 0，落点 ${JSON.stringify(landing)}${tailNote}。`)
}

process.exit(main())
