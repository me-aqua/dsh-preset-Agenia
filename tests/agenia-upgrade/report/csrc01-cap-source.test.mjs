/**
 * `CSRC-01` · **卡上要记出容量参考线是哪一份 `memory.mjs` 给的**（长期票 `ticket-20261102-04` · 评审 `F3`）。
 *
 * 病根（评审原话）：容量参考线记不出是哪一侧给的 `memory.mjs`。
 * 契约（这一格钉的那一句）：新增一格 **`capacity.cap_source`**，值 = 赢下来那一条**候选的路径**；
 * **三级回退（工作区 / 生成器那棵树 / cwd）各跑一次，卡上这三个值必须互不相同。**
 *
 * ── 为什么这一格非有不可 ───────────────────────────────────────────────────
 * `read_capacity()` 今天已经是三级候选（`daily-cards.py:122-132`），三级都读得到 ——
 * 2026-11-02 现量（`.team/test/2026-11-02/_probe/cap-levels-probe.mjs`）：
 *   工作区有 ⇒ 311/31313 · 生成器那棵树有 ⇒ 322/32323 · 只有 cwd 有 ⇒ 333/33333，三次都 exit 0。
 * 也就是说**"读到了"不等于"说得清从哪儿读的"**：三级今天都绿，卡片却只有两个数，
 * 谁把第二级候选删了、谁把次序调了，卡片上**看不出来**（数还是对的，只是来源换了）。
 * 这一格判的就是那句"说得清"：`capacity.cap_source` 必须点名**赢下来那一条**。
 *
 * ── 为什么三个值必须互不相同 ───────────────────────────────────────────────
 * 只断言"cap_source 非空"会让实现把三级的名字写成同一个常量（`"memory.mjs"`）而全绿。
 * 三个现场各给一个**不同**的值（三级各一份夹具、两份数也故意不同）⇒
 * "同一个常量"、"只印第一级"、"印成快照路径" 都会当场翻红。
 *
 * ── 今天为什么红 ───────────────────────────────────────────────────────────
 * 卡上**没有** `capacity.cap_source` 这一格（现量：`C2 · 验收格` 的 `capacity.*` 今天恰好 6 格，
 * 见 `readings.levels[*].capacity_keys`）⇒ 红因 `CAP-SOURCE-CELL-MISSING`，报文点名这个 key。
 * ⚠️ 这一格**不是**"生成器崩了"：三次 exit 都是 0、两个数都对；红在"说不出来源"。
 *
 * ── 这一格什么时候变绿 ─────────────────────────────────────────────────────
 * 生成器在 `C2 · 验收格` 里多印一格 `capacity.cap_source`，值是**赢下来那一份 `memory.mjs` 的路径**
 * （三级各一次、互不相同）。加性键允许（契约 C2 §2.3 末条）；39 个冻结 key 一个不许少 ——
 * 那个"少没少"仍由 `CARD-06` 与 `keysMissing()` 判，本格只加它自己那一条。
 */
import { before, test } from 'node:test'
import { caseFail, preflight, problem, runCase } from '../support/evidence.mjs'
import { CARD_SHEET, keysMissing, sheetMissing } from '../support/card-surface.mjs'
import {
  LEVELS, SNAPSHOT_TOTALS, capCells, capSourceScene, expectedCaps, normPath, scriptSameAsProduction,
} from '../support/cap-source.mjs'

before(() => {
  preflight()
})

/** 一格能不能读：生成器 0 → 页在 → 39 个冻结 key 齐（与 C2 六格同一把尺子）。 */
const usable = (readings, push, label, scene) => {
  readings[label] = { exit_code: scene.run.exit_code, sheet_names: scene.card.dump?.sheet_names ?? null, error: scene.card.error }
  if (scene.run.exit_code !== 0) {
    push('CAPS-GENERATOR-FAILED',
      `${label}：生成器 exit=${scene.run.exit_code} —— stderr=${String(scene.run.stderr).trim().slice(0, 300)}`)
    return false
  }
  if (sheetMissing(scene.card, push, label)) return false
  if (keysMissing(scene.card, push, label)) return false
  return true
}

test('CSRC-01 容量参考线的来源格 capacity.cap_source：三级回退各跑一次，卡上三个值必须互不相同且各自点到那一份', async () => {
  await runCase('CSRC-01', async (rec) => {
    const problems = []
    const push = (code, message, detail) => problems.push(problem(code, message, detail))
    const readings = { levels: {}, sheet: CARD_SHEET }
    rec.readings.csrc01 = readings

    /** 三级各跑一次（每条腿一个现场：只有那一级有 `memory.mjs`）。 */
    for (const level of LEVELS) {
      const label = `${level}`
      const scene = capSourceScene({ caseId: 'CSRC-01', tag: `cap-source-${level}`, level })
      const caps = expectedCaps(scene)
      const same = scriptSameAsProduction(scene)
      const capacity = capCells(scene.card)
      readings.levels[label] = {
        expected: { file: scene.expected.file, root: scene.expected.root, caps: scene.expected.caps, parsed: caps },
        sides: scene.sides,
        generator: { script: scene.script, cwd: scene.cwd },
        capacity_keys: scene.card.keys?.filter((k) => String(k).startsWith('capacity.')) ?? null,
        capacity,
      }

      // ── 夹具自证：**只有这一级**有那份文件（另两级一个字节都没有）──────────────────
      const leaked = scene.sides.filter((side) => side.exists && side.level !== level)
      const missingOwn = scene.sides.find((side) => side.level === level && !side.exists)
      if (leaked.length > 0 || missingOwn !== undefined) {
        push('CAPS-FIXTURE',
          `${label}：夹具不是"只有 ${level} 那一级有 memory.mjs"（多出来的：${JSON.stringify(leaked.map((s) => s.level))}；`
          + `本级的在不在：${JSON.stringify(scene.sides)}）—— 三个值不同这件事就无从判（先修夹具）`)
      }
      if (!caps.ok) {
        push('CAPS-FIXTURE', `${label}：那一份 ${scene.expected.file} 解析不出 CAP_COUNT / CAP_CHARS（${caps.error ?? ''}）—— 夹具坏了，别读成卡印错`)
      }
      if (same === false) {
        push('CAPS-FIXTURE', `${label}：生成器副本与生产那一份不是逐字节相同（${scene.script.file}）—— 那就不是同一把尺子`)
      }

      if (!usable(readings, push, label, scene)) { readings.levels[label].capacity = capacity; continue }

      // ── 判据 ①：参考线的两个数 = **这一级**那份文件里的两个数（来源与数必须自洽）────────
      if (caps.ok && (capacity.cap_count !== caps.count || capacity.cap_chars !== caps.chars)) {
        push('CAP-SOURCE-VALUE',
          `${label}：卡上 \`capacity.cap_count/cap_chars\` 必须是 **${level}** 那一份 `
          + `${scene.expected.file} 里的 ${JSON.stringify(caps.count)} / ${JSON.stringify(caps.chars)}，`
          + `实得 ${JSON.stringify(capacity.cap_count)} / ${JSON.stringify(capacity.cap_chars)} —— `
          + '三级回退走到了哪一级、卡片上那两个数必须跟着那一级走（走到 A 却印 B 的数，与没回退同罪）')
      }
      // ── 判据 ②：实际占用仍是快照 totals（参考线 ≠ 占用）──────────────────────────
      if (capacity.count !== SNAPSHOT_TOTALS.count || capacity.chars !== SNAPSHOT_TOTALS.chars) {
        push('CAP-SOURCE-COUNT',
          `${label}：\`capacity.count/chars\` 必须仍是快照 \`totals\` 的 ${SNAPSHOT_TOTALS.count} / ${SNAPSHOT_TOTALS.chars}，`
          + `实得 ${JSON.stringify(capacity.count)} / ${JSON.stringify(capacity.chars)} —— 参考线（上限）与实际占用是两件事`)
      }

      // ── 判据 ③：来源格在不在、值点不点得到这一级 ───────────────────────────────
      if (!capacity.cap_source_present) {
        push('CAP-SOURCE-CELL-MISSING',
          `${label}：卡上没有 \`capacity.cap_source\` 这一格（今天的 \`capacity.*\` 只有 `
          + `${JSON.stringify(readings.levels[label].capacity_keys)}）—— `
          + '「参考线从哪儿读到的」今天只能靠**排除法**推（哪两级没有文件 ⇒ 剩下的那一级），'
          + '而卡片自己一句话都没说。新格的值 = 赢下来那一条候选的路径（契约 `CONTRACT-REVIEW-20261102` §2）',
          { level, expected_file: scene.expected.file })
      } else if (typeof capacity.cap_source !== 'string' || capacity.cap_source.trim() === '') {
        push('CAP-SOURCE-SHAPE',
          `${label}：\`capacity.cap_source\` 必须是非空字符串（赢下来那份 \`memory.mjs\` 的路径），`
          + `实得 ${JSON.stringify(capacity.cap_source)}（${typeof capacity.cap_source}）`)
      } else {
        const got = normPath(capacity.cap_source)
        const want = normPath(scene.expected.file)
        const others = scene.sides.filter((side) => side.level !== level).map((side) => normPath(side.file))
        if (!got.includes(want)) {
          push('CAP-SOURCE-WRONG-LEVEL',
            `${label}：\`capacity.cap_source\` 必须点名**赢下来那一份** ${scene.expected.file}，`
            + `实得 ${JSON.stringify(capacity.cap_source)} —— 这一级是唯一有文件的一级，点成别的就是"说不清谁给的"。`
            + '⚠️ 值要是**那一条候选自己的路径**（绝对路径或至少能区分三级）：三级的相对写法都长成 '
            + '`presets/agenia/lib/memory.mjs`，那样三个值必然相同 ⇒ 「各不相同」这条判据当场红（所以没采用相对写法）',
            { want: scene.expected.file, got: capacity.cap_source })
        }
        const named = others.filter((file) => got.includes(file))
        if (named.length > 0) {
          push('CAP-SOURCE-AMBIGUOUS',
            `${label}：\`capacity.cap_source\` 把**没赢的那几级**也点了进来（${JSON.stringify(named)}）—— `
            + '这一格要的是一个**赢家**，不是"候选清单"（清单在这里等于又回到"读的人自己数"）')
        }
        if (normPath(capacity.source) !== '' && got === normPath(capacity.source)) {
          push('CAP-SOURCE-CONFUSED-WITH-SNAPSHOT',
            `${label}：\`capacity.cap_source\` 与 \`capacity.source\` 同值（都指向快照）—— `
            + '`capacity.source` 说"占用量从哪来"，`cap_source` 说"参考线从哪来"，是两个来源')
        }
      }
    }

    // ── 判据 ④：三个值**互不相同**（这一票的验收原话："三级回退各跑一次，卡上 cap_source 各不相同"）
    const present = LEVELS
      .map((level) => ({ level, value: readings.levels[level]?.capacity?.cap_source }))
      .filter((item) => typeof item.value === 'string' && item.value.trim() !== '')
    readings.cap_source_values = present
    const byValue = new Map()
    for (const item of present) {
      const key = normPath(item.value)
      if (!byValue.has(key)) byValue.set(key, [])
      byValue.get(key).push(item.level)
    }
    const collapsed = [...byValue.values()].filter((levels) => levels.length > 1)
    if (present.length === LEVELS.length && collapsed.length > 0) {
      push('CAP-SOURCE-NOT-DISTINCT',
        `三级回退给出的 \`capacity.cap_source\` 有重复：${JSON.stringify(collapsed)}（全部实得 ${JSON.stringify(present)}）—— `
        + '三个现场用的是**三份不同的文件**，值必须互不相同；重复 = 印的是一个常量或只印第一级')
    }

    caseFail(problems)
  })
})
