/**
 * `CSRC-02` · **第三级（cwd）单独的正样本**（长期票 `ticket-20261102-05` · 评审 `F4`）。
 *
 * 病根（评审原话）：回退第三级（cwd）没有正样本。
 * 契约（这一格钉的那一句）：**当只有 cwd 下有 `<cwd>/presets/agenia/lib/memory.mjs` 时，
 * 卡照样出得来，而且参考线的两个数就是从那个文件解析出来的。**
 *
 * ── 现量（2026-11-02 · `.team/test/2026-11-02/_probe/cap-levels-probe.mjs`）─────────────
 * 三级**今天都能读出数**（cwd 那一级 333/33333、exit 0）。所以这一格的红**不是**"cwd 回退坏了"：
 *   ① 「卡出得来 + 两个数是 cwd 那份的」那几条 —— **今天是绿的**（照实记在读数里，不装作红）；
 *   ② 「卡片自己说得出是 cwd 给的」那一条 —— **今天红**（`capacity.cap_source` 这一格不存在）。
 * 🔴 为什么这仍然算 `F4` 的腿：`F4` 要的是一条**单独**的绿腿 —— 可判的形状是
 *    "只有 cwd 有 ⇒ 卡上那两个数 + 那一句来源都指向 cwd"。少了来源那一句，
 *    "cwd 给的"与"生成器那棵树给的"在卡上长得一模一样（那两级今天给的数不同，纯属夹具的巧合）——
 *    判据会静默依赖"夹具把三份数写成不同的值"这一条，而那不是被测物的事。
 *
 * ── 现场（三处候选，只有第三处在）─────────────────────────────────────────
 *   · 工作区 `<WS>/presets/agenia/lib/memory.mjs` —— **不写**（夹具自证：不在）；
 *   · 生成器那棵树 `<copyRoot>/presets/agenia/lib/memory.mjs` —— **不写**（跑的是生成器副本，
 *     它的 `here` = `<copyRoot>`；`<copyRoot>/presets/` 整个不存在）；
 *   · cwd `<copyRoot>/cwd/presets/agenia/lib/memory.mjs` —— **写**（333 / 33333）。
 * 另外把 `lib/route.mjs` 摆进工作区：`main()` 先 `route_constants()` 后 `read_capacity()`，
 * route 也找不到时失败会停在 `E_ROUTE_SOURCE`，这一格就量不到容量那一级（`cand-20261020-0078`）。
 * 生成器副本与生产**逐字节相同**（sha256 比过）：同一把尺子，只换了它站的位置。
 */
import { before, test } from 'node:test'
import { existsSync } from 'node:fs'
import { caseFail, preflight, problem, runCase } from '../support/evidence.mjs'
import { CARD_SHEET, keysMissing, sheetMissing } from '../support/card-surface.mjs'
import {
  SNAPSHOT_TOTALS, capCells, capSourceScene, expectedCaps, normPath, scriptSameAsProduction,
} from '../support/cap-source.mjs'

before(() => {
  preflight()
})

test('CSRC-02 只有 cwd 有 memory.mjs ⇒ 卡照出、参考线那两个数来自 cwd 那一份、来源格点名 cwd', async () => {
  await runCase('CSRC-02', async (rec) => {
    const problems = []
    const push = (code, message, detail) => problems.push(problem(code, message, detail))
    const scene = capSourceScene({ caseId: 'CSRC-02', tag: 'cap-cwd-only', level: 'cwd' })
    const caps = expectedCaps(scene)
    const capacity = capCells(scene.card)
    const readings = {
      sheet: CARD_SHEET,
      exit_code: scene.run.exit_code,
      stderr: String(scene.run.stderr).trim().slice(0, 300),
      cwd: scene.cwd,
      generator: { script: scene.script, same_as_production: scriptSameAsProduction(scene) },
      sides: scene.sides,
      expected: { file: scene.expected.file, parsed: caps, caps: scene.expected.caps },
      capacity_keys: scene.card.keys?.filter((k) => String(k).startsWith('capacity.')) ?? null,
      capacity,
    }
    rec.readings.csrc02 = readings

    // ── 夹具自证：另两级**真的不在**（不然量到的不是第三级）──────────────────────────
    const others = scene.sides.filter((side) => side.level !== 'cwd')
    const leaked = others.filter((side) => side.exists)
    if (leaked.length > 0) {
      push('CAP-CWD-FIXTURE',
        `这一格量的是"只有 cwd 有 memory.mjs"，可是 ${JSON.stringify(leaked.map((s) => s.file))} 也在盘上 `
        + '—— 那两级排在 cwd 前面，分不清参考线是谁给的（先修夹具）')
    }
    // 生成器那棵树整个不该有 `presets/`（副本的 `here` = `<copyRoot>`）—— 显式再量一次第二级：
    const generatorLevel = scene.sides.find((side) => side.level === 'generator')
    if (generatorLevel !== undefined && existsSync(generatorLevel.file)) {
      push('CAP-CWD-FIXTURE', `生成器那棵树里居然有 ${generatorLevel.file} —— 这一格量的是第三级，不是第二级`)
    }
    readings.generator_tree_memory_source = { file: generatorLevel?.file ?? null, exists: generatorLevel !== undefined && existsSync(generatorLevel.file) }
    if (!caps.ok) {
      push('CAP-CWD-FIXTURE', `cwd 那一份 ${scene.expected.file} 解析不出 CAP_COUNT / CAP_CHARS（${caps.error ?? ''}）—— 夹具坏了`)
    }
    if (readings.generator.same_as_production === false) {
      push('CAP-CWD-FIXTURE', `生成器副本与生产那一份不是逐字节相同（${scene.script.file}）—— 那就不是同一把尺子`)
    }

    // ── 判据 ①：卡出得来（生成器 0 · 那一页在 · 39 个冻结 key 齐）────────────────────
    if (scene.run.exit_code !== 0) {
      push('CAP-CWD-CARD-MISSING',
        `只有 cwd 有 memory.mjs 时生成器 exit=${scene.run.exit_code} —— 卡没出（stderr=${JSON.stringify(readings.stderr)}）；`
        + '第三级候选要么没被读到、要么失败停在别的错误码上')
    }
    if (!sheetMissing(scene.card, push, 'CSRC-02') && !keysMissing(scene.card, push, 'CSRC-02')) {
      // ── 判据 ②：两个数 = cwd 那份文件里的两个数 ──────────────────────────────────
      if (caps.ok && (capacity.cap_count !== caps.count || capacity.cap_chars !== caps.chars)) {
        push('CAP-CWD-VALUE',
          `参考线必须是 **cwd** 那一份 ${scene.expected.file} 里的 ${JSON.stringify(caps.count)} / ${JSON.stringify(caps.chars)}，`
          + `卡上实得 ${JSON.stringify(capacity.cap_count)} / ${JSON.stringify(capacity.cap_chars)} —— `
          + '第三级候选没被读到（或者读到了却回落到写死的旧值 200 / 80000）')
      }
      if (capacity.count !== SNAPSHOT_TOTALS.count || capacity.chars !== SNAPSHOT_TOTALS.chars) {
        push('CAP-CWD-COUNT',
          `\`capacity.count/chars\` 必须仍是快照 \`totals\` 的 ${SNAPSHOT_TOTALS.count} / ${SNAPSHOT_TOTALS.chars}，`
          + `实得 ${JSON.stringify(capacity.count)} / ${JSON.stringify(capacity.chars)} —— 参考线与实际占用是两件事`)
      }
      if (capacity.state !== 'green') {
        push('CAP-CWD-STATE', `快照与参考线都读到了 ⇒ \`capacity.state\` 必须 \`green\`，实得 ${JSON.stringify(capacity.state)}`)
      }
      // ── 判据 ③：**来源格点名 cwd**（这一条今天红：那一格不存在）────────────────────
      if (!capacity.cap_source_present) {
        push('CAP-SOURCE-CELL-MISSING',
          '卡上没有 `capacity.cap_source` 这一格（今天的 `capacity.*` 只有 '
          + `${JSON.stringify(readings.capacity_keys)}）—— 这一格里那两个数（${JSON.stringify(capacity.cap_count)} / `
          + `${JSON.stringify(capacity.cap_chars)}）**今天确实是 cwd 给的**，可卡片自己说不出这件事：`
          + '把生成器那棵树那份文件也摆上，卡上会印成同样的形状（`ticket-20261102-05` / `F4` 要的正样本因此不可判）',
          { expected_file: scene.expected.file })
      } else if (typeof capacity.cap_source !== 'string' || capacity.cap_source.trim() === '') {
        push('CAP-SOURCE-SHAPE', `\`capacity.cap_source\` 必须是非空字符串，实得 ${JSON.stringify(capacity.cap_source)}`)
      } else {
        const got = normPath(capacity.cap_source)
        if (!got.includes(normPath(scene.expected.file))) {
          push('CAP-CWD-SOURCE-WRONG',
            `只有 cwd 那一级有文件，\`capacity.cap_source\` 必须点名 ${scene.expected.file}，`
            + `实得 ${JSON.stringify(capacity.cap_source)} —— 这一格是第三级唯一的证人。`
            + '⚠️ 值要是那一条候选自己的路径（相对写法三级同形，等于没点名）')
        }
        const leakedName = scene.sides
          .filter((side) => side.level !== 'cwd')
          .map((side) => normPath(side.file))
          .filter((file) => got.includes(file))
        if (leakedName.length > 0) {
          push('CAP-CWD-SOURCE-WRONG',
            `\`capacity.cap_source\` 点名了不在盘上的候选（${JSON.stringify(leakedName)}）—— 那是编出来的来源`)
        }
      }
    }

    caseFail(problems)
  })
})
