/**
 * 尾巴返修（机制①落点 + 限长）+ 情绪模块的探针
 * —— 不重启 harness、不起会话、不花 token。
 *
 * 它验的东西（口径见 `.team/test/2026-09-26/技术契约-尾巴返修与情绪模块.md`）：
 *
 *   机制①「每 n 个工具结果」：只认 `tool/result`；n 写在 `presets/agenia/style.md`
 *          第一行 `<!-- every: N -->`；计数器在 `turn/start` 时清零；n=0 = 关掉机制①。
 *          🔴 **2026-09-26 返修后的落点**：`session/event` 里**只记账**（内存标记
 *          `pendingTail`），真正往请求里塞的那一下在 `agent/pre-step`，追加到**本步
 *          `decision.messages` 的末尾**。旧形态（窗口里 `agent.inject()`）撞
 *          `dsh-session` 的 `appending` 守卫（L1181），被 catch 吞成 warnOnce ⇒
 *          **真回合 0 次，而且静默**。R 族 + 假 ctx 的守卫（S 族）盯的就是它。
 *   机制②「老板开口之后、我第一次开口之前」：在 `agent/pre-step` 里看**这一步领到的
 *          `messages`** 里有没有老板那条（`source.kind === 'user'`）—— 有就把 style
 *          **插进本步的 messages**，紧跟在他那句话后面（它是好的，这一批不许退化）。
 *   尾巴限长：`tailText()` 按 `style.md` 里的 `<!-- 尾巴到此为止 -->` 切；**标记缺失
 *          或切出来是空 ⇒ 退回全文**（口径 7）。P 族。
 *   情绪模块：`moodOf(signals, constants)` **三维**打分（掌控 · 活力 · 亲密）+ 场景命中；
 *          分数行 + 例子拼在尾巴那条 style 后面；常数住在 `mood.md` 的 ```mood 块里
 *          （改它不用重启）。N / O / Q 族。
 *   🔴 **2026-09-26 第二批「情绪模块改三维」**：六维砍到三维（愉悦 / 唤起 / 新异 全删）、
 *      场景库 6 条砍到 3 条（他久别归来 · 一路绿到底 · 刚炸过）、掌控改吃**滑动窗口 + 错误指纹**、
 *      亲近改吃**重逢项 + 夸奖/骂**、疲劳改吃**当日 log 首条 → 净工作时长**。
 *      口径整表换成 `.team/leader/2026-09-26/方案-情绪模块改三维.md` 第五节那 18 条，
 *      契约 = `.team/test/2026-09-26/技术契约-情绪模块改三维.md`。
 *      ⚠️ **老那 149 条里被"事实变了"推翻的几条是改写、不是删**（见契约第八节那张表）：
 *      六维 → 三维、6 条场景 → 3 条，都是**事实动了**，不是判据松了。
 *      新族：`B` 掌控 · `C` 亲近 · `W` 关键词 · `K` 疲劳 · `U` 尾巴全长 · `F` 接线 ·
 *      `Y` 静默失效 · `X` 收官形状 · `S`（本批新增的 `S1`–`S14` 那一段）场景库与条数同步。
 *   🔴 **2026-09-26 第三批「情绪板改名 + 正反词 + 亲密基线」**（方案
 *      `.team/leader/2026-09-26/方案-情绪板改名与正反词.md`）：
 *      **改名**（`疲劳 → 活力` · `亲近 → 亲密`，键名 `fatigue`/`closeness` 不动）·
 *      **活力反算**（`1 − 净工时/满量程`：干得越久分越低）·
 *      **亲密基线 `.50`**（`closenessBase`，加法）· **每维正反词**（块里的 `words`，两侧都贴）。
 *      编号在新契约 `.team/test/2026-09-26/技术契约-情绪板改名与正反词.md` 里逐条对到方案第七节。
 *      ⚠️ 这一批**只动判据侧**（`presets/` 一个字没碰）：
 *      凡是"钉着旧名字 / 旧活力方向 / 旧亲密值 / 旧行形状"的期望值，改的是**事实**，不是把红改绿。
 *      🔴 **`口径 6` 那条 `E2-4` 是改写成新事实、不是删**（方案第六节 · 老板选了选项 B）：
 *      低重逢区间三格仍各不相同；**高重逢区间逐字验证"封顶在 1.00"**。
 *   🔴 **2026-10-20（`F-106` · 门 1）「判据不许钉在会变的东西上」** —— 两格：
 *      · **`I1`** 老写法 `check(…, Number(hit[1]), 3)` 把产物刻度写死在判据里。
 *        `style.md` 第一行 `every: 3 → 10` 之后它**假红**（事实是有意改的，判据没跟）。
 *        现在钉的是实质：**第一行那个数 = 实现实际用的刻度**（喂第 N 个结果才贴）。
 *        刻度从 0 / 1 / 20 三个副本验过：**跟着走、不红**；实现把刻度读错（`Math.min(N,5)`）
 *        ⇒ **只红 `I1`** 一格（`实测 5 / 期望 10`）。
 *      · **`G5`** 老期望 `cutTail(FIXTURE_STYLE(3))` 里的 `3` 与"真文件是 10"**无关**
 *        （`cutTail` 把注释剥掉，3 和 10 切出来逐字相同）—— 它那天红**不是**刻度漂移，
 *        是 `inject.js` 的 **F-102 时间行**（`现在 …（周X）`）进了 ① 到点那一刀，
 *        而期望值里没有它。现在：期望值取**实现读到的那份落盘正文**，时间行只认**形状**
 *        （值来自 `Date.now()`，钉值等于把判据钉在"跑的那一分"上）。
 *        那把时间行改形（去掉星期）⇒ **只红 `G5`** 一格。
 *      ⚠️ 这两格都**不是**"把红改绿"：改完的格子在刀下照样红（读数见
 *        `.team/test/2026-10-20/F-106/`，小刀与副本由 `make-mutants.mjs` 造）。
 *
 * 两条守门（位置问题，不是省钱问题）：
 *   守门 A：机制① 在"他刚说完、我还没开口"时不许触发。
 *   守门 B：机制② 刚摆过的那一个工具结果，机制① 跳过（不叠）。
 *
 * 跑法：<node.exe> .tools/inject-probe.mjs
 *   退出码：0 = 全过 · 1 = 有红 · 2 = 没红但有挂起（未验，≠ 通过）。
 *   每条断言都带口径编号，红的时候能直接对上方案第四节那 18 条。
 * 🔴 **夹具写在 `os.tmpdir()` 里，而 Windows 上那就是 `%TEMP%`**（这台机器 = **C 盘**）——
 *    与「C 盘一个字节都不许写」直接冲突。**跑之前把 `TEMP`/`TMP` 指到项目所在那个盘**，
 *    或者给 `AGENIA_PROBE_TMP=<那个盘上**已经存在**的目录>`（探针**不替你建目录**：建目录本身就是写；
 *    路径不在就让 `mkdtemp` 当场报 ENOENT）。落在 C 盘时它会当场印一行 `[探针] 🔴 …`
 *    （**出声不改行为** —— 真要挡住得改这条纪律的载体，不是探针）。
 *    ⚠️ 这一段是**票外改动**（`F-106` 第 4 关 `R-5` 点名），不算 `F-106` 的交付，另票裁。
 *
 * ⚠️ 它在一个**假的 ctx** 上挂真 `inject.js`，所以判据是"这段逻辑有没有按契约跑"，
 *    **不代替**挂载测试与真回合（见 .tools/mount-test/README.md）。
 * ⚠️ 假 ctx 按真 harness 的次序建模（`dsh-agent-loop` L889/L890/L894/L951/L1028）：
 *    **claim → 装配 → `agent/pre-step` → `step/start` → 这批 messages 落笔成 `user/message`**。
 *    🔴 **会话带 `appending` 守卫**（`dsh-session` L1181/L1191-1202）：
 *    派发 `session/event` 的那个窗口里，`agent.inject()` 必须**抛**
 *    `session append cannot reenter while another append is being published`。
 *    这个守卫 2026-09-26 之前**是缺的** —— 假 ctx 的 `inbox` 是纯数组，`inject()` 直接 push，
 *    永远不重入失败 ⇒ 机制① 死了一整天，三套工具全绿。S 族是它自己的阳性对照。
 * ⚠️ 它**一个字节都不改 `presets/`**：夹具正文住在临时目录里（`PROBE_TMP`，见上面那条 🔴），
 *    "改文件即生效"那一族量的是夹具，不是产物。
 * ⚠️ **时间全从参数进**（每条事件自带 `time`，`moodOf` 的 `now` 是入参）——
 *    否则断言会在半夜自己变红。
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const PRESET_DIR = join(REPO, 'presets', 'agenia')
/**
 * **产物那一块内容**（`style.md` / `mood.md` —— I 族与"产物场景库"读的那些）从哪儿读。
 * 默认就是 `presets/agenia`。
 * ⚠️ 允许用环境变量换掉，**用途只有一个**：红基线那一组对照实验
 *    （2026-09-26 返修加）——"**拿掉产物 `mood.md`** 或**换掉实现**之后，`O7`/`O8` 必须还红"。
 *    没有它，"改断言把红改没了"这件事**没法证伪**：产物内容在 `presets/` 里，而我不许碰那儿。
 */
const PRODUCT_DIR = process.env.AGENIA_PROBE_PRODUCT_DIR ?? PRESET_DIR
const STYLE_FILE = join(PRODUCT_DIR, 'style.md')
/**
 * 被测的入口。默认就是产物 `presets/agenia/inject.js`；
 * ⚠️ 允许用环境变量换掉，**用途只有两个**：
 *   ① 拿一份"照契约写的参考实现"把探针跑一遍，证明这一百多条期望是**自洽可达**的
 *      —— 也就是"红不是脚本自己写错"（阳性对照）。参考实现在 `.team/test/2026-09-26/`。
 *   ② 拿一份**旧实现**跑，证明某条断言**真的会红**（不是摆设）。
 * ⚠️ 换了入口 ⇒ **I 族与"产物场景库"不跑**：那时被测对象不是产物，跑了只会染红对照。
 *    要"换入口 **并且** 照旧跑产物那一块"⇒ 再给一个 `AGENIA_PROBE_PRODUCT_DIR`。
 */
const PRESET_ENTRY = process.env.AGENIA_PROBE_ENTRY ?? join(PRESET_DIR, 'inject.js')
/**
 * 这次量不量**产物那一块内容**（决定 I 族 + 产物场景库跑不跑）。
 * 默认 = 入口没被换过；给了 `AGENIA_PROBE_PRODUCT_DIR` 也算（那是"明知故问"）。
 */
const TESTING_PRODUCT = process.env.AGENIA_PROBE_ENTRY === undefined
  || process.env.AGENIA_PROBE_PRODUCT_DIR !== undefined

/** ESM 按 URL 缓存 —— 只 import 一次，N 族要拿它导出的 `moodOf`。 */
let ENTRY_MODULE
const loadEntry = async () => (ENTRY_MODULE ??= await import(pathToFileURL(PRESET_ENTRY).href))

/**
 * 🔴 **票外改动（第 4 关 `R-5`，评审点了名）**：这里是本票唯一不在验收口径里的一段 ——
 *    `F-106` 定形给测试岗的只有两条线（两格刻度 + `tests/` 读平台版本），这条警告两样都不是。
 *    留着它是因为它说的是**真缺陷**（静默写 C 盘），但它**不算 `F-106` 的交付**，另票处理
 *    （候选 `proposal-20261020-0060`）。撤不撤由组长裁；裁决之前它按"票外、已报备"读。
 *
 * 夹具落在哪个临时根。
 * 🔴 这一族工作区的硬约束是**「C 盘一个字节都不许写」**，而 `os.tmpdir()` 在 Windows 上
 *    读的就是 `%TEMP%` —— 这台机器那是 **C 盘**。探针每跑一次都要拍几十份 `agenia-probe-*`
 *    （跑完自己 `rmSync`，但**写过了**）。所以这里不再装作没事：
 *   · `AGENIA_PROBE_TMP` 显式指定（**不替你建目录** —— 建目录本身就是写；不存在就让 `mkdtemp` 当场报 ENOENT）；
 *   · 否则 `os.tmpdir()`，**但它落在 C 盘而仓库不在 C 盘时印一行警告**。
 * ⚠️ 警告**不改行为**（出声 ≠ 拦截）：要真的不碰 C 盘，跑之前把 `TEMP`/`TMP` 指到
 *    项目所在那个盘，或者给 `AGENIA_PROBE_TMP`。
 */
const driveOf = (p) => (/^[A-Za-z]:/.test(p) ? p.slice(0, 1).toLowerCase() : null)

/**
 * 这条临时根是不是"落在 C 盘、而仓库不在 C 盘"—— **纯函数，一个字节都不写**。
 * 抽出来就是为了**验得动**（第 4 关 `R-5` 的教训：为了验这个判断去真写 C 盘是错的做法）：
 *
 * | 输入 | 期望 |
 * | --- | --- |
 * | `('C:\\x', 'E:\\Harness')` | 警告（`'C'`） |
 * | `('C:\\x', 'C:\\repo')` | `null`（仓库也在 C 盘 ⇒ 这条约束在这台机器上不成立） |
 * | `('E:\\x', 'E:\\Harness')` | `null` |
 * | `('\\\\srv\\share\\x', 'E:\\Harness')` | `null`（UNC 没有盘符，判不了就不出声） |
 *
 * 返回值是那句警告要用的盘符（`'E'`），不需要警告时 `null`。
 */
function foreignCDrive(tmpRoot, repoRoot) {
  const here = driveOf(repoRoot)
  const there = driveOf(tmpRoot)
  if (there !== 'c' || here === null || here === 'c') return null
  return here.toUpperCase()
}

const PROBE_TMP = (() => {
  const explicit = process.env.AGENIA_PROBE_TMP
  const root = typeof explicit === 'string' && explicit !== '' ? explicit : tmpdir()
  const fixDrive = foreignCDrive(root, REPO)
  if (fixDrive !== null) {
    console.error(`[探针] 🔴 夹具的临时根在 C 盘（${root}）—— 「C 盘一个字节都不许写」这条硬约束正在被破。`
      + `\n       改法：跑之前把 TEMP/TMP 指到 ${fixDrive}: 盘，或给 AGENIA_PROBE_TMP=<${fixDrive}: 盘上的一个目录>。`)
  }
  return root
})()


/**
 * 口径编号 → 一句话（红的时候直接印出来，省得来回翻方案）。
 * ⚠️ **编号 = `.team/leader/2026-09-26/方案-情绪模块改三维.md` 第五节那张表**（1–18）。
 *    上一批那套编号（机制①/②、限长、六维情绪）属于上一票的方案 —— 这一批整表又换了。
 *    字符串键（`§…`）是契约内部项（方案里没编号），印出来时不带"口径"两个字。
 */
const CRITERION = {
  1: '维度 = 三个（掌控 · 活力 · 亲密）；愉悦/唤起/新异不再出现',
  2: '场景库条数与 `moodConstants` 的校验**同步**（改一边没改另一边 ⇒ 整块不认）',
  3: '掌控：成功率是**滑动窗口**（最近 20 次结果，跨回合不清零）',
  4: '掌控：**上一回合的错，下一回合仍有影响**（治的是"上一回合的错被 `turn/start` 清零"那个毛病）',
  5: '掌控：两个**不同的错**不算"同一个坑"（治 P4）',
  6: '亲密：**重逢项在他开口那一刻不归零**（治 P5）',
  7: '亲密：夸涨 / 骂跌 / 双命中骂赢 / 一句最多一档',
  8: '关键词 `der` **整词匹配**：`under`/`order`/`header` 不许命中',
  9: '关键词表住 `mood.md`；改词不用重启',
  10: '活力：开工时刻从**当日 log 首条**读得到',
  11: '活力：今天没 log ⇒ **降级到会话首帧**，不静默失效',
  12: '活力：`1 − 净工时/满量程`（**干得越久分越低**）；在场累加 / 离开 ≥15 分钟按半衰 60 回退（时间从参数进）',
  13: '三个新常数住在 `mood.md`，`.js` 里一个都没有',
  14: '`mood.md` 的「分数是调语气用的，不是绩效报表」还在',
  15: '尾巴全长有人守（收悬项 ⑧）：情绪板之前那一段（style + 常识 + 时间行）+ 恰好 2 个字符 + 情绪段 = 真发出去那一条 —— '
    + '它只钉"间隔恰好 2 个字符"与"情绪段非空"，证明不了那段内容来自哪几份源',
  16: '组员**一条都不贴**（口径 8b 回归）',
  17: '`node --check` = 0 · 探针全绿 · 体检全绿',
  18: '改 `inject.js` 后必须重启才生效（真回合，归组长）',
  '§形状': '注入消息的形状与拼接线（契约 3.4 / 老口径 7 的形状那半边）',
  '§产物': '真 presets/agenia/ 的内容文件（口径 1/2/6/14 的产物那半边）+ '
    + '`.runtime/common-sense.md` 在盘上、且不是空壳（`I18`；红 = 真常识文件没了 / 是空壳）',
  '§夹具': '夹具内容根自己的形状（改夹具 = 换量程，要交代）',
  // ── 2026-09-26 第三批新加的四条（方案第七节 #1–#10 的落点，编号是契约内部项）─────
  '§改名': '维度改名彻底：`疲劳` / `亲近` **作为维度名**不再出现在真产物与三份文档里（键名不动）',
  '§基线': '亲密基线 `.50`（`closenessBase`，与重逢项 / 夸 / 骂是**加法**；地板被抬高是定好的）',
  '§正反词': '每维正反词：形状 `正/正 ↔ 反/反`、词**逐字**来自 `mood.md` 的 `words`、'
    + '缺一维 ⇒ 那一格只写分数、形状不对 ⇒ 整块不认 + 出声、改它不用重启',
  '§封顶': '老板拍板选项 B「封顶就封顶」：高重逢区间里夸 / 骂**不动数**，亲密逐字 `1.00`',
  // 🆕 2026-10-15（批次 I4c）：委派后台硬门那一族的判据（STAT-03 点名的三个标记就在这一族里）。
  '§硬门': '委派后台硬门：名单从组合的 `delegationTools` 读（代码里不硬编码）· 一次性作业**省略**后台（含 args 整个缺）'
    + '⇒ 放行（0.2.1 的委派一律异步、那个参数平台已删），只有显式 false / \'true\' / 1 / 0 / null 才拒（`E_GUARD_JOB_FOREGROUND`，'
    + '报文含「必须后台运行」）· continuable 省略 / true 放行，只有显式 false 才拒（`E_GUARD_SELF_FOREGROUND`，报文含「（省略即后台）」）· '
    + '模式只住在 `delegationTools` 一处（`backgroundMode` 0.2.1 已撤，活行上一个都不许有）· '
    + '配置坏了按 A13 窄形状拦委派名（放行 `job_output`/`job_kill`/`job_list`），且**三条**拒绝报文（配置坏 / 作业 / 岗位）'
    + '给的都是 0.2.1 的实话：不出现**这三种已见形状**的「教人传已删的参数」（值形态+指令语境 / 模态词+写传 / 显式写传）、'
    + '并说出平台理由（**说法限于词表** —— 形状与词表的边界写在 GD9 注释里，别读成"原文可以改"）· '
    + '拿不到 `tools.guard` 必须出声（点名「没有 tools.guard」+ 说清后果）',
  // 🆕 2026-10-22：`F-126`（门 2 第 2 关补做）—— 机制② 那条尾巴**也要**带常识与时间行。
  '§F-126': '机制②（老板开口之后、我第一次开口之前）那条尾巴**同样**带 `## 共享记忆 · 常识` 与时间行：'
    + '0 个工具结果 / 少于 `every` / `every: 0` 三种现场都要带；机制① 到点那一刀与段序不许退化'
    + '（`style → 常识 → 时间 → 板子 → 情绪`）',
  // 🆕 2026-10-22：`F-126` 返修（老板拍板：**一条尾巴就是完整的包**）——
  //    第三个触发点（只有板子变了）那一刀也带常识与时间行。它是**另一根轴**，不并进 `§F-126`。
  '§F-126b': '第三个触发点（**只有板子变了**：他一句话没说 + 工具结果不到 `every`）那条尾巴'
    + '**同样**同时带常识与时间行，段序仍是 `style → 常识 → 时间 → 板子 → 情绪`',
  // `G12` 守的是契约 §3.2「触发点只有三个」，它不是 `F-126` 那四格之一 ⇒ 单开一个键（分法同 `§F-126b`）。
  //    它红的时候要印的是"哪七种事件"，不是"尾巴里有什么段"。
  '§围栏': '触发点只有三个（① 每 n 个工具结果 · ② 老板开口之后 · ③ 板子内容变了）：'
    + '七种"看着像触发"的事件（`turn/start` / `step/start` / `step/end` / `tool/call` / `assistant/message` / '
    + '一条 plugin 的 user 消息 / 纯装配）**一条都不许贴**。'
    + '⚠️ 这是一张**黑名单**：它只钉这七种今天不触发，拦不住"明天在第八种事件上加一个"——'
    + '那半边由 `inject.js` 里 `agent/pre-step` 那个唯一出口 + 契约 §3.2 管。',
}

/** `[A1 · 口径1]` / `[J6 · §形状]` */
const tag = (id, criterion) =>
  `[${id} · ${/^\d+$/.test(String(criterion)) ? '口径' : ''}${criterion}]`


// ── 计数与打印 ────────────────────────────────────────────────────────────────
let passed = 0
const reds = []
const skips = []
/**
 * 这次真的判过（或挂起过）的**编号**，按出现次序记下来。
 * 收尾拿它查重号 —— 契约 §6.1：一个编号两个意思 ⇒ 读的人没法引
 * （2026-09-26 那一批就是 `M2` ×2、`M4` ×2，评审照着契约表引编号会引错）。
 */
const usedIds = []
/**
 * 读数怎么印。
 * ⚠️ 长的字符串不许原样打 —— style.md 正文 3000+ 字符，印出来日志就没法看了，
 *    而且"逐字比"真正有用的是**第一个不同的位置**，不是两坨正文。
 */
function brief(value) {
  const text = value === undefined ? 'undefined' : typeof value === 'string' ? value : JSON.stringify(value)
  return text.length > 240 ? `${text.slice(0, 240)}…（共 ${text.length} 字符，已截断）` : text
}
function describe(got, want) {
  const long = (typeof got === 'string' && got.length > 200) || (typeof want === 'string' && want.length > 200)
  if (long) {
    if (typeof got !== 'string' || typeof want !== 'string') return `实测 ${brief(got)} / 期望 ${brief(want)}`
    if (got === want) return `两个字符串逐字相同（${got.length} 字符）`
    let i = 0
    while (i < got.length && i < want.length && got[i] === want[i]) i++
    return `第 ${i} 个字符起不同：实测 ${JSON.stringify(got.slice(i, i + 40))} / 期望 ${JSON.stringify(want.slice(i, i + 40))}`
      + `（长度 ${got.length} vs ${want.length}）`
  }
  return `实测 ${brief(got)} / 期望 ${brief(want)}`
}
const check = (id, criterion, label, got, want) => {
  usedIds.push(id)
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (ok) passed++
  else reds.push({ id, criterion, label, got, want })
  console.log(`${ok ? 'ok  ' : 'RED '} ${tag(id, criterion)} ${label}\n      ${describe(got, want)}`)
}
const checkTrue = (id, criterion, label, cond, detail = '') =>
  check(id, criterion, label, cond ? '是' : `否${detail ? `（${detail}）` : ''}`, '是')
/**
 * 第三种状态：**挂起**。
 * 有些断言是"某个数为 0"（典型：组员整个不贴）。整套跑不起来的时候那个 0 **照样成立** ——
 * 绿得和达标一模一样，这就是"静默失效的检查"。所以先要一条**阳性对照**；
 * 对照不成立时这条记挂起（不算通过、也不算红），退出码 2。
 * 来历：这个仓库吃过一次亏 —— 一条"环境没准备好就必然红"的用例把 28 个变异体全报成"被抓"，
 * 扫描变成了空扫描。
 */
const checkIf = (premise, id, criterion, label, got, want) => {
  if (!premise) {
    skip(id, criterion, label)
    return
  }
  check(id, criterion, label, got, want)
}

/**
 * 挂起的**裸**入口：只记账、不判真假（`checkIf` 前提不成立时走的就是它）。
 * 它存在的理由是**分母**：一条断言的前提不成立时，以前那种写法是
 * `if (前提) { ...check... }` —— 那 9 条**既不红、也不挂起、也不进分母，直接从输出里消失**，
 * 而"跑了 168 条全绿"读起来像全绿（2026-09-26 评审点名的那一条）。
 * ⇒ **判据不许因为被测对象长什么样就自己消失**：前提不成立 ⇒ 记 SKIP、退出码 2、进分母。
 */
const skip = (id, criterion, label, why = '前提不成立') => {
  usedIds.push(id)
  skips.push({ id, criterion, label })
  console.log(`SKIP ${tag(id, criterion)} ${label}\n      ${why} ⇒ **未验**（不算通过，也不算红）`)
}

/**
 * `console.error` 的收信箱。
 * 契约里好几条是"**不许静默失效**"（读不到 mood.md、拿不到 agent.id、贴不上去……）——
 * 那些话只有 `console.error` 一条出口，所以把它截下来：**既照原样打出来**（原始输出里看得见），
 * 也留一份给断言用。没有它，"该出声而没出声"这条永远验不了。
 */
const stderrSeen = []
{
  const real = console.error.bind(console)
  console.error = (...args) => {
    stderrSeen.push(args.map((a) => (typeof a === 'string' ? a : String(a))).join(' '))
    real(...args)
  }
}

// ── 挂载假 ctx ────────────────────────────────────────────────────────────────
/**
 * 贴出来那条 style 长什么样（形状由契约第六节钉着）——
 * 假 ctx 用它认"这一条是尾巴提醒"，落点断言（L 族）也用它。
 */
/**
 * 这条消息是不是"我们贴的那条风格尾巴"？
 *
 * 🔴 **2026-10-01 修**：原来是 `kind === 'plugin' && plugin === 'agenia'` —— **认的是 v4 之前的形状**。
 *    09-28 那份 `24b8d4c` 把 `source` 改成了 v4 的形状（`kind: 'plugin:agenia'` + `form` + `summary`，
 *    因为 v4 **拒收**笼统的 `'plugin'`，见 `check-notes` 那条断言），而**这个 helper 没跟着改**。
 *    ⇒ 后果：**七条判据全调它**找"style 在第几条"（L1/L2/L3/L6、R1/R2、R5），它恒返回 false
 *    ⇒ 恒 `-1` ⇒ **七条恒红**，而实现是好的。这不是"探针比实现旧"，是**探针被打坏了一格**。
 *    ⚠️ **判据照 `kind` 认，别照 `form`/`summary` 认** —— 那两格有自己的断言（G 族）管着；
 *      这里只要认出"这条是我们贴的"就够了（同 `inject.js` 里 `isBossMessage` 只认 `kind` 的道理）。
 */
const isStyleMessage = (m) =>
  m?.source?.kind === 'plugin:agenia' || (m?.source?.kind === 'plugin' && m?.source?.plugin === 'agenia')

/**
 * 从组合里读出**委派**那两样东西（**真读文件，不是读注释**）——
 * guard 那一族（`GD*`）拿它对账，判"名单 = 组合自己"。
 *
 *   · `enabled`：已启用的具名 `@deepseek-ai/dsh-tool-subagent` 实例的 `toolName`（升序）
 *   · `table`：`persona-injector` 那行 config 里 `delegationTools`（工具名 → `one-shot` | `continuable`）
 *
 * 只认这两个形状 —— **别把它扩成通用 YAML 解析器**（这里够用就行；解析器越宽，判据越像"读代码觉得对"）。
 * 注释行先剔掉：判"配置值里有没有"时，注释里提一句名字不算。
 */
function readDelegationConfig(text) {
  const effective = String(text).split('\n').filter((l) => !/^\s*#/.test(l))
  const blocks = []
  let cur = null
  for (const line of effective) {
    const hit = /^\s*- id:\s*(\S+)\s*$/.exec(line)
    if (hit !== null) {
      cur = { id: hit[1], lines: [] }
      blocks.push(cur)
      continue
    }
    if (cur !== null) cur.lines.push(line)
  }
  const bodyOf = (b) => b.lines.join('\n')
  const field = (b, key) => {
    const hit = new RegExp(`^\\s*${key}:\\s*(.+?)\\s*$`, 'm').exec(bodyOf(b))
    return hit === null ? undefined : hit[1].replace(/^['"]|['"]$/g, '')
  }
  const enabled = blocks
    .filter((b) => field(b, 'name') === '@deepseek-ai/dsh-tool-subagent')
    .filter((b) => !/^\s*disabled:\s*true\s*$/m.test(bodyOf(b)))
    .map((b) => field(b, 'toolName'))
    .filter((x) => typeof x === 'string' && x.length > 0)
    .sort()
  // 那一行自己的 `backgroundMode`（工具名 → 模式）—— 名单里的**值**要跟它逐条对账。
  const modes = {}
  for (const b of blocks) {
    const n = field(b, 'toolName')
    const m = field(b, 'backgroundMode')
    if (typeof n === 'string' && typeof m === 'string') modes[n] = m
  }
  const inj = blocks.find((b) => b.id === 'persona-injector')
  let table = null
  if (inj !== undefined) {
    const at = inj.lines.findIndex((l) => /^\s*delegationTools:\s*$/.test(l))
    if (at >= 0) {
      const indent = inj.lines[at].length - inj.lines[at].trimStart().length
      table = {}
      for (const line of inj.lines.slice(at + 1)) {
        if (line.trim() === '') continue
        if (line.length - line.trimStart().length <= indent) break
        const hit = /^\s*([A-Za-z0-9_-]+):\s*(\S+)\s*$/.exec(line)
        if (hit !== null) table[hit[1]] = hit[2]
      }
      if (Object.keys(table).length === 0) table = null
    }
  }
  return { enabled, table, modes }
}

/**
 * 让 inject.js 的 `apply()` 在一个假 ctx 上跑一遍。
 * 每次调用都是一份**全新的状态**（apply 里的 Map 都在闭包里），所以各测各的、互不串味。
 *
 * @param contentDir 内容根（夹具，或真的预设目录）
 * @param member     填了就是"这次是组员"：**只给一个信号** ——
 *                   装配用的 `sections` 里带 `【组员:<role>】`。
 *                   ⚠️ 故意**不**在会话头上塞 `parentSession` / `delegationDepth`：
 *                   组长拍下来的设计里，认人发生在装配那一刻（那里角色是现成的）；
 *                   多给一条路会掩盖"认人到底发生了没有"。
 * @param guard      🔴 2026-10-15（I4c）新增的两档（**不填 = 原来那个空门禁，一个字节没变**）：
 *                   · `'absent'` —— **不给** `ctx.get('tools')`：量"拿不到门禁必须出声"那一格；
 *                   · 函数 —— 记录式门禁：`ctx.effect` 里真调 `tools.guard(handler)`，把这个 handler
 *                     交出来，于是"判定真的按名单走"能在 apply 层验（不是只验纯函数）。
 * @param entry      被测入口（默认产物那一份）—— guard 那一族要指到**带 guard 的那一份**。
 * @param config     喂给 `apply()` 的 config（默认 `{ contentDir }`；guard 那一族要连组合的
 *                   `delegationTools` 一起喂 —— 真挂载时 `apply` 收到的就是那一行的 config）。
 */
async function harness(contentDir, { member, guard, entry, config } = {}) {
  const handlers = new Map()
  const injected = []
  const AGENT_ID = 'probe-agent'
  /**
   * **next-step 收件箱** —— 真 harness 里"老板那句话"和 `agent.inject()` 都先落在这里，
   * 到下一个 `agent/pre-step` 被 `inbox.claim()` **一次**领走（`dsh-agent-loop` L889）。
   *
   * 🔴 假 ctx 的模型就从这儿来，旧探针错在哪儿也在这儿：
   *    · 装配排在 claim **之后**（L889 在 L890 前面）；
   *    · 老板那句话的 `user/message` 要到 `step()` 里才落笔（L1028），比装配**晚**。
   *    ⇒ 装配那一刻，"这一步会不会带上老板那句话"是**看不见**的。
   *    旧探针让 `boss()` 直接发 `user/message` 事件、装配单独摆一次 —— 于是"装配里做决定"
   *    那条错落点看着是通的（还在 `assistant/message` 之前插装配点，正好差一格）。
   *    那是在**错的模型上全绿**（2026-09-26 评审打回的主因）。
   */
  const inbox = []
  /** 每一步实际会送出去的 messages —— 机制② 的落点就从这儿读。 */
  const steps = []
  const recorded = new Set()
  // ⚠️ 只按**身份**记，不按形状认：形状是契约钉的，形状对不上的时候该红的是 G 族，
  //    不该是"这条没被数进去"（自喂自那条 plugin 消息长得和 style 一模一样，按形状认会把它算成一次注入）。
  const record = (message) => {
    if (recorded.has(message)) return
    recorded.add(message)
    injected.push({ owner: AGENT_ID, message })
  }
  let queued = 0
  /**
   * 🔴 **会话对象带 `appending` 守卫** —— 照 `dsh-session/lib/index.js` 建模：
   *   · L1181：`if (entry?.appending) throw new Error("session append cannot reenter while another append is being published")`
   *   · L1191-1202：`entry.appending = true` → `log.push(event)` → **同步**派发 `session/event` → `finally { entry.appending = false }`
   * 2026-09-26 之前这里是个纯数组 ⇒ `inject()` 直接 push ⇒ **永远不重入失败** ⇒
   * 机制① 死了一整天，探针/重放/体检三套全绿。这个字段就是那次的补丁。
   */
  /**
   * 🔴 **`cwd` 指向夹具目录本身**（2026-09-26 第二批改）——
   * 口径 10/11 要求疲劳的"开工时刻"从 `${cwd}/.team/leader/<今天>/log.md` 的首条记录读。
   * 夹具的 `cwd` 不指自己，那一读就会落到**真仓库**的 `.team/leader/**` 上：
   * 读数跟着「今天组长写没写日志」漂 ⇒ 又是一个"会在半夜自己变红"的量具。
   * ⇒ 每个夹具现在自带一份 `.team/leader/<日期>/log.md`（`leaderLog` 参数可覆盖）。
   */
  const session = { id: AGENT_ID, header: { cwd: contentDir }, appending: false }
  const agent = {
    id: AGENT_ID,
    session,
    /**
     * 真语义：`agent.inject()` → `send(input, 'next-step', false)`（`dsh-agent-loop` L795-796）
     * → `inbox.splice()`（L786）→ **`session.append("agent/inbox/spliced", …)`**（L206）。
     * ⇒ 它是一条**写 session 的路**，所以要过同一个守卫：派发窗口里必须抛。
     */
    inject: (message) => {
      if (session.appending) {
        throw new Error('session append cannot reenter while another append is being published')
      }
      inbox.push(message)
      record(message)
    },
  }
  const ctx = {
    baseUrl: pathToFileURL(contentDir + sep).href,
    get(name) {
      if (name === 'systemPrompt') return {}
      if (name === 'agents') return { get: (want) => (want === AGENT_ID ? agent : undefined) }
      // 假的门禁：不给它 inject.js 就会往 stderr 喊"边界没生效"，那是噪声不是判据。
      // ⚠️ 2026-10-15（I4c）加两个档（见上面 `@param guard`）—— `'absent'` 与记录式门禁。
      if (name === 'tools') {
        if (guard === 'absent') return undefined
        if (typeof guard === 'function') return { guard: (handler) => { guard(handler); return () => {} } }
        return { guard: () => () => {} }
      }
      return undefined
    },
    on(event, handler) {
      if (!handlers.has(event)) handlers.set(event, [])
      handlers.get(event).push(handler)
    },
    effect(run) { run() },
  }

  // ⚠️ ESM 按 URL 缓存，所以这里**故意**只 import 一次；状态靠"重新 apply 一遍"重置。
  const mod = await import(pathToFileURL(entry ?? PRESET_ENTRY).href)
  await mod.apply(ctx, config ?? { contentDir })

  const tick = () => new Promise((resolve) => setImmediate(resolve))
  /**
   * 等到"没有新注入"为止。
   * ⚠️ 为什么不能只等一轮微任务：实现里要用 `await readFile` 读 style.md（实测本机
   *    一次 readFile 最多要 ~100 轮 setImmediate 才落地）。也**不能用 setTimeout(0)**
   *    —— 本机实测 15.26 ms/次，光等待就把探针拖死。
   *     判据：连续 200 轮没有新注入 **且** 至少过去 3 ms。
   */
  async function settle() {
    const t0 = Date.now()
    let quiet = 0
    for (let i = 0; i < 400000; i++) {
      const before = injected.length
      await tick()
      quiet = injected.length === before ? quiet + 1 : 0
      if (quiet >= 200 && Date.now() - t0 >= 3) return
    }
  }

  let seq = 0
  /**
   * 派发一条会话事件 —— **带 `appending` 窗口**（照真 `Session.append` 的 L1191-1202）。
   * ⚠️ `time` 从参数进（默认 `Date.now()`）：契约要求实现用**事件自带的 `time`**，
   *    不许调真实时钟 —— 否则"距下班""他多久没开口"这些断言会在半夜自己变红。
   */
  const fire = async (type, data, time) => {
    seq += 1
    const event = { seq, type, time: time ?? Date.now() }
    if (data !== undefined) event.data = data
    if (session.appending) {
      // 真 harness 里这也是一次重入 append（事件是 append 出来的），同样撞 L1181。
      throw new Error('session append cannot reenter while another append is being published')
    }
    session.appending = true
    try {
      for (const handler of handlers.get('session/event') ?? []) handler(session, event)
    } finally {
      session.appending = false
    }
    await settle()
  }

  /**
   * 跑一次装配 —— 真 harness 里它排在 `inbox.claim()` **之后**、`agent/pre-step` **之前**
   * （L889 → L890）。角色登记就在这一步做完。
   */
  const assemble = async () => {
    seq += 1
    const assembly = {
      sections: [{ name: 'x', text: member === undefined ? '没有标记' : `【组员:${member}】` }],
      contexts: [],
      tools: [],
      variables: {},
    }
    for (const handler of handlers.get('system-prompt/assemble') ?? []) {
      await handler(assembly, { scope: { id: AGENT_ID } }, async () => assembly)
    }
    await settle()
  }

  /** 假 ctx 上的 `agent/pre-step` 瀑布：注册过的按注册顺序一层层包起来（和 Cordis 一样）。 */
  async function preStepWaterfall(payload) {
    const list = handlers.get('agent/pre-step') ?? []
    let next = async () => ({ kind: 'enter', messages: payload.messages })
    for (let i = list.length - 1; i >= 0; i--) {
      const handler = list[i]
      const inner = next
      next = () => handler(payload, inner)
    }
    return await next()
  }

  /**
   * 走完**一个步的开头**，次序照真 harness：
   *   `claim`（L889）→ 装配（L890）→ `agent/pre-step` 瀑布（L894）→ `step/start`（L951）
   *   → 这批 messages 逐条落笔成 `user/message`（L1028，排在装配**之后**）。
   * 返回 `{ step, claimed, messages }` —— `messages` 就是**这一步送出去的请求里会有哪些消息**，
   * 机制② 的落点只能从这里读。
   */
  async function stepBegin(time) {
    const claimed = inbox.splice(0, inbox.length)
    // 瀑布**之前**拍一张身份快照：实现要是就地改这个数组，这张也不受影响。
    const claimedSet = new Set(claimed)
    await assemble()
    const payload = {
      agent,
      messages: claimed,
      step: steps.length + 1,
      turn: 1,
      signal: { aborted: false, throwIfAborted() {} },
    }
    const decision = await preStepWaterfall(payload)
    const messages = decision?.kind === 'reject'
      ? []
      : (Array.isArray(decision?.messages) ? decision.messages : [])
    // 新插进来的那一条（不在 claim 里的）= 这一步摆出来的尾巴（机制① 或 ②，都从这儿读）。
    for (const message of messages) if (!claimedSet.has(message)) record(message)
    const entry = { step: steps.length + 1, claimed, messages }
    steps.push(entry)
    await fire('step/start', { turn: 1, step: entry.step }, time)
    // 落笔：`decision.messages` 在 `step()` 里逐条 append —— 位置在装配**之后**（L1028）。
    for (const message of messages) await fire('user/message', message, time)
    return entry
  }

  /**
   * 下一条**排队**的消息带什么 `time`。
   * 🔴 真日志里消息是带时间的（口径 6 的重逢项要读它）——探针里由用例在 `bossText` 的第二参
   *    明确给出；不给就是"本步的时刻"（那是另一个、更粗的近似）。
   */
  let lastQueuedAt
  const queue = (source, text, at) => {
    queued += 1
    lastQueuedAt = at
    inbox.push({
      id: `probe-${queued}`,
      role: 'user',
      content: [{ type: 'text', text }],
      source,
      time: lastQueuedAt,
    })
  }

  return {
    injected,
    ctx,
    /** 累计贴了几条（机制①② 都算）—— 次数口径，和落点无关。 */
    count: () => injected.length,
    /**
     * 尾巴的读数：**条数 + 全部条目的字符数**。
     * 口径 15（尾巴全长）要的是"真发出去那一条有多长"，所以按**每一条**算，
     * 不是把几条加起来（两条尾巴之间的关系不是"叠加"）。
     */
    stat: () => ({
      条数: injected.length,
      字符数: injected.map((x) => (typeof x.message?.content?.[0]?.text === 'string'
        ? x.message.content[0].text.length : 0)),
    }),
    last: () => injected[injected.length - 1]?.message,
    /** 最近一条注入的正文（== `last()` 的正文）—— N/O/P/Q 族都读它。 */
    lastText: () => injected[injected.length - 1]?.message?.content?.[0]?.text,
    /** 每一步送出去的 messages（落点口径）。 */
    steps,
    assemble,
    stepBegin,
    turnStart: (time) => fire('turn/start', undefined, time),
    stepStart: (time) => fire('step/start', undefined, time),
    stepEnd: (time) => fire('step/end', undefined, time),
    iSpeak: (time) => fire('assistant/message', undefined, time),
    toolCall: (time) => fire('tool/call', undefined, time),
    // ⚠️ `data.message.isError === true` 的结果**也算一次**（口径点 1）—— 原样把它交给实现，
    //    断言 A6 钉着"实现不看 isError"。
    toolResult: (data, time) => fire('tool/result', data, time),
    /**
     * 一个**团队工具**的结果 —— 走**插件事** `tools/result`，不是会话事件。
     * 🔴 板子的账本（`inject.js` 的 `ctx.on('tools/result')`）**只听这个口**：
     *    `session/event` 的 `tool/result` 只喂 ① 的计数，喂不出"板子变了"。
     *    ⇒ `G13` 要造那一格必须从这里喂（`toolStep()` 喂不到）。
     * @param name 工具名（`team_dev` / `team_test` …）—— 实现按 `TEAM_TOOL` 认岗位。
     */
    teamResult: async (name) => {
      for (const handler of handlers.get('tools/result') ?? []) {
        await handler({ name, arguments: {}, agent }, undefined)
      }
      await settle()
    },
    // 老板那句话**只进收件箱**：它变成 `user/message` 是后面 `stepBegin()` 里落笔那一下的事。
    boss: (t) => queue({ kind: 'user' }, '老板的话', t),
    /** 带正文的老板消息（口径 7/8 要按**句子里的词**判夸还是骂）。
     *  @param t 这句话的**时刻**（口径 6 的重逢项读它；不给就用本步的时刻）。 */
    bossText: (text, t) => queue({ kind: 'user' }, text, t),
    plugin: () => queue({ kind: 'plugin', plugin: 'agenia' }, '系统自己发的消息'),
    // S 族（守卫自检）要用的三样：会话本身、agent、还有自己挂监听的口子。
    session,
    agent,
    on: (event, handler) => {
      if (!handlers.has(event)) handlers.set(event, [])
      handlers.get(event).push(handler)
    },
    fire: (type, data, time) => fire(type, data, time),
  }
}

/**
 * "我调了一次工具、拿回一个结果" —— 真日志里的形状。
 * 🔴 **它一直走到下一个步边界**（2026-09-26 改）：机制① 的新落点是
 *    「记账在 `session/event`、贴在 `agent/pre-step`」⇒ 挂的账要到**下一步的 messages**
 *    里才看得见。不走到步边界，那一族量的就还是旧落点的形状（会假绿也说不准）。
 */
async function toolStep(h, time) {
  await h.iSpeak(time)
  await h.toolResult(undefined, time)
  return await h.stepBegin(time)
}

/**
 * "老板说一句、我这边走到回答他的那一步" —— 真 harness 的形状：
 * 他那句话进收件箱 ⇒ 下一个步边界 `claim` 领走 ⇒ 装配 ⇒ `agent/pre-step`
 * ⇒ 这就定下了"回答他那一次的请求里有什么"。
 * ⚠️ 旧版本这里是 `boss()` + 单独一次 `assemble()` —— 那对应"装配里做决定"的错落点。
 */
async function bossThenStep(h) {
  await h.boss()
  return await h.stepBegin()
}

// ── 夹具：一份内容根，正文和频率都由探针自己说了算 ─────────────────────────────
/**
 * 夹具的 `style.md`。**这一批加了 `<!-- 尾巴到此为止 -->`** ——
 * 尾巴只许取切口**之前**那一段（口径 6/7）；切口后面那一大段是"不许贴出来"的现场。
 */
const FIXTURE_STYLE = (every) =>
  `<!-- every: ${every} -->\n`
  + '# 语言风格（探针夹具）\n'
  + '\n'
  + '夹具正文第一段：不是客服话术。😌\n'
  + '\n'
  + '夹具正文第二段，中间夹一枚行内注释 <!-- 这一段必须被剥掉 --> 后面还得有字。\n'
  + '\n'
  + '<!-- 尾巴到此为止 -->\n'
  + '\n'
  + '## emoji（切口后面这一大段，尾巴不许贴）\n'
  + '\n'
  + '| | 什么时候用 | 例句 |\n'
  + '| --- | --- | --- |\n'
  + '| 😌 | 平静地宣布一个不太好的消息 | 测试红了。挺好，至少红在该红的地方。😌 |\n'
  + '| 💀 | 事情彻底坏了 | 改了一行，挂了七个测试。💀 |\n'

/** 没有切口标记的那一份 —— 口径 7 的"退回全文"就靠它。
 *  ⚠️ 正文里**不许出现那串标记本身**：写上去就等于有标记（第一版就是这么错的，
 *     实现老老实实地在句子中间切了一刀）。 */
const FIXTURE_STYLE_NO_MARK = (every) =>
  `<!-- every: ${every} -->\n`
  + '# 语言风格（探针夹具 · 这份里没有切口标记）\n'
  + '\n'
  + '这份夹具里没有那个 HTML 注释形式的切口 ⇒ 该贴全文，**不许变空**。\n'
  + '\n'
  + '## emoji\n'
  + '\n'
  + '| 😌 | 平静地宣布一个不太好的消息 | 测试红了。😌 |\n'

/** 标记在最前面 ⇒ 切出来是空的 —— 同样该"退回全文"（口径 7 的同一句）。 */
const FIXTURE_STYLE_EMPTY_CUT = (every) =>
  `<!-- every: ${every} -->\n`
  + '<!-- 尾巴到此为止 -->\n'
  + '\n'
  + '# 标记后面才有正文\n'
  + '\n'
  + '切口之前一个字都没有 ⇒ 退回全文。\n'

/**
 * **老那套六场景库（上一批的夹具）** —— 只留给 `S1` 那一条用：它量的是
 * "旧形状（六维 / 六条）在**当前产物**上是绿的" ⇒ 红基线里"新形状那几条红"才有对照。
 * 🔴 **不许拿它当新契约的夹具**：那是"事实变了"以前的世界。
 */
const FIXTURE_SCENES6 = [
  { id: '他久别归来', when: { closeness: [0.7, 1] },
    lines: ['你终于回来啦！！', '欸——你可算回来了，我这儿刚把 v6 跑完。'] },
  { id: '刚炸过', when: { control: [0, 0.35], arousal: [0.6, 1] },
    lines: ['淦，又是它。', '行，我认，这回是我没验。'] },
  { id: '赶下班', when: { arousal: [0.65, 1], fatigue: [0.6, 1] },
    lines: ['快下班了，你确定还要改？', '再改我就住这儿了。'] },
  { id: '一路绿到底', when: { pleasure: [0.75, 1] },
    lines: ['全绿了全绿了！', '这版比上一版顺眼多了。'] },
  { id: '同一个坑第三次', when: { control: [0, 0.3] },
    lines: ['这是第三次了。', '同一个地方，我不说话了。'] },
  { id: '新东西来了', when: { novelty: [0.7, 1] },
    lines: ['欸，这个我没见过。', '有点意思，我去翻翻。'] },
]

/**
 * **这一批的夹具场景库：恰好 3 条**（口径 1/2，老板 2026-09-26 拍的）。
 * 条件只用三维键（`control` / `fatigue` / `closeness`）—— 写一个别的键，整条区间永远对不上。
 * ⚠️ 句子写得短、好逐字比；`刚炸过` 那两句里留着「第三次」＝ 老板说的"味道留住"。
 */
const FIXTURE_SCENES = [
  { id: '他久别归来', when: { closeness: [0.65, 1] },
    lines: ['你终于回来啦！！', '欸——你可算回来了，我这儿刚把 v6 跑完。'] },
  { id: '一路绿到底', when: { control: [0.65, 1] },
    lines: ['全绿了！！！！', '嘿嘿，一次过。'] },
  { id: '刚炸过', when: { control: [0, 0.35] },
    lines: ['淦，又是它。', '第三次了哥们，这次我把它钉死。'] },
]

/** 三个维度的键（次序就是贴出去那一行的次序，契约 3.4 钉死）。 */
const DIM_KEYS_3 = ['control', 'fatigue', 'closeness']
/** 中文名（按同一个次序）。2026-09-26 改名：`疲劳 → 活力`、`亲近 → 亲密`（键名没动）。 */
const DIM_LABELS_3 = ['掌控', '活力', '亲密']
/** 被砍掉的三个维度（口径 1：**不再出现**）。 */
const DIM_KEYS_GONE = ['pleasure', 'arousal', 'novelty']
const DIM_LABELS_GONE = ['愉悦', '唤起', '新异']

/**
 * 夹具那一份**正反词表** —— 与真 `presets/agenia/mood.md` 的 `words` **逐字对齐**
 * （老板 2026-09-26 逐字拍的那份，方案第五节表 1）。
 * ⚠️ **为什么不从真文件读**：夹具是"另一个内容根"，它必须能独立成立；
 *    真文件那一份由 `I14` 单独钉（逐字比老板拍的表），两处一起看才算"两边都对上了"。
 * 🔴 **夹具不补 `words` 会有假绿**：不补 ⇒ 每一格都退回"只写分数"（那是**合法的**降级路），
 *    于是"分数行有没有词"这件事在夹具模式下**永远量不到** —— `Q1` 会拿着一条没词的行走绿。
 */
const FIXTURE_WORDS = {
  control: { positive: ['笃定', '喜悦'], negative: ['混乱', '失落'] },
  fatigue: { positive: ['精神', '清醒'], negative: ['疲惫', '懒惰'] },
  closeness: { positive: ['爱慕', '亲近'], negative: ['疏离', '冷淡'] },
}

/**
 * 夹具的 `mood.md` —— 契约 3.1 钉的那个 ```mood JSON 块。
 * 🔴 **三个新常数住在这儿**（口径 13）：`presenceMinutes` 15 · `absenceHalfLifeMinutes` 60 ·
 *    `fullScaleMinutes` 360。`pitStep` 是"同一个坑每多一次扣多少"（口径 5 的判据要用到它）。
 * 关键词表也住这儿（口径 9）—— 改词不用重启。
 */
const FIXTURE_MOOD = (over = {}) =>
  '# 情绪板（探针夹具）\n'
  + '\n'
  + '分数是调语气用的，不是绩效报表。\n'
  + '\n'
  + '```mood\n'
  + JSON.stringify({
    halfLifeMinutes: 20,
    roundDecay: 0.6,
    presenceMinutes: 15,
    absenceHalfLifeMinutes: 60,
    fullScaleMinutes: 360,
    pitStep: 0.08,
    // 🔴 **那四档刻度**（2026-09-26 返修 · 评审条件 ③(a)）：键名是机器与文件之间的接口
    //    （`I12` 钉真产物那一份、`Q11`–`Q15` 钉"真的从文件读"）。值就是契约的默认值 ——
    //    夹具带上它们，`moodConstants()` 就算把它们变成"必填"也不会让夹具整块失效。
    reunionScaleMinutes: 240,
    reunionBase: 0.9,
    praiseStep: 0.06,
    blameStep: -0.08,
    // 🔴 **亲密基线 .50 + 正反词**（2026-09-26 第三批）：跟真文件对齐，理由见上面 `FIXTURE_WORDS`。
    closenessBase: 0.5,
    words: FIXTURE_WORDS,
    keywordPraise: ['棒', '厉害', 'der'],
    keywordBlame: ['笨', '又错了', '不是这么写的'],
    ...over,
    scenes: over.scenes ?? FIXTURE_SCENES,
  }, null, 2)
  + '\n```\n'

/** 老形状那一份（六维 / 六条）—— 只给 `S1` 用。 */
const FIXTURE_MOOD6 = (halfLifeMinutes = 20, roundDecay = 0.6) =>
  '# 情绪板（探针夹具 · 老形状六条）\n'
  + '\n'
  + '分数是调语气用的，不是绩效报表。\n'
  + '\n'
  + '```mood\n'
  + JSON.stringify({ halfLifeMinutes, roundDecay, scenes: FIXTURE_SCENES6 }, null, 2)
  + '\n```\n'

/**
 * 夹具的 `.runtime/common-sense.md` —— **F-126 那一族专用**（`G8`–`G13`）。
 *
 * 🔴 **默认夹具里没有这份文件**（`buildFixture()` 的 `commonSense` 默认 `null`），而且**必须**没有：
 *    · 老那 215 格全部跑在"没有常识文件"的夹具上 —— `G5` 的逐字期望值就是
 *      「style 尾巴 + 一行时间行」，补上这份文件会让它当场多一段 ⇒ 那是**删改既有格**。
 *    · 而"常识在不在尾巴里"这件事，在默认夹具上**永远量不到**（`commonSenseOf()` 恒 `undefined`）
 *      ⇒ 拿一条没有常识的尾巴走绿。所以量它的那几格必须把它显式带上。
 * ⚠️ 正文里**不许出现** `## 共享记忆 · 常识` 这一行：那一行是 `commonSenseOf()` 自己加的抬头，
 *    写进来就分不清"抬头是产物给的还是夹具给的"。
 */
const FIXTURE_COMMON_SENSE =
  '# 常识（探针夹具 · `.runtime/common-sense.md`）\n'
  + '\n'
  + '- 夹具常识第一条：测试和实现最好分开。\n'
  + '- 夹具常识第二条：注释和文档只描述当下状态。\n'

/** 夹具的 `me-aqua.md` —— 作息三行，格式照契约（`下班：HH:MM`）。 */
const FIXTURE_ME_AQUA = (offWork = '18:00') =>
  '# 关于老板（探针夹具）\n'
  + '\n'
  + '## 作息（情绪板按这三行读 —— 格式别乱改）\n'
  + '\n'
  + '- 上班日：周一到周五\n'
  + '- 午休：12:00-13:30\n'
  + `- 下班：${offWork}\n`

/**
 * 🔴 **探针的固定那一天** —— 口径 10 的"今天"就是它。
 * 形状照真文件（`.team/leader/2026-09-26/log.md`）：标题行、说明行、`---`、然后 `## HH:MM · …`。
 * ⚠️ **日期必须从事件时间推、不许调 `Date.now()`**（口径 10 + 老口径 10）：
 *    拿真实时钟去凑抽屉名 ⇒ 探针跑在哪天就找哪天的抽屉 ⇒ **半夜自己变红**。
 */
const FIXTURE_DATE = '2026-09-26'
const FIXTURE_LEADER_LOG = (first = '09:00') =>
  `# log · ${FIXTURE_DATE}（星期二）\n`
  + '\n'
  + '> 抽屉日期 = 写它的那天。\n'
  + '\n'
  + '---\n'
  + '\n'
  + `## ${first} · 开工第一步\n`
  + '\n'
  + '| # | 那件事 | 读数 |\n'
  + '| --- | --- | --- |\n'
  + '| ① | 读 now.md | ✅ |\n'

/**
 * 造一份内容根。
 * @param style     `style.md` 的正文（默认带切口标记那一份）
 * @param mood      `mood.md` 的正文；传 **`null`** = 不放这份文件（Q7 用）
 *                  ⚠️ 传 `undefined` 会**触发默认值**（JS 解构的规矩），那是另一个意思。
 * @param meAqua    `me-aqua.md` 的正文（默认 18:00 下班）
 * @param leaderLog `.team/leader/<日期>/log.md` 的正文；传 **`null`** = 不放这份文件（口径 11 的降级现场）。
 *                  ⚠️ 形状照真文件（`.team/leader/2026-09-26/log.md` 实测）：标题行在前，
 *                  首条记录是 `## HH:MM · …`。**这条形状是接口**（口径 10），改了读不出来。
 * @param date      哪个抽屉（默认 = 探针固定那天 `2026-09-26`）
 * @param commonSense `.runtime/common-sense.md` 的正文（`F-126` 那一族用）。
 *                  ⚠️ 传 **`null`**（默认）= **不放这份文件** —— 这个默认值是老 215 格的一部分，
 *                  改它 = 换量程（`G5` 的期望值会跟着变），不是"补一份更全的夹具"。
 */
function buildFixture({
  style = FIXTURE_STYLE(3),
  mood = FIXTURE_MOOD(),
  meAqua = FIXTURE_ME_AQUA(),
  leaderLog = FIXTURE_LEADER_LOG(),
  date = FIXTURE_DATE,
  commonSense = null,
} = {}) {
  const dir = mkdtempSync(join(PROBE_TMP, 'agenia-probe-'))
  mkdirSync(join(dir, 'team'), { recursive: true })
  writeFileSync(join(dir, 'style.md'), style, 'utf8')
  if (mood !== null) writeFileSync(join(dir, 'mood.md'), mood, 'utf8')
  if (meAqua !== null) writeFileSync(join(dir, 'me-aqua.md'), meAqua, 'utf8')
  // 🔴 `commonSenseOf()` 读的是 `<内容根>/.runtime/common-sense.md`（`RUNTIME_DIR` + `COMMON_SENSE_FILE`）。
  //    只有 `F-126` 那一族显式要它；默认 `null` ⇒ 一个字节都不多写。
  if (commonSense !== null) {
    mkdirSync(join(dir, '.runtime'), { recursive: true })
    writeFileSync(join(dir, '.runtime', 'common-sense.md'), commonSense, 'utf8')
  }
  // 🔴 口径 10/11：开工时刻 = 这个抽屉的**首条记录时间**（`## HH:MM`）。
  //    文件就叫 **`log.md`** —— 真目录里那个累计日志是 `.team/leader/log.md`（没有日期那层），
  //    两者同名不同路径，所以这里不需要别的名字。
  if (leaderLog !== null) {
    mkdirSync(join(dir, '.team', 'leader', date), { recursive: true })
    writeFileSync(join(dir, '.team', 'leader', date, 'log.md'), leaderLog, 'utf8')
  }
  // 这几份只是为了别让 inject.js 的配置自检往 stderr 喊"找不到文件" —— 那是噪声。
  // ⚠️ **`leader.md` 不要**：夹具里 `.team/leader/` 是个**目录**，根上再放一个同名文件，
  //    "内容根 + 相对名"那种解析会撞上它（`readFileSync` 直接 EISDIR/ENOENT 抛出来）。
  for (const f of ['work-guidelines.md', 'persona.md']) {
    writeFileSync(join(dir, f), `# ${f}（探针夹具）\n`, 'utf8')
  }
  for (const role of ['design', 'dev', 'test', 'review', 'retro', 'hire']) {
    writeFileSync(join(dir, 'team', `${role}.md`), `# ${role}（探针夹具）\n`, 'utf8')
  }
  return dir
}

/**
 * 夹具 `style.md` **落盘那一份**的正文 —— "逐字比"那几格的**期望值**从这里取。
 * 🔴 为什么不写 `FIXTURE_STYLE(3)`：那个 `3` 是**夹具的刻度**（量程，会变），
 *    而期望值该是"实现**读到的那些字节**"。只有一个来源时，改刻度才不会把判据一起带红。
 *    （`cutTail` 本来就会剥掉 `<!-- every: N -->` ⇒ 今天两者同值；那是巧合，不是保证：
 *     `P4` 那几格比的是 `stripComments(全文)`，**注释不剥**，那时刻度就露在期望值里了。）
 */
const fixtureStyleOnDisk = (dir) => readFileSync(join(dir, 'style.md'), 'utf8')

/** 契约里写的"剥注释"口径：删掉全部 HTML 注释（含跨行）再 trim。 */
const stripComments = (raw) => raw.replace(/<!--[\s\S]*?-->/g, '').trim()

/**
 * 契约第二节那条三步规则（**探针自己写一遍**，不调产物的函数）：
 * 先在原文里找切口 ⇒ 取切口之前那一段（找不到就取全文）⇒ 剥注释 ⇒ 空的就退回全文。
 */
const TAIL_MARK = /<!--\s*尾巴到此为止\s*-->/
function cutTail(raw) {
  const at = raw.search(TAIL_MARK)
  const part = at < 0 ? raw : raw.slice(0, at)
  const body = stripComments(part)
  return body.length > 0 ? body : stripComments(raw)
}

/** 注入正文里，`【情绪板】` 之前那一段就是 style 段（契约 3.4）。 */
function stylePartOf(text) {
  if (typeof text !== 'string') return text
  const at = text.indexOf('【情绪板】')
  return (at < 0 ? text : text.slice(0, at)).trimEnd()
}

/**
 * 那条时间行 —— **F-102** 只在**① 到点那一刀**里加它（`inject.js` 的 `tailBodyOf` 第 3 段）。
 * 形状（`inject.js::timeLineOf`）：`现在 2026-10-20 12:36（周二）`；
 * 第二次起尾巴上还带 ` · 距上次提醒约 N 分钟`。
 * 🔴 **它的值不进任何断言**（值来自 `Date.now()`，那个字面量每跑一次都不一样；
 *    而且 F-104 正要把"真实时钟"这件事改掉 —— 判据钉值 ⇒ 那两票互相绊）。
 */
const TIME_LINE = /^现在 \d{4}-\d{2}-\d{2} \d{2}:\d{2}（周[日一二三四五六]）(?: · 距上次提醒约 \d+ 分钟)?$/
/** 归一之后的固定字样（判据只认形状，不认这一刻是几点）。 */
const TIME_LINE_TOKEN = '现在 <日期> <时:分>（<周X>）'

/**
 * 把**整行完全长得像时间行**的那一段换成固定字样；别的东西**一个字都不动**。
 * ⇒ 多出来的任何东西都留着，会让"逐字比"那一格红（不是被悄悄吃掉）。
 * 按 `\n\n` 分段再拼回去：段内一个字符都不会丢（第一段是风格尾巴，本身就有空行）。
 */
function normalizeTimeLines(text) {
  if (typeof text !== 'string') return text
  return text.split('\n\n').map((seg) => (TIME_LINE.test(seg) ? TIME_LINE_TOKEN : seg)).join('\n\n')
}

/** 注入正文里，`【情绪板】` 那一段（没有 ⇒ undefined）。 */
function moodPartOf(text) {
  if (typeof text !== 'string') return undefined
  const at = text.indexOf('【情绪板】')
  return at < 0 ? undefined : text.slice(at)
}

/**
 * 从 `mood.md` 正文里抠出契约 3.1 那个 ```mood JSON 块并 parse。
 * **探针自己写一遍**（不调产物的函数）—— 两边独立，对不上才有信息量。
 * 读不到 / 没有这个块 / JSON 不合法 ⇒ `undefined`。
 */
function parseMoodBlock(markdown) {
  if (typeof markdown !== 'string') return undefined
  const hit = /```mood[ \t]*\r?\n([\s\S]*?)\r?\n```/.exec(markdown)
  if (hit === null) return undefined
  try {
    return JSON.parse(hit[1])
  } catch {
    return undefined
  }
}

/**
 * 分数行里那个数的写法：`toFixed(2)`，以 `0.` 开头就去掉那个 `0`。
 * 反过来读：`.62` → 0.62 · `1.00` → 1 · `0.62` 也认（宽容读，严格写由 `Q2` 判）。
 */
function scoreFromToken(token) {
  const hit = /^(1\.00|[01]?\.\d{2}|0\.\d{2})$/.exec(String(token))
  if (hit === null) return undefined
  return Number(hit[1].startsWith('.') ? `0${hit[1]}` : hit[1])
}

/**
 * 从一条注入正文里读**三维**分数（读不到 ⇒ undefined）。
 * 行形状（契约 3.4，2026-09-26 起）：`【情绪板】掌控 .62（笃定/喜悦 ↔ 混乱/失落） · 活力 .30（…） · 亲密 .90（…）`
 * ⚠️ 名字改过一轮：`疲劳 → 活力`（**方向也跟着翻了**：分越高越有劲）、`亲近 → 亲密`。
 * ⚠️ **词表那一截是可选**的（`mood.md` 的 `words` 里没给那一维 ⇒ 只有分数）⇒ 先把 `（…）` 整段剥掉再读。
 */
function scoresFromText(text) {
  const line = (moodPartOf(text) ?? '').split('\n')[0] ?? ''
  const bare = line.replace(/（[^）]*）/g, '')
  const hit = /^【情绪板】掌控 (\S+) · 活力 (\S+) · 亲密 (\S+)$/.exec(bare)
  if (hit === null) return undefined
  const values = hit.slice(1).map(scoreFromToken)
  if (values.some((v) => v === undefined)) return undefined
  const [control, fatigue, closeness] = values
  return { control, fatigue, closeness }
}

const fixture = buildFixture()
let exitCode = 1

try {
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ A · 机制①：每 n 个工具结果注入一次（口径 1）═══')
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const h = await harness(fixture)
    await h.turnStart()
    const seen = [h.count()]
    for (let k = 0; k < 7; k++) {
      await toolStep(h)
      seen.push(h.count())
    }
    const names = ['起点', '第 1 个结果', '第 2 个结果', '第 3 个结果', '第 4 个结果', '第 5 个结果', '第 6 个结果', '第 7 个结果']
    check('A1', 1, '第 1 个 tool/result 之后不多贴', { [names[1]]: seen[1] }, { [names[1]]: 0 })
    check('A2', 1, '第 2 个 tool/result 之后不多贴', { [names[2]]: seen[2] }, { [names[2]]: 0 })
    check('A3', 1, '第 3 个 tool/result 之后多贴 1 条', { [names[3]]: seen[3] }, { [names[3]]: 1 })
    check('A4', 1, '计数是"每 n 个"而不是"从第 n 个起一路贴"：第 4、5 个不多贴',
      seen.slice(4, 6), [1, 1])
    check('A5', 1, '第 6 个 tool/result 再多贴 1 条', { [names[6]]: seen[6] }, { [names[6]]: 2 })
  }
  {
    // 🔴 **口径点 1：报错的工具结果也算一次**（组长 2026-09-25 拍：老板说的是"每 n 个工具结果"，
    //    没提成败；被拒的那次调用一样占上下文）。这条口径以前**一条断言都没有**
    //    —— 探针和重放里 `isError` 零命中，哪天有人顺手在计数前滤一下，没人会红。
    // ⚠️ 形状按真日志（`.team/dev/2026-09-26/_probe-log-shape.mjs` 量过 45269 条 `tool/result`）：
    //    `{ turn, step, message: { id, role:'user', source:{kind:'tool',callId},
    //      content: [{ type:'tool-result', toolCallId, content:[…], isError:true }] }, error?:{…} }`
    //    ⇒ 报错标记在 **`data.message.content[0].isError`**（45269 条里 979 条是真报错）。
    //    ⚠️ 顺带一条：工具结果的 `role` 也是 `'user'` —— 机制② 的判据**只能**认 `source.kind`，
    //       认 `role` 的话每个工具结果都会被读成"老板又开口了"。
    const errorResult = {
      turn: 1,
      step: 1,
      message: {
        id: 'probe-error-result',
        role: 'user',
        source: { kind: 'tool', callId: 'probe-call' },
        content: [{
          type: 'tool-result',
          toolCallId: 'probe-call',
          content: [{ type: 'text', text: 'Error: 探针造的报错结果' }],
          isError: true,
        }],
      },
      error: { name: 'ProbeError', code: 'PROBE' },
    }
    const err = await harness(fixture)
    await err.turnStart()
    await err.toolResult(errorResult)
    await err.toolResult(errorResult)
    await err.toolResult(errorResult)
    await err.stepBegin()          // 机制① 的账要在步边界上才看得见
    check('A6', 1, '【口径点 1】3 个**报错**的 tool/result（`data.message.content[0].isError: true`）照样凑满 n ⇒ 机制① 响一次',
      err.count(), 1)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ B · 机制②：老板开口 ⇒ 回答他那一次的 messages 里多一条（口径 3）═══')
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const h = await harness(fixture)
    await h.turnStart()
    await h.boss()
    check('B1', 3, '老板开口那一下**不注入**（他那句话还挂在收件箱里，没到步边界）', h.count(), 0)
    await h.stepBegin()
    check('B2', 3, '他那句话被领进这一步 ⇒ 注入 1 条', h.count(), 1)
    await h.boss()
    await h.boss()
    await h.stepBegin()
    check('B3', 3, '【口径点 4】同一步里两条老板消息 ⇒ 只摆 1 条（挂账是布尔量，不是计数器）', h.count(), 2)
    await h.plugin()
    await h.plugin()
    await h.stepBegin()
    check('B4', 3, 'plugin 自己的 user/message 被领进这一步也不算老板开口（防自己喂自己）', h.count(), 2)
    await h.boss()
    await h.stepBegin()
    check('B5', 3, '老板再开口 ⇒ 回答他的下一步再多 1 条（整段里没有任何 tool/result）', h.count(), 3)
    await h.stepStart()
    await h.stepBegin()
    check('B6', 3, '补一个 step/start 也不额外贴（步边界不是触发点）', h.count(), 3)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ C · 老板说话不算进机制① 的计数（口径 1 · 老口径 #3 的语义）═══')
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const h = await harness(fixture)
    await h.turnStart()
    await h.boss()
    await h.boss()
    await h.stepBegin()
    check('C1', 1, '两条老板消息 + 走到步边界 ⇒ 只有机制② 的 1 条', h.count(), 1)
    await h.iSpeak()   // "我开口了" ⇒ 清掉守门 A，别让 A 替机制① 顶罪
    await h.toolResult()
    await h.stepBegin()
    check('C2', 1, '② 之后那一个工具结果不额外贴（守门 B 的独立现场在 E 族）', h.count(), 1)
    await toolStep(h)
    // 🔴 这一条是口径 #3 的判据：若老板那 2 句话被算进了机制① 的账，计数就已经是 2，
    //    这一个工具结果就该让它响 —— 实测会是 2。
    check('C3', 1, '第 1 个"被计数"的工具结果 ⇒ 累计仍 1（老板那两句话一条都没进账）', h.count(), 1)
    await toolStep(h)
    check('C4', 1, '再 1 个 ⇒ 累计仍 1（计数走到 2，离 n=3 还差一个）', h.count(), 1)
    await toolStep(h)
    check('C5', 1, '第 3 个"被计数的"工具结果 ⇒ 机制① 响一次（证明计数是从 0 起、不是从 2 起）', h.count(), 2)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ D · 守门 A：他刚说完、我还没开口，机制① 让路（口径 4）═══')
  // ═══════════════════════════════════════════════════════════════════════════
  {
    // 🔴 阳性控制：同一份夹具、同样的两个工具结果、**只是没有老板插进来** ⇒ 计数到 3 时必须响。
    //    没有它，下面 D2/D3/D4 那三条"不许贴"在"机制① 压根不存在"的实现上会**空跑成绿**
    //    （实测踩过：旧实现对这三条全绿，而它根本没有机制①）。
    const ctlD = await harness(fixture)
    await ctlD.turnStart()
    for (let k = 0; k < 3; k++) await toolStep(ctlD)
    const oneWorks = ctlD.count() === 1
    check('D0', 4, '【阳性控制】没有老板插进来时，第 3 个工具结果让机制① 响一次', ctlD.count(), 1)

    const h = await harness(fixture)
    await h.turnStart()
    await toolStep(h)                    // 计数 1
    await toolStep(h)                    // 计数 2 —— 再来一个就该响
    console.log('       · 前置：已经把机制① 的计数喂到 n-1 = 2（否则下面 D3 会因为"还没到 n"而假绿）')
    await bossThenStep(h)                // 回答他的那一步：② 插进本步 messages；老板在等，我还没开口
    check('D1', 4, '老板开口 + 走到这一步 ⇒ 1 条（② 的落点就是"那句话之后、我开口之前"）', h.count(), 1)
    await h.stepStart()                  // ⚠️ step/start 排在老板那句话**之前**（真日志 seq 767→768）
    await h.toolResult()                 // 守门 A 拦住；若没有 A，守门 B 也只会吃掉这一个
    await h.stepBegin()
    checkIf(oneWorks, 'D2', 4, '老板说完、我还没开口时来了一个工具结果 ⇒ 不让路就不对了', h.count(), 1)
    await h.toolResult()                 // 🔴 这一个才是判据：没有守门 A ⇒ 计数到 3 ⇒ 会多贴一条
    await h.stepBegin()
    checkIf(oneWorks, 'D3', 4, '紧接着再来一个 ⇒ 仍不许贴（没有守门 A 的话这里必然会多一条）', h.count(), 1)
    await h.iSpeak()                     // 我开口了 ⇒ 守门 A 解除
    await h.toolResult()
    await h.stepBegin()
    checkIf(oneWorks, 'D4', 4, '我开口之后，工具结果恢复正常（守门 A 不是永久关闭机制①）', h.count(), 1)
    await h.toolResult()
    await h.stepBegin()                  // 第 3 个"被计数的"结果 ⇒ 机制① 响（落在这一步）
    check('D5', 4, '开口之后第 2 个工具结果 ⇒ 机制① 回到正轨', h.count(), 2)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ E · 守门 B：机制② 刚摆过的那一步，机制① 跳过（口径 4）═══')
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const h = await harness(fixture)
    await h.turnStart()
    await toolStep(h)                    // 计数 1
    await toolStep(h)                    // 计数 2
    await bossThenStep(h)                // ② 摆 1 条（插进本步的 messages）
    await h.iSpeak()                     // 我开口了 ⇒ 守门 A 不成立，这一组只测守门 B
    await h.toolResult()                 // 🔴 若没有守门 B：计数到 3 ⇒ 同一个请求里两条 style
    await h.stepBegin()                  // 走到步边界 —— 机制① 的账只能在这儿看见
    check('E1', 4, '"老板的话 + 机制② + 第一个工具结果"里 style 只出现一次', h.count(), 1)
    await h.toolResult()
    await h.stepBegin()                  // 🔴 这一个才是判据：跳过的那一个不计数 ⇒ 再一个就凑满 n
    check('E2', 4, '【口径点 B1】跳过的那一个"不计数" ⇒ 再一个工具结果就让机制① 响', h.count(), 2)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ F · 同一刻度重复组装不重复贴（口径 3 · 机制② 不重复）═══')
  // ═══════════════════════════════════════════════════════════════════════════
  {
    // 先立阳性对照：证明"这一套挂载确实会贴"。后面的 0 才有意义。
    const ctl = await harness(fixture)
    await ctl.turnStart()
    await bossThenStep(ctl)
    check('F1', 3, '【阳性对照】老板开口 + 走到这一步 ⇒ 立刻 1 条', ctl.count(), 1)
    for (let k = 0; k < 5; k++) await ctl.assemble()
    check('F2', 3, '再装配 5 次（收件箱里没有老板的话）⇒ 还是那 1 条', ctl.count(), 1)
    for (let k = 0; k < 4; k++) await toolStep(ctl)   // 第 1 个被守门 B 吃掉，第 4 个让机制① 响
    check('F3', 3, '等机制① 也响过一次 ⇒ 2 条', ctl.count(), 2)
    for (let k = 0; k < 5; k++) await ctl.assemble()
    check('F4', 3, '再装配 5 次 ⇒ 还是那 2 条', ctl.count(), 2)

    // 冷启动：一条触发事件都没有时，装配本身绝不许贴
    //（"每个步边界都贴"是 2026-09-24 老板在 GUI 里当场喊停的灾难）。
    const cold = await harness(fixture)
    await cold.turnStart()
    for (let k = 0; k < 5; k++) await cold.assemble()
    checkIf(ctl.count() === 2, 'F5', 3,
      '一条触发事件都没有、连装配 5 次 ⇒ 一条都不许贴', cold.count(), 0)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ G · 注入消息的形状与正文（§形状）═══')
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const h = await harness(fixture)
    await h.turnStart()
    // ⚠️ **`6` 是夹具的"量程"，不是产物刻度**：夹具的 `style.md` 是 `buildFixture()` 按
    //    `FIXTURE_STYLE(3)` 造出来的 ⇒ 第 3、第 6 个结果各贴一条，于是 `G0` 要"恰好 2 条"。
    //    这是**探针自己的量程**（改夹具 = 换量程，要交代，见 `CRITERION['§夹具']`）；
    //    产物那份 `style.md` 的刻度（今天是 10）**到不了这一组** —— `G5` 的期望值也已经是
    //    "实现读到的那份落盘正文"而不是一个写死的数（`F-106`）。
    for (let k = 0; k < 6; k++) await toolStep(h)   // 第 3、第 6 个结果各贴一条
    const got = h.injected.map((x) => x.message)
    // ⚠️ 先把"确实贴了两条"钉死：不然 `[].every(...)` 恒真，
    //    一条都没贴的时候形状检查会**假绿** —— 那比红还坏。
    check('G0', 6, '先确认这一组真的贴了 2 条（否则下面几条形状断言会因为空数组而恒真）', got.length, 2)
    const twoTexts = (pick) => (got.length === 2 ? got.map(pick) : `只贴了 ${got.length} 条`)
    check('G1', 6, '每条的 role 都是 user', twoTexts((m) => m.role), ['user', 'user'])
    check('G2', 6, "content 是 [{type:'text', text}]", twoTexts((m) => m.content?.map((c) => c.type)), [['text'], ['text']])
    // 🔴 2026-10-01 改：**期望值过期，不是代码错。**
    //    老期望 `{kind:'plugin', plugin:'agenia'}` 是 **v4 之前的形状**；会话格式升到 v4 之后，
    //    `'plugin'` 这个笼统身份被框架**拒收**（报文原文：
    //    `format v4 message requires a producer-owned source kind` —— **整轮运行直接失败**，
    //    2026-09-28 真回合撞过）。现在写的是自己的名字 `plugin:agenia`，
    //    并且带上了 `form: 'notice'`（v4 起 GUI 按它分派渲染）与 `summary`（折叠行那一眼看到的分数）。
    //    真回合取证：2026-10-01 桌面端会话流 seq 19/35/52/63/80/89/106/115/130/145 全是这个形状，
    //    `summary` 逐条都是 `【情绪板】…` 那一行。
    //    ⇒ 这条**不是"改绿"**：它现在钉的是一个**能判真假**的新形状（少 `form` 就退化成 opaque，界面上看不到情绪板）。
    const sourceShape = (m) => {
      const s = m?.source ?? {}
      return { kind: s.kind, form: s.form, 有summary: typeof s.summary === 'string' && s.summary.length > 0 }
    }
    check('G3', 6, "source 是 {kind:'plugin:agenia', form:'notice', 带非空 summary}（v4 起 'plugin' 会被拒收）",
      twoTexts(sourceShape),
      [{ kind: 'plugin:agenia', form: 'notice', 有summary: true },
        { kind: 'plugin:agenia', form: 'notice', 有summary: true }])
    const ids = got.map((m) => m.id)
    checkTrue('G4', 6, '每条一个 uuid，且互不相同',
      ids.length === 2 && ids.every((x) => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x))
        && new Set(ids).size === ids.length,
      `拿到 ${ids.length} 条：${ids.join(', ')}`)
    // 🔴 期望值**不写死刻度**：风格尾巴取自"实现读到的那份 `style.md` 落盘正文"（`fixtureStyleOnDisk`）。
    //    刻度（`<!-- every: N -->`）改动 ⇒ `cutTail` 把注释剥掉 ⇒ 这一格**不动**。
    // 🔴 而 **F-102 的时间行**（`现在 …（周X）`）是 `tailBodyOf` 拼出来的第 3 段、**不是** `style.md` 的一部分
    //    ⇒ 只把它的**形状**归一再比（值来自 `Date.now()`，钉值就等于把这一格钉在"跑的那一分"上）。
    //    这一族里它**只**出现在 ① 到点那一刀（G 组两个触发点都是 ①）⇒ 期望值就是"风格尾巴 + 一行时间行"。
    //    ⚠️ 契约的段序再加一段（`inject.js::tailBodyOf` 里那条注释）时，这一格要同批跟 —— 那是有意的：
    //       它是"注入正文长什么样"的判据，正文多一段它就该红。
    // 🔴 **改前的义务 vs 改后的义务（第 4 关 `R-6`/§2.2 要求写准）**：
    //    改前它把时间行当"**多出来的东西**"判红（那时期望值里没有它）；
    //    改后它是期望值的一部分 ⇒ **时间行多了红、少了也红**。
    //    ⇒ 这一格现在**新担了一条**"① 到点那一刀必须有时间行"的义务，验收时别读成"只是把红改绿"。
    const want = [cutTail(fixtureStyleOnDisk(fixture)), TIME_LINE_TOKEN].join('\n\n')
    check('G5', '§形状', '**尾巴那一段**与 style.md 切口之前那一段逐字一致（剥掉全部 HTML 注释后 trim）'
      + '；其后**恰好**一行 F-102 时间行（只认形状、不认那几点的值；多一行少一行都红）',
      normalizeTimeLines(stylePartOf(got[0]?.content?.[0]?.text)), want)
    checkTrue('G6', 6, '正文里不含任何 `<!--`（注释真被剥了，不是只剥第一行）',
      got.length === 2 && got.every((m) => !m.content[0].text.includes('<!--')), `拿到 ${got.length} 条`)
    checkTrue('G7', 6, '正文没有外框（不许出现"自动提醒"这类护栏）',
      got.length === 2 && got.every((m) => !/自动提醒|REMINDER_(HEAD|TAIL)|不是老板的消息/.test(m.content[0].text)),
      `拿到 ${got.length} 条`)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ G8–G13 · F-126：机制② 与「只有板子变了」那一刀都得带常识与时间行（§F-126 / §F-126b）═══')
  // ═══════════════════════════════════════════════════════════════════════════
  // 病（定形：`.team/leader/2026-10-22/spec-F-126.md`）：
  //   `tailBodyOf(id, { cut })` 里 `if (cut)` 才拼「常识 + 时间行」，而机制② 的调用点传 `cut: false`
  //   ⇒ 一轮里 `tool/result` 少于 `every`（今天 10）时，常识与时间**一次都不出现**。
  //   老板 2026-10-22 报的就是这一格：他每句话之后那条组装尾巴里没有时间也没有常识。
  //
  // 🔴 **这一族必须自带 `.runtime/common-sense.md`，而默认夹具必须继续没有它**（两件事都要紧）：
  //    · 默认夹具没有这份文件 ⇒ `commonSenseOf()` 恒 `undefined` ⇒ 在默认夹具上量"常识在不在"
  //      **永远量不到**，会拿一条没有常识的尾巴走绿（假绿）。
  //      实测：全份探针此前**一条**判据都没碰过「共享记忆 · 常识」这一段（grep 零命中）。
  //    · 反过来给默认夹具补上它，`G5` 的逐字期望值会当场多一段 ⇒ 那是**删改既有格**，不是新增。
  //    ⇒ 只有这一族用 `buildFixture({ commonSense: FIXTURE_COMMON_SENSE })`。
  //
  // 🔴 **反向三红的合法性靠 `G11`**（阳性对照是"红"这个字唯一的合法性来源）：
  //    `G8`/`G9`/`G11` 共用**同一个内容根 `f10`**（同一份 `style.md` 刻度、同一份常识文件）。
  //    改前：`G11`（机制① 到点那一刀）**绿** ⇒ 证明这份常识文件真的被读到了、常识段真的检测得到；
  //    于是 `G8`/`G9`/`G10` 的红就只剩一个解释：**机制② 那条路不拼常识与时间**。
  //    少了 `G11`，"三红"可能只是"夹具没写进去" —— 那是拿前提失败冒充 bug。
  //
  // ⚠️ 期望值只钉**形状与次序**：时间行的值来自 `Date.now()`，钉值等于把判据钉在"跑的那一分"上
  //    （同 `G5`）。常识段钉**逐字** —— 那是夹具写下去的字节，不随机器 / 时刻变。
  // ⚠️ 段序是契约（`inject.js::tailBodyOf` 那条注释）：`style → 常识 → 时间 → 板子 → 情绪`。
  {
    const SENSE_BLOCK = `## 共享记忆 · 常识\n\n${FIXTURE_COMMON_SENSE.trim()}`
    /** 两段都在、且常识在前 —— 这一族每一格的期望值。 */
    const WANT_SECTIONS = {
      常识段: '有（逐字 = 夹具那一份）',
      时间行: TIME_LINE_TOKEN,
      次序: '常识 → 时间',
    }
    /**
     * 一条注入正文的段读数：常识在不在（**逐字**）、时间行在不在（**只认形状**）、谁在前。
     * ⚠️ 一件都没有时也给同一形状的读数 —— 红的时候能一眼分出"缺段"和"被改成别的样子"。
     */
    const sectionsOf = (text) => {
      if (typeof text !== 'string') {
        return { 常识段: '（一条尾巴都没有）', 时间行: '（没有）', 次序: '（缺段，判不了）' }
      }
      const senseAt = text.indexOf(SENSE_BLOCK)
      // ⚠️ `TIME_LINE` 是整段形状（`^…$`）⇒ 用 `m` 让它按**行**匹配，不去动它本身。
      const time = new RegExp(TIME_LINE.source, 'm').exec(text)
      return {
        常识段: senseAt < 0 ? '（没有）' : '有（逐字 = 夹具那一份）',
        时间行: time === null ? '（没有）' : TIME_LINE_TOKEN,
        次序: senseAt < 0 || time === null
          ? '（缺段，判不了）'
          : (senseAt < time.index ? '常识 → 时间' : '时间 → 常识（次序反了）'),
      }
    }
    /**
     * 板子那一段在不在、以及它落在时间行的哪一边 —— `G13` 用。
     * 段序是契约（`inject.js::tailBodyOf` 那条注释）：板子排在时间行**之后**、情绪段之前。
     * ⚠️ 红的时候要能一眼分出「没有板子」和「板子位置不对」：两种都错，但不是同一个修法。
     */
    const boardOrderOf = (text) => {
      if (typeof text !== 'string') return '（一条尾巴都没有）'
      const boardAt = text.indexOf('【这一票的进度】')
      if (boardAt < 0) return '（没有）'
      const time = new RegExp(TIME_LINE.source, 'm').exec(text)
      if (time === null) return '有（时间行缺 ⇒ 次序判不了）'
      return boardAt > time.index ? '有（在时间行之后）' : '有（在时间行之前 —— 段序反了）'
    }

    const f10 = buildFixture({ style: FIXTURE_STYLE(10), commonSense: FIXTURE_COMMON_SENSE })
    const f0 = buildFixture({ style: FIXTURE_STYLE(0), commonSense: FIXTURE_COMMON_SENSE })
    try {
      // ── G8（定形验收口径 1）：老板开口 + **0 个工具结果** ──────────────────────
      const h1 = await harness(f10)
      await h1.turnStart()
      await bossThenStep(h1)                       // 他开一次口，走到回答他的那一步：0 个工具结果
      check('G8', '§F-126',
        '① 老板开口 + **0 个工具结果**（every: 10）⇒ 机制② 那条尾巴**同时**带'
          + '「## 共享记忆 · 常识」与时间行',
        { 注入条数: h1.count(), ...sectionsOf(h1.lastText()) },
        { 注入条数: 1, ...WANT_SECTIONS })

      // ── G9（定形验收口径 2 = **老板报的那一格**）：同一回合只有 3 个工具结果 ──────
      const h2 = await harness(f10)
      await h2.turnStart()
      for (let k = 0; k < 3; k++) await toolStep(h2)   // every: 10 ⇒ 机制① 一次都不响
      // ⚠️ 这一格自带前提：先钉"机制① 在这之前一条都没贴"。不然刻度要是被改成 3，
      //    下面读到的那条尾巴就是**机制① 的**（它本来就有常识与时间）⇒ 这一格变成假绿。
      const oneBefore2 = h2.count()
      await bossThenStep(h2)
      check('G9', '§F-126',
        '② **老板报的那一格**：同一回合只有 3 个工具结果（every: 10 ⇒ 机制① 一次都没响）'
          + '+ 老板开口 ⇒ 机制② 那条尾巴**同时**带常识与时间行',
        { '机制①到点次数': oneBefore2, 注入条数: h2.count(), ...sectionsOf(h2.lastText()) },
        { '机制①到点次数': 0, 注入条数: 1, ...WANT_SECTIONS })

      // ── G10（定形验收口径 3）：`every: 0` ⇒ 机制① 关掉，机制② 那条**仍然**要带 ──
      const h3 = await harness(f0)
      await h3.turnStart()
      for (let k = 0; k < 4; k++) await toolStep(h3)   // every: 0 ⇒ 一条都不贴
      const oneBefore3 = h3.count()
      await bossThenStep(h3)
      check('G10', '§F-126',
        '③ `every: 0`（机制① 关掉）⇒ 机制② 那条**仍然**同时带常识与时间行'
          + '（n=0 的意思是"只留机制②"，不是"两条都关"）',
        { '机制①到点次数': oneBefore3, 注入条数: h3.count(), ...sectionsOf(h3.lastText()) },
        { '机制①到点次数': 0, 注入条数: 1, ...WANT_SECTIONS })

      // ── G11（定形验收口径 4）：机制① **到点那一刀** —— 现状不许退化 ─────────────
      // 这一格同时是 `G8`–`G10` 的**阳性对照**（同一份 `f10`：常识真的读得到、检测得到）。
      const h4 = await harness(f10)
      await h4.turnStart()
      for (let k = 0; k < 10; k++) await toolStep(h4)  // 第 10 个结果 ⇒ 机制① 到点
      check('G11', '§F-126',
        '④ 机制① **到点那一刀**（第 10 个工具结果）⇒ 常识与时间行照旧都在'
          + '（这一格是**防退化**：F-126 不许把它弄丢；它同时是 G8/G9/G10 的阳性对照）',
        { 注入条数: h4.count(), ...sectionsOf(h4.lastText()) },
        { 注入条数: 1, ...WANT_SECTIONS })

      // ── G12（**围栏**，不是定形那四格之一）：除了那三个理由，谁都不许单独触发 ──────
      // 定形的不做清单点名要一条「防第四个偷偷进来」的判据：
      //   触发点 = ① 每 n 个工具结果 · ② 老板开口之后 · ③ 板子内容变了（老板 2026-10-22 认了板子不算违约）
      //   —— **就这三个，不许再加第四个**。
      // 这里喂的是一串"看着像但都不算"的事件（这一回合 `every: 10`，一个工具结果都没有 ⇒ ① 根本不成立）：
      //   `turn/start` · `step/start` · `step/end` · `tool/call` · `assistant/message`（我开口）·
      //   一条 `source.kind: 'plugin'` 的 user 消息（系统自己发的，不是他）· 纯装配。
      // ⚠️ **边界写清，别假装覆盖得更宽**：这是一张**黑名单** —— 它只钉**这七种**事件今天不触发，
      //    拦不住"明天在第八种事件上偷偷加一个"。真要挡住第四个，靠的是 `inject.js`
      //    `agent/pre-step` 里那**一行**唯一的出口（`if (!byTwo && !byOne && !boardChanged) return`），
      //    加新理由必须同时改那一行与 CONTRACT.md 的那一节 —— 那半边是评审的眼睛，不是这一格。
      const h5 = await harness(f10)
      await h5.turnStart()
      await h5.stepStart()
      await h5.stepEnd()
      await h5.toolCall()
      await h5.iSpeak()
      await h5.plugin()
      await h5.stepBegin()      // 那条 plugin 消息被领进这一步：它不许被读成"老板又开了一次口"
      await h5.assemble()
      check('G12', '§围栏',
        '【围栏·不是四格之一】七种"看着像触发"的事件（turn/start · step/start · step/end · tool/call · '
          + 'assistant/message · 一条 plugin 的 user 消息 · 纯装配）⇒ **一条都不许贴**'
          + '（这一格只判这七种事件不触发；它证明不了"触发点只有三个"）',
        { 注入条数: h5.count() }, { 注入条数: 0 })

      // ── G13（**板子那一刀**；2026-10-22 老板拍「一条尾巴就是完整的包」）─────────────
      // 病：这一刀以前**不带**常识与时间 —— 唯一调用点传的是 `withSense: byOne || byTwo`，
      //     板子那条理由不在里面。而全份探针**没有一格**钉着它（`G12` 那几句注释是全份唯一
      //     提到「板子」的地方）⇒ 行为没有判据 = 随便谁改回去都发现不了。
      // 现场：老板一个字没说（收件箱空 ⇒ `byTwo = false`）、工具结果远不到 `every`
      //   （`every: 10`，这一格只喂 1 个 ⇒ `byOne = false`）⇒ **唯一**的理由是 `boardChanged`。
      // 🔴 板子的账本只听**插件事** `tools/result`（`inject.js` 的 `ctx.on('tools/result')`）；
      //    `session/event` 的 `tool/result` 只喂 ① 的计数 ⇒ 用 `h6.teamResult('team_dev')` 造它。
      // 🔴 **这一格的反向读数**（"红"这个字唯一的合法性来源）：把 `tailBodyOf` 那一处换回
      //    `withSense: byOne || byTwo`（`.team\dev\2026-10-22\_tmp\inject-byoneortwo-f126-2.mjs`，
      //    只差那一行）⇒ **G13 红**（常识段 / 时间行都读成「（没有）」），其余 220 格全绿。
      //    跑法：`AGENIA_PROBE_ENTRY=<那份副本> AGENIA_PROBE_PRODUCT_DIR=<presets\agenia>`
      //    （同 `F-126` 那次的对照；只给 `ENTRY` 不给 `PRODUCT_DIR` 会把量产物那一族整批换掉）。
      const h6 = await harness(f10)
      await h6.turnStart()
      await h6.iSpeak()                        // 我开口（不是触发点）
      await h6.teamResult('team_dev')          // 🔴 板子从"没有"变成"开发 1"（他一句话没说）
      await h6.toolResult()                    // 同一件事的会话事件：① 的计数 1/10，远不到点
      const oneBefore6 = h6.count()            // 前提：到这一步为止 ① 与 ② 一条都没贴过
      const boardStep = await h6.stepBegin()   // 纯步边界：收件箱空 ⇒ ② 不成立
      const text6 = h6.lastText()
      check('G13', '§F-126b',
        '【板子那一刀】**只有板子变了**（他一句话没说 + 工具结果不到 `every`）⇒ 那条尾巴'
          + '**同样**同时带「## 共享记忆 · 常识」与时间行，段序仍是'
          + ' `style → 常识 → 时间 → 板子 → 情绪`',
        {
          '①到点次数': oneBefore6,
          本步领到的消息数: Array.isArray(boardStep?.claimed) ? boardStep.claimed.length : '（读不到）',
          注入条数: h6.count(),
          ...sectionsOf(text6),
          板子: boardOrderOf(text6),
        },
        {
          '①到点次数': 0,
          本步领到的消息数: 0,
          注入条数: 1,
          ...WANT_SECTIONS,
          板子: '有（在时间行之后）',
        })
    } finally {
      rmSync(f10, { recursive: true, force: true })
      rmSync(f0, { recursive: true, force: true })
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ H · 改 every 不用重启；n=0 = 只留机制②（口径 1）═══')
  // ═══════════════════════════════════════════════════════════════════════════
  {
    // ⚠️ 这一组会一直改夹具的 `style.md`，所以**必须用自己那份夹具** ——
    //    共用一份的话，它把 every 改成 0 之后，后面几组会跟着变成"机制① 全程关着"。
    //    （实测踩过：M0 报 1 而不是 2，看着像守门 A 写错了，其实是这一组留下的 `every: 0`。）
    const hFixture = buildFixture()
    try {
      const h = await harness(hFixture)   // 起点是 <!-- every: 3 -->
      writeFileSync(join(hFixture, 'style.md'), FIXTURE_STYLE(1), 'utf8')
      await h.turnStart()
      await toolStep(h)
      check('H1', 1, '把第一行改成 every: 1 ⇒ 一个工具结果就贴（存盘即生效，没重新 apply、没重启）', h.count(), 1)

      writeFileSync(join(hFixture, 'style.md'), FIXTURE_STYLE(2), 'utf8')
      await h.turnStart()
      await toolStep(h)
      check('H2', 1, '改成 every: 2 ⇒ 第 1 个不贴', h.count(), 1)
      await toolStep(h)
      check('H3', 1, '第 2 个才贴', h.count(), 2)

      writeFileSync(join(hFixture, 'style.md'), FIXTURE_STYLE(0), 'utf8')
      await h.turnStart()
      await toolStep(h)
      await toolStep(h)
      await toolStep(h)
      await toolStep(h)
      check('H4', 1, 'every: 0 ⇒ 4 个工具结果一条都不贴（机制① 关掉）', h.count(), 2)
      await bossThenStep(h)
      check('H5', 1, 'every: 0 时机制② 照常 ⇒ n=0 的意思是"只留机制②"', h.count(), 3)
    } finally {
      rmSync(hFixture, { recursive: true, force: true })
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ I · 产物本身：真 `presets/agenia/` 那两份内容文件（口径 1、2、10、15）═══')
  // ═══════════════════════════════════════════════════════════════════════════
  // ⚠️ 这一族量的是**产物内容**（真 style.md 有多长、真 mood.md 在不在），不是逻辑 ——
  //    所以拿夹具当被测对象时（`AGENIA_PROBE_ENTRY` 指到别处，而且没给 `AGENIA_PROBE_PRODUCT_DIR`）
  //    **这一族不判**：那时它量的是"另一个东西的内容"，判了只会把阳性对照染红
  //    （09-25 那次 `I1` 就是这么红的）。
  // 🔴 **但"不判"不等于"消失"**（2026-09-26 返修）：夹具模式下这一族**逐条记挂起、照样进分母**。
  // 🔴 **挂起条数不手写**（`F-135` 第 4 关返修）：报数那一句读的是下面 `I_FAMILY_SKIPS` 的 `length`，
  //    和真正要挂起的那些编号**同一份数据** —— 手数的那一份这次跟对了、下次加格还会漏（评审原话）。
  //    这张表必须和下面真正判的那些编号一一对应（`Z9` 与"三种跑法分母对照"是它的守卫）。
  if (!TESTING_PRODUCT) {
    // ⚠️ 表先声明、后报数：下面那一句里的条数就是这张表的 `length`，不另写数字。
    const I_FAMILY_SKIPS = [
      ['I1', 1, '`style.md` 第一行那个 `<!-- every: N -->` 就是实现**实际用的**刻度（第 N 个工具结果才贴）'],
      ['I2', 1, '`every` 那枚注释在第一行'],
      ['I6', 6, '真 `style.md` 里有切口标记'],
      ['I7', 6, '真尾巴那一段 ≤ 400 字符'],
      ['I3', '§产物', '真产物贴出来的尾巴段 === 真 `style.md` 切完那一段'],
      ['I4', '§产物', '真产物尾巴段里不含 `<!--`'],
      ['I5', '§产物', '真产物尾巴段不是兜底那两句'],
      ['I10', 15, '真产物全长 = 情绪板之前那一段（style + 常识 + 时间行）+ 2 + 情绪段'],
      ['I11', 15, '真产物全长 ≤ 1000 字符'],
      ['I8', 2, '真 `mood.md` 解析得出恰好 3 条场景'],
      ['I9', 2, '`inject.js` 里"场景数必须正好 N"那个 N = 3'],
      ['I12', 13, '真 `mood.md` 的块里有那几档刻度（含亲密基线）、键名与值对'],
      ['I13', '§正反词', '真产物那一行 = 新形状：词**逐字**来自真 `mood.md` 的 `words`、正在前反在后、维度次序钉死'],
      ['I14', '§正反词', '真 `mood.md` 的 `words` **逐字** = 老板 2026-09-26 拍的那份表'],
      ['I15', '§改名', '真产物那条尾巴里 `疲劳` / `亲近` **不作为维度名**出现'],
      ['I16', 6, '真 `mood.md` 的「他久别归来」那道门还是 `.65`（没跟着基线一起抬）'],
      ['I17', 6, '真产物那一路上：他第一次开口、没夸没骂 ⇒ 亲密恰好 .50（基线）'],
      ['I18', '§产物', '真那份 `.runtime/common-sense.md` 在盘上、而且不是空壳（去掉空白后还有字）'],
    ]
    console.log(`（I 族：这次测的是夹具，不是产物 —— ${I_FAMILY_SKIPS.length} 条记挂起，分母不缩）`)
    // ⚠️ `O7`（"产物那个块解析得出 3 条场景"）也只在产物模式下判 —— 它同样必须进分母。
    skip('O7', 2, '产物的 `mood.md` 解析得出恰好 3 条场景：这次测的是夹具，不是产物 ⇒ **未验**')
    for (const [id, criterion, what] of I_FAMILY_SKIPS) skip(id, criterion, `${what}：这次测的是夹具，不是产物 ⇒ **未验**`)
  } else {
    const raw = readFileSync(STYLE_FILE, 'utf8')
    const head = raw.split('\n')[0] ?? ''
    const hit = /<!--\s*every:\s*(\d+)\s*-->/.exec(head)
    /**
     * 🔴 **`I1`：刻度不写死在判据里。**
     *
     * 老的写法是 `check(…, Number(hit[1]), 3)` —— 那一格 2026-10-20 假红过一次：
     * 老板把 `style.md` 第一行从 `every: 3` 改成 `every: 10`，**事实是有意改的**，
     * 而判据里钉着 3 ⇒ 红得和"实现坏了"一模一样。那种红会把人教成"忽略脚本"。
     *
     * 现在这一格钉的是**实质**：`style.md` 第一行那个数 **= 实现实际用的刻度**。
     * ⚠️ 不能写成"从文件读一个数、再跟同一个数比" —— 期望值和实现读**同一份来源**时，
     *    两边永远相等，那不是判据（`cand-20261016-selfsourced-order01`）。
     *    所以量的是**行为**：喂第 `N` 个工具结果时正好贴一条，第 `N-1` 个时一条都不贴。
     *    ⇒ 刻度改成 10 它照样绿（真值跟着走）；实现把刻度读错 / 读死 / 不读它 —— 红。
     *    ⇒ 第一行**没有**那枚注释时，I2 红，这一格也红（实现会静默退到 `DEFAULT_EVERY`）。
     */
    const everyFromFile = hit === null ? null : Number(hit[1])
    /**
     * 喂几步。
     * · 刻度 ≥ 1 ⇒ 正好喂 `N` 步（第 N 步才该贴）。
     * · 刻度 = 0（机制① 关着）⇒ 喂 **5** 步：只喂 1 步的话，"真关着"和"刻度读错了"
     *   在读数上**一模一样**（都是 0）—— 那是个假绿。5 步是够看的样本量，
     *   **故意不写 3**：3 是实现的兜底常数（`DEFAULT_EVERY`），抄进探针就等于
     *   把"读不出来就退兜底"那条错路写成期望值。
     * · 刻度 > `STEPS_CAP`（`style.md` 第一行一个手滑的 `every: 100000`）⇒ **不喂、直接红**，
     *   报文写明"超出探针量程，这一格判不了"。**不许静默截断**：截断会把错刻度喂成绿。
     */
    const STEPS_CAP = 200
    const beyondCap = everyFromFile !== null && everyFromFile > STEPS_CAP
    const steps = beyondCap ? 0 : (everyFromFile === null ? 1 : (everyFromFile === 0 ? 5 : everyFromFile))
    const everyH = await harness(PRODUCT_DIR)
    await everyH.turnStart()
    let firstTailAt = 0     // 0 = 这几步里一条都没贴
    for (let k = 1; k <= steps && firstTailAt === 0; k++) {
      await toolStep(everyH)
      if (everyH.count() > 0) firstTailAt = k
    }
    check('I1', 1, '`style.md` 第一行那个 `<!-- every: N -->` 就是实现**实际用的**刻度：'
      + '前 N−1 个工具结果不贴、第 N 个正好贴一条（刻度值本身不写死在这一格里）',
      beyondCap ? '（没喂步：刻度超出探针量程）' : firstTailAt,
      beyondCap
        ? `刻度 ${everyFromFile} 超出探针量程（> ${STEPS_CAP} 步）⇒ 这一格判不了，要人看`
        : (everyFromFile === null
          ? `第一行没有 \`<!-- every: N -->\`：${JSON.stringify(head)}（实现会静默退到 DEFAULT_EVERY ⇒ 这一格红）`
          : everyFromFile))
    checkTrue('I2', 1, '`every` 那枚注释在第一行，不在别处',
      /^\s*<!--\s*every:\s*\d+\s*-->/.test(head), JSON.stringify(head))

    // 🔴 口径 6 的真判据在这儿：真 `style.md` **切完**那一段有多长。
    const cut = cutTail(raw)
    checkTrue('I6', 6, '真 `style.md` 里有 `<!-- 尾巴到此为止 -->` 这个切口',
      TAIL_MARK.test(raw), '没有切口 ⇒ 尾巴贴的是全文（口径 7 允许，但口径 6 的长度就没救了）')
    checkTrue('I7', 6, `真尾巴那一段 ≤ 400 字符（实测 ${cut.length}；切口之前那一段）`,
      cut.length <= 400, `实测 ${cut.length} 字符`)

    const h = await harness(PRODUCT_DIR)   // 真产物、真正文
    await h.turnStart()
    await bossThenStep(h)
    const text = h.last()?.content?.[0]?.text
    // 🔴 F-126：机制② 那条尾巴**也带**常识与时间行 ⇒ 期望值 = style 段 + 常识块 + 一行时间行。
    //    常识块**逐字**来自盘上那份 `.runtime/common-sense.md`（探针自己拼，不调产物的函数）；
    //    时间行的值来自 `Date.now()` ⇒ 只认形状（同 `G5`）。
    //    ⚠️ 这条**不是**放松成 `includes`：比的是**`【情绪板】` 之前那一段**（`stylePartOf` 只切到那里），
    //    仍然整段 `===` —— 在**那一段里**，多一段 / 少一段 / 次序反了都红。
    //    `【情绪板】` 及它后面（情绪段）**一个字都不比**：情绪段在不在归 `I10`（`tailMood > 0`），
    //    整条注入的长度上限归 `I11`（≤ 1000 字符）。
    const i3SenseFile = join(PRODUCT_DIR, '.runtime', 'common-sense.md')
    // ⚠️ 读失败（不存在 / 是个目录 / 读不了）一律只落成 `undefined`，**不许把整份探针崩掉**：
    //    下面 `I18` 要把它判成一条**点名**的红；崩掉的进程报不出"是哪份文件没了"。
    let i3SenseRaw
    let i3SenseReadError
    try {
      i3SenseRaw = readFileSync(i3SenseFile, 'utf8')
    } catch (err) {
      i3SenseReadError = err?.code ?? String(err)
      i3SenseRaw = undefined
    }
    const i3Sense = typeof i3SenseRaw === 'string' && i3SenseRaw.trim().length > 0
      ? `## 共享记忆 · 常识\n\n${i3SenseRaw.trim()}`
      : undefined
    check('I3', '§产物', '真产物贴出来的**尾巴段** === 真 `style.md` 切完那一段 + 常识块 + 一行时间行'
      + '（style 与常识逐字、次序钉死；时间行只认形状）',
      normalizeTimeLines(stylePartOf(text)),
      [cut, ...(i3Sense === undefined ? [] : [i3Sense]), TIME_LINE_TOKEN].join('\n\n'))

    /**
     * 🔴 `I18`（`F-135`）：**真那份 `.runtime/common-sense.md` 在盘上、而且不是空壳**。
     *
     * 为什么这半件事必须单独一格：`I3` 的期望值**就是从这份文件的字节算出来的**
     * （`i3Sense === undefined ? [] : [i3Sense]`）—— 文件没了 / 只剩空白，期望值跟着少一段，
     * 两边仍然 `===`、格子仍然绿。⇒ `I3` 绿证明的是"盘上有什么就贴什么"，
     * 它**不证明盘上还有常识要贴**。这一格守的才是那件事本身。
     *
     * 口径与 `SURF-03` 一致：**去掉空白后必须还有字**（不是"字节数 ≥ 2" —— 一个换行也是 2 字节）。
     * ⚠️ 没并进 `SURF-01/03` 那张 13 份名单：那张是**注入面清单**，根在 `presets/agenia/*.md`；
     *    这份在 `.runtime/` 下，路径根不同 —— 混进同一张表就把"同一张表"的口径弄坏了。
     * ⚠️ `commonSenseOf()` / `tailBodyOf()` 的行为不动：读不到 ⇒ `undefined` + `warnOnce`、
     *    尾巴不拼那段。那个失败策略是对的（不编、不抛、出声）；缺的是"退化时有人报红"，
     *    这一格补的就是那一半。
     *
     * 编号 `I18`：`I` 族量的就是"真产物那几份内容文件"（`style.md` / `mood.md` / 这一份），
     * 这一格与 `I3` 是同一份字节的两面（贴出来的对不对 / 文件在不在）⇒ 归 `I` 族，接在 `I17` 后面。
     * 不挑 `I12`：`I12` 已经被占了（`mood.md` 那几档刻度），挑它就和既有编号撞车。
     * 不挑 `G14`：`G*` 量的是**注入行为**、靶子是夹具；这一格量的是盘上那份数据文件。
     */
    // 🔴 红因必须分流（`F-135` 第 4 关返修）：读数只有两态时，「文件不在」和「文件在盘上、
    //    但读不出正文」会印成同一句「盘上没有这份文件」—— 而后者恰恰是上面那个 `try/catch` 存在的理由。
    //    判据本体一个字不动（期望值仍是 `{在盘上:'是', 正文:'非空'}`），只让**实测**那一列说真话：
    //    真的不在 / 在盘上但是个目录（或不是普通文件）/ 是普通文件但读不出来 / 空壳。
    //    `statSync(..., { throwIfNoEntry: false })`：不存在（含路径中间那段不是目录）返回 `undefined`，
    //    存在就把"是不是普通文件"一并说出来 —— 一次调用分完流，不用 `existsSync` 再 `statSync`。
    //
    // 🔴 `statSync` 自己也抛（`F-135` 复审尾巴）：`throwIfNoEntry` 只把 **ENOENT** 落成 `undefined`，
    //    `EACCES` / `EPERM` / `EIO` 这些**照样抛** —— 于是"文件在盘上、但连 stat 都不让"时，
    //    探针会在**报出是哪份文件之前**整份崩掉（崩了就说不出红因）。和上面 `readFileSync` 那次
    //    是同一个形状，所以用同一个护法：留住错误码，往下走，让 `I18` 把它判成一条点名这一格的红。
    let i18Stat
    let i18StatError
    try {
      i18Stat = statSync(i3SenseFile, { throwIfNoEntry: false })
    } catch (err) {
      i18StatError = err?.code ?? String(err)
      i18Stat = undefined
    }
    // 🔴 `statSync` 那次没抛时，读数照旧由下面这一块分四支 —— 这一整块与上一版**逐字相同**
    //    （含缩进；只把落点名字从 `i18Reading` 改成 `i18StatReading`，好在下面再叠一支）。
    const i18StatReading = i18Stat === undefined
      ? { 在盘上: '否（盘上没有这份文件）', 正文: '（文件不在，判不了）' }
      : !i18Stat.isFile()
        ? {
          在盘上: `是（在盘上，但读不出正文：它${i18Stat.isDirectory() ? '是个目录' : '不是普通文件'}）`,
          正文: '（读不了，判不了）',
        }
        : i3SenseRaw === undefined
          ? { 在盘上: `是（在盘上，但读不出来：${i3SenseReadError}）`, 正文: '（读不了，判不了）' }
          : { 在盘上: '是', 正文: i3SenseRaw.trim().length > 0 ? '非空' : '空壳（去掉空白后一个字都没有）' }
    // 🔴 第五支（`F-135` 复审尾巴）：`statSync` **自己抛**了 ⇒ 上面那四支一支都落不到。
    // ⚠️ 这一支只能报"判不了"：stat 抛 EACCES 时**连"在不在盘上"都问不到**（那不是 ENOENT）。
    //    它抛则上面那次 `readFileSync` 在同样的权限下必然也抛，所以这里不会把"其实读得出来的
    //    正文"误判成红；反过来，万一真出现 stat 抛、read 却读到了字节（非常规文件系统），
    //    这一格仍是一条写着"哪一步抛的"的红 —— 不抛，也不会被吞成绿。
    const i18Reading = i18StatError !== undefined
      ? { 在盘上: `判不了（statSync 自己抛了：${i18StatError}）`, 正文: '（读不了，判不了）' }
      : i18StatReading
    check('I18', '§产物', '真那份 `presets/agenia/.runtime/common-sense.md` **在盘上**、而且**不是空壳**'
      + '（红 = 真常识文件没了 / 是空壳；那时 `commonSenseOf()` 只 `warnOnce` 一行、尾巴静默少一段，'
      + '而 `I3` 会跟着少算一段、照旧绿）',
      i18Reading,
      { 在盘上: '是', 正文: '非空' })
    checkTrue('I4', '§产物', '真产物贴出来的尾巴段里不含 `<!--`', typeof text === 'string' && !text.includes('<!--'))
    checkTrue('I5', '§产物', '真产物贴出来的尾巴段不是兜底那两句（读到了文件，不是回退默认值）',
      typeof text === 'string' && text.includes('# 语言风格'))

    // 🔴 **口径 15 的产物那半边**（2026-09-26 返修 · 评审条件 ①(a)）：`Y1`–`Y3` 量的是**夹具**，
    //    真产物那条尾巴以前**没有任何会自己再跑的判据** —— 它是实现岗一次性脚本的读数
    //    （`.team/leader/now.md` 的悬项 ⑧："没有任何断言守着"）。形状与 `Y2`/`Y3` 同源，
    //    只是把被测对象换成**真 `style.md` + 真 `mood.md`**。
    const tailStyle = typeof text === 'string' ? stylePartOf(text).length : 0
    const tailMood = typeof text === 'string' ? (moodPartOf(text) ?? '').length : 0
    checkTrue('I10', 15, `【口径 15·真产物全长】情绪板之前那一段（style + 常识 + 时间行）+ 恰好 2 个字符 + 情绪段 = 真发出去那一条（style ${tailStyle} + 2 + 情绪 ${tailMood}）`,
      typeof text === 'string' && tailMood > 0 && text.length === tailStyle + tailMood + 2,
      `实测全长 ${typeof text === 'string' ? text.length : '拿不到'}（style ${tailStyle} + 2 + 情绪 ${tailMood}）`)
    checkTrue('I11', 15, '【口径 15·真产物上限】真产物那条尾巴 ≤ 1000 字符（同 `Y3` 代拍的那个数）',
      typeof text === 'string' && text.length <= 1000, `实测 ${typeof text === 'string' ? text.length : '拿不到'} 字符`)

    // 口径 1/2 的**机器那半边**：真 mood.md 在不在、**三条**场景读不读得出来（人读那半边归组长）。
    const moodFile = join(PRODUCT_DIR, 'mood.md')
    const moodRaw = existsSync(moodFile) ? readFileSync(moodFile, 'utf8') : undefined
    const parsed = parseMoodBlock(moodRaw)
    check('I8', 2, '真 `presets/agenia/mood.md` 在，而且能解析出**恰好 3 条**场景（口径 2 的第一半）',
      parsed === undefined ? '读不到 / 没有 ```mood 块 / JSON 不合法' : parsed.scenes?.length, 3)

    // 🔴 **口径 2 的第二半（本批最贵的一条）**：`moodConstants()` 里那个写死的条数校验
    //    必须跟着从 6 改成 3。**改一边没改另一边** ⇒ 整块不认 ⇒ 情绪段整个不贴、
    //    而且只 `warnOnce` 一次然后永久闭嘴（方案第四节点名的那颗雷）。
    //    这里量**产物自己的源码**：把 `scenes.length !== N` 那个 N 抠出来。
    const productSrc = readFileSync(PRESET_ENTRY, 'utf8')
    const wantHits = [...productSrc.matchAll(/scenes\.length\s*!==\s*(\d+)/g)].map((m) => Number(m[1]))
    check('I9', 2, '`inject.js` 里"场景数必须正好 N"那个 N = **3**（和 mood.md 同步）',
      wantHits.length === 0 ? '（源码里找不到 `scenes.length !== N` 这个校验）' : wantHits, [3])

    // 🔴 **那四档刻度也得住在这个块里**（2026-09-26 返修 · 评审条件 ③(a)）。
    //    以前 `moodConstants()` 是**白名单**：`reunionScaleMinutes` / `reunionBase` /
    //    `praiseStep` / `blameStep` 传不进去 ⇒ 往块里写什么都没人读，
    //    而 `inject.js` 的注释还写着"以文件里的为准"（那句话当时是假的）。
    //    这条只钉**名字与值**（键名是机器与文件之间的接口，改名 = 换接口）；
    //    "真的从文件读"由 `Q11`–`Q15` 那五条行为判据证。
    const fourKeys = [
      ['reunionScaleMinutes', 240], ['reunionBase', 0.90], ['praiseStep', 0.06], ['blameStep', -0.08],
      // 🔴 2026-09-26 第三批：**亲密基线**也是"块说了算"的一档刻度 ⇒ 一起钉键名与值。
      ['closenessBase', 0.5],
    ]
    check('I12', 13, '真 `mood.md` 的 ```mood 块里有那几档刻度（四档 + 亲密基线），键名与值 = `reunionScaleMinutes` 240 · `reunionBase` .90 · `praiseStep` .06 · `blameStep` −.08 · `closenessBase` .50',
      fourKeys.map(([key]) => `${key}=${parsed?.[key] ?? '（没有）'}`),
      fourKeys.map(([key, value]) => `${key}=${value}`))

    // ── 2026-09-26 第三批新增的四条（改名的产物那半边 + 正反词的产物那半边）──────────
    /**
     * 🔴 **方案第七节 #1 / #2 / #3**（一条判据一起钉，因为它们是**同一行**的三个侧面）：
     *    真产物贴出去的那一行 = `【情绪板】掌控 P（正/正 ↔ 反/反） · 活力 P（…） · 亲密 P（…）`，
     *    其中**每一维的词逐字等于真 `mood.md` 的 `words`**、**正在前反在后**、**维度次序钉死**。
     * ⚠️ 词**不是从 `DIM_LABELS_3` 那类常量比的**，是从**刚读进来的那份文件**比 ——
     *    这样"文件改了、实现没跟上"和"实现自己编了一套词"都会被抓住。
     */
    const realLine = typeof text === 'string' ? ((moodPartOf(text) ?? '').split('\n')[0] ?? '') : ''
    const groups = realLine.startsWith('【情绪板】') ? realLine.slice('【情绪板】'.length).split(' · ') : []
    const cell = (g) => {
      const hit = /^(\S+) (1\.00|\.[0-9]{2})（(.+) ↔ (.+)）$/.exec(String(g))
      return hit === null ? undefined : { 标签: hit[1], 分: hit[2], 正: hit[3], 反: hit[4] }
    }
    const cells = groups.map(cell)
    const wantCells = DIM_KEYS_3.map((dim, i) => {
      const w = parsed?.words?.[dim]
      return {
        标签: DIM_LABELS_3[i],
        正: Array.isArray(w?.positive) ? w.positive.join('/') : '（文件里没有这一维的正词）',
        反: Array.isArray(w?.negative) ? w.negative.join('/') : '（文件里没有这一维的反词）',
      }
    })
    // ⚠️ 判据写成"**逐格比**（标签 / 正词 / 反词）+ 三格齐全"，**不比分数**：
    //    这一行里那个分数是**这一步的信号**算出来的，逐字比它会变成比"这一格跑了多少活"。
    //    分数的**写法**（`.NN` / `1.00`）已经由 `cell()` 那个正则钉住（解析不出来就是 undefined）。
    const lineOk = cells.length === 3 && cells.every((c, i) => c !== undefined
      && c.标签 === wantCells[i].标签 && c.正 === wantCells[i].正 && c.反 === wantCells[i].反)
    checkTrue('I13', '§正反词', '真产物那一行 = 新形状：词**逐字**来自真 `mood.md` 的 `words`、正在前反在后、维度次序钉死（方案第七节 #1/#2/#3）',
      lineOk,
      `实测那一行 ${JSON.stringify(realLine)}`
      + `（逐格：${cells.map((c) => (c === undefined ? '解析不出来' : `${c.标签}（${c.正} ↔ ${c.反}）`)).join(' | ')}）`)

    /**
     * 🔴 **方案第五节表 1**：那份词表是**老板逐字拍的**（他当天还改了两个词：麻木→懒惰、热络→爱慕）。
     *    这一条钉的是**文件本身**：谁把 `words` 改了（哪怕改得更通顺），这条当场红。
     * ⚠️ 逐维比、不整块 `JSON.stringify`：`words` 里那几个键的**先后**不影响贴出来的那一行
     *    （那一行的次序由 `DIMS` 决定），拿它去红人是过约束。
     */
    const WANT_WORDS = {
      control: ['笃定', '喜悦', '混乱', '失落'],
      fatigue: ['精神', '清醒', '疲惫', '懒惰'],
      closeness: ['爱慕', '亲近', '疏离', '冷淡'],
    }
    const gotWords = Object.fromEntries(DIM_KEYS_3.map((dim) => {
      const w = parsed?.words?.[dim]
      return [dim, [...(Array.isArray(w?.positive) ? w.positive : []), ...(Array.isArray(w?.negative) ? w.negative : [])]]
    }))
    check('I14', '§正反词', '真 `mood.md` 的 `words` **逐字** = 老板 2026-09-26 拍的那份表（每维：正词们在前、反词们在后）',
      DIM_KEYS_3.map((dim) => `${dim}=${gotWords[dim].join('/') || '（空）'}`),
      DIM_KEYS_3.map((dim) => `${dim}=${WANT_WORDS[dim].join('/')}`))

    /**
     * 🔴 **方案第七节 #6（改名的产物那半边）**：`疲劳` / `亲近` **作为维度名**不许再出现在真产物里。
     * ⚠️ 判据**不能**写成"整条尾巴里不许出现这两个词"：`亲近` 是**亲密那一维的正词之一**
     *    （`爱慕/亲近`）—— 词表里合法出现，那是**词**不是**维度名**。
     *    ⇒ 精确形状 = 「旧名字 + 后面跟一个分数」（`疲劳 .96` / `亲近 1.00`），
     *      分数行和例子行的括注都是这个形状。
     */
    const moodText = typeof text === 'string' ? (moodPartOf(text) ?? '') : ''
    const staleAsLabel = ['疲劳', '亲近'].filter((w) => new RegExp(`${w}\\s*(?:1\\.00|\\.\\d\\d)`).test(moodText))
    checkTrue('I15', '§改名', '真产物那条尾巴里 `疲劳` / `亲近` **不作为维度名**出现（`亲近` 作为**词**出现在 `爱慕/亲近` 里是合法的，不算）',
      staleAsLabel.length === 0,
      staleAsLabel.length === 0 ? '（干净）' : `还当维度名用着：${staleAsLabel.join('、')}`)

    /**
     * 🔴 **方案第五节【3】· 第四节"不做清单"**：「他久别归来」那道门**没跟着基线抬**，还是 `.65`。
     *    ⇒ 老板知情并接受"他离开约 40 分钟就会亮"。谁回头把门抬到 `.8x` 去"修"这件事，
     *      这条当场红 —— 它是那个决定在文件里的唯一落点（行为那一半归 `E2-10`）。
     */
    const welcome = (parsed?.scenes ?? []).find((s) => s?.id === '他久别归来')
    check('I16', 6, '真 `mood.md` 的「他久别归来」那道门还是 `closeness: [0.65, 1]`（老板拍了"门不动"，别拿它去修"40 分钟就亮"）',
      JSON.stringify(welcome?.when?.closeness ?? '（没找到这条场景）'), JSON.stringify([0.65, 1]))

    /**
     * 🔴 **方案第七节 #4 的"真产物那一路"**（纯函数那一路是 `E2-1`；文件那一半是 `I12`）。
     *    同一个 harness、**真 `mood.md` + 真 `inject.js`**：他**第一次开口**、那一句里没夸没骂
     *    ⇒ 重逢项 0、互动项 0 ⇒ 亲密就是**基线 .50**。
     *    ⚠️ 这一步的推论链要写清楚，免得被读成"照着读数编的"：
     *      他从没开过口 ⇒ `sincePreviousBossMinutes` = 0 · `boss()` 那句固定正文（"老板的话"）
     *      里一个夸 / 骂词都没有 ⇒ 两个句数都是 0 ⇒ 算式里只剩 `closenessBase`。
     */
    const realScores = scoresFromText(text)
    check('I17', 6, '【基线·真产物那一路】真 `mood.md` + 真 `inject.js`：他第一次开口、没夸没骂 ⇒ 亲密**恰好 .50**（方案第七节 #4）',
      realScores?.closeness, 0.5)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ L · 落点：机制② 落在"回答老板那一次"的 messages 里（口径 3）═══')
  // ═══════════════════════════════════════════════════════════════════════════
  // 🔴 这一族是 2026-09-26 返修专门加的"能红的断言"。
  //    旧的假 ctx 里 `inject()` 只是被记一笔，装配点还插在 `assistant/message` **之前** ——
  //    于是"装配里 inject ⇒ 落到下一步"这个错落点**结构上量不出来**（56/56 全绿，而落点是错的）。
  //    现在次序照真 harness：老板那句话进收件箱 ⇒ 步边界 `claim` 领走 ⇒ 装配 ⇒ `agent/pre-step`
  //    ⇒ **这一步的 messages 定了稿**（`stepBegin()` 的返回值就是它）。
  //    ⇒ 把落点改回"装配里 inject / 落到下一步"，L1/L2/L3/L6 当场红。
  {
    const h = await harness(fixture)
    await h.turnStart()
    await h.boss()
    const step = await h.stepBegin()          // 这一趟 = "回答老板的那一次"
    const bossAt = step.messages.findIndex((m) => m?.source?.kind === 'user')
    const styleAt = step.messages.findIndex(isStyleMessage)
    check('L0', 3, '【前提】这一步确实领到了老板那句话（否则下面几条是空跑）',
      { 领到的条数: step.claimed.length, 老板在第几条: bossAt }, { 领到的条数: 1, 老板在第几条: 0 })
    // 🔴 2026-10-01：这一族（L1/L2/L3/L6 + R1/R2/R5）曾被误判成"假 ctx 模型旧了"而挂起 ——
    //    真因是 `isStyleMessage` 没跟上 v4 的 `source` 形状（改成 `kind: 'plugin:agenia'` 之后
    //    它还在认 `source.plugin`）⇒ 七条恒红。**helper 修好之后，这一族是好的**，
    //    原文逐字放回（它们本来就是这个形状，别因为"红过"就改它们的期望值）。
    check('L1', 3, '机制② 的 style 落在**本步**（= 回答老板那一次的请求）的 messages 里',
      { 'style 在第几条': styleAt }, { 'style 在第几条': 1 })
    check('L2', 3, '它排在老板那句话**之后**',
      { 老板在第几条: bossAt, 'style 在第几条': styleAt }, { 老板在第几条: 0, 'style 在第几条': 1 })
    check('L3', 3, '这一步里只有一条 style（不是每条老板消息各来一条）',
      step.messages.filter(isStyleMessage).length, 1)

    const next = await h.stepBegin()          // 下一步：收件箱已经空了
    check('L4', 3, '**下一步**的 messages 里一条 style 都没有（落点不是"推迟一格"）',
      next.messages.filter(isStyleMessage).length, 0)

    // 老板的话还挂在收件箱里时，**装配本身**不许贴 —— 钉死"落点不是装配"。
    // （真 harness 里装配排在 claim 之后、他那句话落笔之前：那一刻它还没见过这句话。）
    const h2 = await harness(fixture)
    await h2.turnStart()
    await h2.boss()
    await h2.assemble()
    check('L5', 3, '老板的话还在收件箱里时，装配本身一条都不贴', h2.count(), 0)
    const step2 = await h2.stepBegin()
    check('L6', 3, '走到这一步才贴，而且就贴在本步',
      { 累计: h2.count(), 本步: step2.messages.filter(isStyleMessage).length }, { 累计: 1, 本步: 1 })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ M · 组员整个不贴（口径 5）═══')
  // ═══════════════════════════════════════════════════════════════════════════
  {
    // 【阳性对照】组长跑一个完整回合 —— 防止"为了关组员，把组长也一起关了"，
    // 同时它是 M3 的前提：组长都不贴的时候，"组员 0 条"是空跑出来的。
    const lead = await harness(fixture)
    await lead.assemble()
    await lead.turnStart()
    await bossThenStep(lead)
    for (let k = 0; k < 4; k++) await toolStep(lead)
    check('M0', 5, '【阳性对照·组长完整回合】机制② 1 条 + 机制① 1 条 ⇒ 2 条', lead.count(), 2)

    // 最小对照对（组长点名要的那条）：两条序列**逐事件相同**，只差装配里有没有那枚标记。
    const minLead = await harness(fixture)
    await minLead.turnStart()
    await bossThenStep(minLead)
    check('M1', 5, '【最小对照·组长】老板一句 + 走到那一步（装配不带标记）⇒ 注入 1 条', minLead.count(), 1)

    const minMate = await harness(fixture, { member: 'test' })
    await minMate.turnStart()
    await bossThenStep(minMate)
    checkIf(minLead.count() === 1, 'M2', 5,
      '【最小对照·组员】同一序列、装配带 `【组员:test】` ⇒ **0 条**（组员的开场消息不会换来一次注入）',
      minMate.count(), 0)

    const mate = await harness(fixture, { member: 'test' })
    await mate.assemble()          // 装配带标记 ⇒ 登记角色
    await mate.turnStart()
    await bossThenStep(mate)
    for (let k = 0; k < 4; k++) await toolStep(mate)
    checkIf(lead.count() === 2, 'M3', 5,
      '【组员完整回合】机制① 和机制② 都不生效 ⇒ 0 条', mate.count(), 0)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ J · 静态形状：旧机制删干净了没有 ═══')
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const src = readFileSync(PRESET_ENTRY, 'utf8')
    for (const [id, criterion, name, pattern, why] of [
      ['J1', 1, '`armed` 已删（被机制② 的 pre-step 落点取代）', /\barmed\b/,
        '旧口径"有真消息 ⇒ 下个组装必贴"是**落点看运气**的那一版，正是 09-24 出事的地方'],
      ['J2', 1, '`steps` / `lastRemindStep` 已删（"每 N 步"那套）', /\b(lastRemindStep|steps\s*=\s*new Map)\b/,
        '老板 09-25 定的是"每 n 个**工具结果**"，不是"每 n 步"'],
      ['J3', 1, '`REMINDER_EVERY_DEFAULT` 已删（默认改成 3 且从文件读）', /REMINDER_EVERY_DEFAULT/,
        '留着 8 就是两份来源，迟早对不上'],
      ['J4', 5, '`memberReminder()` 已删（组员那条路整个不要了）', /memberReminder/,
        '口径 8b 之后它就是死代码，留着迟早被人接回去'],
    ]) {
      checkTrue(id, criterion, name, !pattern.test(src), why)
    }
    // ⚠️ 别误伤：认组员靠的是这枚标记（`agent.cordis.yml` 的 deployment:persona-prefix 段），
    //    8b 关掉的是"给组员贴语气"，不是"认出他是谁"。
    checkTrue('J5', 5, '认组员的 `【组员:xx】` 标记还在（关的是语气，不是身份）',
      /【组员:\(\[a-z0-9\]/.test(src) || /ROLE_MARK/.test(src),
      '连标记一起删，组长和组员就再也分不开了')

    // ── 2026-09-26 返修加的三条静态判据（口径 1 的"读代码"那半边）──────────────
    // 🔴 上面 J1–J5 钉的是"旧机制别回来"；这三条钉的是**这一批的地基**：
    //    机制① 不许再走 `agent.inject()`（那正是撞 appending 守卫、被吞成 warnOnce 的那条路）。
    checkTrue('J6', 1, '`inject.js` 里 `agent.inject(` **零命中**（口径 1）',
      !/agent\.inject\s*\(/.test(src),
      '还在用它 ⇒ 只要是从 session/event 里调的，就必撞 dsh-session L1181 的守卫')
    const segOf = (start, end) => {
      const a = src.indexOf(start)
      if (a < 0) return undefined
      const b = src.indexOf(end, a + start.length)
      return src.slice(a, b < 0 ? src.length : b)
    }
    const sessionSeg = segOf("ctx.on('session/event'", "ctx.on('")
    checkTrue('J7', 1, '`session/event` 处理器那一段里**没有任何注入调用**（只记账、不写盘）',
      sessionSeg !== undefined && !/\binject\w*\s*\(/.test(sessionSeg),
      sessionSeg === undefined ? '找不到 `ctx.on(\'session/event\'` 这一段' : '那一段里还有 inject* 调用')
    const preStepSeg = segOf("ctx.on('agent/pre-step'", "ctx.on('system-prompt/assemble'")
    checkTrue('J8', 1, '`agent/pre-step` 那一段里能看见"这一步要不要贴尾巴"的判定（口径 2 的落点）',
      preStepSeg !== undefined && /(pendingTail|\w*[Tt]ail|styleOf)/.test(preStepSeg),
      preStepSeg === undefined ? '找不到 `ctx.on(\'agent/pre-step\'` 这一段' : '那一段里看不见尾巴判定')

    // 🔴 **2026-09-26 返修 · 装饰换成判据**（评审条件 ⑤）。
    //    唤起被砍 ⇒「距下班」那条信号整个删掉，`me-aqua.md` 的作息三行**没有任何机器读**。
    //    以前 `check-notes` 里那条断言测的是"那三行的格式还对不对" —— 它测的东西**死了**，
    //    前提没了、正则照样命中 ⇒ **永远绿**（不能翻面的判据 = 装饰）。
    //    ⇒ 换成"读它的代码一个都不许回来"。这条与 `check-notes` 里那条同源，**两处都要有**：
    //      `check-notes` 钉的是**产物那条固定路径**（它没法指向别处 ⇒ 翻面只能靠人看）；
    //      这一条钉的是**这次跑的那个入口** —— 拿一份真读过 `me-aqua.md` 的旧实现当入口
    //      （`AGENIA_PROBE_ENTRY=…`），它**当场红**，那才叫证据。
    checkTrue('J9', '§形状', '`inject.js` 里没有读 `me-aqua.md` 的代码（`ME_FILE` / `minutesToOffWork` / 距下班 零命中）',
      !/ME_FILE|minutesToOffWork|距下班/.test(src),
      ['ME_FILE', 'minutesToOffWork', '距下班'].filter((w) => src.includes(w)).join('、') || '（干净：一个都没有）')
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 时间与情绪模块的公共原料（N / O / Q / S / R / P 各族都用）
  // ───────────────────────────────────────────────────────────────────────────
  /**
   * 探针里**时间的唯一来源**（契约 3.5）：每条会话事件自带 `time`。
   * 起点是 2026-09-26（周六）09:00 +08:00 —— **固定值**，跑在哪天都一样 ⇒ 断言不会半夜变红。
   */
  const MIN = 60 * 1000
  const HOUR = 60 * MIN
  const T0 = Date.parse('2026-09-26T09:00:00+08:00')

  /** 一条**报错的** tool/result —— 真形状（`data.message.content[0].isError`）。A6 与 Q4 共用。
   *  @param line 错误报文里那行"关键话"（口径 5 的**错误指纹**认它；默认那一份 = A6/Q4 用的）。
   *  @param tool 工具名（指纹的另一半）。真日志里 `tool/result` 与 `tool/call` 是两条事件、
   *              这里省掉 `tool/call` 直接把它挂在 `data.tool` 上 —— 采集端两种读法都该认。 */
  let errorSeq = 0
  const errorResultEvent = (line = 'Error: 探针造的报错结果', tool = 'pwsh') => {
    errorSeq += 1
    return {
      turn: 1,
      step: 1,
      data: { tool, line },
      message: {
        id: `probe-error-${errorSeq}`,
        role: 'user',
        source: { kind: 'tool', callId: `probe-call-${errorSeq}` },
        content: [{
          type: 'tool-result',
          toolCallId: `probe-call-${errorSeq}`,
          content: [{ type: 'text', text: line }],
          isError: true,
        }],
      },
      error: { name: 'ProbeError', code: 'PROBE' },
    }
  }

  /**
   * 契约 3.2 那张"中性基线"表，逐字照抄。
   * 🔴 **三维版**：`errors` / `oks` / `steps` / `continuousMinutes` / `newThings` / `sameErrorCount`
   *    这些**老字段留着**（它们仍然是真信号的一部分：`recentResults` 数"最近 20 次"、
   *    `lastErrorAt` 给衰减钟用），新增的是 `pitCounts` / `netWorkMinutes` / `keywordPraise` /
   *    `keywordBlame` / `presentMinutes` / `absenceMinutes` 这几根**这一批真正吃**的旋钮。
   */
  const NEUTRAL_SIGNALS = {
    now: T0,
    recentResults: ['ok', 'ok', 'ok'],
    pitCounts: {},
    lastErrorAt: undefined,
    roundsSinceError: 0,
    errors: 0,
    oks: 3,
    steps: 3,
    sinceBossMinutes: 5,
    sincePreviousBossMinutes: 5,
    netWorkMinutes: 30,
    keywordPraise: 0,
    keywordBlame: 0,
  }

  /**
   * 每维的"强 / 弱"两个极端剖面（契约 3.2 那张控制字段表）。
   * ⚠️ 探针要验"信号加大 ⇒ 分数单调"，就必须知道**哪根旋钮拧哪一维** —— 这是契约钉死的，
   *    不是我猜的。场景命中（O 族）也用它造"落进区间"和"落不进区间"的两组信号。
   * 🔴 亲近的旋钮**两根一起拧**（`sinceBossMinutes` 与 `sincePreviousBossMinutes`）：
   *    契约里两个数只有一个进打分（重逢项优先取"他上一次开口之前离了多久"），
   *    但探针**不知道实现取的是哪一根** —— 只拧一根的话，另一边（中性 5 分钟）
   *    会把分钉死在 .01875，单调性就变成了假红。
   */
  const EXTREME = {
    // 掌控：连着翻车（窗口里全是错、同一个坑第 5 次）→ 一直顺（窗口全绿、没有坑）
    control: {
      strong: { recentResults: Array(20).fill('ok'), pitCounts: {} },
      weak: { recentResults: Array(20).fill('fail'), pitCounts: { 'pwsh|拒绝访问': 5 } },
    },
    // 活力：**分越高越有劲**（2026-09-26 改名时方向跟着翻了）⇒ 强 = 刚开工（净干 0）、
    //       弱 = 净干满量程（360 分钟）。⚠️ 这一对**必须跟名字一起翻**：
    //       还按"干满 = 强"写的话，`N9`/`N10` 会拿一个**满身疲惫的剖面**去要高分。
    fatigue: { strong: { netWorkMinutes: 0 }, weak: { netWorkMinutes: 360 } },
    // 亲密：就在手边 → 想他了（量程 240 分钟）
    // ⚠️ **弱剖面必须带骂句**：基线 .50 把地板抬到了 .50，
    //    只拧"重逢项"的话弱剖面就是 .50 —— 落不到 ≤ .35（那是老板 09-26 拍下的定义，不是实现没做）。
    //    ⇒ 弱 = 重逢项 0 **且** 三句骂（`.50 − 3×.08 = .26`）。这样"亲密真的拉得开"照样是一条能翻面的判据。
    closeness: {
      strong: { sinceBossMinutes: 240, sincePreviousBossMinutes: 240 },
      weak: { sinceBossMinutes: 0, sincePreviousBossMinutes: 0, keywordPraise: 0, keywordBlame: 3 },
    },
  }

  /** 按 `when` 里每一维的区间，造一组"落进去"（hit）或"落不进去"（miss）的信号。 */
  const profileFor = (when, want, now) => {
    const signals = { ...NEUTRAL_SIGNALS, now }
    for (const [dim, band] of Object.entries(when ?? {})) {
      const extreme = EXTREME[dim]
      if (extreme === undefined) continue
      const [lo, hi] = band
      const wantHigh = (lo + hi) / 2 >= 0.5
      const high = want === 'hit' ? wantHigh : !wantHigh
      // ⚠️ 深拷一层：这一批的旋钮里出现了**数组 / 对象**（`recentResults` / `pitCounts`），
      //    浅拷会让两组信号共用一个引用 ⇒ 后面改了它，前面那组跟着变（假绿的高发区）。
      Object.assign(signals, JSON.parse(JSON.stringify(high ? extreme.strong : extreme.weak)))
    }
    return signals
  }

  /** 夹具 `mood.md` 里那个 ```mood 块 —— 探针**自己解析**，不调产物的函数。 */
  const CONSTANTS = parseMoodBlock(FIXTURE_MOOD())
  /**
   * 被测入口导出的 `moodOf`（口径 10 要的"导出的纯函数"）。
   * ⚠️ **`moodOf` 与 `constants` 必须成套**：`moodOf(signals, constants)` 是按**传进去的那份**
   *    例库判命中、按那份常数算衰减的。所以下面每一个 `callMood` 都得把**对应那一套**常数递进去
   *    —— 夹具那几族递 `CONSTANTS`，产物场景库那一族递**产物自己那份**。
   *    （2026-09-26 返修：以前 `callMood` 写死了 `CONSTANTS`，于是 `O8` 是"产物场景 × 夹具常数
   *     × 产物句子"——**组合自相矛盾**，9 条红全是这么来的。见契约第八节。）
   */
  /** 被测入口导出的 `moodOf`（口径 10 要的"导出的纯函数"）。 */
  const ENTRY = await loadEntry()
  const moodOf = typeof ENTRY.moodOf === 'function' ? ENTRY.moodOf : undefined
  /** 调一次 moodOf：拿不到读数就带一句话回来，让断言照红，**不静默**。 */
  const callMood = (signals, constants = CONSTANTS) => {
    if (moodOf === undefined) return { 为什么: 'inject.js 没有导出 moodOf' }
    try {
      return { 值: moodOf(signals, constants) }
    } catch (error) {
      return { 为什么: `moodOf 抛了：${String(error)}` }
    }
  }
  const scoresOf = (result) => (result?.值?.scores === undefined ? undefined : result.值.scores)
  const sceneIdsOf = (result) => (Array.isArray(result?.值?.scenes) ? result.值.scenes.map((s) => s.id) : [])
  /** 分数怎么写（契约 3.4）：`toFixed(2)`，以 `0.` 开头就去掉那个 `0`。 */
  const fmtScore = (x) => {
    const text = Number(x).toFixed(2)
    return text.startsWith('0.') ? text.slice(1) : text
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ S · 假 ctx 自己的守卫：window 里注入必须撞 L1181（口径 15）═══')
  // ═══════════════════════════════════════════════════════════════════════════
  // 🔴 **这是整份探针的阳性对照里最要紧的一族。**
  //    守卫要是没补上（或者补坏了），假 ctx 就退回"inject() 永远成功"——
  //    那时**机制① 死了也会全绿**，正是 2026-09-26 之前一整天的形态。
  //    这两条量的是**工具自己**，跟被测实现无关；它们绿了，上面那些红才有意义。
  {
    const h = await harness(fixture)
    let insideError
    let insideThrew = false
    h.on('session/event', () => {
      if (insideError !== undefined) return
      try {
        h.agent.inject({
          id: 'guard-self-check',
          role: 'user',
          content: [{ type: 'text', text: '守卫自检' }],
          source: { kind: 'plugin', plugin: 'agenia' },
        })
      } catch (error) {
        insideThrew = true
        insideError = String(error)
      }
    })
    await h.turnStart(T0)
    checkTrue('S1', 15, '在 `session/event` 派发窗口里注入 ⇒ **抛** `session append cannot reenter …`',
      insideThrew && /cannot reenter while another append is being published/.test(String(insideError)),
      `拿到的是 ${brief(insideError)}`)

    // 窗口外（pre-step 那一刻）注入**不许**抛 —— 否则守卫就成了"把注入全拦掉"，同样是坏量尺。
    const h2 = await harness(fixture)
    let outsideError
    h2.on('agent/pre-step', async (payload, next) => {
      try {
        h2.agent.inject({
          id: 'guard-self-check-outside',
          role: 'user',
          content: [{ type: 'text', text: '窗口外自检' }],
          source: { kind: 'plugin', plugin: 'agenia' },
        })
      } catch (error) {
        outsideError = String(error)
      }
      return await next()
    })
    await h2.turnStart(T0)
    await h2.stepBegin(T0)
    check('S2', 15, '窗口外（pre-step）注入 ⇒ **不抛**，而且东西进了收件箱',
      { 抛错: outsideError === undefined ? '无' : brief(outsideError), 收件箱里那一条: h2.count() >= 1 ? '在' : '不在' },
      { 抛错: '无', 收件箱里那一条: '在' })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ R · 机制① 的新落点：追加到本步 messages 末尾（口径 2）═══')
  // ═══════════════════════════════════════════════════════════════════════════
  // 🔴 旧实现死在这一族上：它走 `agent.inject()` ⇒ 撞守卫（S1 那个）⇒ 被 catch 吞掉 ⇒
  //    "第 n 个工具结果"响 0 次。R1 实测 0 / 期望 1 就是那个现场。
  {
    const h = await harness(fixture)
    await h.turnStart(T0)
    await h.iSpeak(T0)
    await h.toolResult(undefined, T0 + 1000)
    await h.toolResult(undefined, T0 + 2000)
    const before = await h.stepBegin(T0 + 2500)
    check('R0', 2, '【前提】第 2 个结果之后那一步里没有 style（离 n=3 还差一个）',
      before.messages.filter(isStyleMessage).length, 0)

    await h.toolResult(undefined, T0 + 3000)      // 第 3 个 ⇒ 挂账
    const at = await h.stepBegin(T0 + 3500)
    check('R1', 2, '第 n 个工具结果之后的**下一步** ⇒ 本步 messages 里有 1 条 style',
      at.messages.filter(isStyleMessage).length, 1)
    checkTrue('R2', 2, '它**追加在末尾**（工具结果 → 我下一次开口 之间），不是插在最前面',
      at.messages.length > 0 && isStyleMessage(at.messages[at.messages.length - 1]),
      `本步 ${at.messages.length} 条，最后一条是 ${isStyleMessage(at.messages[at.messages.length - 1]) ? 'style' : '别的'}`)
    const after = await h.stepBegin(T0 + 4000)
    check('R3', 2, '再下一步 ⇒ 0 条（落点不许推迟一格）',
      after.messages.filter(isStyleMessage).length, 0)
    check('R4', 1, '整段下来机制① 一共只贴了 1 条（不是每一步都贴）', h.count(), 1)
  }
  {
    // 守门 B 在新落点上的形状：一步里同时"有老板的话"和"有一笔到期的机制①" ⇒ 不叠。
    const h = await harness(fixture)
    await h.turnStart(T0)
    await h.iSpeak(T0)
    await h.toolResult(undefined, T0 + 1000)
    await h.toolResult(undefined, T0 + 2000)
    await h.toolResult(undefined, T0 + 3000)      // 第 3 个 ⇒ 机制① 挂账
    await h.boss()                                // 老板这就开口了（还没到步边界）
    const step = await h.stepBegin(T0 + 4000)
    check('R5', 4, '同一批里既有老板的话、又有到期的机制① ⇒ 本步 style **恰好 1 条**（不叠）',
      step.messages.filter(isStyleMessage).length, 1)
    const next = await h.stepBegin(T0 + 5000)
    check('R6', 4, '② 赢下这一格 ⇒ ① 的挂账清掉（下一步也不再补一条）',
      next.messages.filter(isStyleMessage).length, 0)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ P · 尾巴限长 + 标记缺失退回全文（口径 6、7）═══')
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const h = await harness(fixture)
    await h.turnStart(T0)
    await bossThenStep(h)
    const text = h.lastText()
    // 🔴 F-126：机制② 那一刀也带时间行（默认夹具**没有** `.runtime/common-sense.md` ⇒ 没有常识段），
    //    所以期望值 = 切完那一段 + 一行时间行；仍整段 `===`，不是 `includes`。
    check('P1', '§形状', '夹具的尾巴段 === `cutTail(夹具 style.md)` + 一行时间行'
      + '（切口之前、剥注释、trim；时间行只认形状）',
      normalizeTimeLines(stylePartOf(text)),
      [cutTail(fixtureStyleOnDisk(fixture)), TIME_LINE_TOKEN].join('\n\n'))
    checkTrue('P2', 7, '切口**后面**那一大段不许出现在请求里（`## emoji` 表在切口后面）',
      typeof text === 'string' && !text.includes('## emoji'),
      `贴出来的正文里${typeof text === 'string' && text.includes('## emoji') ? '**有**' : '没有'}切口后面那一段`)
    checkTrue('P3', 6, `夹具尾巴里**情绪板之前**那一段（style 段 + 一行时间行）≤ 400 字符（实测 ${String(stylePartOf(text)).length}）`,
      typeof text === 'string' && stylePartOf(text).length <= 400,
      `实测 ${String(stylePartOf(text)).length} 字符（**不含**情绪段；整条注入的上限由 \`P7\` 的 1000 管）`)
  }
  {
    // 口径 7：喂一份**没有标记**的夹具 ⇒ 退回全文（不许静默变空）。
    const noMark = buildFixture({ style: FIXTURE_STYLE_NO_MARK(3) })
    try {
      const h = await harness(noMark)
      await h.turnStart(T0)
      await bossThenStep(h)
      const got = stylePartOf(h.lastText())
      // 🔴 F-126：机制② 那一刀也带时间行（夹具无常识文件 ⇒ 只多这一行）。仍整段 `===`。
      check('P4', 7, '没有 `<!-- 尾巴到此为止 -->` ⇒ **退回全文** + 一行时间行（逐字），而且不是空的',
        normalizeTimeLines(got),
        [stripComments(FIXTURE_STYLE_NO_MARK(3)), TIME_LINE_TOKEN].join('\n\n'))
      checkTrue('P5', 7, '退回的那一份**不许是空串**', typeof got === 'string' && got.trim().length > 0,
        `实测 ${brief(got)}`)
    } finally {
      rmSync(noMark, { recursive: true, force: true })
    }
  }
  {
    // 标记在最前面 ⇒ 切出来是空的 ⇒ 同样退回全文（口径 7 的同一句：不许静默变空）。
    const emptyCut = buildFixture({ style: FIXTURE_STYLE_EMPTY_CUT(3) })
    try {
      const h = await harness(emptyCut)
      await h.turnStart(T0)
      await bossThenStep(h)
      // 🔴 F-126：同 `P4` —— 机制② 那一刀也带时间行；仍整段 `===`。
      check('P6', 7, '标记在最前面（切口之前一个字都没有）⇒ 也退回全文 + 一行时间行，不是空串',
        normalizeTimeLines(stylePartOf(h.lastText())),
        [stripComments(FIXTURE_STYLE_EMPTY_CUT(3)), TIME_LINE_TOKEN].join('\n\n'))
    } finally {
      rmSync(emptyCut, { recursive: true, force: true })
    }
  }
  {
    // 【测试位代拍】整条注入（尾巴段 + 情绪段）≤ 1000 字符（口径 6 只管 style 段；这条是防情绪段自己失控的护栏）。
    const h = await harness(fixture)
    await h.turnStart(T0)
    await bossThenStep(h)
    const text = h.lastText()
    checkTrue('P7', 6, `整条注入（尾巴段 + 情绪段）≤ 1000 字符（实测 ${typeof text === 'string' ? text.length : '拿不到'}）`,
      typeof text === 'string' && text.length <= 1000, `实测 ${typeof text === 'string' ? text.length : '拿不到'} 字符`)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ N · moodOf：导出的纯函数 + 三维（口径 10、9）+ 单调性（口径 11）═══')
  // ═══════════════════════════════════════════════════════════════════════════
  {
    checkTrue('N0', 10, '`inject.js` 导出了 `moodOf`（口径 10 要的那个导出）',
      typeof moodOf === 'function', `typeof mod.moodOf = ${typeof ENTRY.moodOf}`)

    const first = callMood(NEUTRAL_SIGNALS)
    checkTrue('N0b', 10, '`moodOf(signals, constants)` 返回 `{ scores, scenes }`（同步，不是 Promise）',
      scoresOf(first) !== undefined && Array.isArray(first?.值?.scenes),
      `拿到的是 ${brief(first?.值 ?? first?.为什么)}`)

    // ① 确定性：同一组输入跑两遍，读数逐字相同。
    const again = callMood(NEUTRAL_SIGNALS)
    check('N1', 10, '【纯函数】同一组输入 ⇒ 同一组输出（跑两遍逐字相同）',
      JSON.stringify(again?.值), JSON.stringify(first?.值))

    // ② **时间从参数进**：把真实时钟毒掉再调一次 —— 它不许碰 `Date.now()` / `new Date()`。
    //    这一条是"断言不会半夜自己变红"的机器保证。
    let poisoned
    {
      const RealDate = globalThis.Date
      class PoisonedDate extends RealDate {
        constructor(...args) {
          if (args.length === 0) throw new Error('moodOf 里 `new Date()` 没带参数 —— 时间必须从参数进')
          super(...args)
        }
        static now() { throw new Error('moodOf 里调了 `Date.now()` —— 时间必须从参数进') }
      }
      // ⚠️ 只换全局那个 `Date`（它的静态 `now` 就是抛错桩），**别去改真 Date 的属性** ——
      //    改了就复原不干净：探针自己的 `settle()` 也调 `Date.now()`，会当场炸（实测踩过）。
      globalThis.Date = PoisonedDate
      try {
        poisoned = callMood(NEUTRAL_SIGNALS)
      } finally {
        globalThis.Date = RealDate
      }
    }
    check('N1b', 10, '【纯函数】调用窗口里 `Date.now()`／`new Date()` 被换成抛错的桩 ⇒ 结果**一模一样**',
      JSON.stringify(poisoned?.值 ?? poisoned?.为什么), JSON.stringify(first?.值 ?? '拿不到'))

    // ③ 出参形状：**就那三维**；被砍掉的三维一个都不许出现（口径 1）。
    const shape = scoresOf(first)
    const keys = shape === undefined ? ['（拿不到 scores）'] : Object.keys(shape)
    const inRange = shape !== undefined
      && Object.values(shape).every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1)
    check('N2', 1, '`scores` 就**三个**键，而且次序 = `control, fatigue, closeness`，每个都是 [0,1] 的数',
      { 键: keys.join(','), 全在区间内: inRange ? '是' : '否' },
      { 键: DIM_KEYS_3.join(','), 全在区间内: '是' })

    /**
     * 单调性：拧**一根**旋钮（契约 3.2 那张表），看那一维。
     * ⚠️ 判据是两条一起 —— ①逐点不升/不降；②**首尾真的不同**。
     *    只有①的话，"这一维是个常数"也会全绿（那就是假绿）。
     * 🔴 这一批有三根旋钮的值**不是标量**（`recentResults` 是数组、`pitCounts` 是映射），
     *    所以 `field` 也认三个【测试位代拍】的合成名：
     *      `pitRepeat` = 窗口全绿、同一个坑重复 k 次
     *      `windowFailures` = 窗口 20 个里 k 个失败（其余绿）
     *      `windowOks` = 窗口 20 个里 k 个绿（其余失败）
     *    —— 把"数组怎么造"写在一个地方，免得每条断言各写一遍、各错一遍。
     */
    const PIT_A = 'pwsh|拒绝访问'
    const signalForField = (field, v) => {
      if (field === 'pitRepeat') return { recentResults: Array(20).fill('ok'), pitCounts: v <= 1 ? {} : { [PIT_A]: v } }
      if (field === 'windowFailures') return { recentResults: [...Array(20 - v).fill('ok'), ...Array(v).fill('fail')] }
      if (field === 'windowOks') return { recentResults: [...Array(v).fill('ok'), ...Array(20 - v).fill('fail')] }
      return { [field]: v }
    }
    const sweep = (key, field, values, dir, extra = {}) => {
      const curve = values.map((v) => {
        const scores = scoresOf(callMood({ ...NEUTRAL_SIGNALS, ...extra, ...signalForField(field, v) }))
        return scores === undefined ? '拿不到' : scores[key]
      })
      const nums = curve.filter((x) => typeof x === 'number')
      const complete = nums.length === values.length
      const monotone = complete && nums.every((x, i) => i === 0 || (dir === 'up' ? x >= nums[i - 1] : x <= nums[i - 1]))
      const moved = complete && Math.abs(nums[nums.length - 1] - nums[0]) > 0
      console.log(`       · 曲线 ${field} ${values.join(' → ')} ⇒ ${key}：${JSON.stringify(curve)}`)
      return { 单调: monotone ? '是' : '否', 首尾有真变化: moved ? '是' : '否' }
    }
    const ok = { 单调: '是', 首尾有真变化: '是' }

    /**
     * 🔴 **口径 1 的另一半：被砍掉的三个维度不许回来。**
     * 喂一组"老维度拉满"的信号（老实现会靠它算出愉悦 1.00 / 唤起 .90 / 新异 1.00），
     * 三维实现里这三样**根本不在出参里**。
     * ⚠️ 这条与 `N2` 是同源的（都看 `scores` 的键）；留两条是因为它们红的原因不同：
     *    `N2` 红 = 出参里多了三个键；`N3` 红 = 出参里那三个键**还被喂着老信号**。
     */
    const legacyFed = scoresOf(callMood({
      ...NEUTRAL_SIGNALS,
      errors: 0, oks: 6, steps: 40, continuousMinutes: 300, newThings: 6, minutesToOffWork: 0,
    }))
    const backAgain = DIM_KEYS_GONE.filter((k) => legacyFed !== undefined && k in legacyFed)
    check('N3', 1, '【砍掉的三个维度】喂满"愉悦/唤起/新异"的老信号（oks 6 · steps 40 · newThings 6）⇒ 那三个键**不许出现**',
      backAgain.length === 0 ? '（一个都没回来）' : `回来了：${backAgain.join('、')}`, '（一个都没回来）')
    check('N4', 12, '【单调性·活力】净工作时长 0→60→180→360 ⇒ 活力**不升**（干得越久分越低；方向随改名一起翻）',
      sweep('fatigue', 'netWorkMinutes', [0, 60, 180, 360], 'down'), ok)
    check('N5', 5, '【单调性·掌控·同一个坑】同一个坑 1→3→5 次（窗口全绿）⇒ 掌控**不升**',
      sweep('control', 'pitRepeat', [1, 3, 5], 'down'), ok)
    check('N6', 3, '【单调性·掌控·滑动窗口】窗口里失败数 0→5→10→20（总 20 次）⇒ 掌控**不降/不升**（成功率↓ ⇒ 分数↓）',
      sweep('control', 'windowFailures', [0, 5, 10, 20], 'down'), ok)
    check('N7', 3, '【单调性·掌控】窗口里的绿 0→20 次（全绿）⇒ 掌控不降（老 N7 的位置换了维度，见契约第八节）',
      sweep('control', 'windowOks', [0, 5, 10, 20], 'up'), ok)
    check('N8', 6, '【单调性·亲密】他"这一次开口之前"离了 0→30→120→240 分钟 ⇒ 亲密**不降**',
      sweep('closeness', 'sincePreviousBossMinutes', [0, 30, 120, 240], 'up', { sinceBossMinutes: 240 }), ok)

    /**
     * ④ **活力与掌控是两个独立的数**（老版那条"唤起 ≠ 疲劳"的对应条）：
     *    连着翻车但是干满一天 ⇒ 掌控低、活力低；一路顺但是刚开工 ⇒ 掌控高、活力高。
     *    合成一维的话这四格就分不开了。
     * ⚠️ 措辞跟 `EXTREME.fatigue` **同一批翻过**：强 = 刚开工、弱 = 干满。
     */
    const tiredBad = scoresOf(callMood({ ...NEUTRAL_SIGNALS, ...EXTREME.fatigue.weak, ...EXTREME.control.weak }))
    const freshGood = scoresOf(callMood({ ...NEUTRAL_SIGNALS, ...EXTREME.fatigue.strong, ...EXTREME.control.strong }))
    checkTrue('N9', 1, '【分开验】掌控与活力是两根独立的数：连着翻车+干满 ⇒ 掌控低而活力低；一路顺+刚开工 ⇒ 掌控高而活力高',
      typeof tiredBad?.control === 'number' && typeof tiredBad?.fatigue === 'number'
      && typeof freshGood?.control === 'number' && typeof freshGood?.fatigue === 'number'
      && tiredBad.control < 0.35 && tiredBad.fatigue < 0.35
      && freshGood.control > 0.65 && freshGood.fatigue > 0.65,
      `翻车+干满：掌控 ${tiredBad?.control} 活力 ${tiredBad?.fatigue} · 顺+刚开工：掌控 ${freshGood?.control} 活力 ${freshGood?.fatigue}`)

    // ⑤ 三个"强"剖面真的进得了高区间、"弱"剖面进得了低区间 ——
    //    否则场景区间没得写（分数全挤在 0.4~0.6 就是装饰）。
    const spanOk = Object.entries(EXTREME).every(([dim, ex]) => {
      const strong = scoresOf(callMood({ ...NEUTRAL_SIGNALS, ...ex.strong }))?.[dim]
      const weak = scoresOf(callMood({ ...NEUTRAL_SIGNALS, ...ex.weak }))?.[dim]
      return typeof strong === 'number' && typeof weak === 'number' && strong >= 0.65 && weak <= 0.35
    })
    const spanDetail = Object.entries(EXTREME).map(([dim, ex]) => {
      const strong = scoresOf(callMood({ ...NEUTRAL_SIGNALS, ...ex.strong }))?.[dim]
      const weak = scoresOf(callMood({ ...NEUTRAL_SIGNALS, ...ex.weak }))?.[dim]
      return `${dim} ${weak}→${strong}`
    }).join(' · ')
    checkTrue('N10', 3, '每一维的"强"剖面 ≥ 0.65、"弱"剖面 ≤ 0.35（分数真的拉得开；亲密那个弱剖面**带骂句**，理由见 `EXTREME.closeness`）',
      spanOk, spanDetail)

    // ⑥ 缺信号不许炸：只给 `now`。
    const bare = scoresOf(callMood({ now: T0 }))
    checkTrue('N11', 10, '只给 `now`、别的信号全缺 ⇒ 照样出一组**三维**分数（不许抛、不许 NaN）',
      bare !== undefined && Object.keys(bare).length === 3 && Object.keys(bare).join(',') === DIM_KEYS_3.join(',')
        && Object.values(bare).every((v) => typeof v === 'number' && Number.isFinite(v)),
      `拿到的是 ${brief(bare)}`)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ O · 场景例库真的会被命中（口径 2、12）═══')
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const scenes = CONSTANTS?.scenes ?? []
    check('O0', 2, '夹具的 ```mood 块里解析出**恰好 3 条**场景（口径 2 的机器那半边）', scenes.length, 3)
    const keys = new Set(Object.keys(EXTREME))
    const badKey = scenes.flatMap((s) => Object.keys(s.when ?? {})).filter((k) => !keys.has(k))
    check('O0b', 1, '每条场景的 `when` 只用那**三个**维度键（写错一个 ⇒ 那条区间永远对不上）',
      badKey.length === 0 ? '（干净）' : `多出来：${[...new Set(badKey)].join('、')}`, '（干净）')

    /**
     * 逐场景验：命中（分数落进区间 ⇒ 那几句递出来）+ 不命中（推到反极端 ⇒ 不许递）。
     * 同一个函数跑**两套场景库**：夹具那一套（机制通不通）+ 产物那一套（口径 12 说的是它）。
     * 🔴 `constants` **必须跟着库一起换**：`moodOf` 拿哪份例库判命中，就得拿哪份常数算分
     *    —— 两套混用会把"实现错"和"断言错"搅在一起（2026-09-26 就是这么栽的，见契约第八节）。
     */
    const checkSceneLibrary = (prefix, libraryScenes, label, constants) => {
      for (const [i, scene] of libraryScenes.entries()) {
        const at = i + 1
        const dims = Object.entries(scene.when ?? {})
        const inBand = (scores) => dims.every(([d, [lo, hi]]) =>
          typeof scores?.[d] === 'number' && lo <= scores[d] && scores[d] <= hi)
        const anyOut = (scores) => dims.some(([d, [lo, hi]]) =>
          typeof scores?.[d] !== 'number' || scores[d] < lo || scores[d] > hi)

        // 命中：把 when 里每一维推到"离区间中点更近"的那一端。
        const hit = callMood(profileFor(scene.when, 'hit', T0), constants)
        const hitScores = scoresOf(hit)
        const hitIds = sceneIdsOf(hit)
        const hitLines = hit?.值?.scenes?.find((s) => s.id === scene.id)?.lines
        check(`${prefix}${at}a`, 12, `【命中·${label}】${scene.id}：造一组落进它区间的信号 ⇒ 它被递出来`,
          {
            分数真的落进区间: inBand(hitScores) ? '是' : `否（${brief(hitScores ?? hit?.为什么)}）`,
            递出来的场景里有它: hitIds.includes(scene.id) ? '是' : `否（递出来的是 ${hitIds.join('、') || '一条都没有'}）`,
          },
          { 分数真的落进区间: '是', 递出来的场景里有它: '是' })
        check(`${prefix}${at}b`, 12, `【命中·逐字·${label}】${scene.id} 的 ${scene.lines.length} 句**原样**递出来（来自 mood.md）`,
          Array.isArray(hitLines) ? hitLines : brief(hitLines ?? hit?.为什么), scene.lines)

        // 不命中：把 when 里每一维推到**反极端**。
        // ⚠️ 挂在**阳性对照**上（`hitOk`）：机制没做出来时，"一条都没递"会让这条**空跑成绿** ——
        //    那正是"静默失效的检查和通过的检查长得一模一样"。对照不成立 ⇒ 记挂起（未验）。
        const hitOk = inBand(hitScores) && hitIds.includes(scene.id)
        const miss = callMood(profileFor(scene.when, 'miss', T0), constants)
        const missScores = scoresOf(miss)
        const missIds = sceneIdsOf(miss)
        checkIf(hitOk, `${prefix}${at}c`, 12,
          `【不命中·${label}】${scene.id}：把 when 里每一维推到反极端 ⇒ 它**不许**被递出来`,
          {
            至少一维真的出了区间: anyOut(missScores) ? '是' : `否（${brief(missScores ?? miss?.为什么)}）`,
            递出来的场景里有它: missIds.includes(scene.id) ? `有（不该有）` : '没有',
          },
          { 至少一维真的出了区间: '是', 递出来的场景里有它: '没有' })
      }
    }
    checkSceneLibrary('O', scenes, '夹具', CONSTANTS)

    /**
     * 🔴 **这一族的前提不成立时，9 条编号也要进分母**（2026-09-26 返修）。
     * 以前写的是 `if (productLibrary?.scenes?.length === 3) { checkSceneLibrary('O8', …) }`：
     * 产物还是 6 条场景那阵子，这个分支**不进** ⇒ `O81a`–`O83c` 那 9 条
     * **既不红、也不挂起、也不进分母，直接从输出里消失**（评审 grep "跳过"：零命中）。
     * 后果是"58 红 → 0 红"这句话被污染：那 9 条**没有"改前"读数**。
     * ⇒ 现在的规矩：**判据不许因为被测对象长什么样就自己消失**。
     *    前提不成立 ⇒ 逐条记 SKIP（退出码 2），分母恒定。
     * ⚠️ 这份编号清单必须和 `checkSceneLibrary` 里那三个 `${prefix}${at}a/b/c` 一一对应
     *    —— 收尾的 `Z9`（编号唯一）与"三种跑法分母对照"是它的守卫。
     */
    const skipSceneLibrary = (prefix, label, why) => {
      for (let i = 1; i <= 3; i++) {
        skip(`${prefix}${i}a`, 12, `【命中·${label}】第 ${i} 条场景：${why} ⇒ **未验**`)
        skip(`${prefix}${i}b`, 12, `【命中·逐字·${label}】第 ${i} 条场景：${why} ⇒ **未验**`)
        skip(`${prefix}${i}c`, 12, `【不命中·${label}】第 ${i} 条场景：${why} ⇒ **未验**`)
      }
    }

    // 🔴 口径 2 说的是**产物**那三条场景。夹具那一套只证明"机制通不通"——
    //    产物自己的区间与打分对不对得上，必须拿**产物自己的** mood.md 跑，
    //    而且**常数也得用产物那一份**（`moodOf` 是按传进去的例库判命中的）。
    //    ⚠️ 夹具模式下这 9 条**记挂起、不跑**（那时它量的是"另一个东西的内容"，
    //       跑了只会染红对照，同 `I` 族）—— 但**照样进分母**。
    if (!TESTING_PRODUCT) {
      console.log('（产物那三条场景：这次测的是夹具 —— 9 条记挂起，分母不缩，见契约 5.2）')
      skipSceneLibrary('O8', '产物', '这次测的是夹具，不是产物')
    } else {
      const productMoodPath = join(PRODUCT_DIR, 'mood.md')
      const productLibrary = parseMoodBlock(existsSync(productMoodPath) ? readFileSync(productMoodPath, 'utf8') : undefined)
      check('O7', 2, `\`${PRODUCT_DIR}\` 下的 mood.md 解析得出恰好 3 条场景（口径 2 的前提）`,
        productLibrary?.scenes?.length ?? '读不出来 / 不是 3 条', 3)
      if (productLibrary?.scenes?.length === 3) {
        checkSceneLibrary('O8', productLibrary.scenes, '产物', productLibrary)
      } else {
        // 🔴 原来这里什么都没有 —— 9 条就这么没了。现在它们进分母、退出码按 2 算。
        console.log('（产物的场景不是 3 条 ⇒ 下面 9 条记挂起，**不许**读成通过）')
        skipSceneLibrary('O8', '产物', '产物的 ```mood 块里不是 3 条场景（见上一条 `O7`）')
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ Q · 接线：分数行 + 例子拼在尾巴后面（口径 1、7、12）═══')
  // ═══════════════════════════════════════════════════════════════════════════
  /** 情绪段到底能不能贴出来 —— Q7 的阳性对照（它不成立时"没有情绪段"是空跑成绿的）。 */
  let moodSectionWorks = false
  {
    const h = await harness(fixture)
    await h.turnStart(T0)
    await bossThenStep(h)
    const text = h.lastText()
    const mood = moodPartOf(text)
    const lines = (mood ?? '').split('\n')
    // 🔴 **2026-09-26 第三批：分数行带正反词了**（老板拍的"两侧都写出来，这样信息更多"）。
    //    形状 = `【情绪板】掌控 P（正/正 ↔ 反/反） · 活力 P（…） · 亲密 P（…）`。
    //    ⚠️ **分隔符是 ` · `（`·` 两边各一个空格）**：出处是老板真回合里那条尾巴
    //       （`技术契约-情绪板改名与正反词.md` §2 抄了那一行逐字）；
    //       方案第二节的示例把空格省了 —— 那种写法**不作为逐字依据**（它只是示意图）。
    //    ⚠️ 期望那一行**从夹具的 `words` 现算**，不抄一遍：抄一遍的话，
    //       "夹具换了词表、实现没跟上"这两边会一起漂，判据就废了。
    const wantLine = new RegExp('^【情绪板】' + DIM_KEYS_3.map((dim, i) => {
      const w = FIXTURE_WORDS[dim]
      return `${DIM_LABELS_3[i]} (?:1\\.00|\\.[0-9]{2})（${w.positive.join('/')} ↔ ${w.negative.join('/')}）`
    }).join(' · ') + '$')
    moodSectionWorks = wantLine.test(lines[0] ?? '')
    checkTrue('Q1', '§正反词', '尾巴那条消息里有【情绪板】分数行：**三维齐全、次序照契约、每维都带正反词**，分数写成 `.NN`',
      moodSectionWorks, `第 1 行实测 ${JSON.stringify(lines[0] ?? '（没有情绪段）')}`)
    check('Q2', '§形状', '情绪段第 2 行恒为 `【这种状态，人一般这么说话】`',
      lines[1], '【这种状态，人一般这么说话】')
    checkTrue('Q3', '§形状', '情绪段拼在**尾巴那条 style 后面**（不是前面、不是单独一条消息）',
      typeof text === 'string' && typeof mood === 'string' && text.startsWith(stylePartOf(text))
        && text.includes(`${stylePartOf(text)}\n\n【情绪板】`),
      `尾巴段 ${String(stylePartOf(text)).length} 字符，情绪段在${typeof text === 'string' && text.indexOf('【情绪板】') > 0 ? '后面' : '别处'}`)
  }
  {
    // 例子行：造一个**确定命中**的场景（他久别归来 = 亲近高）—— 老板 12 小时前开的口。
    // ⚠️ 那一批工具结果里**混两个报错的**：这样掌控落在中段（不命中"一路绿到底"），
    //    这一条才量得到"命中场景那一行的**形状**"，不会被别的场景行搅进来。
    const scene = FIXTURE_SCENES.find((s) => s.id === '他久别归来')
    // ⚠️ 这一块**自带一份夹具**（不共用那个模块级的 `fixture`）：别的族会往它上面写东西
    //    （H 族改 `style.md`），共用的话读数会被别人拨动 —— 本票实测踩过。
    const q4dir = buildFixture()
    try {
      const h = await harness(q4dir)
      // 形状同 V 族：**先让他 4 小时前说过一句**，现在这一句 ⇒ 重逢项到顶（.90）。
      // 🔴 每句话的**时刻**都要显式给（`bossText` 的第二参）—— 口径 6 的重逢项读的是它。
      await h.turnStart(T0 - 4 * HOUR)
      await h.bossText('（上一句话）', T0 - 4 * HOUR)
      await h.stepBegin(T0 - 4 * HOUR + 5 * MIN)
      await h.bossText('老板的话', T0)
      await h.iSpeak(T0 + MIN)                                   // 一条成功结果 ⇒ 掌控够高（不点亮"刚炸过"）
      await h.toolResult(undefined, T0 + MIN)
      await h.stepBegin(T0 + 2 * MIN)
      const text = h.lastText()
      const scores = scoresFromText(text)
      const example = (moodPartOf(text) ?? '').split('\n').find((l) => l.includes(scene.lines[0]))
      check('Q4', 7, `【例子行】命中场景的那一行**逐字**长这样：\`  ·（${DIM_LABELS_3[2]} .NN）「句」「句」\``,
        example, `  ·（${DIM_LABELS_3[2]} ${scores === undefined ? '??' : fmtScore(scores.closeness)}）「${scene.lines[0]}」「${scene.lines[1]}」`)
      // ⚠️ 挂阳性对照：连"命中的那一行"都没递出来时，"别的场景不在"是**空跑成绿**的。
      checkIf(typeof example === 'string', 'Q5', 7,
        '没命中的场景**不许**出现在情绪段里（这一格没有"刚炸过"、没有"一路绿到底"）',
        typeof text === 'string' && text.includes('第三次了哥们，这次我把它钉死。') ? '混进来了' : '没有', '没有')
    } finally {
      rmSync(q4dir, { recursive: true, force: true })
    }
  }
  {
    // 口径 12：**同一份 harness、同一个夹具**，只改 mood.md 里的常数 ⇒ 下一次分数跟着变（不用重启）。
    // 这一条量的是"常数真住在文件里"，所以**挑一个这一批新加的常数**（`fullScaleMinutes`）：
    // 净工时 > 0 ⇒ 满量程 360 的活力 `1 − 净/360` 比满量程 180 的 `1 − 净/180` **高**
    // （满量程越小 ⇒ 同一段工时越压得低）。
    // ⚠️ 必须用**自己那份夹具**：这一组会改 mood.md，共用的话后面几族会跟着变。
    const hFixture = buildFixture()
    try {
      const h = await harness(hFixture)
      const runOnce = async (t) => {
        // ⚠️ 先推一条**早一点**的事件：净工作时长量的是"上一次记账 → 现在"，
        //    不先垫一条，`lastWorkAt` 就落在这一刻上 ⇒ interval 恒 0 ⇒ 净工时永远是 0。
        await h.turnStart(t - HOUR)
        await h.toolResult(undefined, t - HOUR)
        await h.boss(undefined, t)
        await h.stepBegin(t)
        return scoresFromText(h.lastText())
      }
      // 这一条只钉**方向**：`净 > 0` 时那个不等式由算式本身成立，**不需要知道采集端记了几分钟**
      // （采集端记多少是 X 族的事）。两个读数的**绝对值**在 `X1`/`X2`/`X4` 那一层钉 ——
      // 那里 `netWorkMinutes` 是入参，期望值能从算式直接算出来。
      const slow = await runOnce(T0 + 3 * HOUR)
      writeFileSync(join(hFixture, 'mood.md'), FIXTURE_MOOD({ fullScaleMinutes: 180 }), 'utf8')
      const fast = await runOnce(T0 + 3 * HOUR)
      checkTrue('Q6', 12, '只改 `mood.md` 的 `fullScaleMinutes`（360 → 180）⇒ 同一段信号打出**不同**的分：满量程越小、活力越低（存盘即生效）',
        typeof slow?.fatigue === 'number' && typeof fast?.fatigue === 'number'
        && fast.fatigue < slow.fatigue && slow.fatigue < 1 && fast.fatigue < 1,
        `满量程 360 的活力 ${slow?.fatigue ?? '拿不到'} · 满量程 180 的活力 ${fast?.fatigue ?? '拿不到'}`
        + '（两个都要 < 1 —— 否则这一格是拿两个 1.00 空跑，净工时根本没进来）')
    } finally {
      rmSync(hFixture, { recursive: true, force: true })
    }
  }
  {
    // 🔴 **那四档刻度也得从 `mood.md` 读**（2026-09-26 返修 · 评审条件 ③(a)）。
    //    以前 `moodConstants()` 返回的是**白名单对象**：`reunionScaleMinutes` / `reunionBase` /
    //    `praiseStep` / `blameStep` **根本传不进去** ⇒ 往块里写什么都没人读，
    //    而 `inject.js` 的注释却写着"以文件里的为准"（那句话当时是假的）。
    //    判据形状与 `V4`（词表住文件里）、`Q6`（满量程住文件里）同源：
    //    **同一串事件、只换文件里那个数 ⇒ 读数按算出来的量走**。
    //    四个数写死在 `.js` 里的实现，两格读数会**一模一样** ⇒ 当场红。
    /**
     * 老板隔 `gapMinutes` 分钟之前说过一句（传 `null` = 他从没开过口），现在这一句是 `said`。
     * 走到回答他那一步 ⇒ 从情绪段读**亲密**。起点固定 09:00（夹具当日 log 首条）。
     */
    const closenessRun = async (gapMinutes, said, over = {}) => {
      const dir = buildFixture({ mood: FIXTURE_MOOD(over) })
      try {
        const h = await harness(dir)
        await h.turnStart(T0 - 8 * HOUR)
        if (gapMinutes !== null) {
          // 🔴 **他上一次开口那一步的时刻 = 那句话的时刻**（`stepBegin` 与 `bossText` 同刻）。
          //    理由：`sincePrevBossMin` 有两个记账点 —— pre-step 用**消息自带的时间**、
          //    `user/message` 事件那条兜底用**本步的时间**，而事件排在 pre-step 之后 ⇒ 后者赢。
          //    两者不同刻时，读数会差"上一步的滞后"（本票实测：差 1 分钟 ⇒ .90 读成 .89）。
          //    同刻之后两个记账点写的是同一个数 ⇒ 期望值能算准。
          await h.bossText('（上一句话）', T0 - gapMinutes * MIN)
          await h.stepBegin(T0 - gapMinutes * MIN)
        }
        await h.bossText(said, T0)
        await h.stepBegin(T0 + MIN)
        return scoresFromText(h.lastText())?.closeness
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }
    const near = (a, b) => typeof a === 'number' && Math.abs(a - Number(b)) < 5e-3
    const show = (x) => (typeof x === 'number' ? Number(x.toFixed(4)) : x)

    // 亲密 = `clamp01(closenessBase .50 + reunionBase × clamp01(间隔 ÷ reunionScaleMinutes)
    //        + praiseStep×夸句数 + blameStep×骂句数)`（方案第五节 · 第六节）。
    // 🔴 **四档刻度那几条一律要落在"没被 clamp 夹住"的区间里**（2026-09-26 第三批改的）：
    //    基线 .50 之后，上半段（重逢项大 + 夸）会**顶到 1.00**，两格读数一样 ⇒ 判据当场变成空跑。
    //    ⇒ 取点全部下移（量程那条用 48 分钟、骂那条用 2 小时、底那条把基线按 0 传进去）。
    //    ⚠️ 这不是"把期望值改小"，是**换个还能分辨的取点**：四个数写死在 `.js` 里的实现照样红。
    // ⚠️ 取点还要**避开两位小数读数的舍入边界**：这些格是从分数行上读回来的（分辨率 .01），
    //    取 `.725` 那种值只能看出 `.72`/`.73`，期望值就没法逐字钉 —— 所以取能落到整分位的点。
    const scaleA = await closenessRun(48, '今天就这样')
    const scaleB = await closenessRun(48, '今天就这样', { reunionScaleMinutes: 120 })
    checkTrue('Q11', 13, '【四档刻度·量程】只改文件里的 `reunionScaleMinutes`（240 → 120），隔 48 分钟开口 ⇒ 亲密 .50+.18=.68 → .50+.36=.86',
      near(scaleA, 0.68) && near(scaleB, 0.86),
      `量程 240 ⇒ ${show(scaleA)}（期望 .68） · 量程 120 ⇒ ${show(scaleB)}（期望 .86）`)

    // ⚠️ 这一格把 `closenessBase` 按 **0** 传：让"顶端 = 重逢项本身"重新能被看见。
    //    （基线 .50 时，真文件那个 `reunionBase` .90 在顶端会被 clamp 成 1.00 ——
    //      `.90` 这个值本身由 `I12` 钉键值、由 `N8` 在**线性区**钉行为。）
    const baseA = await closenessRun(480, '今天就这样', { closenessBase: 0 })
    const baseB = await closenessRun(480, '今天就这样', { closenessBase: 0, reunionBase: 0.45 })
    checkTrue('Q12', 13, '【四档刻度·顶】只改文件里的 `reunionBase`（.90 → .45），隔 8 小时开口（比值已到顶）⇒ 重逢项 .90 → .45（基线按 0 传，免得顶到 clamp）',
      near(baseA, 0.90) && near(baseB, 0.45),
      `底 .90 ⇒ ${show(baseA)}（期望 .90） · 底 .45 ⇒ ${show(baseB)}（期望 .45）`)

    const praiseA = await closenessRun(null, '真棒')
    const praiseB = await closenessRun(null, '真棒', { praiseStep: 0.20 })
    checkTrue('Q13', 13, '【四档刻度·夸】只改文件里的 `praiseStep`（.06 → .20），他第一次开口就夸一句 ⇒ 亲密 .50+.06=.56 → .50+.20=.70',
      near(praiseA, 0.56) && near(praiseB, 0.70),
      `一档 .06 ⇒ ${show(praiseA)}（期望 .56） · 一档 .20 ⇒ ${show(praiseB)}（期望 .70）`)

    const blameA = await closenessRun(120, '真笨')
    const blameB = await closenessRun(120, '真笨', { blameStep: -0.20 })
    checkTrue('Q14', 13, '【四档刻度·骂】只改文件里的 `blameStep`（−.08 → −.20），隔 2 小时开口时骂一句 ⇒ 亲密 .50+.45−.08=.87 → .50+.45−.20=.75（**键值带负号**：加法的写法才对吧）',
      near(blameA, 0.87) && near(blameB, 0.75),
      `一档 −.08 ⇒ ${show(blameA)}（期望 .87） · 一档 −.20 ⇒ ${show(blameB)}（期望 .75）`)

    // 最后一条量的是"**存盘即生效**"：同一个 harness（同一个模块实例，没重启）、同一份夹具，
    // 只把 `mood.md` 里的四个数换掉 ⇒ 下一次读数跟着换（`readMoodConstants()` 每次现读）。
    const hSame = buildFixture()
    try {
      const h = await harness(hSame)
      const run = async (at, said) => {
        await h.turnStart(at - 8 * HOUR)
        await h.bossText(said, at)
        await h.stepBegin(at + MIN)
        return scoresFromText(h.lastText())?.closeness
      }
      const before = await run(T0, '真棒')   // 他第一次开口 ⇒ 重逢项 0 ⇒ 只剩基线 .50 + 夸那一档 .06
      writeFileSync(join(hSame, 'mood.md'),
        FIXTURE_MOOD({ reunionScaleMinutes: 1, reunionBase: 0.3, praiseStep: 0.2, blameStep: -0.4 }), 'utf8')
      // 这一次开口离上一次 4 小时 = 240 分钟 ≥ 量程 1 ⇒ 比值 1 ⇒ 重逢项 .30；
      // 一句夸 +.20、一句骂 −.40 ⇒ .50 + .30 + .20 − .40 = .60。
      const after = await run(T0 + 4 * HOUR, '真棒，这一版很好。真笨，这块写错了。')
      checkTrue('Q15', 13, '【四档刻度·不用重启】同一个 harness 里只换文件（量程 1 · 底 .30 · 夸 +.20 · 骂 −.40）⇒ 下一次读数 .60（四个数写死在 `.js` 里的话是 1.00）',
        near(before, 0.56) && near(after, 0.60),
        `改文件前 ${show(before)}（期望 .56） · 改文件后 ${show(after)}（期望 .60；四个数写死的话 1.00）`)
    } finally {
      rmSync(hSame, { recursive: true, force: true })
    }
  }
  {
    // 读不到 mood.md ⇒ 尾巴照贴 style、**不贴情绪段**，而且要出声（契约 3.1，口径 2 的老半边）。
    const noMood = buildFixture({ mood: null })
    try {
      const before = stderrSeen.length
      const h = await harness(noMood)
      await h.turnStart(T0)
      await bossThenStep(h)
      const text = h.lastText()
      checkIf(moodSectionWorks, 'Q7', 2,
        '读不到 `mood.md` ⇒ 尾巴**只贴 style 段**，不贴分数行（宁可不说，不许瞎说）',
        moodPartOf(text) === undefined ? '（没有情绪段）' : brief(moodPartOf(text)), '（没有情绪段）')
      // 🔴 F-126：机制② 那一刀也带时间行（夹具无常识文件 ⇒ 只多这一行）。仍整段 `===`。
      check('Q8', 2, '而且 style 段照贴、逐字不差（不是"整条不贴"）—— 外加一行时间行',
        normalizeTimeLines(stylePartOf(text)),
        [cutTail(fixtureStyleOnDisk(noMood)), TIME_LINE_TOKEN].join('\n\n'))
      checkTrue('Q9', 2, '读不到 `mood.md` **要出声**（`console.error`，报文里点到 mood.md）—— 不许静默',
        stderrSeen.slice(before).some((m) => /mood\.md/.test(m)),
        `这一段里 console.error 收到的是：${brief(stderrSeen.slice(before).join(' | ') || '（一声都没有）')}`)
    } finally {
      rmSync(noMood, { recursive: true, force: true })
    }
  }
  {
    // 口径 13：**三个新常数住在 `mood.md`，`.js` 里一个都没有**（正则 + 全流程两半边）。
    //   ① 文件那半边：夹具的 ```mood 块里三个键都在；
    //   ② `.js` 那半边：源码里不许出现这三个数（`15` / `60` / `360` 各自作为**常数名**的赋值）。
    const c = CONSTANTS ?? {}
    const missing = ['presenceMinutes', 'absenceHalfLifeMinutes', 'fullScaleMinutes']
      .filter((k) => typeof c[k] !== 'number')
    check('Q10', 13, '`mood.md` 的 ```mood 块里有三个新常数：`presenceMinutes` / `absenceHalfLifeMinutes` / `fullScaleMinutes`',
      missing.length === 0 ? ['presenceMinutes', 'absenceHalfLifeMinutes', 'fullScaleMinutes'].map((k) => `${k}=${c[k]}`) : `缺：${missing.join('、')}`,
      ['presenceMinutes=15', 'absenceHalfLifeMinutes=60', 'fullScaleMinutes=360'])
  }
  {
    // 🔴 **方案第七节 #7**（2026-09-26 第三批新加）：`words` 里**只给两维** ⇒
    //    缺的那一格（活力）**只写分数**，其余两格照写词、**整个情绪段照贴** ——
    //    一个词表瑕疵不该把整段干掉。
    // ⚠️ 判据必须**两头一起钉**：只钉"活力没有词"的话，一个"干脆一个词都不写"的实现照样绿。
    const dir = buildFixture({ mood: FIXTURE_MOOD({
      words: { control: FIXTURE_WORDS.control, closeness: FIXTURE_WORDS.closeness },
    }) })
    try {
      const h = await harness(dir)
      await h.turnStart(T0)
      await bossThenStep(h)
      const line = (moodPartOf(h.lastText()) ?? '').split('\n')[0] ?? ''
      const group = (i) => line.replace(/^【情绪板】/, '').split(' · ')[i] ?? ''
      const pairText = (dim) => `（${FIXTURE_WORDS[dim].positive.join('/')} ↔ ${FIXTURE_WORDS[dim].negative.join('/')}）`
      const noWordsOnFatigue = /^活力 (?:1\.00|\.[0-9]{2})$/.test(group(1))
      const othersStillHaveWords = group(0).includes(pairText('control')) && group(2).includes(pairText('closeness'))
      checkTrue('Q16', '§正反词', '某一维**没给词** ⇒ 那一格只写分数，其余两格照写词、情绪段照贴（方案第七节 #7）',
        noWordsOnFatigue && othersStillHaveWords,
        `第 1 行实测 ${JSON.stringify(line || '（没有情绪段）')}`
        + `（活力那格没词 = ${noWordsOnFatigue}；另两格照写词 = ${othersStillHaveWords}）`)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
  {
    /**
     * 🔴 **方案第七节 #8**：`words` **给了**但形状不对 ⇒ **整块不认 + 出声**（不静默）。
     * ⚠️ 与 `Q16`（缺一维 ⇒ 那一格只写分数）是**两件事**，必须分开钉：
     *    缺一维是**合法降级**、形状不对是**坏块** —— 合在一条里，两个方向里总有一个量不到。
     */
    const badWordsRun = async (what, words) => {
      const dir = buildFixture({ mood: FIXTURE_MOOD({ words }) })
      try {
        const before = stderrSeen.length
        const h = await harness(dir)
        await h.turnStart(T0)
        await bossThenStep(h)
        return {
          场景: what,
          情绪段: moodPartOf(h.lastText()) === undefined ? '不贴' : '还贴着',
          出声: stderrSeen.slice(before).some((m) => /mood\.md/.test(m)) ? '出了' : '一声不吭',
        }
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }
    const noNeg = await badWordsRun('某一维只有 positive、没有 negative', { control: { positive: ['笃定'] } })
    check('Q17', '§正反词', '`words` 里某一维**只有 positive、没有 negative** ⇒ 整块不认（情绪段不贴）+ 出声',
      noNeg, { 场景: '某一维只有 positive、没有 negative', 情绪段: '不贴', 出声: '出了' })
    const bogus = await badWordsRun('出现不认识的维度名', { control: FIXTURE_WORDS.control, pleasure: FIXTURE_WORDS.control })
    check('Q17b', '§正反词', '`words` 里出现**不认识的维度名**（`pleasure`）⇒ 同样整块不认 + 出声',
      bogus, { 场景: '出现不认识的维度名', 情绪段: '不贴', 出声: '出了' })
  }
  {
    // 🔴 **方案第七节 #9**：改 `mood.md` 的 `words` / `closenessBase` **不用重启**。
    //    同一个 harness（同一个模块实例）、同一份夹具，只把文件换掉 ⇒ 下一次读数跟着换：
    //      · 词换了 ⇒ 那一格括号里的字跟着换（`words` 真的被**现读**）
    //      · 基线 .50 → .80 ⇒ 读数 +.30（`closenessBase` 真的被**现读**）
    //    ⚠️ 两半必须一起钉：只钉词的话，一个"词现读、基线写死在 `.js` 里"的实现照样绿。
    const near5 = (a, b) => typeof a === 'number' && Math.abs(a - Number(b)) < 5e-3
    const hWords = buildFixture()
    try {
      const h = await harness(hWords)
      const run = async (at) => {
        await h.turnStart(at - 8 * HOUR)
        await h.bossText('开工', at)       // 没夸没骂；他第一次开口 ⇒ 重逢项 0 ⇒ 读数 = 基线
        await h.stepBegin(at + MIN)
        const text = h.lastText()
        return { 分: scoresFromText(text)?.closeness, 行: (moodPartOf(text) ?? '').split('\n')[0] ?? '' }
      }
      const before = await run(T0)
      writeFileSync(join(hWords, 'mood.md'), FIXTURE_MOOD({
        closenessBase: 0.8,
        words: { ...FIXTURE_WORDS, closeness: { positive: ['黏你'], negative: ['生分'] } },
      }), 'utf8')
      const after = await run(T0)
      const wordsSwapped = before.行.includes('爱慕/亲近 ↔ 疏离/冷淡') && after.行.includes('黏你 ↔ 生分')
      checkTrue('Q18', '§正反词', '只改 `mood.md` 的 `words` / `closenessBase`（词换一对、基线 .50 → .80）⇒ 同一 harness 里下一次读数跟着换（不用重启，方案第七节 #9）',
        wordsSwapped && near5(before.分, 0.50) && near5(after.分, 0.80),
        `改前 ${before.分 ?? '拿不到'}（期望 .50）· 改后 ${after.分 ?? '拿不到'}（期望 .80）；词跟着换 = ${wordsSwapped}`)
    } finally {
      rmSync(hWords, { recursive: true, force: true })
    }
  }
  {
    // 🔴 **缺 `closenessBase` 时的兜底** —— 这一条是**变异体逼出来的**（2026-09-26 · 第三批）：
    //    夹具与真 `mood.md` **都带着这个键** ⇒ `moodOf` 里那个兜底值**够不着**，
    //    于是"把兜底改回 0"这个半修形状**一条断言都碰不到**：实测改完 **0 条红、静默存活**。
    //    ⇒ 补这一格：**把键整个拿掉**（`JSON.stringify` 会把 `undefined` 那个键丢掉），
    //      基线还得是 `.50` —— 方案第七节 #4 那句承诺**不该依赖文件里写没写这个键**。
    //    ⚠️ 口径缝（如实记在契约 §5）：方案只写了"`moodConstants()` 收下并校验两个新键"，
    //       **没写"键缺了怎么办"**；这里按 #4 判"缺也得是 .50"，与"一个常数瑕疵不该把
    //       整段情绪干掉"那条精神一致（`mood.md` 里那个键在，所以这一格是防未来的）。
    const dir = buildFixture({ mood: FIXTURE_MOOD({ closenessBase: undefined }) })
    try {
      const h = await harness(dir)
      await h.turnStart(T0 - 8 * HOUR)
      await h.bossText('开工', T0)     // 没夸没骂；他第一次开口 ⇒ 重逢项 0 ⇒ 读数 = 基线
      await h.stepBegin(T0 + MIN)
      check('Q19', 6, '`closenessBase` **整个不在块里** ⇒ 兜底仍然是 **.50**（不是老实现的 .00；方案第七节 #4 不依赖文件里写没写这个键）',
        scoresFromText(h.lastText())?.closeness, 0.5)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ B · 掌控：滑动窗口 + 跨回合 + 错误指纹（口径 3、4、5）═══')
  // ═══════════════════════════════════════════════════════════════════════════
  // 🔴 这一族量的是**这一批的四件事之一**（方案第三节【2】）。三条病：
  //    P2 成功率是一条直线（只看本回合）· P3 跨回合的失败被 `turn/start` 清零 ·
  //    P4 "同一个坑"数的是"连续失败"而不是"是不是同一个错"。
  {
    /** 浮点比：期望值是按 4 位小数手算的，判据放到 5e-3（够窄：任何一档 .06/.08 的错都跑不掉）。 */
    const near4 = (a, b) => typeof a === 'number' && Math.abs(a - Number(b)) < 5e-3
    const shown = (x) => (typeof x === 'number' ? Number(x.toFixed(4)) : x)

    // ① 滑动窗口：**跨回合不清零**。老实现 `turn/start` 把 errors/oks 清零 ⇒ 窗口里只剩本回合。
    //    ⚠️ 期望值按契约 3.2 那条式子手算：`success = (rate-.4)/.6`、失败影响 `weight` 在本格 = 1
    //       （窗口里那次失败的 `lastErrorAt` = 本步时刻 ⇒ 时间折扣和回合折扣都是 1）
    //       ⇒ `control = .8958 − .5 = .3958`。**老实现给 1.00**。
    const h = await harness(fixture)
    await h.turnStart(T0)
    await h.toolResult(errorResultEvent(), T0 + MIN)        // 回合 1：一个失败
    await h.turnStart(T0 + 2 * MIN)                          // 新回合（老实现会把它抹掉）
    for (let k = 0; k < 15; k++) await h.toolResult(undefined, T0 + 3 * MIN)   // 回合 2：15 个绿
    await h.stepBegin(T0 + 3 * MIN)                          // 这一步的就是"最近一条事件"⇒ 折扣 = 1
    const crossScores = scoresFromText(h.lastText())
    // 窗口 = 最近 20 次 = 1 失败 + 15 绿 ⇒ rate .9375 ⇒ success .8958。
    // 🔴 那次失败在**上一个回合** ⇒ 两个时钟都动了：时间折扣 e^(−2/20) 与回合折扣 0.6
    //    ⇒ `weight = .9048 × .6 = .5429` ⇒ `control = .8958 − .2714 = .6244`。
    //    老实现：`turn/start` 把 errors 清零 ⇒ 权重 0 ⇒ 掌控 1.00（一条直线）。
    checkTrue('D2-1', 3, '【滑动窗口】上一回合那个失败**还在窗口里**（1 败 + 15 绿 + 隔一个回合 ⇒ 掌控 .6244，不是 1.00）',
      near4(crossScores?.control, 0.6244),
      `实测 ${shown(crossScores?.control)} / 期望 0.6244（老实现：窗口里只剩本回合的 15 个绿 ⇒ 1.00）`)
    checkTrue('D2-2', 3, '【滑动窗口·窗口长度】窗口里的失败**会一直算到 20 个之后才挤出去**（不是"只看最近几个"）',
      typeof crossScores?.control === 'number' && crossScores.control < 0.99,
      `实测掌控 ${shown(crossScores?.control)} —— 老实现这里是 1.00（一条直线）`)

    // ② 跨回合的失败**有影响，但被两个时钟打折**（P3 的正题）。
    //    同一次失败、同一组别的信号，只差"它是在本回合还是 6 小时前" ⇒ 分数必须**不同**。
    const fresh = scoresOf(callMood({
      ...NEUTRAL_SIGNALS, recentResults: ['fail', 'ok', 'ok', 'ok', 'ok', 'ok'],
      lastErrorAt: T0, roundsSinceError: 0,
    }))
    const stale = scoresOf(callMood({
      ...NEUTRAL_SIGNALS, recentResults: ['fail', 'ok', 'ok', 'ok', 'ok', 'ok'],
      lastErrorAt: T0 - 6 * HOUR, roundsSinceError: 1,
    }))
    checkTrue('D2-3', 4, '【治 P3·形态】同一组信号、只把那次失败挪到 6 小时前 + 隔了一个回合 ⇒ 掌控**不一样**（旧账被打折，没被抹掉）'
      + '（本格手算：rate .8333 ⇒ success .7222；本回合 −.5 ⇒ .2222 · 六小时前 −.5×e⁻¹⁸×.6 ≈ 0 ⇒ .7222）',
      near4(fresh?.control, 0.2222) && near4(stale?.control, 0.7222),
      `本回合 ${shown(fresh?.control)}（期望 .2222） · 六小时前 ${shown(stale?.control)}（期望 .7222）`)
    checkTrue('D2-4', 4, '【治 P3·判据】那一维**不是被清零**：隔了一个回合的那次失败，掌控仍 < 0.95（老实现这里恒 1.00）',
      typeof stale?.control === 'number' && stale.control < 0.95,
      `实测 ${stale?.control ?? '拿不到'}（老实现：errors 在 turn/start 被清 0 ⇒ 权重 0 ⇒ 恒 1.00）`)

    // ③ **两个不同的错 ≠ 同一个坑**（P4 的正题）：只按"连续失败次数"数的实现分不开这两组。
    const twoDiff = scoresOf(callMood({
      ...NEUTRAL_SIGNALS, recentResults: ['fail', 'fail', 'ok', 'ok'],
      pitCounts: { 'pwsh|拒绝访问': 1, 'read|文件不存在': 1 },
    }))
    const sameTwice = scoresOf(callMood({
      ...NEUTRAL_SIGNALS, recentResults: ['fail', 'fail', 'ok', 'ok'],
      pitCounts: { 'pwsh|拒绝访问': 2 },
    }))
    checkTrue('D2-5', 5, '【治 P4】**两个不同的坑**各一次 ⇒ 没有"同一个坑"的扣分（掌控 = 成功率那一档）',
      typeof twoDiff?.control === 'number' && typeof sameTwice?.control === 'number'
      && twoDiff.control > sameTwice.control,
      `两个不同的坑 ${twoDiff?.control ?? '拿不到'} · 同一个坑两次 ${sameTwice?.control ?? '拿不到'}`)
    check('D2-6', 5, '【治 P4·刻度】同一个坑第 2 次 ⇒ 只扣**一档**（`pitStep` = .08）',
      typeof sameTwice?.control === 'number' && typeof twoDiff?.control === 'number'
        ? Number((sameTwice.control - twoDiff.control).toFixed(4)) : '拿不到', -0.08)

    // ④ 采集端：真事件流里，"同一个坑"必须真的**按指纹**攒起来（不是只喂纯函数）。
    //    形状照真日志：`tool/result` 的 `data.message.content[0]` 里既有 `isError` 也有错误报文。
    const hPit = await harness(fixture)
    await hPit.turnStart(T0)
    await hPit.toolResult(errorResultEvent(), T0 + MIN)
    await hPit.turnStart(T0 + 2 * MIN)                       // 跨回合：坑要跟过去
    await hPit.toolResult(errorResultEvent(), T0 + 3 * MIN)
    await hPit.toolResult(undefined, T0 + 3 * MIN)
    await hPit.toolResult(undefined, T0 + 3 * MIN)
    await hPit.stepBegin(T0 + 3 * MIN + MIN)
    const pitScores = scoresFromText(hPit.lastText())
    // 同一个坑第 2 次 ⇒ 成功率 (2 绿 / 4) = .5 ⇒ success .1667，再扣 .08 .5 ⇒ 贴地 0
    check('D2-7', 5, '【采集端】两个**同形**的报错（同工具 + 同报文）跨一个回合 ⇒ 攒成"同一个坑第 2 次"（掌控贴地 .00）',
      pitScores?.control, 0)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ C · 亲近：重逢项 + 夸 / 骂（口径 6、7）═══')
  // ═══════════════════════════════════════════════════════════════════════════
  // 🔴 **重逢项量的是"他这一次开口之前离了多久"**（契约 3.3 钉死 `sincePreviousBossMinutes`）。
  //    方案原话是「取"他开口**之前**那一刻的『多久没见』"」—— 老实现取的是"现在离他上一句多久"，
  //    `bossAt` 一刷就归零 ⇒ **「他久别归来」永远亮不了**（诊断 P5）。
  // 🔴 三项相加（重逢 + 夸 − 骂），因为它们要能**分开看**。
  {
    const step6 = (from, want) => (typeof from === 'number' ? Number((from + want).toFixed(4)) : '拿不到')
    /** 浮点比：读数按 4 位小数对齐再比（`0.45+0.06` 这类加法在二进制里不精确）。 */
    const near4 = (a, b) => typeof a === 'number' && Math.abs(a - Number(b)) < 1e-6
    const shown = (x) => (typeof x === 'number' ? Number(x.toFixed(4)) : x)

    // ① **基线**：他上一次开口就是刚刚（重逢项 0）、没夸没骂 ⇒ 亲密 = **基线 .50**
    //    （老板 2026-09-26 定：会话刚开始时她跟老板不是"毫无关系"）。
    //    ⚠️ 老实现这里读 .00 —— 这条判据就是钉"地板被抬高"这件事本身。
    const justSpoke = scoresOf(callMood({ ...NEUTRAL_SIGNALS, sincePreviousBossMinutes: 0 }))
    check('E2-1', 6, '【基线·零点】他上一次开口就是刚刚（间隔 0 分钟）、没夸没骂 ⇒ 亲密 = 基线 **.50**',
      justSpoke?.closeness, 0.5)
    // ② **线性区**：隔 2 小时（量程 240 的一半）⇒ 重逢项 .90×.5 = .45 ⇒ 亲密 .50+.45 = **.95**。
    //    取中段而不是顶端：基线 .50 之后顶端会被 clamp 夹住（见 `E2-4b`），取顶端就量不出 `reunionBase` 了。
    const goneLong = scoresOf(callMood({ ...NEUTRAL_SIGNALS, sincePreviousBossMinutes: 480 }))
    const halfWay = scoresOf(callMood({ ...NEUTRAL_SIGNALS, sincePreviousBossMinutes: 120 }))
    check('E2-2', 6, '【重逢项·线性区】他上一次开口在 2 小时前（量程 240 的一半）⇒ 亲密 .50 + .90×½ = **.95**',
      halfWay?.closeness, 0.95)
    // ③ 治 P5 的**可判定形态**：同样"他刚开口"，隔了 8 小时之后的那一句 ⇒ 亲密 ≥ .65
    //    ⇒「他久别归来」那条场景**真的会被递出来**（这才是老板要看的那件事）。
    checkTrue('E2-3', 6, '【治 P5】隔了 8 小时之后他再开口 ⇒ 亲密 1.00 ≥ .65 ⇒「他久别归来」**亮得起来**',
      typeof goneLong?.closeness === 'number' && goneLong.closeness >= 0.65,
      `实测 ${goneLong?.closeness ?? '拿不到'}（老实现：\`sinceBoss\` 被刷成 0 ⇒ 0.00 ⇒ 永远亮不了）`)
    // ④ 🔴 **低重逢区间：重逢项 ≠ 互动项**（同一格上夸 / 骂能把读数挪开，三格各不相同）。
    //    ⚠️ 取点必须选在 **clamp 之下**：隔 1 小时 ⇒ 重逢项 .225 ⇒ 底 .725，
    //       夸 .785 · 骂 .645 —— 三格都在 (0,1) 里，谁都夹不住。
    //       （老那版取隔 8 小时：基线 .50 之后三格**全是 1.00**，判据自己变成了空跑。）
    const lowBase = scoresOf(callMood({ ...NEUTRAL_SIGNALS, sincePreviousBossMinutes: 60 }))
    const lowPraise = scoresOf(callMood({ ...NEUTRAL_SIGNALS, sincePreviousBossMinutes: 60, keywordPraise: 1 }))
    const lowBlame = scoresOf(callMood({ ...NEUTRAL_SIGNALS, sincePreviousBossMinutes: 60, keywordBlame: 1 }))
    checkTrue('E2-4', 6, '【重逢项 ≠ 互动项·低重逢】同一格（隔 1 小时、他刚开口）：不夸不骂 .725 · 夸 .785 · 骂 .645 —— **三格各不相同**',
      near4(lowBase?.closeness, 0.725) && near4(lowPraise?.closeness, 0.785) && near4(lowBlame?.closeness, 0.645),
      `不夸不骂 ${shown(lowBase?.closeness)} · 夸 ${shown(lowPraise?.closeness)} · 骂 ${shown(lowBlame?.closeness)}`)
    // ④b 🔴 **高重逢区间：封顶就封顶**（老板 2026-09-26 拍的**选项 B**，方案第六节）。
    //    基线 .50 + 重逢顶 .90 = 1.40 ⇒ 被 `clamp01` 截成 **1.00** ⇒ 夸 / 骂**不动数**。
    //    ⇒ 这是**定义好的行为，不是 bug**：别去"修"它，也别把它写成红。
    //    ⚠️ 这一格看着像"三个 1.00 的空跑"，其实**能翻面** —— 落选的那两个方案都会让它红：
    //       选项 A（缩放）：骂那一格 < 1.00 · 选项 C（砍重逢顶）：不夸不骂那一格 < 1.00。
    const praised = scoresOf(callMood({ ...NEUTRAL_SIGNALS, sincePreviousBossMinutes: 480, keywordPraise: 1 }))
    const scolded = scoresOf(callMood({ ...NEUTRAL_SIGNALS, sincePreviousBossMinutes: 480, keywordBlame: 1 }))
    checkTrue('E2-4b', '§封顶', '【封顶·高重逢】隔 8 小时开口：不夸不骂 / 夸 / 骂 **逐字都是 1.00**（老板拍的选项 B：满就满，夸骂不动数）',
      near4(goneLong?.closeness, 1) && near4(praised?.closeness, 1) && near4(scolded?.closeness, 1),
      `不夸不骂 ${shown(goneLong?.closeness)} · 夸 ${shown(praised?.closeness)} · 骂 ${shown(scolded?.closeness)}`
      + '（选项 A 会让"骂"掉下来、选项 C 会让"不夸不骂"掉下来 —— 那两个都不许实现）')
    // ④c **门没跟着抬**（方案第五节【3】· 知情并接受）：基线 .50 之后
    //     `重逢项 = .15`（隔 40 分钟）就够到「他久别归来」那条门（`.65`）。
    //     ⇒ 隔 40 分钟**亮**、隔 20 分钟**不亮** —— 这两格把那个日子钉死，免得谁回头偷偷把门抬高。
    const doorIn = callMood({ ...NEUTRAL_SIGNALS, sincePreviousBossMinutes: 40 })?.值
    const doorOut = callMood({ ...NEUTRAL_SIGNALS, sincePreviousBossMinutes: 20 })?.值
    const hitIn = Array.isArray(doorIn?.scenes) && doorIn.scenes.some((s) => s.id === '他久别归来')
    const hitOut = Array.isArray(doorOut?.scenes) && doorOut.scenes.some((s) => s.id === '他久别归来')
    checkTrue('E2-10', 6, '【门不动】隔 40 分钟开口 ⇒ 亲密 .50+.15=.65 ⇒「他久别归来」**亮**；隔 20 分钟 ⇒ .575 ⇒ **不亮**（门还是 .65）',
      near4(doorIn?.scores?.closeness, 0.65) && near4(doorOut?.scores?.closeness, 0.575) && hitIn && !hitOut,
      `隔 40 分钟 ⇒ ${shown(doorIn?.scores?.closeness)}（亮=${hitIn}） · 隔 20 分钟 ⇒ ${shown(doorOut?.scores?.closeness)}（亮=${hitOut}）`)

    // ⑤ 夸 / 骂的**四格**（口径 7）。契约 3.3 把两个入参钉成**句数**：
    //    `keywordPraise` = "带夸奖关键词"的**句子数**（一句最多算一档）· `keywordBlame` 同理
    //    · **同一句话两个都命中 ⇒ 只算骂**（骂赢）。
    // 🔴 **取点隔 1 小时**（重逢项 .225 ⇒ 底 .725）：基线 .50 之后，隔 2 小时的话
    //    `.95 + .06 = 1.01` 会被 clamp 夹成 1.00 ⇒ 夸 / 骂那几条**又变成空跑**。
    const P = { ...NEUTRAL_SIGNALS, sincePreviousBossMinutes: 60 }   // 底 = .50 + .225 = .725
    const base = scoresOf(callMood({ ...P, keywordPraise: 0, keywordBlame: 0 }))?.closeness
    const p1 = scoresOf(callMood({ ...P, keywordPraise: 1 }))?.closeness
    const b1 = scoresOf(callMood({ ...P, keywordBlame: 1 }))?.closeness
    const both = scoresOf(callMood({ ...P, keywordPraise: 1, keywordBlame: 1 }))?.closeness
    const p2 = scoresOf(callMood({ ...P, keywordPraise: 2 }))?.closeness
    const p3b1 = scoresOf(callMood({ ...P, keywordPraise: 3, keywordBlame: 1 }))?.closeness
    checkTrue('E2-5', 7, '【夸一句】夸 ⇒ 比不夸**高**（+一档 .06）',
      near4(p1, step6(base, 0.06)), `不夸 ${shown(base)} ⇒ 夸 ${shown(p1)}（期望 ${step6(base, 0.06)}）`)
    checkTrue('E2-6', 7, '【骂一句】骂 ⇒ 比不骂**低**（−一档 .08，骂比夸更响）',
      near4(b1, step6(base, -0.08)), `不骂 ${shown(base)} ⇒ 骂 ${shown(b1)}（期望 ${step6(base, -0.08)}）`)
    checkTrue('E2-7', 7, '【纯函数那一层是"各自累计"】夸与骂同时非零 ⇒ 两项各加各减（`.50 + .225 + .06 − .08 = .705`）—— 判"双命中"要先知道**是不是同一句**，那是采集端的事（下一条）',
      near4(both, step6(base, -0.02)),
      `夸 ${shown(p1)} · 两个都非零 ${shown(both)} · 骂 ${shown(b1)}`)
    /**
     * 🔴 口径 7 的"**骂赢**"真正发生的地方在**关键词计数那一层**（一句话里两个词都出现）。
     * 纯函数拿到的只是两个句数，它分不出"同一句"还是"两句" —— 所以这一条必须走**全流程**。
     * ⚠️ **取点隔 1 小时**（不复用 V 族那个 4 小时）：基线 .50 + 重逢顶 .90 = 1.40 会被 clamp 夹住 ⇒
     *    两格都读 1.00、**什么样的实现都相等**，判据当场变空跑。隔 1 小时 ⇒ 底 .725，
     *    骂一档 ⇒ .645：既没夹住，也离"两个都算"（.705）差得开。
     */
    const oneLine = await (async () => {
      const dir = buildFixture({ mood: FIXTURE_MOOD({ keywordPraise: ['棒'], keywordBlame: ['笨'] }) })
      try {
        const h = await harness(dir)
        await h.turnStart(T0 - 1 * HOUR)
        await h.bossText('（上一句话）', T0 - 1 * HOUR)
        await h.stepBegin(T0 - 1 * HOUR)
        await h.bossText('这版挺棒，不过这块写得真笨', T0)   // ⚠️ 一句里既夸又骂
        await h.stepBegin(T0 + MIN)
        return scoresFromText(h.lastText())?.closeness
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })()
    const blameOnly = await (async () => {
      const dir = buildFixture({ mood: FIXTURE_MOOD({ keywordPraise: ['棒'], keywordBlame: ['笨'] }) })
      try {
        const h = await harness(dir)
        await h.turnStart(T0 - 1 * HOUR)
        await h.bossText('（上一句话）', T0 - 1 * HOUR)
        await h.stepBegin(T0 - 1 * HOUR)
        await h.bossText('这块写得真笨', T0)
        await h.stepBegin(T0 + MIN)
        return scoresFromText(h.lastText())?.closeness
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })()
    check('E7b', 7, '【双命中·采集端】同一句话里既夸又骂 ⇒ 读数 == **只按骂算**那一格（骂赢在数句子的那一层）',
      oneLine, blameOnly)
    checkTrue('E2-8', 7, '【一句最多一档 / 跨句累计】两句各夸一次 ⇒ +.12',
      near4(p2, step6(base, 0.12)), `夸一句 ${shown(p1)} ⇒ 夸两句 ${shown(p2)}（期望 ${step6(base, 0.12)}）`)
    checkTrue('E2-9', 7, '【夸与骂各自累计】三句夸 + 一句骂 ⇒ 净 +.10',
      near4(p3b1, step6(base, 0.10)), `实测 ${shown(p3b1)} / 期望 ${step6(base, 0.10)}`)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ W · 关键词：`der` 整词匹配（口径 8）═══')
  // ═══════════════════════════════════════════════════════════════════════════
  // 🔴 **口径 8 点名要阳性对照**：光证"`under` / `order` / `header` 不命中"是不够的 ——
  //    一个把关键词表整个丢掉、永远返回 0 的实现也能让那三条**空跑成绿**。
  //    ⇒ 同一批里必须有**会命中的**（`der` 整词 / `棒` / `笨`），而且整词那两格要**同一份夹具**。
  {
    /**
     * 老板发一句话、走到回答他那一步 ⇒ 从情绪段里读**亲密**分。
     * 🔴 **取点：让他隔 30 分钟没开口**（这次量的是"命中 / 不命中"，不是重逢项本身）。
     *    为什么不是老那版的 4 小时：基线 .50 之后 `.50 + .90 = 1.40` 会被 clamp 夹成 1.00 ⇒
     *    **所有格都是 1.00**，"命中了"和"谁都不命中"读数一样，整个 W 族变成空跑
     *    （改前实测：`der 1 · under order header 1`）。
     *    取 30 分钟 ⇒ 底 .50 + .1125 ≈ `.61`，往上往下都离 clamp 与 0 很远。
     *    ⚠️ 顺带：老那版要避开的是**下界**（重逢项 .0038 时减一档骂会贴 0 被夹住），
     *       基线 .50 把那个坑填掉了 —— 现在要避开的是**上界**。方向反过来了。
     */
    const V_GAP_MIN = 30
    const closenessAfter = async (said, { mood } = {}) => {
      const dir = buildFixture(mood === undefined ? {} : { mood })
      try {
        const h = await harness(dir)
        // 🔴 **老板那句话的时刻必须给他**（`bossText` 的第二参）：重逢项量的是
        //    "他这一次开口**之前**离了多久"，而那条 `user/message` 要到**本步落笔时**才写。
        //    ⇒ 贴出去的那一条是在 pre-step 上算的，它只能从**消息自带的时间**里读这个距离。
        //    （不给的话实现退回"本步的时刻"，读数会差一点 —— 本票实测踩过：重逢项恒 0。）
        // ⚠️ `stepBegin` 与 `bossText` **同刻**（同 `closenessRun` 那条纪律）：
        //    `sincePrevBossMin` 有两个记账点，不同刻时读数会差"上一步的滞后"。
        await h.turnStart(T0 - (V_GAP_MIN + 1) * MIN)
        await h.bossText('（上一句话）', T0 - V_GAP_MIN * MIN)
        await h.stepBegin(T0 - V_GAP_MIN * MIN)
        await h.bossText(said, T0)
        await h.stepBegin(T0 + MIN)
        return { 值: scoresFromText(h.lastText())?.closeness, 句子: said }
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }
    /**
     * 两格读数之差 ≈ 某一档刻度（容差 .011：那些格是**从两位小数的分数行上读回来的**，
     * 一格的分辨率就是 .01 —— 逐字比会变成比舍入，不是比行为）。
     * 🔴 **判据写成"差 = 一档"而不是"谁比谁大"**：两格共用同一个重逢项（同刻、同夹具），
     *    所以那一项在减法里**消掉**，剩下来的只能是关键词那一档 —— 这样连
     *    "重逢项被算错"都盖不住它，而且完全不需要知道重逢项到底记了几分钟。
     */
    const stepOf = (a, b) => (typeof a === 'number' && typeof b === 'number' ? Number((a - b).toFixed(4)) : '拿不到')
    const nearStep = (diff, want) => typeof diff === 'number' && Math.abs(diff - want) < 0.011
    /** 把关键词表钉成**只有一个** `der`（+一个中文骂词），正反两格就走同一份夹具 —— 对照才干净。 */
    const DER_ONLY = FIXTURE_MOOD({ keywordPraise: ['der', '棒'], keywordBlame: ['笨'] })

    const derWord = await closenessAfter('der', { mood: DER_ONLY })
    const derInside = await closenessAfter('under order header', { mood: DER_ONLY })
    const derGlued = await closenessAfter('nader derx', { mood: DER_ONLY })
    const derUpper = await closenessAfter('DER', { mood: DER_ONLY })
    const praiseCn = await closenessAfter('棒')
    const blameCn = await closenessAfter('笨')
    const plain = await closenessAfter('今天就这样')
    checkTrue('V1', 8, '【阳性对照·字母词】`der` **整词**出现 ⇒ 命中夸：读数比"谁也不命中"那一格**正好高一档 `.06`**（不是"永远不命中"）',
      typeof derWord.值 === 'number' && typeof plain.值 === 'number' && derWord.值 > plain.值
      && nearStep(stepOf(derWord.值, plain.值), 0.06),
      `「der」 ⇒ 亲密 ${derWord.值 ?? '拿不到'} · 「今天就这样」 ⇒ ${plain.值 ?? '拿不到'}（差 ${stepOf(derWord.值, plain.值)}，期望 .06）`)
    checkTrue('V2', 8, '【整词·负例】`under` / `order` / `header`（都**含有** `der`）⇒ 一个都不许命中（＝"谁也不命中"那一格）',
      typeof derInside.值 === 'number' && typeof plain.值 === 'number' && derInside.值 === plain.值,
      `「under order header」 ⇒ ${derInside.值 ?? '拿不到'} · 「今天就这样」 ⇒ ${plain.值 ?? '拿不到'}`)
    checkTrue('V2b', 8, '【整词·边界】`nader` / `derx`（`der` 贴在别的字母上）⇒ 同样不许命中',
      typeof derGlued.值 === 'number' && typeof plain.值 === 'number' && derGlued.值 === plain.值,
      `「nader derx」 ⇒ ${derGlued.值 ?? '拿不到'} · 「今天就这样」 ⇒ ${plain.值 ?? '拿不到'}`)
    checkTrue('V2c', 8, '【大小写】`DER`（大写）⇒ 仍然命中（整词匹配不该被大小写搅掉）',
      typeof derUpper.值 === 'number' && typeof derWord.值 === 'number' && derUpper.值 === derWord.值,
      `「DER」 ⇒ ${derUpper.值 ?? '拿不到'} · 「der」 ⇒ ${derWord.值 ?? '拿不到'}`)
    checkTrue('V3', 8, '【中文按子串·阳性对照】`棒` 命中夸（+.06）、`笨` 命中骂（−.08）、`今天就这样` 谁都不命中（三格分得开）',
      typeof praiseCn.值 === 'number' && typeof blameCn.值 === 'number' && typeof plain.值 === 'number'
      && praiseCn.值 > plain.值 && blameCn.值 < plain.值
      && nearStep(stepOf(praiseCn.值, plain.值), 0.06) && nearStep(stepOf(plain.值, blameCn.值), 0.08),
      `棒 ${praiseCn.值 ?? '拿不到'} · 笨 ${blameCn.值 ?? '拿不到'} · 平 ${plain.值 ?? '拿不到'}`
      + `（棒−平 ${stepOf(praiseCn.值, plain.值)} 期望 .06 · 平−笨 ${stepOf(plain.值, blameCn.值)} 期望 .08）`)
    // 口径 9：**词表真的从文件读** —— 同一句「超级棒」，只换 `mood.md` 里的夸词表：
    //  · 词表 A = `['der','棒']` ⇒ 「超级棒」里有「棒」⇒ **命中**
    //  · 词表 B = `['der','挺好']` ⇒ 一个都不含 ⇒ **不命中**
    // 词表写死在 `.js` 里的实现，这两格会一模一样。
    // ⚠️ 老那段注释写着"重逢项到顶（.90）时 +.06 会被 1.00 夹住"——那是**老基线**的坑；
    //    基线 .50 之后取点已经挪到 .61 一带（见 `closenessAfter`），两格差得开。
    const WORD_A = FIXTURE_MOOD({ keywordPraise: ['der', '棒'], keywordBlame: ['笨'] })
    const WORD_B = FIXTURE_MOOD({ keywordPraise: ['der', '挺好'], keywordBlame: ['笨'] })
    const hitA = await closenessAfter('超级棒', { mood: WORD_A })
    const hitB = await closenessAfter('超级棒', { mood: WORD_B })
    checkTrue('V4', 9, '【词表住在文件里】同一句「超级棒」：词表含 `棒` 的那份**命中夸**（比不含的那份正好高一档 `.06`）',
      typeof hitA.值 === 'number' && typeof hitB.值 === 'number' && hitA.值 > hitB.值
      && nearStep(stepOf(hitA.值, hitB.值), 0.06),
      `词表=['der','棒'] ⇒ ${hitA.值 ?? '拿不到'} · 词表=['der','挺好'] ⇒ ${hitB.值 ?? '拿不到'}`
      + `（差 ${stepOf(hitA.值, hitB.值)}，期望 .06）`)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ K · 疲劳：开工时刻 + 净工作时长（口径 10、11、12）═══')
  // ═══════════════════════════════════════════════════════════════════════════
  {
    /**
     * 净工作时长的**两个端点**（口径 12 的前半：在场累加）。
     * ⚠️ 老那版这里写着"下限 0 的线性回退"——**已经作废**：契约 3.3 钉的是
     *    `net × e^(−(离开−在场判据)/absenceHalfLifeMinutes)`（见 K4）。
     */
    // 🔴 **活力是反着算的**（老板 2026-09-26 改名时定的方向）：`活力 = 1 − 净工时/满量程`。
    //    ⇒ 两个端点是**恰好** 0 与 1（不是 ≥.95 / ≤.05 那种"差不多到顶"）——
    //      老那版用 ≥/≤ 是因为旧方向下"到顶"只是个近似；新算式两端是精确值，就该按精确值钉。
    const tired = scoresOf(callMood({ ...NEUTRAL_SIGNALS, netWorkMinutes: 360 }))
    const justIn = scoresOf(callMood({ ...NEUTRAL_SIGNALS, netWorkMinutes: 0 }))
    checkTrue('X1', 12, '【在场累加】净干满量程 360 分钟 ⇒ 活力**恰好 .00**（干得越久分越低，干满 ⇒ 0）',
      typeof tired?.fatigue === 'number' && Math.abs(tired.fatigue) < 1e-6, `实测 ${tired?.fatigue ?? '拿不到'}`)
    checkTrue('X2', 12, '【刚开工】净干 0 分钟 ⇒ 活力**恰好 1.00**（还有的是劲）',
      typeof justIn?.fatigue === 'number' && Math.abs(justIn.fatigue - 1) < 1e-6, `实测 ${justIn?.fatigue ?? '拿不到'}`)

    /**
     * 🔴 **这一条才是治 P6 的**：老实现吃的是"本回合时长"，而回合被老板开口切成 2–4 分钟
     * ⇒ 一整天只从 .10 动到 .11。判据必须**跨很多个回合**量，不能拿"一个长回合"冒充。
     * 这里喂 26 个回合（每个 14 分钟、中间他都开过口）⇒ 净工作时长该累到满量程。
     */
    const hLong = await harness(fixture)
    const startOfDay = Date.parse('2026-09-26T09:00:00+08:00')
    await hLong.turnStart(startOfDay)
    for (let i = 0; i < 26; i++) {
      await hLong.bossText(`第 ${i + 1} 句话`, startOfDay + (i + 1) * 14 * MIN)                   // 他一直在旁边 ⇒ 在场
      await hLong.stepBegin(startOfDay + (i + 1) * 14 * MIN)     // 机制② 出口 ⇒ 情绪段
    }
    const longRun = scoresFromText(hLong.lastText())
    checkTrue('X3', 12, '【治 P6】26 个回合、每回 14 分钟、他一直在旁边 ⇒ 活力 ≤ .05（干了一整天；老实现吃"本回合时长" ⇒ 恒 .1x 的一条直线）',
      typeof longRun?.fatigue === 'number' && longRun.fatigue <= 0.05,
      `实测活力 ${longRun?.fatigue ?? '拿不到'}（老实现：本回合 14 分钟 ⇒ 疲劳 .10 + .8×(14/300) ≈ .14）`)

    /**
     * 离开 ⇒ **按 `absenceHalfLifeMinutes`（60）半衰回退**（口径 12 后半）。
     * 两格对照：同样"干了 4 小时"，他走了 15 分钟 / 走了 2 小时 ⇒ 后者攒下的少 ⇒ **活力更高**。
     * 🔴 **回退算在采集端**（契约 3.2 末尾）：`moodOf` 只拿一个**已经算好**的
     *    `netWorkMinutes` 去打分。所以这里喂的数是**回退之后**的那个时长 ——
     *    240·e⁻² ≈ 32.5 分钟 ⇒ 活力 1 − 32.5/360 = .9097。
     *    两边各算一次会把衰减乘两遍（老那版实测：活力恒满）。
     */
    const AWAY_2H = 240 * Math.exp(-2)
    const awayShort = scoresOf(callMood({ ...NEUTRAL_SIGNALS, netWorkMinutes: 240 }))
    const awayLong = scoresOf(callMood({ ...NEUTRAL_SIGNALS, netWorkMinutes: AWAY_2H }))
    checkTrue('X4', 12, '【离开回退·打分端】净干 240 分钟 ⇒ 活力 1−240/360 = .3333；走了 2 小时之后回退到 32.5 分钟 ⇒ 1−32.5/360 = .9097（半衰 60）',
      typeof awayShort?.fatigue === 'number' && typeof awayLong?.fatigue === 'number'
      && Math.abs(awayShort.fatigue - (1 - 240 / 360)) < 1e-6
      && Math.abs(awayLong.fatigue - (1 - AWAY_2H / 360)) < 1e-6,
      `没走 ${Number((awayShort?.fatigue ?? NaN).toFixed(4))}（期望 .3333） · 走了两小时 ${Number((awayLong?.fatigue ?? NaN).toFixed(4))}（期望 .9097）`)
    // ⚠️ **边界跟着方向翻**：老那版写的是 `> 0.05`（疲劳还在），翻成活力之后那句话变成
    //    "活力没满" ⇒ **上界**。照抄旧下界的话，`1.00`（= 账被清零）也满足 `> 0.05`，
    //    判据当场变成恒真 —— 这正是"静默失效"的形状。
    checkTrue('X5', 12, '【回退不是清零】走了两小时之后，活力**严格小于 1**（攒下的那笔账还在；清零的实现是 1 − 15/360 = .9583）',
      typeof awayLong?.fatigue === 'number' && awayLong.fatigue <= 0.93,
      `实测 ${Number((awayLong?.fatigue ?? NaN).toFixed(4))}（清零 ⇒ .9583，应当在窗外）`)

    /**
     * 🔴 **采集端那一支（今天零覆盖）**：`X1`–`X5` 全是**手工喂一个算好的 `netWorkMinutes`** 给
     * `moodOf` —— `advanceWork()` 里"他离开 ⇒ 攒下的按半衰往回退"那一行**一条断言都穿不过去**
     * （评审条件 ②：`X4` 的注释自己也写着"这里喂的数是回退之后的那个时长"）。
     * 这一组走**真事件流**，把组长拍的语义钉死：
     *   · 在场（间隔 ≤ `presenceMinutes` 15）⇒ 整段累加；
     *   · 离开 ≥ 15 分钟 ⇒ 攒下的那一段按 `absenceHalfLifeMinutes`（60）**半衰回退，不是清零**；
     *   · 他回来 ⇒ **接着累加**（不是从 0 重来）。
     * ⚠️ 疲劳只在**贴尾巴那一步**推进（`emotionTextOf` → `advanceWork`），
     *    而 `now` 取的是**最近一条事件的 `time`** ⇒ 采集端的账**按每 15 分钟一个尾巴**走：
     *    工具结果每 5 分钟一条（`every: 3`）⇒ 每 15 分钟贴一条 ⇒ 每格正好记满 15 分钟。
     */
    {
      const at = (m) => T0 + m * MIN
      const hWork = await harness(fixture)
      await hWork.turnStart(at(0))
      await hWork.bossText('开工', at(0))
      await hWork.stepBegin(at(1))                 // 他开过口了（`bossHeard`）⇒ 攒下的那一段算数
      // ⚠️ **守门 B**：机制② 刚摆过的那**一个**工具结果不计数（"不叠"）⇒ 第 1 条结果被吃掉，
      //    尾巴落在第 4、7、10…37 条结果上（共 12 个），每个之间都是 15 分钟。
      for (let k = 1; k <= 37; k++) await toolStep(hWork, at(k * 5))
      const inPresence = scoresFromText(hWork.lastText())?.fatigue
      checkTrue('X6', 12, `【采集端·在场累加】每次间隔 15 分钟（= 在场判据）⇒ 12 个尾巴攒满 180 分钟 ⇒ 活力 .50（实测 ${inPresence ?? '拿不到'}；走的是真事件流，不是喂纯函数）`,
        typeof inPresence === 'number' && Math.abs(inPresence - 0.50) < 5e-3,
        `实测 ${inPresence ?? '拿不到'}（期望 .50 = 1 − 180 ÷ 360）`)

      // 他离开 2 小时：这一段里**一个尾巴都没有**（采集端那个钟不推进，那段时间不算工时）。
      // 恢复干活：305 / 310 / 315 三条结果 ⇒ 机制① 在 315 那一步贴。
      // 采集端在那一刻看到的是"上一个尾巴（185 分）→ 现在（315 分）"= 130 分钟：
      // 超出在场的 15 分钟之外是 115 分钟 ⇒ 攒下的 180 按半衰 60 退成 180·e^(−115/60) ≈ 26.5，
      // 再记在场那 15 分钟 ⇒ 41.5 分钟 ⇒ 活力 1 − 41.5/360 ≈ .885。
      // 🔴 **判据给的是窗口，不是那一位小数**：这一步的读数取决于"哪一个事件推进那个钟"
      //    （只在贴尾巴那一步推 ⇒ 41.5 分钟 ⇒ 活力 .885；每个事件都推 ⇒ 56.2 ⇒ .844）。
      //    窗口 [.83, .92] 覆盖"同一条规则、记账时刻差一步"（它是老窗口 [.08, .17] 按
      //    `1 − x` 翻过来的 —— 这两件事本来就是同一件事的正反两面）。
      //    而**三个错的行为都在窗外**：清零 ⇒ 1 − 15/360 = .958 · 不折 ⇒ 1 − 195/360 = .458 ·
      //    半衰写错（30 / 120）⇒ 1 − 18/360 ≈ .95 / 1 − 77/360 ≈ .79。
      for (let k = 61; k <= 63; k++) await toolStep(hWork, at(k * 5))
      const afterAway = scoresFromText(hWork.lastText())?.fatigue
      checkTrue('X7', 12, `【采集端·离开回退】他离开 2 小时（这段一个尾巴都没有）之后接着干活 ⇒ 攒下的 180 分钟**按半衰 60 退**（实测活力 ${afterAway ?? '拿不到'}；只在尾巴那步记账是 .885、每个事件都记账是 .844）—— 清零 .96 · 不折 .46 都在窗外`,
        typeof afterAway === 'number' && afterAway >= 0.83 && afterAway <= 0.92,
        `实测 ${afterAway ?? '拿不到'}（期望落在 [.83, .92]；清零 ⇒ .96 · 不折 ⇒ .46 · 半衰 30 ⇒ .95）`)

      // 回来之后**接着累加**：再干 15 分钟 ⇒ 活力**正好 −15 ÷ 360 = −.0417**
      // （一个"他回来就从头算"的实现给不出这个增量 —— 除非它连在场那段也丢了）。
      for (let k = 64; k <= 66; k++) await toolStep(hWork, at(k * 5))
      const resumed = scoresFromText(hWork.lastText())?.fatigue
      const delta = typeof afterAway === 'number' && typeof resumed === 'number'
        ? Number((resumed - afterAway).toFixed(4)) : '拿不到'
      checkTrue('X8', 12, `【采集端·回来接着累加】再干 15 分钟 ⇒ 活力**正好 −.0417**（实测增量 ${delta}）—— 在攒下的那个数上继续加，不是从 0 重来`,
        typeof delta === 'number' && Math.abs(delta + 15 / 360) < 5e-3,
        `回退后 ${afterAway ?? '拿不到'} ⇒ 再干 15 分钟 ${resumed ?? '拿不到'}（增量 ${delta}，期望 −.0417）`)
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ U · 尾巴全长：style 段 + 情绪段（口径 15 · 悬项 ⑧）═══')
  // ═══════════════════════════════════════════════════════════════════════════
  // 🔴 **悬项 ⑧（`.team/leader/now.md`）**：`I7` 只卡 **style 段**（380 字符），
  //    而真发出去的是 **549/564/566 字符** —— 情绪板那 ~170-186 字符**不在任何断言的量程里**。
  //    口径 15 就是收它：**全长**（style 段 + 情绪段）必须有人守。
  {
    const h = await harness(fixture)
    await h.turnStart(T0)
    await bossThenStep(h)
    const text = h.lastText()
    const { 条数, 字符数 } = h.stat()
    check('Y1', 15, '【前提】这一步确实贴了一条尾巴（否则下面两条是空跑）', { 条数, 尾部字符数: 字符数 }, { 条数: 1, 尾部字符数: 字符数 })
    const styleLen = typeof text === 'string' ? stylePartOf(text).length : 0
    const moodLen = typeof text === 'string' ? (moodPartOf(text) ?? '').length : 0
    checkTrue('Y2', 15, `【口径 15·全长】贴出去那一条 = style 段 + 情绪段，**逐字量出来**（style ${styleLen} + 情绪 ${moodLen} = ${typeof text === 'string' ? text.length : '拿不到'}）`,
      typeof text === 'string' && text.length === styleLen + moodLen + 2,
      `实测全长 ${typeof text === 'string' ? text.length : '拿不到'}（两段之间一个空行 = 2 个字符）`)
    checkTrue('Y3', 15, '【口径 15·上限】全长 ≤ 1000 字符【测试位代拍】（方案只说"顺手收悬项 ⑧"，没给数；这个数取自上一批 `P7`）',
      typeof text === 'string' && text.length <= 1000, `实测 ${typeof text === 'string' ? text.length : '拿不到'} 字符`)
    // ⚠️ **真产物那条**在 `I` 族（真 style.md + 真 mood.md），这条只是夹具。
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ A · 接线：疲劳的"开工时刻"从当日 log 首条读（口径 10、11）═══')
  // ═══════════════════════════════════════════════════════════════════════════
  // 🔴 方案第三节【4】点名的**形状接口**：`.team/leader/<今天>/log.md` 的首条 `## HH:MM`。
  //    这个形状改了 ⇒ 开工时刻读不出来 ⇒ **静默退化**（同 `me-aqua.md` 的下班三行那种死法）。
  {
    /** 一份夹具、两个抽屉：只换"首条记录时间"，看疲劳跟不跟着动。 */
    const fatigueAt = async (first, now) => {
      const dir = buildFixture({ leaderLog: FIXTURE_LEADER_LOG(first) })
      try {
        const h = await harness(dir)
        await h.turnStart(now)
        await h.bossText('开工', now)
        await h.stepBegin(now)
        return scoresFromText(h.lastText())?.fatigue
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }
    const morning = await fatigueAt('09:00', T0 + 6 * HOUR)
    const noon = await fatigueAt('15:00', T0 + 6 * HOUR)
    checkTrue('Z1', 10, '【口径 10】同一时刻、只把当日 log 的首条记录从 `09:00` 换成 `15:00` ⇒ 活力**明显更高**（开工晚 ⇒ 净工时短；首条真的被读）',
      typeof morning === 'number' && typeof noon === 'number' && noon > morning,
      `首条 09:00 ⇒ 活力 ${morning ?? '拿不到'} · 首条 15:00 ⇒ 活力 ${noon ?? '拿不到'}`)

    // 口径 11：**今天没有 log ⇒ 降级到会话首帧**，而且要出声（不许静默失效）。
    // ⚠️ 事件序列：`turn/start` + 一个工具结果把 `lastEventAt` 推到 T0，**最后**才让老板开口
    //    （这样"距上次开口"= 0 ⇒ 在场 ⇒ 从会话首帧 T0 到 T0+6h 的 6 小时全部累加）。
    const noLog = buildFixture({ leaderLog: null })
    try {
      const before = stderrSeen.length
      const h = await harness(noLog)
      await h.turnStart(T0)
      // 🔴 造一段**像样的工作日**：他每 14 分钟搭一句话（在场累加），一路干到 6 小时。
      //    ⚠️ 只发一条"开工"然后跳到 6 小时后是不行的：那 6 小时里他几乎都不在，
      //       按口径 12 的规矩**不算干活**（疲劳读数 15 分钟 ⇒ .04，判据当场红）。
      //       本条要钉的是"**降级那条路**"（没有 log ⇒ 用会话首帧当开工时刻），
      //       不是"他不在也算干活"，所以工作日的形状必须真实。
      for (let i = 0; i < 26; i++) {
        const at = T0 + i * 14 * MIN
        await h.bossText(`第 ${i + 1} 句话`, at)
        await h.stepBegin(at + 14 * MIN)
      }
      const degraded = scoresFromText(h.lastText())?.fatigue
      checkTrue('Z2', 11, '【口径 11】**今天没有 log** ⇒ 降级用**会话首帧**当开工时刻（6 小时的工作日 ⇒ 活力贴地）',
        typeof degraded === 'number' && degraded <= 0.05, `实测活力 ${degraded ?? '拿不到'}`)
      checkTrue('Z3', 11, '【口径 11·不许静默】降级那一刻**要出声**（`console.error`，报文里点到 log / 开工时刻）',
        stderrSeen.slice(before).some((m) => /log\.md|开工时刻|首条/.test(m)),
        `这一段里 console.error 收到的是：${brief(stderrSeen.slice(before).join(' | ') || '（一声都没有）')}`)
    } finally {
      rmSync(noLog, { recursive: true, force: true })
    }

    // 🔴 **只认 `<日期>/log.md` 那个抽屉，不认 `.team/leader/log.md`**（方案第三节【4】末尾那句）。
    //    现场：抽屉里没有 log，但累计日志在 ⇒ 拿累计日志的首条当开工时刻就错了。
    const cumulative = buildFixture({ leaderLog: null })
    try {
      mkdirSync(join(cumulative, '.team', 'leader'), { recursive: true })
      writeFileSync(join(cumulative, '.team', 'leader', 'log.md'),
        '# log（累计日志 · 这是另一个东西）\n\n## 07:00 · 很早的一条\n', 'utf8')
      const h = await harness(cumulative)
      await h.turnStart(T0)
      await h.toolResult(undefined, T0)
      await h.bossText('开工', T0)
      await h.stepBegin(T0 + 6 * HOUR)
      const fell = scoresFromText(h.lastText())?.fatigue
      // 会话首帧 = T0（09:00）⇒ 干了 6 小时 ⇒ 活力 .00；累计日志那条 07:00 ⇒ 8 小时 ⇒ 也是 .00。
      // ⇒ 这一条**分不开**两种实现（两种都贴地），所以它只钉"降级那条路有值、不静默"。
      checkTrue('Z4', 11, '【口径 11·同一件事】抽屉里没有 log 时，**降级**这条路的读数不静默（活力有值、不是 undefined）',
        typeof fell === 'number', `实测活力 ${fell ?? '拿不到'}`)
    } finally {
      rmSync(cumulative, { recursive: true, force: true })
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ M · 组员一条都不贴（口径 16 · 回归）═══')
  // ═══════════════════════════════════════════════════════════════════════════
  // 老板 2026-09-25：「组员完全不需要语气」。**情绪段跟着 style 走同一个出口**
  // ⇒ 组员那边情绪段也不存在。这一批改了情绪模块，这条**必须回归**。
  // 🔴 **编号（2026-09-26 返修）**：这一族原来是 `M4`/`M2`/`M6`/`M4` —— `M2` 与 `M4` 各撞一次，
  //    而 `M4` 那两处还是**两件不同的事**（机制② / 机制①）。现在照契约 §3.6 那张表逐格对齐：
  //    机制② = `M4`（组长对照）/`M5`（组员）· 机制① = `M6`（组长对照）/`M7`（组员）。
  //    上一族（口径 5）用的是 `M0`–`M3`，两族合起来没有一个重号（收尾 `Z9` 自己会查）。
  {
    // 机制②：老板开口 ⇒ 组长的这一步会贴；组员的不许贴。
    const lead2 = await harness(fixture)
    await lead2.turnStart(T0)
    await bossThenStep(lead2)
    check('M4', 16, '【机制②·对照·组长】老板一句 + 走到那一步（装配不带标记）⇒ 注入 1 条', lead2.count(), 1)

    const mem2 = await harness(fixture, { member: 'test' })
    await mem2.turnStart(T0)
    await bossThenStep(mem2)
    checkIf(lead2.count() === 1, 'M5', 16, '【机制②·组员】同样一串事件 ⇒ 一条都不贴（情绪段也不许漏出去）',
      mem2.count(), 0)

    // 机制①：攒够 n 个工具结果 ⇒ 组长的会贴；组员的不许贴。
    const lead3 = await harness(fixture)
    await lead3.turnStart(T0)
    for (let k = 0; k < 3; k++) await toolStep(lead3, T0 + k * MIN)
    check('M6', 16, '【机制①·对照·组长】3 个工具结果 ⇒ 机制① 响一次', lead3.count(), 1)

    const mem3 = await harness(fixture, { member: 'test' })
    await mem3.turnStart(T0)
    for (let k = 0; k < 3; k++) await toolStep(mem3, T0 + k * MIN)
    checkIf(lead3.count() === 1, 'M7', 16, '【机制①·组员】同样 3 个工具结果 ⇒ 一条都不贴',
      mem3.count(), 0)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ F · 静态形状：常数与关键词表住在文件里（口径 13、14、1）═══')
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const src = readFileSync(PRESET_ENTRY, 'utf8')
    checkTrue('H6', 1, '`inject.js` 里不再有"愉悦 / 唤起 / 新异"这三个中文维度名（口径 1 的静态半边）',
      !/愉悦|唤起|新异/.test(src),
      ['愉悦', '唤起', '新异'].filter((w) => src.includes(w)).map((w) => `还写着「${w}」`).join('、') || '（干净）')
    checkTrue('H7', 1, '`inject.js` 里不再有 `pleasure` / `arousal` / `novelty` 这三个键（口径 1 的静态半边）',
      !/\b(pleasure|arousal|novelty)\b/.test(src),
      ['pleasure', 'arousal', 'novelty'].filter((w) => new RegExp(`\\b${w}\\b`).test(src)).join('、') || '（干净）')
    // 口径 13：三个新常数**一个都不许写进 `.js`**。
    const hard = [
      ['presenceMinutes 的值 15', /presence\w*\s*[:=]\s*15|15\s*[,;]?\s*\/\/\s*在场/],
      ['absenceHalfLifeMinutes 的值 60', /absence\w*\s*[:=]\s*60/],
      ['fullScaleMinutes 的值 360', /fullScale\w*\s*[:=]\s*360/],
    ].filter(([, re]) => re.test(src)).map(([name]) => name)
    check('H8', 13, '`.js` 里没有"三个新常数"的硬编码值（它们只许住在 `mood.md`）',
      hard.length === 0 ? '（干净）' : `硬编码了：${hard.join('、')}`, '（干净）')
    // 口径 9：关键词表住在 `mood.md` —— `.js` 里不许有**写死的词**。
    // ⚠️ 判据**不能**写成"源码里不许出现 `der` 这三个字符"：一份照契约写的实现必然要在
    //    **注释**里举 `under` / `order` 当反例（参考夹具就是）。注释不是词表。
    //    ⇒ 先剥注释，再看**代码里**有没有那几个词。
    const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    const hardWords = ['棒', '笨', 'der'].filter((w) => codeOnly.includes(`'${w}'`) || codeOnly.includes(`"${w}"`) || codeOnly.includes(`\`${w}\``))
    checkTrue('H9', 9, '`.js` **代码里**没有写死的夸 / 骂词（`棒` / `笨` / `der` 只许住在 `mood.md`）',
      hardWords.length === 0,
      hardWords.length === 0 ? '（干净：注释里提到的不算）' : `写死在代码里的是：${hardWords.join('、')}`)
    // 口径 14：那句"分数是调语气用的，不是绩效报表"**还在 `mood.md` 里**。
    // ⚠️ 这条量的是**产物内容**：拿参考夹具当被测对象时（换入口）它不适用 —— 记挂起，不染红对照。
    const moodRaw = existsSync(join(PRODUCT_DIR, 'mood.md'))
      ? readFileSync(join(PRODUCT_DIR, 'mood.md'), 'utf8') : ''
    checkIf(TESTING_PRODUCT, 'H10', 14, '`mood.md` 里「分数是调语气用的，不是绩效报表」**还在**',
      /分数是调语气用的/.test(moodRaw) ? '在' : '不在了 —— 老板 2026-09-26 下午点名要它留着', '在')
    // 口径 10：**"今天的抽屉是哪个"必须从事件时间推**，不许读真实时钟。
    // 边界（两件事各守一半，缺一不可）：
    //   · 禁区 = 任何地方的无参 `new Date()`，以及任何地方的 `Date.now()`；
    //   · 唯一的例外 = `timeLineOf(<会话 id>, Date.now())` 这一处**实参** —— 尾巴那条「现在几点」
    //     按 F-102 的口径取**进程当时**（他读的是"现在几点"，不是"今天在哪个抽屉"）。
    //     豁免按**调用形状**给，不按文件给：这个钟只许喂给那一行，不许被别处借去算抽屉或算别的。
    // ⚠️ 静态判据抠整份源码、注释也算（mig-rules-13），而 `inject.js` 那段文档注释**必须**逐字写
    //    "`now` 必须是 `Date.now()`"（那是 F-102 的规范）⇒ 这里**先剥注释**再扫（保留行号）：
    //    注释不是代码，规范本身不该被自己的判据判红。
    // ⚠️ 只对**产物入口**判：参考夹具用 `new Date(事件时间戳)` 把"今天"推出来是合规的
    //    （带参数 = 不读真实时钟），换入口时这一条不适用。
    const stripCommentsKeepingLines = (text) => text
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
      .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length))
    const SANCTIONED_CLOCK = /timeLineOf\(\s*[A-Za-z_$][\w$]*\s*,\s*Date\.now\(\)\s*\)/g
    const lineAt = (text, index) => text.slice(0, index).split('\n').length
    const clockScanOf = (text) => {
      const blanked = stripCommentsKeepingLines(text)
      const allowed = [...blanked.matchAll(SANCTIONED_CLOCK)].map((m) => ({ line: lineAt(blanked, m.index) }))
      const scrubbed = blanked.replace(SANCTIONED_CLOCK, (m) => m.replace(/[^\n]/g, ' '))
      const violations = [...scrubbed.matchAll(/Date\.now\s*\(|new Date\s*\(\s*\)/g)]
        .map((m) => ({ line: lineAt(scrubbed, m.index), text: m[0].startsWith('new') ? '无参 new Date()' : 'Date.now()' }))
      return { allowed, violations }
    }
    // ⚠️ `AGENIA_PROBE_H11_ENTRY` 的用途**只有一个**：阳性对照 —— 拿一份**变异副本**证明
    //    "别处塞一个无参 `new Date()` / 一个不在 `timeLineOf` 里的 `Date.now()`"真的会红。
    //    用了它必须在读数里看得见（下面那行会印出来），不许静默。
    const h11Override = process.env.AGENIA_PROBE_H11_ENTRY
    const h11Witness = typeof h11Override === 'string' && h11Override.trim() !== ''
    if (h11Witness) console.log(`H11 判的源码：${h11Override}（由 AGENIA_PROBE_H11_ENTRY 指定 —— 阳性对照，不是产物本身）`)
    const h11Scan = clockScanOf(h11Witness ? readFileSync(h11Override, 'utf8') : src)
    const h11Ok = h11Scan.violations.length === 0 && h11Scan.allowed.length === 1
    const h11Got = h11Ok ? '豁免 1 处 · 违规 0 处'
      : `豁免 ${h11Scan.allowed.length} 处`
        + (h11Scan.allowed.length === 0
          ? `（一处都没有：F-102 的时间行该读的那个钟不见了）`
          : `（${h11Scan.allowed.map((x) => `行 ${x.line}`).join('、')}）`)
        + ` · 违规 ${h11Scan.violations.length} 处`
        + (h11Scan.violations.length === 0 ? ''
          : `（${h11Scan.violations.map((x) => `行 ${x.line}：${x.text}`).join('；')}）`)
    checkIf(h11Witness || PRESET_ENTRY === join(PRESET_DIR, 'inject.js'), 'H11', 10,
      '`inject.js` 读真实时钟只许 `timeLineOf(id, Date.now())` 那一处（F-102 的「现在几点」）：别处的 `Date.now()` 与**任何**无参 `new Date()` 都不许',
      h11Got, '豁免 1 处 · 违规 0 处')
  }

  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n═══ GD · 委派后台硬门：名单来自组合、判定按名单（§硬门）═══')
  // ═══════════════════════════════════════════════════════════════════════════
  // 这一族钉的是这次升级新加的**命名导出**（`delegationPolicy` / `delegationToolNames` /
  // `subagentBackgroundVerdict`，裁定 A4 + Q1）。它**真读**两样东西：
  //   · 目标 `inject.js` —— import 它、**调它的纯函数**（不是抠源码里的字符串）；
  //   · 它旁边那份 `agent.cordis.yml` —— 名单从组合读，代码里不硬编码。
  //
  // 🔴 目标入口怎么选（**每一步都印出来**）：
  //   ① 活体那一份自己带 guard（装完之后就是这一支）⇒ 量活体；
  //   ② 否则量**目标**（staging 那一份 —— guard 的实现现在住在那儿）；
  //   ③ 两处都没有 ⇒ 这一族**逐条记挂起**（未验，不许静默算过）。
  //
  // ⚠️ 为什么不满足于"源码里有那几个字符串"：字符串命中证明不了"名单真的从组合来"，
  //    更证明不了"省略 run_in_background 在 0.2.1 上真的会**放行**、显式 false 真的会被拒"。
  //    这里两条都真跑。
  {
    const LIVE_ENTRY = join(PRESET_DIR, 'inject.js')
    const STAGED_ENTRY = join(REPO, '.tools', '_staging', 'agenia-upgrade', 'preset', 'inject.js')
    const GD_IDS = ['GD0', 'GD1', 'GD12', 'GD2', 'GD3', 'GD4', 'GD5', 'GD6', 'GD7', 'GD8', 'GD9', 'GD10', 'GD11']
    const skipRest = (why) => {
      for (const id of GD_IDS) skip(id, '§硬门', `${id}：${why}`)
    }
    const hasGuard = async (p) => {
      if (!existsSync(p)) return false
      try {
        const m = await import(pathToFileURL(p).href)
        return typeof m.subagentBackgroundVerdict === 'function'
      } catch {
        return false
      }
    }
    // ⚠️ `AGENIA_PROBE_GUARD_ENTRY` 的用途**只有一个**：阳性对照 —— 拿一份**变异副本**跑这一族，
    //    证明"名单对不上 / 作业行写歪了"这些断言**真的会红**（不是摆设）。
    //    纪律同上：换了入口 ⇒ 必须在读数里看得见（下面那行会印出来），不许静默。
    const override = process.env.AGENIA_PROBE_GUARD_ENTRY
    const guardEntry = typeof override === 'string' && override.length > 0 ? override
      : (await hasGuard(LIVE_ENTRY)) ? LIVE_ENTRY
        : (await hasGuard(STAGED_ENTRY)) ? STAGED_ENTRY : null
    console.log(`目标入口：${guardEntry ?? '（活体与 staging 都没有带 guard 的 inject.js ⇒ 这一族全是未验）'}`
      + (typeof override === 'string' && override.length > 0 ? '（由 AGENIA_PROBE_GUARD_ENTRY 指定）' : ''))
    if (guardEntry === null) {
      skipRest('没有带 guard 的入口（活体还没装、staging 也不在）⇒ 这一轮判不了')
    } else {
      const guard = await import(pathToFileURL(guardEntry).href)
      const guardDir = dirname(guardEntry)
      const compFile = join(guardDir, 'agent.cordis.yml')
      const compText = existsSync(compFile) ? readFileSync(compFile, 'utf8') : ''
      const { enabled, table, modes } = readDelegationConfig(compText)
      const guardConfig = table === null ? { contentDir: guardDir } : { contentDir: guardDir, delegationTools: table }
      checkTrue('GD0', '§硬门',
        '先确认目标：这一份真的导出 guard 那三个名字，而且它旁边有组合（否则下面全是空转）',
        typeof guard.delegationPolicy === 'function' && typeof guard.delegationToolNames === 'function'
          && typeof guard.subagentBackgroundVerdict === 'function' && compText !== '',
        `入口 ${guardEntry} · 组合 ${existsSync(compFile) ? compFile : '**找不到**'}`
          + ` · 导出 ${['delegationPolicy', 'delegationToolNames', 'subagentBackgroundVerdict']
            .filter((k) => typeof guard[k] === 'function').length}/3`)
      if (table === null) {
        skipRest('目标那份组合里读不到 delegationTools 名单 ⇒ 判不了（装前 / 配置坏了都长这样）')
      } else {
        const policy = guard.delegationPolicy(guardConfig)
        const oneShot = enabled.filter((n) => table[n] === 'one-shot')
        const cont = enabled.filter((n) => table[n] === 'continuable')

        // GD1：**每个已启用的具名 `dsh-tool-subagent` 实例都必须在名单里**（名单 = 组合自己）。
        check('GD1', '§硬门',
          'delegationToolNames(组合 config) == 组合里已启用的具名 dsh-tool-subagent 实例（代码里不硬编码名单）',
          guard.delegationToolNames(guardConfig), enabled)

        // GD12：**模式只有一个来源**（`delegationTools`）。
        //   0.2.1 把每行那个 `backgroundMode` 撤了 —— 组合里只剩在 `disabled: true` 的行上，
        //   活着的行一条都没有。所以原来那句"名单里的值 = 那一行的 backgroundMode"**没有第二个来源可对**
        //   （两边都是它自己 ⇒ 同义反复，而且恒红）。新轴换**行身份**（与 `tests/static/composition.test.mjs`
        //   的 `DELEGATION-TOOLS-MODE` 同口径）：
        //     · 名单里的值必须由行身份推出：`job_*` ⇒ one-shot；`team_*` / 裸 `subagent` ⇒ continuable；
        //     · **已启用**的行上一个 `backgroundMode` 都不许有 —— 写在活行上就是造第二份真相
        //       （0.2.1 不读它 ⇒ 改它不生效，下一个人会照它改模式，而硬门按另一份判）。
        //   阳性对照：解析器得**确实看得见**这个键（拿一段合成的组合喂它）——
        //   否则"活行上都没有"可能只是解析器瞎了，这一格会静默空转。
        const MODE_SELF_TEST = [
          '- id: synthetic-enabled',
          '  name: "@deepseek-ai/dsh-tool-subagent"',
          '  config:',
          '    toolName: job_synthetic',
          '    backgroundMode: one-shot',
        ].join('\n')
        const parserSeesDeadKey = readDelegationConfig(MODE_SELF_TEST).modes.job_synthetic === 'one-shot'
        const modeBad = []
        for (const n of enabled) {
          const want = /^job_/.test(n) ? 'one-shot' : 'continuable'
          if (table[n] !== want) {
            modeBad.push(`${n}：名单说 ${table[n]}，行身份说 ${want}（job_ = one-shot；team_ / subagent = continuable）`)
          }
          if (modes[n] !== undefined) {
            modeBad.push(`${n}：已启用的行上还写着 0.2.1 撤掉的 backgroundMode=${modes[n]} —— 模式只许在 delegationTools 一处`)
          }
        }
        checkTrue('GD12', '§硬门',
          '模式只有一个来源：名单里的值 = 由行身份推出（job_* ⇒ one-shot；team_*/subagent ⇒ continuable）· 已启用的行上不许再写 backgroundMode（0.2.1 已撤）',
          oneShot.length > 0 && cont.length > 0 && parserSeesDeadKey && modeBad.length === 0,
          `解析器自证看得见 backgroundMode：${parserSeesDeadKey ? '是' : '**否 —— 这一格会空转**'}`
            + ` · one-shot ${oneShot.length} / continuable ${cont.length}`
            + (modeBad.length > 0 ? ` · ${modeBad.join('；')}` : ' · 逐条都对'))

        // GD2：组合里这份名单**本身是合法的** ⇒ `delegationPolicy` 不该报 configError。
        //   ⚠️ 这一格原来还断言"名单里每个工具都**暴露着** `run_in_background` 参数" —— 那是 0.2.0 的平台事实。
        //   0.2.1 把这个参数从工具里删了，`backgroundExposed` 现在只是 `new Set(mode.keys())`（注入器自己算的派生量）
        //   ⇒ 它跟名单的键**永远相等**，翻不了面，不是判据（套件那侧的同款 `POLICY-EXPOSED` 已经因此删掉）。
        //   只留能翻面的那一半：名单合法 ⇒ configError = null；`backgroundExposed` 降级成读数。
        checkTrue('GD2', '§硬门',
          '组合里这份名单合法 ⇒ delegationPolicy 不报 configError（出现非法模式值 / 形状不对就该红）',
          policy.configError === null,
          `configError=${JSON.stringify(policy.configError)}`
            + ` · 读数（不作判据）：backgroundExposed ${[...policy.backgroundExposed].length}/${enabled.length} 个`
            + '（0.2.1 已无此参数；它是派生量 = 名单的键）')

        // GD3 / GD4 / GD5：`one-shot` 那几条（**从组合读，不写死**）。
        // 🔴 2026-10-20（`F-112`，DSH 0.2.1）：`run_in_background` 这个参数**已经从工具里删了** ——
        //    0.2.1 的委派一律异步（调用即返回，完成后再通知），所以"省略"是唯一可能的值，
        //    它本来就满足这条门禁的**目标**（不把组长卡在前台）。三格按"0.2.1 上该长什么样"重切：
        //      · GD3 = 名单里的**两档**：省略 ⇒ 放行（新义务）；显式 false ⇒ 仍拒（旧义务里仍然成立的那一半）。
        //      · GD4 = **阳性对照**：显式 true 仍放行。
        //      · GD5 = **判据的形状**还是 `=== true`：显式 `'true'` / 1 / 0 / null 一律拒
        //        （不是 `!== false` 那种松判据）；而**"缺参数"这一档翻面**（旧：拒 → 新：放行）。
        //    ⚠️ 两档必须成对：只钉"省略放行"会给"把门禁删掉"发通行证；只钉"false 拒"会漏掉翻面。
        const jobBad = []
        for (const n of oneShot) {
          for (const [label, args] of [['省略', {}], ['args 整个缺', undefined]]) {
            const v = guard.subagentBackgroundVerdict(n, args, policy)
            if (v !== null) jobBad.push(`${n}/${label}：应放行（0.2.1 委派一律异步、参数已删），实得 ${v.code}`)
          }
          const refused = guard.subagentBackgroundVerdict(n, { run_in_background: false }, policy)
          if (refused === null || refused.code !== 'E_GUARD_JOB_FOREGROUND') {
            jobBad.push(`${n}/false：应拒（E_GUARD_JOB_FOREGROUND），实得 ${JSON.stringify(refused)}`)
          } else if (!String(refused.message).includes('必须后台运行')) {
            jobBad.push(`${n}/false：报文应含「必须后台运行」，实得 ${String(refused.message).slice(0, 120)}`)
          }
        }
        checkTrue('GD3', '§硬门',
          `${oneShot.length} 条 one-shot：省略 run_in_background（含 args 整个缺）⇒ 放行；显式 false ⇒ 拒（E_GUARD_JOB_FOREGROUND + 报文含「必须后台运行」）`,
          oneShot.length > 0 && jobBad.length === 0,
          jobBad.length > 0 ? jobBad.join('；') : `${oneShot.join(', ')} 两档都对`)
        const passBad = oneShot.filter((n) => guard.subagentBackgroundVerdict(n, { run_in_background: true }, policy) !== null)
        checkTrue('GD4', '§硬门',
          '同一批 one-shot：显式 run_in_background: true ⇒ 放行（**阳性对照**：GD3/GD5 判的是拒档，没有这一格，"见参数就拒"也能让它们绿）',
          oneShot.length > 0 && passBad.length === 0,
          passBad.length > 0 ? `被误拒的：${passBad.join(', ')}` : `${oneShot.length} 条都放行`)
        const looseShapes = [
          ['字符串 true', { run_in_background: 'true' }],
          ['1', { run_in_background: 1 }],
          ['0', { run_in_background: 0 }],
          ['null', { run_in_background: null }],
        ]
        const shapeBad = []
        for (const n of oneShot) {
          for (const [label, args] of looseShapes) {
            const v = guard.subagentBackgroundVerdict(n, args, policy)
            if (v === null || v.code !== 'E_GUARD_JOB_FOREGROUND') {
              shapeBad.push(`${n}/「${label}」：应拒（E_GUARD_JOB_FOREGROUND），实得 ${v === null ? '放行' : v.code}`)
            }
          }
          // 0.2.1 唯一可能的值：**缺参数**（键在、值是 undefined，与"整个省略"同档）。
          // 这一档单独判 —— 谁把判据改回"必须 === true"，它立刻红（那会让四条作业一次都发不出去）。
          if (guard.subagentBackgroundVerdict(n, { run_in_background: undefined }, policy) !== null) {
            shapeBad.push(`${n}/缺参数（键在、值 undefined）：应放行（与省略同档）`)
          }
        }
        checkTrue('GD5', '§硬门',
          'one-shot 的判据仍是 `=== true`：显式 `\'true\'` / 1 / 0 / null 一律拒（不是 `!== false` 的松判据）；而**缺参数 ⇒ 放行**（0.2.1 唯一可能的值）',
          oneShot.length > 0 && shapeBad.length === 0,
          shapeBad.length > 0 ? shapeBad.join('；') : `${oneShot.length} 条 × 4 种非 true 值都被拒 · 缺参数都放行`)

        // GD6：`continuable` 那几条 —— 省略 / true 放行，**只有显式 false** 才拒。
        const contBad = []
        for (const n of cont) {
          if (guard.subagentBackgroundVerdict(n, {}, policy) !== null) contBad.push(`${n}：省略应放行`)
          if (guard.subagentBackgroundVerdict(n, { run_in_background: true }, policy) !== null) contBad.push(`${n}：true 应放行`)
          const v = guard.subagentBackgroundVerdict(n, { run_in_background: false }, policy)
          if (v === null || v.code !== 'E_GUARD_SELF_FOREGROUND' || !String(v.message).includes('（省略即后台）')) {
            contBad.push(`${n}：显式 false 应拒（E_GUARD_SELF_FOREGROUND +「（省略即后台）」），实得 ${JSON.stringify(v)}`)
          }
        }
        checkTrue('GD6', '§硬门',
          `${cont.length} 条 continuable：省略 / true 放行，**只有显式 false** 才拒（E_GUARD_SELF_FOREGROUND）`,
          cont.length > 0 && contBad.length === 0,
          contBad.length > 0 ? contBad.join('；') : `${cont.join(', ')} 三态都对`)

        // GD7：名单之外 —— **一个都不许误伤**（框架自己的 job_output / job_kill / job_list 尤其）。
        const outsiders = ['job_output', 'job_kill', 'job_list', 'read', 'present', 'send_message', 'edit', 'pwsh', 'subagent_fork']
        const hurt = outsiders.filter((n) => guard.subagentBackgroundVerdict(n, {}, policy) !== null)
        checkTrue('GD7', '§硬门',
          '名单之外一个都不误伤（含框架自己的 job_output / job_kill / job_list —— 配置坏了也要能收作业结果）',
          hurt.length === 0, hurt.length > 0 ? `被误伤的：${hurt.join(', ')}` : `${outsiders.length} 个都放行`)

        // GD8：配置坏掉的六种形状 ⇒ 一律 `E_GUARD_CONFIG_MISSING`（**不许静默放前台**）。
        const brokenConfigs = [
          undefined, null, {}, { delegationTools: {} }, { delegationTools: [] },
          { delegationTools: 'x' }, { delegationTools: { team_dev: 'foreground' } },
        ]
        const notBroken = brokenConfigs
          .map((c, i) => ({ i, code: guard.delegationPolicy(c).configError }))
          .filter((r) => r.code !== 'E_GUARD_CONFIG_MISSING')
        checkTrue('GD8', '§硬门',
          '配置缺失 / null / 空映射 / 不是映射 / 模式值非法 ⇒ configError = E_GUARD_CONFIG_MISSING',
          notBroken.length === 0,
          notBroken.length > 0 ? `这几种没认出来：${notBroken.map((r) => `#${r.i}→${JSON.stringify(r.code)}`).join(', ')}` : `${brokenConfigs.length} 种形状都认出来了`)

        // GD9：错误态的**窄形状**（追加裁定 v1.1 · A13）—— 拦委派名，**放行**收作业结果的那三个。
        //   同一格还钉**三条拒绝报文说的是不是 0.2.1 的实话**。三条路都要看（`F-116`：生产侧把
        //   作业 / 岗位那两句也改成了实话 ⇒ 判据跟着从"只看配置坏掉那条"覆盖到三条）：
        //     · `E_GUARD_CONFIG_MISSING`（配置坏了）
        //     · `E_GUARD_JOB_FOREGROUND`（一次性作业被硬塞了非 `true` 的值）
        //     · `E_GUARD_SELF_FOREGROUND`（可续聊岗位被硬塞了 `false`）
        //   `run_in_background` 这个参数平台已经删了（`inject.js:769-773`），所以每条拒绝报文：
        //     ① **不许教人去传它** —— 判"教"这个动作，**不是**"出现过参数名"。
        //        🔴 0.2.1 的**实话**里本来就会出现 `run_in_background: true`：`inject.js:782` 的
        //           兼容说明「门禁只为兼容老调用，仍把 run_in_background: true 当「后台」放行」——
        //           那是**陈述**，不是**指令**。**把出现本身当教，这条正确的报文会当场假红** ——
        //           已实测（`.team/test/2026-10-20/F-116/_runs/step1-先红-取样放宽判据未改.txt`）。
        //     ② 要说出**平台理由**（委派是异步的 / 这个参数没了）—— 禁令**不算理由**：
        //        「不要传 run_in_background。」只下了禁令、没给原因 ⇒ 那正是要拦的半修。
        //   ── 三处"回看"的口径（第 4 关 `B-1` / `B-2` / `B-9`：原来都是**固定字数窗口**，
        //      而字数是对着证人量出来的 ⇒ 一定有缝，插一个状语就漏）──────────────────────────
        //     · **指令语境**：从那个 `: true` 回看到**上一个分句标点**（`，；。！？`；`：` **透明**）为止，
        //       这一段里有表内词即算教。⇒ 表内词离参数名 20 字也认
        //       （`请务必记住：…补成 run_in_background: true`）。
        //       🔴 第 4 关第二遍 `B-11`：停标一开始用的是"句末"（逗号**不**停）⇒ 窗口 = 整句 ⇒
        //          同一句的**前一个分句**里有个表内词就把本分句的**陈述**判成教
        //          （`请注意：…，仍把 run_in_background: true 当「后台」放行` ⇒ 假红）。
        //          **判据咬住正确的话，比没咬住错的话更糟** ⇒ 逗号停、`：` 透明。
        //     · **否定**：从命中点回看到**上一个分句标点**（`，。；：、`）为止，有否定词即算否定语境。
        //       ⇒ `不必显式地写…`（「不」落在第 5 字）也认；`不是必须传` / `不需要显式传` / `不要写` 照旧。
        //     · **值形态**：参数名后面紧跟的值**不是 `true`** ⇒ 那是在**陈述被拒的那个值**，不是教人传。
        //       ⇒ `这次被拒是因为显式传 run_in_background: false。` 是实话，**不许判红**（`B-1`）。
        //   ⚠️ **边界要写清，别假装覆盖得更宽**（两个方向都写）：
        //        · **会漏**：① 只判**这三种已见形状**（值形态+指令语境 / 模态词+写传 / 显式写传）。
        //          三支都不认的教法 —— `请把 run_in_background 传进来` · `run_in_background 必须为 true` ·
        //          `务必传 …` · `把它去掉，或改成 true` · **表外动词** ·
        //          **表内词落在上一句或另一个分句**（`请务必记住：调用子代理的时候，一定要把参数补成 …`，
        //          中间多一个逗号就够）—— 属已知边界；只有"另起一句"这一类任何正则都挡不住，别的都是没补。
        //        · **误判面（已收）**：表内词在**同一个分句**里但整段其实是**陈述** ⇒ 仍可能误判
        //          （`写法很简单：设 run_in_background: true` 这种形状与指令同形，分不开）。
        //          第 4 关第二遍点的那两句（表内词在**前一个分句**）已由"逗号停"消灭，进了 `CONTROLS` 当反向证人。
        //        · ② 只认 `PLATFORM_REASON` 这张**词表**：说法不在表里会红。换说法要么补表，
        //          要么先改这里 —— **不是**"原文可以改"。
        //     ③ 极性/语境见上面那三行 —— **不是**整句豁免：一句里别处的「不」不许把真教法一并放走。
        //   📌 对照表 `CONTROLS` 是这一格的一部分（`F-112` 第 4 关 `E-3` / `E-4`）：① 的三支
        //      **各有一行证人**、② 两种说法各有证人、外加三条"对的报文"的反向证人 ——
        //      删掉任一支，它那一行当场翻面 ⇒ 这一格红。表里第 2 列**逐字**是喂进去的原串。
        //   刀：`n1`/`n2`（作业 / 岗位那两句回退成 0.2.0 的教法）· `n5`/`n6`/`n7`（配置那条）·
        //       `p1`~`p3`（删掉 ① 的任一支）· `p4`（动词表放宽：陈述被判教）·
        //       `p5`（去掉"参数名后面不是 true ⇒ 陈述"）· `p6`（否定回看退回 4 字）· `p7`（语境回看退回 8 字）·
        //       `p8`（判 ② 之前不摘冻针）· `p9`（语境窗退回"逗号不停"）。
        const badPolicy = guard.delegationPolicy(undefined)
        const mustReject = ['subagent', 'team_test', 'team_design',
          'job_memory_judge', 'job_memory_review', 'job_conversation_review', 'job_technical_review']
        const mustAllow = ['job_output', 'job_kill', 'job_list', 'read', 'present', 'send_message', 'edit', 'pwsh']
        const leaks = mustReject.filter((n) => guard.subagentBackgroundVerdict(n, {}, badPolicy) === null)
        const kills = mustAllow.filter((n) => guard.subagentBackgroundVerdict(n, {}, badPolicy) !== null)
        /**
         * 三处"回看"的落点（口径见上面那一段）——**都不是固定字数**：
         *   `backToStop`：从 `at` 往回走到**上一个标点**为止，返回那一段。
         *   `NEG_BEFORE`：用**分句**标点；`valueFormTeach` 的语境窗用 `VALUE_CTX_STOPS`。
         */
        const CLAUSE_STOPS = '，,。；;：:、！!？?\n'
        /**
         * 第一支（值形态 + 指令语境）的语境窗 —— **逗号停、`：` 透明**（第 4 关第二遍 `B-11`）。
         * 🔴 一开始它用 `SENTENCE_STOPS`（逗号**不**停）⇒ 窗口 = 整句 ⇒ 认"同一句的**前一个分句**里
         *    有个表内词、而本分句是**陈述**"：
         *      · `请注意：门禁只为兼容老调用，仍把 run_in_background: true 当「后台」放行。`（`请` 在第 0 字）⇒ 判教
         *      · `显式传 false 会被拒，平台仍把 run_in_background: true 当后台放行。`（`传` 在前一分句）⇒ 判教
         *    两句都是**对的**。**判据咬住正确的话，比没咬住错的话更糟** ⇒ 这两个原串已进 `CONTROLS` 当反向证人。
         * ⚠️ `：` **必须透明**：`写法很简单：设 run_in_background: true` 的 `设` 就在冒号后面。
         * ⚠️ 代价（写清）：`请务必记住：调用子代理的时候，一定要把参数补成 …`（中间多一个逗号）会漏 ——
         *    那一类落在"表内词在**别的分句**"这条边界里。
         */
        const VALUE_CTX_STOPS = '，,；;。！!？?\n'
        const backToStop = (text, at, stops) => {
          let i = at
          while (i > 0 && !stops.includes(text[i - 1])) i -= 1
          return text.slice(i, at)
        }
        /**
         * 否定语境：从命中点回看到**上一个分句标点**为止，有否定词 ⇒ 这一处不是在教。
         * ⚠️ 原来是"前 4 个字"—— 那 4 是对着三条证人量出来的（最远 3 字），余量 1 字；
         *    `不必显式地写 run_in_background: true`（「不」落在第 5 字）当场假红（第 4 关 `B-9`）。
         * ⚠️ 不退回"整句豁免"：分句标点仍然隔断 ⇒「不要说别的，必须传…」照样判教。
         */
        const NEG_BEFORE = (text, at) => /[不无别未非]/.test(backToStop(text, at, CLAUSE_STOPS))
        /**
         * 指令语境的"表内词"——**逐字列出来，不用字符类**。
         * 🔴 上一版写的是 `[写传指定设填]`：那是**六个单字**，`指`/`定` 各自成词
         *    ⇒「一**定**要把参数补成 …」里的 `定` 被当成动词，让一条本该判"教"的句子**撞巧**过关。
         *    口径与代码对不上就是这种事（第 4 关 `B-3`）。
         * ⚠️ `用` / `给` **不收**：「调用」里的 `用` 离参数名 4 个字，收进去会把
         *    `inject.js:782` 那句「兼容老调用，仍把 run_in_background: true 当后台放行」判红（`p4` 钉住）。
         * ⚠️ `补成|改成|写成|设为|填成` 是第 4 关第二遍 `B-13` 补的：它们**只在"教人传一个值"的句子里**出现，
         *    比裸动词准。补之前 `…一定要把参数补成 run_in_background: true` 里**没有**表内词 ——
         *    那种句子原来靠句首的 `请`/`务必` 才红，把 `请务必` 去掉就是真漏。见 `CONTROLS` 的对照。
         */
        const CONTEXT_WORD = /必须|需要|请|务必|记得|别忘了|直接|手动|写|传|指定|设|填|补成|改成|写成|设为|填成/
        /** 值形态 `run_in_background: true` 的每一处。 */
        const VALUE_FORM = /run_in_background\s*[:：]\s*true/g
        /**
         * 参数名后面紧跟一个**非 `true`** 的值 ⇒ 那是在陈述被拒的那个值，不是教人传。
         * 🔴 `(?!\s*true)` 里的 `\s*` **不能省**：写成 `(?!true)` 时，`\s*[:：]\s*` 末尾那个 `\s*` 可以匹配**空**，
         *    于是 `: true` 在"空格那一格"上通过了否定前瞻 ⇒ 被当成"陈述" ⇒ 第三支对**任何带值的**都哑掉。
         *    这是刀台的 `EXPECT` 抓出来的：`n1` 的读数只有三支（少了 `显式写传`），实跑 3 / 期望 4。
         */
        const REPORTS_OTHER_VALUE = /^\s*[:：]\s*(?!\s*true)/
        /**
         * ① 第一支：**值形态 + 指令语境**。
         * ⚠️ 这一支**不能写成一条大正则**：窗口一旦放宽，贪婪匹配会把"先否定一句、后面真教"的两个命中
         *    吞成一个（`不要写 run_in_background: false，必须传 run_in_background: true` 会漏）。
         *    所以**按每一个 `: true` 逐个回看**。
         */
        const valueFormTeach = (msg) => {
          for (const m of msg.matchAll(VALUE_FORM)) {
            const before = backToStop(msg, m.index, VALUE_CTX_STOPS)
            for (const c of before.matchAll(new RegExp(CONTEXT_WORD.source, 'g'))) {
              if (!NEG_BEFORE(before, c.index)) return true
            }
          }
          return false
        }
        /**
         * ① 第二、三支：形状命中 ⇒ 否定隔离 + "后面不是 `true` ⇒ 陈述"。
         * ⚠️ `REPORTS_OTHER_VALUE` 是第 4 关 `B-1`：`inject.js:789` 那句「显式传了 run_in_background: false」
         *    正是这一票要求报文**把实参原样写出来**的结果 —— 拿它当"教人传"，等于把实话判红。
         */
        const shapeTeach = (msg, source, { valueGuard = false } = {}) => {
          const re = new RegExp(source, 'g')
          let m
          while ((m = re.exec(msg)) !== null) {
            const after = msg.slice(m.index + m[0].length)
            if ((!valueGuard || !REPORTS_OTHER_VALUE.test(after)) && !NEG_BEFORE(msg, m.index)) return true
            if (m.index === re.lastIndex) re.lastIndex += 1   // 防零长匹配死循环
          }
          return false
        }
        /** ① 三种**已见**的"教人传"形状（命中任一即算）。每一支各有一行证人（`CONTROLS`）。 */
        const TEACHES_DEAD_ARG = [
          ['值形态', valueFormTeach],
          ['模态词+写传', (msg) => shapeTeach(msg, '(?:必须|需要|请)[^。；]{0,6}(?:显式)?\\s*(?:写|传|指定)[^。；]{0,10}run_in_background')],
          ['显式写传', (msg) => shapeTeach(msg, '显式(?:写|传)\\s*run_in_background', { valueGuard: true })],
        ]
        /** ① 判"教没教"：返回命中的形状名（空数组 = 没教）。 */
        const teaches = (msg) => TEACHES_DEAD_ARG.filter(([, fn]) => fn(msg)).map(([name]) => name)
        /**
         * ② "为什么"只认**平台事实**；禁令不是理由。三组说法都认（同一个事实）：
         *   · **委派是即时的**：`异步` / `即发` / `即返回`（`inject.js` 自己的注释就用「调用即返回」）；
         *   · **这个参数没了**：`参数…删 / 移除 / 没有 / 不再 / 不存在 / 撤 / 去掉 / 取消 / 废弃 / 下线 / 停止支持`，
         *     或者反过来（`删 / 没有 …参数`）。**`撤` 是项目自己在用的词**（`agent.cordis.yml:304`
         *     就写「`backgroundMode` 也一起撤了」）—— 第 4 关 `B-8`；
         *   · **省略就是后台**：`省略…后台` —— 收，但**判之前先把冻针摘掉**（见下面 `reasonText`）。
         *     🔴 第 4 关第一遍 `B-8` 我拒过这一条，理由是「`（省略即后台）` 是冻针，算成理由会让 ② 恒真」。
         *     **那个诊断对，处置改了**（第 4 关第二遍）：一条**正向判据**不许被另一条判据**强制要求**的
         *     子串满足 —— 一行修法就是判 ② 之前 `replaceAll('（省略即后台）', '')`。
         *     摘掉之后 `省略…后台` 只在**冻针之外另写一遍**时才算理由；`n2`（0.2.0 那句岗位报文）
         *     摘掉冻针后只剩「把它去掉，或改成 true」⇒ ② **照样红**（`CONTROLS` 那一行是它的证人，`p8` 钉住）。
         * ⚠️ 这是**词表**，不是"说没说清"的判定器 —— 表外的说法会红（边界写在上面）。
         * ⚠️ 窗口用 `{0,16}` 而**不是** `{0,8}`：`这个参数在 0.2.1 里被去掉了` 里隔着 10 个字；
         *    而 `[^。；]` 本身不许跨句。
         * 🔴 `去掉` **不收成裸词**，只收**被动式**（`…被去掉了`）：`把这个参数整个去掉再派`
         *    是一条**指令**，拿它当"平台理由"会让"只留义务、不给理由"那类报文当场假绿
         *    （实测：`n3-msg-job-noreason` 那把刀整把变绿）。这一格靠 `n3` 钉住。
         */
        /** "这个参数没了"那一路的动词（**描述性**的那几个；`去掉` 见下面单独一条）。 */
        const GONE = '删|移除|没有|不再|不存在|撤|取消|废弃|下线|停止支持'
        const PLATFORM_REASON = new RegExp([
          '异步|即发|即返回',
          `(?:参数|run_in_background)[^。；]{0,16}(?:${GONE}|被[^。；]{0,6}去掉)`,
          `(?:${GONE})[^。；]{0,16}(?:参数|run_in_background)`,
          '省略[^。；]{0,6}后台',
        ].join('|'))
        /**
         * 判 ② 之前要看的正文 —— **先把冻针那半句摘掉**（第 4 关第二遍）。
         * 为什么：`（省略即后台）` 是 `FROZEN.guardMessageNeedles.selfOmitted`，
         *   `guard.test.mjs:216` 对**每一条**岗位报文强制 `includes` 它 ⇒ 不摘掉的话，
         *   「② 说没说清平台理由」在岗位这一路上会被一条**别的**判据强制满足（同义反复）。
         * ⚠️ 摘的是**带全角括号的整串**（冻针逐字），不是「省略即后台」六个字 ——
         *   报文在冻针之外另写一遍，仍然算它说清了理由。
         */
        const reasonText = (msg) => msg.replaceAll('（省略即后台）', '')
        /**
         * 对照表 —— **判据的一部分**，不是读数（`F-112` 第 4 关 `E-3` / `E-4`）。
         *   第 1 列 = 行名（报文里印这个）· 第 2 列 = **喂进去的原串（逐字）** · 第 3 列 = 该判成什么。
         *   `teach` = ① 该判"教" · `clean` = ① 该判"没教" · `reason` / `no-reason` = ② 该不该认出平台理由。
         * ⚠️ 为什么钉在断言里而不是只写一份读数：读数会过期，判据不会（`cand-20261017-0058`）。
         */
        const CONTROLS = [
          ['①值形态+指令语境（证人）', '写法很简单：设 run_in_background: true。', 'teach'],
          ['①模态词+写传（证人）', '必须传 run_in_background。', 'teach'],
          ['①显式写传（证人）', '显式传 run_in_background。', 'teach'],
          ['①同一句、模态词离参数名 20 字（证人）', '请务必记住：调用子代理的时候一定要把参数补成 run_in_background: true。', 'teach'],
          ['①同一句、模态词离参数名 20 字（换字·真漏那一版）', '请务必记住：调用子代理的时候一定要把那个参数补成 run_in_background: true。', 'teach'],
          ['①同一句、只有表外→表内动词（证人）', '调用子代理的时候一定要把参数补成 run_in_background: true。', 'teach'],
          ['①同一句、只有模态词离得远（20 字外，表外动词）', '请务必记住：调用子代理的时候一定要把参数弄成 run_in_background: true。', 'teach'],
          ['①否-显式写传（反向证人）', '0.2.1 已删掉这个参数，不需要显式传 run_in_background。', 'clean'],
          ['①否-模态词（反向证人）', '这不是必须传 run_in_background（省略就是后台）。', 'clean'],
          ['①否-值形态（反向证人）', '不要写 run_in_background: true，那会被忽略。', 'clean'],
          ['①否-否定词离得远（反向证人）', '不必显式地写 run_in_background: true。', 'clean'],
          ['①陈述-参数名后面不是 true（反向证人）', '这次被拒是因为显式传 run_in_background: false。', 'clean'],
          ['①陈述不是教（兼容说明）', '门禁只为兼容老调用，仍把 run_in_background: true 当「后台」放行。', 'clean'],
          ['①陈述-表内词在前一个分句（反向证人）', '请注意：门禁只为兼容老调用，仍把 run_in_background: true 当「后台」放行。', 'clean'],
          ['①陈述-裸动词在前一个分句（反向证人）', '显式传 false 会被拒，平台仍把 run_in_background: true 当后台放行。', 'clean'],
          ['①否-同一个分句里的「调用」（反向证人）', '兼容起见，调用时仍把 run_in_background: true 当后台放行。', 'clean'],
          ['②没有这个参数', '0.2.1 里没有这个参数了。', 'reason'],
          ['②已经移除', '这个参数已经移除。', 'reason'],
          ['②即发（调用即返回）', '0.2.1 的委派是即发的（调用即返回）。', 'reason'],
          ['②撤了', '0.2.1 已经把 run_in_background 撤了。', 'reason'],
          ['②去掉了', '这个参数在 0.2.1 里被去掉了。', 'reason'],
          ['②取消', '这个参数已经被取消。', 'reason'],
          ['②废弃', '0.2.1 废弃了这个参数。', 'reason'],
          ['②下线', '这个参数已经下线。', 'reason'],
          ['②停止支持', '0.2.1 停止支持这个参数了。', 'reason'],
          ['②省略即后台（冻针之外另写一遍）', '省略即后台，不用再补任何值。', 'reason'],
          ['②只剩冻针那半句 ⇒ 不算理由', '「team_test」必须后台运行（省略即后台）—— 只有显式 run_in_background: false 才会被拒；把它去掉，或改成 true。', 'no-reason'],
          ['②只有禁令不算理由', '不要传 run_in_background。', 'no-reason'],
        ]
        const controlBad = []
        for (const [name, sample, want] of CONTROLS) {
          const hit = teaches(sample)
          const hasReason = PLATFORM_REASON.test(reasonText(sample))
          const got = want === 'teach' ? (hit.length > 0 ? 'teach' : 'clean')
            : want === 'clean' ? (hit.length === 0 ? 'clean' : `teach（${hit.join('+')}）`)
              : want === 'reason' ? (hasReason ? 'reason' : 'no-reason')
                : (hasReason ? 'reason' : 'no-reason')
          if (got !== want) controlBad.push(`「${name}」喂的是 ${JSON.stringify(sample)} ⇒ 该 ${want}，实得 ${got}`)
        }
        /**
         * 三条拒绝路径的报文 —— **真的调那条路**取回来，不是拼字符串；同一条路上的多条工具名
         * 报文逐字相同 ⇒ 按正文去重，报告只印路径名（不然一条错会印 7 遍）。
         */
        const SAMPLED = [
          ['配置坏了', mustReject.map((n) => [n, guard.subagentBackgroundVerdict(n, {}, badPolicy)])],
          ['作业显式 false', oneShot.map((n) => [n, guard.subagentBackgroundVerdict(n, { run_in_background: false }, policy)])],
          ['岗位显式 false', cont.map((n) => [n, guard.subagentBackgroundVerdict(n, { run_in_background: false }, policy)])],
        ]
        /** 空转闸：某条路一条拒绝报文都没取到 ⇒ 这一格必须红（否则"取样为空"会读成"全绿"）。 */
        const idlePath = SAMPLED.filter(([, rows]) => rows.length === 0 || rows.some(([, v]) => v === null))
          .map(([name]) => name)
        const teachesDeadArg = []
        const silentWhy = []
        for (const [path, rows] of SAMPLED) {
          const seen = new Set()
          for (const [, v] of rows) {
            const msg = String(v?.message ?? '')
            if (msg === '' || seen.has(msg)) continue
            seen.add(msg)
            const hit = teaches(msg)
            if (hit.length > 0) teachesDeadArg.push(`${path} → ${hit.join('+')}：${msg.slice(0, 60)}`)
            if (!PLATFORM_REASON.test(reasonText(msg))) silentWhy.push(`${path}：${msg.slice(0, 60)}`)
          }
        }
        checkTrue('GD9', '§硬门',
          '配置坏掉时：委派名（subagent / team_* / job_*）一律拒、job_output / job_kill / job_list 放行（A13）'
            + ' · 而且**三条**拒绝报文（配置坏 / 作业 / 岗位）说的都是 0.2.1 的实话：不出现这三种「教人传」的形状'
            + '（值形态+指令语境 / 模态词+写传 / 显式写传），并说出平台理由（说法限于词表）',
          leaks.length === 0 && kills.length === 0 && idlePath.length === 0
            && controlBad.length === 0 && teachesDeadArg.length === 0 && silentWhy.length === 0,
          // ⚠️ 判定词**短**、排在前面：`describe()` 对 200 字以上的串只印前 40 个字符
          //    ⇒ 长报文会把"红在哪一半"挤出屏幕。逐条详情走下面的 `console.log`（不截断）。
          (() => {
            const bad = []
            if (leaks.length > 0) bad.push(`漏拦 ${leaks.length}`)
            if (kills.length > 0) bad.push(`误杀 ${kills.length}`)
            if (idlePath.length > 0) bad.push(`空转 ${idlePath.length}`)
            if (controlBad.length > 0) bad.push(`对照翻面 ${controlBad.length}`)
            if (teachesDeadArg.length > 0) bad.push(`①还在教人传 ${teachesDeadArg.length}`)
            if (silentWhy.length > 0) bad.push(`②没说清平台理由 ${silentWhy.length}`)
            return bad.length === 0
              ? `全对（取样 ${SAMPLED.length} 条路 · 对照 ${CONTROLS.length} 行）`
              : `红在：${bad.join(' · ')}`
          })())
        // ── 判定读数（**不作判据**，但绿的时候也要印出来）─────────────────────────
        // 为什么要印：① "这一格到底看了几条报文、几行对照"不印就只能读代码猜；
        //             ② `E-4` 的教训 —— 喂进去的东西（原串）要能从读数里对上。
        console.log(`      判定：① 教不教 = ${teachesDeadArg.length === 0 ? `没教（绿，${SAMPLED.length} 条路都看了）` : `**教了（红）${teachesDeadArg.length} 条**`}`
          + ` · ② 平台理由 = ${silentWhy.length === 0 ? '有（绿）' : `**没有（红）${silentWhy.length} 条**`}`
          + ` · 对照 ${CONTROLS.length - controlBad.length}/${CONTROLS.length} 行`
          + ` · 取样 ${SAMPLED.length - idlePath.length}/${SAMPLED.length} 条路（${SAMPLED.map(([name]) => name).join(' / ')}）`
          + ' · 原串逐字见本节 `CONTROLS` 表')
        for (const line of teachesDeadArg) console.log(`        ✗ ① ${line}`)
        for (const line of silentWhy) console.log(`        ✗ ② ${line}`)
        for (const line of controlBad) console.log(`        ✗ 对照 ${line}`)
        for (const line of idlePath) console.log(`        ✗ 空转 ${line}`)

        // GD10：apply 层 —— **拿不到 `tools.guard` 必须出声**（不许静默失效）。
        //   🔴 0.2.1 换了措辞：旧句「subagent 后台硬门未生效」在注入器里**已经不存在**了
        //   （钉一句原文的判据会变成常驻红）。判据改钉**两个属性**（与套件那侧同一口径）：
        //     ① 点名缺的是哪一样（`没有 tools.guard`）；② 这次挂载的告警**整体**说清了后果
        //     （`没有生效` / `没挂上`）—— 判的是整个 stderr 切片，**不按句切**。
        //   这样"删掉整段告警"红、"喊了但没说是哪样 / 没后果"也红 —— 比只钉一句原文更硬。
        const errMark = stderrSeen.length
        await harness(guardDir, { guard: 'absent', entry: guardEntry })
        const silence = stderrSeen.slice(errMark).join(' ｜ ')
        checkTrue('GD10', '§硬门',
          '真挂一次：拿不到 tools.guard ⇒ 必须 console.error，且点名「没有 tools.guard」+ 说清后果（没有生效 / 没挂上）',
          silence.includes('没有 tools.guard') && ['没有生效', '没挂上'].some((s) => silence.includes(s)),
          silence === '' ? '**一句都没喊** —— 那正是"静默失效"（评审会以为自己只审不改）' : `出声了：${silence.slice(0, 160)}`)

        // GD11：apply 层 —— 装上**记录式**门禁：判定真的按名单走（不是只验纯函数）。
        //   0.2.1：作业**省略**后台 ⇒ 放行（参数已删）；作业显式 false ⇒ 拒；continuable 省略 ⇒ 放行 / false ⇒ 拒；
        //   无关工具一律放行。两档成对 ⇒ "门禁没装上"和"门禁装上了但什么都放行"都会红。
        const recorder = { handler: null }
        await harness(guardDir, { guard: (h) => { recorder.handler = h }, entry: guardEntry, config: guardConfig })
        const callGuard = (name, args) => (typeof recorder.handler === 'function'
          ? recorder.handler({ name, arguments: args, agent: undefined })
          : '<门禁没装上>')
        const applyBad = []
        if (typeof recorder.handler !== 'function') applyBad.push('门禁没被装上（ctx.effect 里没调 tools.guard）')
        else if (oneShot.length === 0 || cont.length === 0) applyBad.push('名单里 one-shot / continuable 有一边是空的 —— 这一格会空转')
        else {
          const job = oneShot[0]
          const self = cont[0]
          const omitted = callGuard(job, {})
          if (omitted !== undefined) applyBad.push(`${job} 省略后台应放行（0.2.1 参数已删），实得 ${JSON.stringify(omitted)}`)
          const refused = callGuard(job, { run_in_background: false })
          if (typeof refused !== 'string' || !refused.includes('必须后台运行')) {
            applyBad.push(`${job} 显式 false 应被拒（报文含「必须后台运行」），实得 ${JSON.stringify(refused)}`)
          }
          if (callGuard(job, { run_in_background: true }) !== undefined) applyBad.push(`${job} 显式 true 应放行`)
          if (callGuard(self, {}) !== undefined) applyBad.push(`${self}（continuable）省略应放行`)
          if (typeof callGuard(self, { run_in_background: false }) !== 'string') applyBad.push(`${self}（continuable）显式 false 应被拒`)
          if (callGuard('read', {}) !== undefined) applyBad.push('无关工具 read 应放行')
        }
        checkTrue('GD11', '§硬门',
          '真挂一次：门禁被装上，而且它按名单判（作业省略后台 ⇒ 放行；作业显式 false ⇒ 拒；continuable 省略 ⇒ 放行 / false ⇒ 拒；无关工具 ⇒ 放行）',
          applyBad.length === 0,
          applyBad.length > 0 ? applyBad.join('；') : `handler 在 · 名单 ${enabled.length} 个 · 作业 ${oneShot.length} 条 / 岗位 ${cont.length} 条`)
      }
    }
  }

  // ── 自检 · 编号唯一（契约 §6.1）────────────────────────────────────────────
  // 🔴 这一条钉的是**探针自己**：同一次运行里一个编号只许有一个意思。
  //    2026-09-26 那批 `M2` ×2、`M4` ×2（且 `M4` 两处是两件不同的事）、还有 `N5` ×2 ——
  //    第 5 关照契约表引编号就会引错。以前只有"加新族之前人肉跑一次查重"这条纪律，
  //    人一忙就会漏 ⇒ 改成每次运行自己判。
  {
    const seen = new Map()
    for (const id of usedIds) seen.set(id, (seen.get(id) ?? 0) + 1)
    const dup = [...seen].filter(([, n]) => n > 1).map(([id, n]) => `${id} ×${n}`)
    checkTrue('Z9', '§形状',
      `探针自己的编号全局唯一（这次判了 ${seen.size} 个编号；一个编号一个意思，否则照契约表引编号会引错）`,
      dup.length === 0, dup.length === 0 ? '（没有重复）' : `重号：${dup.join('、')}`)
  }

  // ── 收尾 ───────────────────────────────────────────────────────────────────
  const total = passed + reds.length + skips.length
  console.log(`\n${'─'.repeat(72)}`)
  console.log(`${passed}/${total} 条通过`
    + (reds.length > 0 ? ` · ${reds.length} 条红` : '')
    + (skips.length > 0 ? ` · ${skips.length} 条挂起（**未验**，别读成通过）` : ''))
  if (reds.length > 0) {
    console.log('\n红的是「实现还没跟上契约」。逐条对上 `now.md` 的验收口径：')
    for (const r of reds) {
      console.log(`  · ${tag(r.id, r.criterion)} ${r.label}`)
      console.log(`      ${describe(r.got, r.want)}`)
      console.log(`      口径原文：${CRITERION[r.criterion]}`)
    }
  }
  if (skips.length > 0) {
    console.log('\n挂起的（**未验**，别读成通过）：')
    for (const s of skips) console.log(`  · [${s.id} · 口径${s.criterion}] ${s.label}`)
    console.log('  前提是阳性对照。对照绿了之后这几条会自己开始判。')
  }

  console.log(
    '\n退出码：0 = 全过 · 1 = 有红 · 2 = 没红但有挂起（未验，≠ 通过）\n'
    + '\n本探针**不验**这些（自动验不了，留给真回合 / 组长）：\n'
    + '  · GUI 里会不会被读成"老板又开了一次口"（2026-09-24 那个现场）\n'
    + '  · 改完 `inject.js` 要不要重启才生效（ESM 按 URL 缓存 —— 只有真重启才知道）\n'
    + '  · token 账单（要真请求才量得出来；口径 6 的"3325 → ~250"那一笔在这里结）\n'
    + '  · 真 harness 里机制① 到底落在第几步：这里假 ctx 按真次序建模\n'
    + '    （claim L889 → 装配 L890 → pre-step L894 → step/start L951 → 落笔 L1028），\n'
    + '    而且会话带 `appending` 守卫（dsh-session L1181）—— 但"真回合里是不是这样"要真回合才看得见。\n'
    + '  · `newThings` 的**采集端**（从 `tool/call` 读工具名）：这里只喂 `moodOf` 的纯函数。\n'
    + '详见 .team/test/2026-09-26/技术契约-尾巴返修与情绪模块.md 第六节。',
  )
  exitCode = reds.length > 0 ? 1 : skips.length > 0 ? 2 : 0
} finally {
  rmSync(fixture, { recursive: true, force: true })
}

process.exit(exitCode)
