/**
 * `VRF-01` · **`F-120`** —— 指纹口径：`--root <预设根>` 时，CODE 必须按**根相对**排除数据目录。
 *
 * 病根（盘上现场，2026-10-22）：`.tools/fingerprint.mjs` 的排除表里那条
 * `presets/agenia/.runtime/` 是**仓库根相对**写法。技术评审按 `--root E:\Harness\presets\agenia`
 * 量指纹时，收录的相对路径是 `.runtime/…` ⇒ 那一条**永不匹配**，57 份脑数据（3.2 MB）混进 CODE；
 * 于是"代码有没有被动过"被一次正常审计写入翻面（`equal=false`），而 48 份代码一个字节没动。
 *
 * 判据（四格，各在一个**独立夹具树**上量，互不遮蔽）：
 *   A `真现场`  现役预设根（**只读**）的 CODE 名单里 `.runtime/` 必须 **0 份**，且盘上它**非空**（否则判据空转）
 *   B `写数据`  `<root>/.runtime/` 里写一份 ⇒ CODE **必须不变**          ← **今天红的就是这一格**
 *   C `写办公桌` `<root>/.team/` 里写一份 ⇒ CODE **必须不变**（"按根相对"这条规矩本来就在）
 *   D `改代码`  `lib/receipt.mjs` 改一个字节 ⇒ CODE **必须变**（阳性对照：这把尺子看得见改动）
 *   E `加代码`  `lib/` 下新增一份 ⇒ CODE **必须变**（防"干脆少算"的假修）
 *
 * B/C 与 D/E 是**一对翻面**：只排除一切 ⇒ D/E 红；什么都不排除 ⇒ B/C 红。
 */
import { before, describe, test } from 'node:test'
import path from 'node:path'
import { PATHS } from '../support/env.mjs'
import { caseFail, preflight, problem, runCase } from '../support/evidence.mjs'
import {
  buildPresetTree, countFiles, fingerprintCode, writeUnder,
} from '../support/verify-recompute.mjs'

before(() => {
  preflight()
})

const RUNTIME_WRITE = '.runtime/memory/2026-10-22/audit-append.json'
const OFFICE_WRITE = '.team/leader/2026-10-22/note.md'

describe('integration · verify-recompute (VRF) · F-120 指纹口径', () => {
  test('VRF-01 CODE 指纹按根相对排除：写 .runtime/ 不许翻面，改 lib/ 必须翻面', async () => {
    await runCase('VRF-01', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))

      // ── A 真现场：现役预设根（只读）────────────────────────────────────
      const real = fingerprintCode(PATHS.finalPreset)
      rec.readings.real_root = {
        root: PATHS.finalPreset,
        ok: real.ok,
        files: real.code?.files ?? null,
        bytes: real.code?.bytes ?? null,
        problems: real.problems,
      }
      if (!real.ok) {
        push('FINGERPRINT-TOOL', `量现役预设根失败（尺子本身跑不起来）：${real.problems.join('；')}`)
      } else {
        const list = real.code.list
        const runtimeRels = list.filter((f) => f.rel === '.runtime' || f.rel.startsWith('.runtime/') || f.rel.includes('/.runtime/')).map((f) => f.rel)
        const runtimeBytes = list.filter((f) => runtimeRels.includes(f.rel)).reduce((n, f) => n + f.bytes, 0)
        const runtimeDisk = countFiles(path.join(PATHS.finalPreset, '.runtime'))
        rec.readings.real_root.runtime_files_on_disk = runtimeDisk
        rec.readings.real_root.runtime_files_in_code = runtimeRels.length
        rec.readings.real_root.runtime_bytes_in_code = runtimeBytes
        rec.readings.real_root.runtime_byte_share = real.code.bytes > 0 ? `${(runtimeBytes / real.code.bytes * 100).toFixed(1)}%` : null
        rec.readings.real_root.sample = runtimeRels.slice(0, 5)
        if (runtimeDisk === 0) {
          push('CRITERION-VACUOUS', `现役 ${path.join(PATHS.finalPreset, '.runtime')} 里一份文件都没有 ⇒ "CODE 里不许有 .runtime/" 这条断言**空转**（它今天必然绿，绿得毫无意义）`)
        }
        if (runtimeRels.length !== 0) {
          push('CODE-INCLUDES-DATA', `现役预设根的 CODE 名单里混进 ${runtimeRels.length} 份 .runtime/ 文件（${runtimeBytes} B，占 CODE ${real.code.bytes} B 的 ${(runtimeBytes / real.code.bytes * 100).toFixed(1)}%）—— 举例 ${runtimeRels.slice(0, 3).join(' · ')}；排除表里的 \`presets/agenia/.runtime/\` 是**仓库根相对**写法，\`--root presets\\agenia\` 时永不匹配`)
        }
      }

      // ── B 写数据 ⇒ CODE 必须不变（这一格今天红）────────────────────────
      const treeB = buildPresetTree('VRF-01', 'runtime-write')
      const b0 = fingerprintCode(treeB)
      writeUnder(treeB, RUNTIME_WRITE, '{"kind":"audit-append"}\n')
      const b1 = fingerprintCode(treeB)
      rec.readings.data_write = { before: b0.code === null ? null : { sha256: b0.code.sha256, files: b0.code.files }, after: b1.code === null ? null : { sha256: b1.code.sha256, files: b1.code.files } }
      if (!b0.ok || !b1.ok) {
        push('FINGERPRINT-TOOL', `量夹具树 ${treeB} 失败：${[...b0.problems, ...b1.problems].join('；')}`)
      } else if (b1.code.sha256 !== b0.code.sha256 || b1.code.files !== b0.code.files) {
        push('CODE-FLIPPED-BY-DATA', `往 <root>/.runtime/ 里写了一份（${RUNTIME_WRITE}）⇒ CODE 从 ${b0.code.sha256.slice(0, 12)}… / ${b0.code.files} 份变成 ${b1.code.sha256.slice(0, 12)}… / ${b1.code.files} 份。数据写入不许让"代码有没有被动过"翻面（这就是技术评审那次 equal=false 的来源）`)
      }

      // ── C 写办公桌 ⇒ CODE 必须不变（`.team/` 那条本来就按根相对）───────
      const treeC = buildPresetTree('VRF-01', 'office-write')
      const c0 = fingerprintCode(treeC)
      writeUnder(treeC, OFFICE_WRITE, 'note\n')
      const c1 = fingerprintCode(treeC)
      rec.readings.office_write = { before: c0.code === null ? null : c0.code.sha256, after: c1.code === null ? null : c1.code.sha256 }
      if (!c0.ok || !c1.ok) {
        push('FINGERPRINT-TOOL', `量夹具树 ${treeC} 失败：${[...c0.problems, ...c1.problems].join('；')}`)
      } else if (c1.code.sha256 !== c0.code.sha256) {
        push('CODE-FLIPPED-BY-OFFICE', `往 <root>/.team/ 里写了一份 ⇒ CODE 翻面了（${c0.code.sha256.slice(0, 12)}… → ${c1.code.sha256.slice(0, 12)}…）。\`.team/\` 这条排除项本来就是按根相对写的，它红了说明排除表整体坏了`)
      }

      // ── D 改代码一个字节 ⇒ CODE 必须变（阳性对照）──────────────────────
      const treeD = buildPresetTree('VRF-01', 'code-edit')
      const d0 = fingerprintCode(treeD)
      const receiptAbs = path.join(treeD, 'lib', 'receipt.mjs')
      writeUnder(treeD, 'lib/receipt.mjs', '// lib/receipt.mjs（夹具）—— 代码\nexport const REJECT_REASON_MIN_CHARS = 999\n')
      const d1 = fingerprintCode(treeD)
      rec.readings.code_edit = {
        file: receiptAbs,
        before: d0.code === null ? null : d0.code.sha256,
        after: d1.code === null ? null : d1.code.sha256,
      }
      if (!d0.ok || !d1.ok) {
        push('FINGERPRINT-TOOL', `量夹具树 ${treeD} 失败：${[...d0.problems, ...d1.problems].join('；')}`)
      } else if (d1.code.sha256 === d0.code.sha256) {
        push('POSITIVE-CONTROL-DEAD', `把 lib/receipt.mjs 的 \`REJECT_REASON_MIN_CHARS\` 从 10 改成 999，CODE 指纹居然没变（${d0.code.sha256.slice(0, 12)}…）—— 这把尺子看不见代码改动，它给出的任何"没变"都不算读数`)
      }

      // ── E 新增一份代码 ⇒ CODE 必须变（防"少算"的假修）──────────────────
      const treeE = buildPresetTree('VRF-01', 'code-add')
      const e0 = fingerprintCode(treeE)
      writeUnder(treeE, 'lib/added.mjs', '// lib/added.mjs（夹具）—— 新加的代码\nexport const ADDED = 1\n')
      const e1 = fingerprintCode(treeE)
      rec.readings.code_add = {
        before: e0.code === null ? null : { sha256: e0.code.sha256, files: e0.code.files },
        after: e1.code === null ? null : { sha256: e1.code.sha256, files: e1.code.files },
      }
      if (!e0.ok || !e1.ok) {
        push('FINGERPRINT-TOOL', `量夹具树 ${treeE} 失败：${[...e0.problems, ...e1.problems].join('；')}`)
      } else if (e1.code.sha256 === e0.code.sha256 || e1.code.files !== e0.code.files + 1) {
        push('CODE-MISSES-ADDED-FILE', `在 lib/ 下新增一份代码以后，CODE 应变成 ${e0.code.files + 1} 份且哈希翻面，实得 ${e1.code.files} 份 / ${e1.code.sha256.slice(0, 12)}…（"少算"不是安全，是把改动藏起来）`)
      }

      caseFail(problems)
    })
  })
})
