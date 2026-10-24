/**
 * `REV-04` · **`F-160`** —— 评审对象是**派工那一刻的提交**：活树在窗口里动了 ⇒ 本轮仍然有效。
 *
 * 病根（2026-10-24 11:05–11:35 实测）：前后 CODE 指纹量在**活树**上，而活树里装着"别的岗位此刻正在写的文件"。
 * 派工那一刻 `equal=true` 就已经注定失败：25 分钟翻了 7 次、`changed[]` 4 → 18，四份 findings 内容可用、
 * **效力作废**（`code_fingerprint.equal=false`）。⇒ 口径要钉在**不可变对象**（提交）上，不是钉在概率上。
 *
 * 这一格分四段，**各段用各自的新鲜夹具**（互不遮蔽）：
 *   `A DEVICE`  量具自证：提交侧的 CODE 指纹（读 `git cat-file` 的 blob，独立一条路）与
 *               `.tools/fingerprint.mjs` 在**同一棵树**上必须同一个数；排除表在这份夹具上真的排掉 2 份
 *   `B SCENE`   **现场本身**（参照副本，`exportCommitReference` —— 只当阳性对照，不是被测对象）：
 *               副本就是这个提交（逐份 `git blob` SHA-1 + 路径集合 + 没有 `.git`）· 副本的 CODE 指纹 = 提交侧独立算的那个数 ·
 *               窗口里动**活树**两处 ⇒ 副本前后 **equal:true**（本轮有效）· 活树前后 **equal:false**（**旧口径会作废**这轮好评审 ——
 *               11:0x 那个 `code_fingerprint.equal=false` 就是这么来的）
 *   `C EXPORT`  被测的那条路（`.tools/tree-at-commit.mjs`）：导出 → 副本 = 提交 · `code.sha256` = 卡片上的 `before_sha256` ·
 *               留活树基线 · 校验自己复算（`equal:true` · `is_that_commit.ok:true` · 活树动了 **2** 处，**不是**"副本 vs 活树的分歧"）·
 *               没给基线 ⇒ 判不了（不许读成 0）· 同一个 `--out` 再导一次必须拒
 *   `D REAL`    真仓库里**钉住的一个提交**（`8b7cea6…`）：副本仍必须是它、CODE 指纹仍必须对得上；
 *               另记一条读数：活树 vs 提交的**分歧**（今天 192 vs 135）—— 它**不等于**"活树动了"，谁按分歧报就是读数撒谎
 *   `E SHAPES`  三份载体上的针：作业书「必读输入清单」代码根那一行 + 「地基」一节 +
 *               `leader.md` 第三步（`rev-parse` / 副本 / `before_sha256`）+ `CONTRACT.md` 的 `F-160` 那一句
 *
 * ⚠️ 这一格今天 **RED** 的只有两类：`C` 那一段（机制还没有：导出器不存在）与 `E` 那一段（三份载体还没改口径）。
 *    `A` / `B` / `D` 的读数今天是**绿的** —— 那正是"现场是真的、旧口径确实会作废好评审"的证据。
 */
import { before, describe, test } from 'node:test'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { PATHS } from '../support/env.mjs'
import { caseFail, preflight, problem, runCase, runRoot } from '../support/evidence.mjs'
import {
  EXPORT_FIELDS, VERIFY_FIELDS, buildFixtureRepo, codeDigestOfCommit, codeDigestOfDir, codeListDiff,
  dispatchShapes, excludedFromCode, exportCommitReference, exporterPath, fingerprintCompare, fingerprintTool,
  lsTreeBlobs, missingFields, runExport, runVerify, saveCodeBaseline, verifyCopyIsCommit,
} from '../support/tree-at-commit.mjs'

before(() => {
  preflight()
})

/** 真仓库里钉住的一个提交（2026-10-24 的 HEAD；历史只追加 ⇒ 它永远解析得出来）。 */
const REAL_COMMIT = '8b7cea6ea2a5ca6c5ebcc1f4ddfa65d3ebae5bf6'

/** 窗口里动活树的那两处（**都在 CODE 名单里** —— 不在的话"旧口径作废"那一格就演不出来）。 */
const LIVE_MODIFIED = 'lib/alpha.mjs'
const LIVE_ADDED = 'lib/added-by-other-role.mjs'

describe('integration · review (REV) · F-160 评审对象是提交', () => {
  test('REV-04 活树在窗口里动了 ⇒ 副本前后仍一致、本轮有效（旧口径必须作废）', async () => {
    await runCase('REV-04', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      const root = runRoot()

      // ══ A DEVICE + B SCENE：现场本身（不需要被测工具）════════════════════════
      const fx = buildFixtureRepo(root, 'rev04-scene')
      rec.readings.fixture = { repo: fx.repo, pinned_commit: fx.commitA, second_commit: fx.commitB, files_A: fx.filesA, files_B: fx.filesB }
      const commitA = codeDigestOfCommit(fx.repo, fx.commitA)
      const commitB = codeDigestOfCommit(fx.repo, fx.commitB)
      rec.readings.commit_a = { ok: commitA.ok, sha256: commitA.sha256, files: commitA.files, bytes: commitA.bytes, excluded: commitA.excluded, problems: commitA.problems }
      rec.readings.commit_b = { ok: commitB.ok, sha256: commitB.sha256, files: commitB.files }
      if (!commitA.ok) {
        push('DEVICE-COMMIT-UNREADABLE', `读不出提交 ${fx.commitA.slice(0, 12)}… 的 CODE 指纹（git 那一路）：${commitA.problems.join('；')}`)
      } else {
        // 夹具里 7 份文件、其中 2 份（`notes/run.log` 后缀 / `.env` env 类）不进 CODE ⇒ CODE 名单必须恰好 5 份。
        if (commitA.files !== 5) {
          push('DEVICE-CODE-SET-WRONG', `提交 A 的 CODE 名单应是 5 份（7 份里 \`notes/run.log\` 与 \`.env\` 按排除表不进），实得 ${commitA.files} 份：${commitA.list.map((f) => f.rel).join(' · ')} —— 这份排除表写法与 \`.tools/fingerprint.mjs\` 分叉了`)
        }
        const leaked = commitA.list.map((f) => f.rel).filter((rel) => excludedFromCode(rel))
        if (leaked.length > 0) push('DEVICE-CODE-SET-WRONG', `CODE 名单里混进了本该排除的路径：${leaked.join(' · ')}`)
        if (commitA.excluded.length !== 2) push('DEVICE-CODE-SET-WRONG', `提交 A 里该被排除的路径应有 2 份（\`notes/run.log\` · \`.env\`），实得 ${commitA.excluded.length} 份：${commitA.excluded.join(' · ') || '（空）'}`)
        if (commitB.ok && commitB.sha256 === commitA.sha256) push('DEVICE-CODE-SET-WRONG', '提交 A 与提交 B 的 CODE 指纹相同 —— 夹具的第二次提交没有改到 CODE 名单，"钉住哪个提交"这条腿就没有样本')
      }

      // 参照副本（阳性对照）：提交 A 的纯树
      const refOut = path.join(fx.dir, `ref-tree-at-${fx.commitA.slice(0, 8)}`)
      const ref = exportCommitReference(fx.repo, fx.commitA, refOut)
      rec.readings.reference_copy = { ok: ref.ok, files: ref.files, problems: ref.problems }
      if (!ref.ok) {
        push('DEVICE-REFERENCE-BROKEN', `参照副本都没造出来（${ref.problems.join('；')}）—— 这一格的现场立不住，先修量具，别读后面的绿`)
      } else {
        const refIdent = verifyCopyIsCommit({ repo: fx.repo, commit: fx.commitA, copyRoot: refOut })
        rec.readings.reference_copy.identity = { ok: refIdent.ok, files: refIdent.actual.length, problems: refIdent.problems.slice(0, 5) }
        if (!refIdent.ok) push('DEVICE-REFERENCE-BROKEN', `参照副本不是提交 ${fx.commitA.slice(0, 12)}…：${refIdent.problems.slice(0, 5).join('；')}`)
        const refDir = codeDigestOfDir(refOut)
        const refTool = fingerprintTool(refOut)
        rec.readings.reference_copy.code = { dir: refDir.sha256, tool: refTool.sha256, commit_side: commitA.sha256, dir_files: refDir.files }
        if (!refTool.ok) push('DEVICE-TOOL-FAILED', `\`.tools/fingerprint.mjs\` 量不动参照副本：${refTool.problems.join('；')}`)
        else if (refTool.sha256 !== refDir.sha256) {
          push('DEVICE-MISMATCH', `同一个参照副本，我的收录表算出 ${refDir.sha256.slice(0, 12)}…（${refDir.files} 份），\`.tools/fingerprint.mjs\` 算出 ${refTool.sha256.slice(0, 12)}…（${refTool.files} 份）—— 两台尺子对不上，谁给的"没变"都不算读数（先核排除表那两份写法）`)
        }
        if (commitA.ok && refDir.sha256 !== commitA.sha256) push('COPY-CODE-DIGEST-MISMATCH', `参照副本的 CODE 指纹 ${refDir.sha256.slice(0, 12)}… ≠ 提交从 git 对象算出来的 ${commitA.sha256.slice(0, 12)}…`)

        // ── B SCENE：窗口里动**活树**两处；副本一个字节不动 ────────────────
        const sceneBaseline = path.join(fx.dir, 'live-before.json')
        const saved = saveCodeBaseline(fx.repo, sceneBaseline)
        rec.readings.scene = { baseline: saved.ok ? saved.sha256 : null, problems: saved.problems }
        if (!saved.ok) {
          push('LIVE-BASELINE-SHAPE', `活树基线存不下来（${saved.problems.join('；')}）—— "旧口径会作废"那一格没有基线可比`)
        } else {
          const copyBefore = fingerprintTool(refOut)
          writeFileSync(path.join(fx.repo, LIVE_MODIFIED), "export const ALPHA = 'a2-changed-by-another-role'\n", 'utf8')
          const addedAbs = path.join(fx.repo, LIVE_ADDED)
          mkdirSync(path.dirname(addedAbs), { recursive: true })
          writeFileSync(addedAbs, "export const ADDED_BY_OTHER_ROLE = '11:09:25'\n", 'utf8')
          const copyAfter = fingerprintTool(refOut)
          const liveAfter = fingerprintCompare(fx.repo, sceneBaseline)
          const divergence = codeListDiff(commitA.list, codeDigestOfDir(fx.repo).list)
          rec.readings.scene.copy_before = copyBefore.ok ? copyBefore.sha256 : null
          rec.readings.scene.copy_after = copyAfter.ok ? copyAfter.sha256 : null
          rec.readings.scene.live_changed = liveAfter.changed.map((c) => `${c.rel}(${c.kind})`)
          rec.readings.scene.divergence = { count: divergence.length, places: divergence.map((d) => d.rel) }
          if (!copyBefore.ok || !copyAfter.ok) {
            push('DEVICE-TOOL-FAILED', `量参照副本的前后读数失败：${[...(copyBefore.problems ?? []), ...(copyAfter.problems ?? [])].join('；')}`)
          } else if (copyBefore.sha256 !== copyAfter.sha256) {
            push('COPY-RULER-VOIDED', `活树动了两处，副本的 CODE 指纹却从 ${copyBefore.sha256.slice(0, 12)}… 变成 ${copyAfter.sha256.slice(0, 12)}… —— 这不是"副本被人动了"，是量错了对象`)
          }
          if (!liveAfter.ok) {
            push('LIVE-BASELINE-SHAPE', `活树基线比不了：${liveAfter.problems.join('；')}`)
          } else if (liveAfter.equal !== false) {
            push('OLD-RULER-DID-NOT-FLIP', `窗口里改了活树的 \`${LIVE_MODIFIED}\` 并加了一份 \`${LIVE_ADDED}\`，活树的 CODE 指纹居然没翻面（equal=${JSON.stringify(liveAfter.equal)}）—— 这一格演的现场是假的，"旧口径会作废好评审"就没有证据`)
          } else {
            const rels = liveAfter.changed.map((c) => c.rel).sort()
            const want = [LIVE_ADDED, LIVE_MODIFIED].sort()
            rec.readings.scene.live_changed_count = liveAfter.changed.length
            if (rels.length !== want.length || rels.some((r, i) => r !== want[i])) {
              push('OLD-RULER-DID-NOT-FLIP', `活树那一侧应该恰好这两处变化（${want.join(' · ')}），实得 ${rels.length} 处：${rels.join(' · ')}`)
            }
            // 「变动」= 基线 vs 现在；「分歧」= 副本 vs 活树现在（夹具里从第一秒起就 ≠ 0）—— 两个数不许混用
            rec.readings.scene.moved = liveAfter.changed.length
            if (divergence.length === liveAfter.changed.length) {
              push('LIVE-COUNT-INFLATED', `这一格里"活树变动"与"副本 vs 活树的分歧"恰好都是 ${divergence.length} —— 夹具没能把这两个数分开，LIVE-COUNT-INFLATED 那条判据会空转`)
            }
          }
        }
      }

      // ══ C EXPORT：被测的那条路（新鲜夹具，时间线从零开始）════════════════════
      const fxTool = buildFixtureRepo(root, 'rev04-tool')
      rec.readings.fixture_tool = { repo: fxTool.repo, pinned_commit: fxTool.commitA }
      const ex = exporterPath()
      rec.readings.exporter = { file: ex.file, exists: ex.exists, source: ex.source }
      if (!ex.exists) {
        push('EXPORTER-MISSING', `导出器不在：${ex.file}（来源 ${ex.source}）—— 没有它就没有"派工那一刻的只读副本"，活树仍然是评审对象。落地后用 AGENIA_TREE_AT_COMMIT 也能指过来`)
      } else {
        const out = path.join(fxTool.dir, `tree-at-${fxTool.commitA.slice(0, 8)}`)
        const baselineFile = path.join(fxTool.dir, 'live-before.json')
        const exp = runExport({ exporter: ex.file, repo: fxTool.repo, commit: fxTool.commitA, out, liveBaseline: baselineFile })
        rec.readings.export = { exit: exp.exit, json: exp.json, json_error: exp.json_error, stderr: exp.stderr.slice(0, 600), out, baseline: baselineFile }
        if (exp.exit !== 0 || exp.json === null) {
          push('EXPORT-FAILED', `导出失败：exit=${exp.exit}${exp.json_error === null ? '' : ` · stdout 最后一行不是 JSON（${exp.json_error}）`}${exp.stderr.trim() === '' ? '' : ` · stderr：${exp.stderr.trim().slice(0, 300)}`}`)
        } else {
          const j = exp.json
          const miss = missingFields(j, EXPORT_FIELDS)
          if (miss.length > 0) push('EXPORT-JSON-SHAPE', `导出的 JSON 缺字段：${miss.join(' · ')}（契约 §2：${EXPORT_FIELDS.join(' / ')}）`)
          if (String(j.commit ?? '').toLowerCase() !== fxTool.commitA.toLowerCase()) {
            push('EXPORT-COMMIT-MISMATCH', `导出的读数说提交是 ${JSON.stringify(j.commit)}，我们钉住的是 ${fxTool.commitA} —— 读数必须回报**解析后的完整哈希**（短哈希不是读数）`)
          }
          if (j.code === null || typeof j.code !== 'object' || typeof j.code.sha256 !== 'string') {
            push('EXPORT-JSON-SHAPE', `导出的 \`code\` 必须是对象并带 \`sha256\`（副本的 CODE 指纹 = 派工卡上的 before_sha256），实得 ${JSON.stringify(j.code)?.slice(0, 120)}`)
          }
          if (!existsSync(out)) {
            push('EXPORT-NO-COPY', `导出器说成功，但 \`--out\` 那个目录不在：${out}`)
          } else {
            const cv = verifyCopyIsCommit({ repo: fxTool.repo, commit: fxTool.commitA, copyRoot: out })
            rec.readings.export.copy_identity = { ok: cv.ok, files: cv.actual.length, expected: cv.expected.length, missing: cv.missing, extra: cv.extra, mismatched: cv.mismatched, problems: cv.problems }
            if (!cv.ok) push('COPY-NOT-THAT-COMMIT', `副本不是提交 ${fxTool.commitA.slice(0, 12)}… 那一棵树：${cv.problems.slice(0, 6).join('；')}${cv.problems.length > 6 ? `（另有 ${cv.problems.length - 6} 条）` : ''}`)
            const toolDigest = codeDigestOfCommit(fxTool.repo, fxTool.commitA)
            const dirDigest = codeDigestOfDir(out)
            const toolDir = fingerprintTool(out)
            rec.readings.export.copy_code = { dir: dirDigest.sha256, tool: toolDir.sha256, commit_side: toolDigest.sha256, dir_files: dirDigest.files }
            if (!toolDir.ok) push('DEVICE-TOOL-FAILED', `\`.tools/fingerprint.mjs\` 量不动副本：${toolDir.problems.join('；')}`)
            else if (toolDir.sha256 !== dirDigest.sha256) {
              push('DEVICE-MISMATCH', `同一个副本目录，两台尺子对不上：我算 ${dirDigest.sha256.slice(0, 12)}…（${dirDigest.files} 份）/ \`.tools/fingerprint.mjs\` 算 ${toolDir.sha256.slice(0, 12)}…（${toolDir.files} 份）`)
            }
            if (toolDigest.ok && dirDigest.sha256 !== toolDigest.sha256) {
              push('COPY-CODE-DIGEST-MISMATCH', `副本的 CODE 指纹 ${dirDigest.sha256.slice(0, 12)}… ≠ 提交从 git 对象算出来的 ${toolDigest.sha256.slice(0, 12)}… —— 副本不是这个提交（或被谁动过）`)
            }
            if (typeof j.code?.sha256 === 'string' && toolDigest.ok && j.code.sha256.toLowerCase() !== toolDigest.sha256) {
              push('CARD-BEFORE-MISMATCH', `导出的 \`code.sha256\` ${String(j.code.sha256).slice(0, 12)}… ≠ 独立算出来的 ${toolDigest.sha256.slice(0, 12)}… —— 派工卡的 before_sha256 必须由副本量出，而不是"某个目录"的读数`)
            }
            // 活树基线
            const lb = j.live_baseline
            rec.readings.export.live_baseline = { field: lb ?? null, exists: typeof lb === 'string' && existsSync(lb) }
            if (typeof lb !== 'string' || !existsSync(lb)) {
              push('LIVE-BASELINE-MISSING', `导出没留下活树基线（\`live_baseline\` = ${JSON.stringify(lb ?? null)}）—— "活树动了几处"必须由**派工那一刻**的基线算出来；没有基线时 verify 只能判"判不了"，不能判 0`)
            } else {
              const atDispatch = fingerprintCompare(fxTool.repo, lb)
              rec.readings.export.live_baseline.at_dispatch = { ok: atDispatch.ok, equal: atDispatch.equal, changed: atDispatch.changed.length, problems: atDispatch.problems }
              if (!atDispatch.ok) push('LIVE-BASELINE-SHAPE', `活树基线不是 \`fingerprint.mjs --save\` 的形状（逐份 \`changed[]\` 算不出来）：${atDispatch.problems.join('；')}`)
              else if (atDispatch.equal !== true) push('LIVE-BASELINE-SHAPE', `刚写完的活树基线立刻与活树不等（${atDispatch.changed.length} 处）—— 这份基线不是那一刻的活树`)

              // 窗口：动活树两处（改一份 + 加一份，都进 CODE 名单）
              writeFileSync(path.join(fxTool.repo, LIVE_MODIFIED), "export const ALPHA = 'a2-changed-by-another-role'\n", 'utf8')
              const addedAbs2 = path.join(fxTool.repo, LIVE_ADDED)
              mkdirSync(path.dirname(addedAbs2), { recursive: true })
              writeFileSync(addedAbs2, "export const ADDED_BY_OTHER_ROLE = '11:09:25'\n", 'utf8')

              const ver = runVerify({ exporter: ex.file, copy: out, repo: fxTool.repo, commit: fxTool.commitA, expect: j.code?.sha256 ?? '', liveBaseline: lb, liveRoot: fxTool.repo })
              rec.readings.verify = { exit: ver.exit, json: ver.json, json_error: ver.json_error, stderr: ver.stderr.slice(0, 600) }
              if (ver.exit !== 0 || ver.json === null) {
                push('VERIFY-FAILED', `校验失败：exit=${ver.exit}${ver.json_error === null ? '' : ` · 最后一行不是 JSON（${ver.json_error}）`}${ver.stderr.trim() === '' ? '' : ` · stderr：${ver.stderr.trim().slice(0, 300)}`}`)
              } else {
                const v = ver.json
                const vmiss = missingFields(v, VERIFY_FIELDS)
                if (vmiss.length > 0) push('VERIFY-JSON-SHAPE', `校验的 JSON 缺字段：${vmiss.join(' · ')}（契约 §3：${VERIFY_FIELDS.join(' / ')}）`)
                if (v.equal !== true) {
                  push('COPY-RULER-VOIDED', `校验自己复算的结果是 \`equal=${JSON.stringify(v.equal)}\` —— 活树在窗口里动了两处、副本一个字节没动，本轮必须仍然有效（这一格判的就是"活树变动不在效力范围内"）`)
                }
                if (v.is_that_commit?.ok !== true) {
                  push('VERIFY-COMMIT-UNVERIFIED', `校验没有确认"副本就是提交 ${fxTool.commitA.slice(0, 12)}…"：\`is_that_commit\` = ${JSON.stringify(v.is_that_commit)?.slice(0, 300)}`)
                }
                const moved = v.live?.moved ?? v.live?.count ?? null
                const places = Array.isArray(v.live?.places) ? v.live.places.map((p) => (typeof p === 'string' ? p : p?.rel)).filter((x) => typeof x === 'string').sort() : []
                const divergence = codeListDiff(toolDigest.list, codeDigestOfDir(fxTool.repo).list)
                rec.readings.verify.live = { moved, places, divergence: divergence.map((d) => `${d.rel}(${d.kind})`) }
                if (moved !== 2) {
                  if (moved !== null && moved === divergence.length && divergence.length !== 2) {
                    push('LIVE-COUNT-INFLATED', `活树**变动**是 2 处，校验报的却是 ${moved} 处 = 副本与活树的**分歧**（${divergence.map((d) => d.rel).join(' · ')}）—— 分歧里装着"从来没进过提交"的文件，它不是"派工后动了"。读数必须按基线算变动，不按分歧`)
                  } else {
                    push('LIVE-COUNT-WRONG', `活树在窗口里动了 2 处（\`${LIVE_MODIFIED}\` 改 + \`${LIVE_ADDED}\` 加），校验报的 \`live.moved\` 是 ${JSON.stringify(moved)}（places：${places.join(' · ') || '（空）'}）`)
                  }
                } else if (places.length > 0) {
                  const want = [LIVE_ADDED, LIVE_MODIFIED].sort()
                  if (places.length !== want.length || places.some((r, i) => r !== want[i])) {
                    push('LIVE-PLACES-WRONG', `校验报的变动位置与现场对不上：报 ${places.join(' · ')}，实际动的是 ${want.join(' · ')}`)
                  }
                }
                if (moved === null && !String(v.live?.detail ?? v.live?.note ?? '').length) {
                  push('LIVE-NO-BASELINE-SILENT', '`live.moved` 是判不了，但 `live` 里没有一句说法 —— "判不了"必须写出来（读的人会把它读成 0）')
                }
              }

              // 不给基线 ⇒ 变动数必须"判不了"
              const noBaseline = runVerify({ exporter: ex.file, copy: out, repo: fxTool.repo, commit: fxTool.commitA, expect: j.code?.sha256 ?? '', liveBaseline: null, liveRoot: fxTool.repo })
              const nv = noBaseline.json
              rec.readings.verify_no_baseline = { exit: noBaseline.exit, json: nv, stderr: noBaseline.stderr.slice(0, 400) }
              if (noBaseline.exit === 0 && nv !== null) {
                const nm = nv.live?.moved ?? nv.live?.count ?? null
                if (nm === 0) push('LIVE-NO-BASELINE-READS-ZERO', '没给活树基线，校验把"变动 0 处"报了出来 —— 没有基线就不可能知道动了几处，这是"读不到"被写成了"没变"')
                if (nm === null && !String(nv.live?.detail ?? nv.live?.note ?? '').length) push('LIVE-NO-BASELINE-SILENT', '没给基线时 `live.moved` 是判不了，但没有任何一句说法')
              }

              // 同一个 --out 再导一次 ⇒ 必须拒（读数不许原地覆盖）
              const again = runExport({ exporter: ex.file, repo: fxTool.repo, commit: fxTool.commitA, out, liveBaseline: path.join(fxTool.dir, 'live-before-2.json') })
              const afterAgain = codeDigestOfDir(out).sha256
              rec.readings.reexport = { exit: again.exit, copy_sha_before: dirDigest.sha256, copy_sha_after_second_export: afterAgain, stderr: again.stderr.slice(0, 300) }
              if (again.exit === 0) {
                push('REFUSE-OVERWRITE', '同一个 `--out` 又导了一次，退出码 0 —— 已有的副本会被原地覆盖（读数不许原地重写）；应拒（exit ≠ 0）并说清"这个目录已经有东西"')
              } else if (afterAgain !== dirDigest.sha256) {
                push('REFUSE-OVERWRITE', `第二次导出被拒了（exit ${again.exit}），但副本的字节已经变了（${dirDigest.sha256.slice(0, 12)}… → ${afterAgain.slice(0, 12)}…）—— 拒之前不许先写进去`)
              }
            }
          }
        }
      }

      // ══ D REAL：真仓库里钉住的那个提交 ═══════════════════════════════════════
      const realTree = lsTreeBlobs(PATHS.repo, REAL_COMMIT)
      if (!realTree.ok) {
        push('REAL-COMMIT-MISSING', `真仓库里钉住的提交 ${REAL_COMMIT.slice(0, 12)}… 读不出来：${realTree.problems.join('；')}（历史只追加 ⇒ 它应当永远在那儿；不在说明这一格的输入没了）`)
      } else {
        const realCommit = codeDigestOfCommit(PATHS.repo, REAL_COMMIT)
        rec.readings.real = { commit: REAL_COMMIT, tracked: realTree.entries.length, code: { ok: realCommit.ok, sha256: realCommit.sha256, files: realCommit.files, bytes: realCommit.bytes } }
        if (!realCommit.ok) push('REAL-COMMIT-MISSING', `提交 ${REAL_COMMIT.slice(0, 12)}… 的 CODE 指纹算不出来：${realCommit.problems.join('；')}`)
        else if (realCommit.files < 50) push('REAL-COMMIT-MISSING', `提交 ${REAL_COMMIT.slice(0, 12)}… 的 CODE 名单只有 ${realCommit.files} 份 —— 样本太小，"副本是不是那个提交"就没什么可核的`)
        else {
          // 读数（**不判**）：活树里有一批从没进过提交的 CODE 文件 ⇒ "分歧 ≠ 变动"（今天是 192 vs 135）。
          const liveCode = codeDigestOfDir(PATHS.repo)
          const divergence = codeListDiff(realCommit.list, liveCode.list)
          rec.readings.real.live_divergence = { count: divergence.length, sample: divergence.slice(0, 8).map((d) => `${d.rel}(${d.kind})`), live_files: liveCode.files, commit_files: realCommit.files }
          if (liveCode.files > 0 && divergence.length === 0) {
            push('REAL-DIVERGENCE-EMPTY', `真仓库的活树与提交 ${REAL_COMMIT.slice(0, 12)}… 的 CODE 名单一模一样（分歧 0 份）—— "分歧 ≠ 变动"这条读数就没有样本；这一格的前提变了，报告里要改名`)
          }
          if (ex.exists) {
            const realOut = path.join(root, 'fixtures', 'f160-rev04-scene', `real-tree-at-${REAL_COMMIT.slice(0, 8)}`)
            const realExp = runExport({ exporter: ex.file, repo: PATHS.repo, commit: REAL_COMMIT, out: realOut })
            rec.readings.real.export = { exit: realExp.exit, code: realExp.json?.code ?? null, commit: realExp.json?.commit ?? null, json_error: realExp.json_error, stderr: realExp.stderr.slice(0, 400) }
            if (realExp.exit !== 0 || realExp.json === null) {
              push('EXPORT-FAILED', `真仓库（${PATHS.repo}）上导出提交 ${REAL_COMMIT.slice(0, 12)}… 失败：exit=${realExp.exit}${realExp.json_error === null ? '' : ` · ${realExp.json_error}`}${realExp.stderr.trim() === '' ? '' : ` · stderr：${realExp.stderr.trim().slice(0, 300)}`}`)
            } else {
              const realCv = verifyCopyIsCommit({ repo: PATHS.repo, commit: REAL_COMMIT, copyRoot: realOut })
              rec.readings.real.copy = { ok: realCv.ok, files: realCv.actual.length, expected: realCv.expected.length, missing: realCv.missing.length, extra: realCv.extra.length, mismatched: realCv.mismatched.length, problems: realCv.problems.slice(0, 5) }
              if (!realCv.ok) push('COPY-NOT-THAT-COMMIT', `真仓库的副本不是提交 ${REAL_COMMIT.slice(0, 12)}…：${realCv.problems.slice(0, 5).join('；')}${realCv.problems.length > 5 ? `（另有 ${realCv.problems.length - 5} 条）` : ''}`)
              const realDir = codeDigestOfDir(realOut)
              const realToolCompare = fingerprintTool(realOut)
              rec.readings.real.copy_code = { dir: realDir.sha256, tool: realToolCompare.sha256, commit_side: realCommit.sha256, dir_files: realDir.files }
              if (realToolCompare.ok && realToolCompare.sha256 !== realDir.sha256) push('DEVICE-MISMATCH', `真仓库副本上两台尺子对不上：我算 ${realDir.sha256.slice(0, 12)}… / 工具算 ${realToolCompare.sha256.slice(0, 12)}…`)
              if (realDir.sha256 !== realCommit.sha256) push('COPY-CODE-DIGEST-MISMATCH', `真仓库副本的 CODE 指纹与提交从 git 对象算出来的对不上（${realDir.sha256.slice(0, 12)}… vs ${realCommit.sha256.slice(0, 12)}…）`)
              if (typeof realExp.json.code?.sha256 === 'string' && realExp.json.code.sha256.toLowerCase() !== realCommit.sha256) {
                push('CARD-BEFORE-MISMATCH', `真仓库导出回报的 \`code.sha256\` ${String(realExp.json.code.sha256).slice(0, 12)}… ≠ 独立算出来的 ${realCommit.sha256.slice(0, 12)}…`)
              }
            }
          }
        }
      }

      // ══ E SHAPES：三处载体（每针各报各的）════════════════════════════════════
      const shapes = dispatchShapes({ repo: PATHS.repo })
      rec.readings.dispatch_shapes = shapes.readings
      for (const p of shapes.problems) problems.push(p)

      caseFail(problems)
    })
  })
})
