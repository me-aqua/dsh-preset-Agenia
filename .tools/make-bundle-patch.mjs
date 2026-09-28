/**
 * 从 `presets/agenia/agent.cordis.yml` 生成**内联版**的 bundle 补丁。
 *
 * 为什么要生成而不是手写：那份组合是**唯一来源**，补丁里那一份必须是它的派生物 ——
 * 这个脚本就是那条"派生"关系的可执行形态（改完 .yml 跑一次它，两份永远一致）。
 *
 * 用法：<node> .tools/make-bundle-patch.mjs [--check]
 *   · 不带参数：写 `presets/agenia/cordis.patch.yml`
 *   · `--check`：只对账，不一致就退出 1（体检脚本调它）
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PRESET = join(REPO, 'presets', 'agenia')
const SOURCE = join(PRESET, 'agent.cordis.yml')
const TARGET = join(PRESET, 'cordis.patch.yml')

/**
 * 注入器那一行的行名 —— **必须写绝对的 `file:///` URL，不能写 `./inject.js`**。
 *
 * ⚠️ 2026-09-28 实测（真 web 档）：写成 `./inject.js` 时那一行报
 * `persona-injector (./inject.js): never started` —— 整份预设因此判 broken。
 * 相对路径是按**调起进程的工作目录**解析的，不是按补丁文件所在目录
 * （`presets/agenia/cordis.patch.yml` 只是 bundle 的入口，插入的行归 profile 的加载器管）。
 *
 * ⚠️ **这是整个仓库里唯一一处写死 E: 的地方** —— 换机器 / 换目录，改这一行。
 * （旧写法 `./inject.js` 依赖"补丁文件就在预设文件夹里"，那是 `cordis:include` 时代的性质，
 *   include 一去掉就不成立了 —— 见下面那段注释。）
 */
const INJECTOR = 'file:///E:/Harness/presets/agenia/inject.js'

/**
 * 内容目录 —— 跟上面同一个理由，**也必须写绝对路径**。
 *
 * `inject.js` 默认拿 `ctx.baseUrl` 当内容根（`presetDir()`）。内置时那个值是
 * **调起进程的工作目录**，不是预设文件夹 —— 于是 `persona.md` / `team/*.md` 全都读不到，
 * 而它**不报错**：那一行照样 active，只是每一段都静默不注入（实测 stderr 里那一串
 * `leaderOrder 里的「persona」找不到对应文件` 就是它）。
 * ⇒ 显式把 `contentDir` 写死，把位置从"解析出来的 baseUrl"改成"这一行说了算"。
 * ⚠️ 同 INJECTOR：换机器 / 换目录，这两行一起改。
 */
const CONTENT_DIR = 'E:/Harness/presets/agenia'

/**
 * 把组合本体切成"顶格 `- ` 开头的行块"。
 * 只认**行首**的 `- `：缩进的那些是行的内部（config 块、注释）。
 */
function splitRows(text) {
  const blocks = []
  let cur = null
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    if (/^- /.test(line)) {
      if (cur !== null) blocks.push(cur)
      cur = [line]
    } else if (cur !== null) {
      cur.push(line)
    }
  }
  if (cur !== null) blocks.push(cur)
  return blocks.map((block) => {
    while (block.length > 0 && block[block.length - 1].trim() === '') block.pop()
    return block.join('\n')
  })
}

const ids = (text) => (text.match(/^\s*- id: .+$/gm) ?? []).map((l) => l.trim().slice(6).trim())

export function build() {
  const source = readFileSync(SOURCE, 'utf8')
  const blocks = splitRows(source).map((block) => {
    if (!/^- id: persona-injector\s*$/m.test(block)) return block
    // 只动 `persona-injector` 这一行（`planning` / `compaction` 那种组的 config 是**列表**，
    // 往里插键会把 YAML 插坏 —— 第一版就是那么挂的，报 bad indentation）。
    return block
      .replace(/^(\s*name:\s*)'\.\/inject\.js'\s*$/m, `$1'${INJECTOR}'`)
      // 锚在 `leaderOrder:` 上（它是这一行 config 的第一个键），把 contentDir 插在它前面。
      .replace(/^(\s*)leaderOrder:\s*$/m, (m, indent) => `${indent}contentDir: '${CONTENT_DIR}'\n${m}`)
  })
  const INDENT = ' '.repeat(10) // 对齐到 `plugins:` 下面的 `- id:`（见下面模板）
  const body = blocks
    .map((block) => block.split('\n').map((l) => (l.trim() === '' ? '' : INDENT + l)).join('\n'))
    .join('\n')

  // 那一行仍然写相对路径：插入行的相对路径按**这份补丁所在目录**解析，
  // 而这份补丁就在预设文件夹里（profile 里那个 junction 指回 E:\Harness\presets\agenia）。
  // ⚠️ 它**不再**走 `cordis:include`，所以"按被包含文件解析"那条性质不适用了 ——
  //    解析基准变回"补丁文件所在目录"，而那个目录就是预设文件夹本身，结论一样。
  const text = `# Agenia 作为一个 DSH bundle 的补丁文件 —— 这份预设的**注册入口**。
#
# ── 为什么需要它（2026-09-28 换版）─────────────────────────────────────────
# DSH 0.1.7 起，"用户预设"的发现机制整个换掉了：
#   · 以前：往 profile 的 cordis.patch.yml 里登记一个 \`roots\` 目录，由扫描器去扫目录里
#     的 agent.cordis.yml（那一行的 id 叫 \`agent-presets\`）。
#   · 现在：**没有任何东西会扫目录**（框架自己的 skill 原话：Nothing reads that
#     directory any more —— 连 ~/.dsh/.agent-presets/ 一起作废）。
#     一份预设 = 一行 @deepseek-ai/dsh-agent-preset 声明，由某个 bundle 的补丁带进来。
#   ⇒ 旧的 \`agent-presets\` 行与 \`roots\` 键在新版里**根本不存在**，写它只会得到一句
#     \`patch: entry %C not found\` 然后被跳过。症状：预设菜单里**只剩出厂那四个**
#     （standard / ptc / minimal / cordis）—— 2026-09-28 真发生过一次。
#
# 出厂那四份就是这个形状，住在 @deepseek-ai/dsh-web-app/presets/<id>.patch.yml。
# 照抄它，别自己发挥。装法见同目录的 说明.md「怎么装」。
#
# ── 🔴 为什么下面那些行是**内联**的，而不是 \`cordis:include\` 进来的 ──────────────
# 2026-09-28 实测（在**真 web 档**里读的注册表）：
#
#   standard / ptc / minimal / cordis : generation=true  行=32/33/7/33  broken=无
#   我们这份（include 写法）           : generation=false 行=-        broken=persona… never started
#   同一个组合本体、同一个位置、内联   : generation=true  行=1        broken=无
#
# —— **\`cordis:include\` 在预设里挂不起来**：那份补丁的全部行都停在"等宿主服务"，
#    整份预设被判 broken（菜单里那条**被 UI 藏掉**，所以症状是"压根看不见 Agenia"）。
#    出厂四份预设**没有一份**用 include，它们的 plugins 全是内联的。这一条在无头档里
#    也同样复现（那里是 29 行全废）。⇒ **别再改回 include。**
#
# ⚠️ 所以这份文件是 \`agent.cordis.yml\` 的**派生物**：
#    那份仍是唯一来源，这份由 \`.tools/make-bundle-patch.mjs\` 生成 ——
#    **改了 agent.cordis.yml 就跑一次它**，体检脚本有一条断言盯着两份是否一致。
#
# ⚠️ 下面那个 \`persona-injector\` 的行名与 \`contentDir\` 都是**绝对路径**，
#    两处都由生成器改写（见 \`.tools/make-bundle-patch.mjs\` 里 INJECTOR / CONTENT_DIR 两段说明）：
#      · 行名写 \`./inject.js\` ⇒ 那一行 never started ⇒ **整份预设 broken**（实测）
#      · 不写 contentDir   ⇒ 那些 .md 全读不到，**而且不报错**（静默注入 0 字符）
#    ⇒ **换机器 / 换目录，改生成器里那两行，再跑一次生成器。**
- insert:
    - id: preset-agenia # 行名按约定写 preset-<预设 id>
      name: '@deepseek-ai/dsh-agent-preset'
      config:
        id: agenia # 预设 id：小写字母、数字、短横线
        name: Agenia 模式 # 菜单里显示的名字（旧 preset.yml 那一份搬到这里了）
        description: 带班子的工程组长。她自己分诊、派人、验收；手下五个固定岗位按次序干活，只审不改的岗位碰不到源码。
        order: 10 # 名册里的位置：出厂四个是 1..4，我们排在它们后面
        plugins:
${body}
`
  // 对账：`plugins:` 那一层里**拷进来多少个 `- id:`**，必须与源文件一致。
  // 判据用"缩进 10 格"就够 —— 拷进来的行都在那一层，而组内的子行缩得更深，
  // 它们跟着父行一起搬，不单独算（数量对得上就说明没漏搬）。
  const copied = (body.match(/^ {10}- id: /gm) ?? []).length
  return { text, sourceRows: ids(source).length, copied, blocks: blocks.length }
}

const isCheck = process.argv.includes('--check')
const { text, sourceRows, copied, blocks } = build()

if (isCheck) {
  let current = ''
  try {
    current = readFileSync(TARGET, 'utf8')
  } catch {
    current = ''
  }
  const same = current === text
  console.log(same
    ? `  ok   cordis.patch.yml 与 agent.cordis.yml 一致（${blocks} 条顶格行 / 拷进来 ${copied} 个 id）`
    : `  RED  cordis.patch.yml 与 agent.cordis.yml 对不上 —— 改了 .yml 就跑 <node> .tools/make-bundle-patch.mjs`)
  process.exit(same ? 0 : 1)
}

writeFileSync(TARGET, text, 'utf8')
console.log(`写出 ${TARGET}`)
// ⚠️ 这两个数**本来就不相等**，不是一个"对不上"：
//    `copied` 数的是**顶层行块**（20 条），`sourceRows` 数的是**全部 `- id:`**（38 个，
//    含 planning / compaction / delegation 三个组里的子行与 5 条 team-*）。
//    别拿它们互相比 —— 真正的对账是 `--check` 那条（整份文本逐字比）。
console.log(`  顶层行块 ${blocks} 条 · 补丁里拷进来 ${copied} 条 · 源文件共 ${sourceRows} 个 id（含组内子行）`)
