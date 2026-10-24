/**
 * `REV-05` · **`F-160`** —— 评审**自己动了副本** ⇒ 本轮作废（`equal:false`）。
 *
 * 与 `REV-04` 是**同一把尺子的两个方向**：`REV-04` 说"活树动了不算你的事"，
 * 这一格说"**副本动了就是你的事**" —— 少这一格，新口径就是一条只会往"有效"那一边倒的判据
 * （`mig-rules-11`：不能翻面的判据是装饰）。
 *
 * 现场（单因：**活树一个字节不动**，只动副本 —— 所以翻面只可能来自副本那一侧）：
 *   `A DEVICE`   量具自证：副本上"盘上那一条路"与 `.tools/fingerprint.mjs` 必须同一个数
 *   `B COPY-TOUCHED`（参照副本，阳性对照）改副本里**一份 CODE 文件** ⇒ 副本前后 `equal:false`、
 *                `changed[]` 恰好那一份；**同一时刻活树前后 `equal:true`（0 处）**
 *   `C EXPORT`   被测的那条路：导出后改副本 ⇒ 校验必须**自己复算**：`equal:false`（**不许照抄卡上的值**——
 *                卡上还写着派工那一刻的数）+ `is_that_commit.ok:false` 并**点名**那一份文件
 *   `D WRONG-COMMIT` 拿**另一个提交**去核一份**干净**的副本 ⇒ `equal:true`（副本确实没动）但
 *                `is_that_commit.ok:false` —— 两条腿互相独立；只比哈希的实现会在这一格上"绿得看不出来"
 *
 * ⚠️ 这一格今天 **RED** 的只有 `C` / `D` 两段（机制还没有：导出器不存在）—— 那是正确的红。
 *    `A` / `B` 今天是绿的：副本这条口径**确实能翻面**。
 */
import { before, describe, test } from 'node:test'
import { existsSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { PATHS } from '../support/env.mjs'
import { caseFail, preflight, problem, runCase, runRoot } from '../support/evidence.mjs'
import {
  VERIFY_FIELDS, buildFixtureRepo, codeDigestOfCommit, codeDigestOfDir, codeListDiff, excludedFromCode,
  exportCommitReference, exporterPath, fingerprintCompare, fingerprintTool, missingFields,
  runExport, runVerify, saveCodeBaseline, verifyCopyIsCommit,
} from '../support/tree-at-commit.mjs'

before(() => {
  preflight()
})

/** 评审动的那一份（**CODE 名单里**的文件 —— 动一份不进 CODE 的文件，这把尺子看不见，那一格就不成立）。 */
const COPY_TOUCHED = 'lib/beta.mjs'

describe('integration · review (REV) · F-160 副本被动过 ⇒ 作废', () => {
  test('REV-05 评审动了副本 ⇒ 副本前后 equal:false、本轮作废（活树这一侧必须是干净的）', async () => {
    await runCase('REV-05', async (rec) => {
      const problems = []
      const push = (code, msg, detail) => problems.push(problem(code, msg, detail))
      const root = runRoot()

      // ══ A DEVICE + B COPY-TOUCHED：现场本身（不需要被测工具）══════════════════
      const fx = buildFixtureRepo(root, 'rev05-scene')
      rec.readings.fixture = { repo: fx.repo, pinned_commit: fx.commitA, second_commit: fx.commitB, files_A: fx.filesA }
      const commitA = codeDigestOfCommit(fx.repo, fx.commitA)
      const commitB = codeDigestOfCommit(fx.repo, fx.commitB)
      rec.readings.commit_a = { ok: commitA.ok, sha256: commitA.sha256, files: commitA.files, excluded: commitA.excluded }
      if (!commitA.ok) push('DEVICE-COMMIT-UNREADABLE', `读不出提交 ${fx.commitA.slice(0, 12)}… 的 CODE 指纹：${commitA.problems.join('；')}`)
      if (commitA.ok && commitB.ok && commitA.sha256 === commitB.sha256) {
        push('DEVICE-CODE-SET-WRONG', '提交 A 与 B 的 CODE 指纹相同 —— "拿错提交去核"这一格（`D`）没有样本')
      }
      if (commitA.ok && excludedFromCode(COPY_TOUCHED)) {
        push('DEVICE-CODE-SET-WRONG', `\`${COPY_TOUCHED}\` 在 CODE 名单之外 —— 动它不会让指纹翻面，这一格演的现场是假的`)
      }

      const refOut = path.join(fx.dir, `ref-tree-at-${fx.commitA.slice(0, 8)}`)
      const ref = exportCommitReference(fx.repo, fx.commitA, refOut)
      rec.readings.reference_copy = { ok: ref.ok, files: ref.files, problems: ref.problems }
      if (!ref.ok) {
        push('DEVICE-REFERENCE-BROKEN', `参照副本都没造出来（${ref.problems.join('；')}）—— 这一格的现场立不住，先修量具，别读后面的绿`)
      } else {
        const refIdent = verifyCopyIsCommit({ repo: fx.repo, commit: fx.commitA, copyRoot: refOut })
        rec.readings.reference_copy.identity = { ok: refIdent.ok, files: refIdent.actual.length, problems: refIdent.problems.slice(0, 5) }
        if (!refIdent.ok) push('DEVICE-REFERENCE-BROKEN', `参照副本不是提交 ${fx.commitA.slice(0, 12)}…：${refIdent.problems.slice(0, 5).join('；')}`)
        const dirBefore = codeDigestOfDir(refOut)
        const toolBefore = fingerprintTool(refOut)
        rec.readings.device = { dir: dirBefore.sha256, tool: toolBefore.ok ? toolBefore.sha256 : null, dir_files: dirBefore.files, tool_files: toolBefore.files }
        if (!toolBefore.ok) push('DEVICE-TOOL-FAILED', `\`.tools/fingerprint.mjs\` 量不动参照副本：${toolBefore.problems.join('；')}`)
        else if (toolBefore.sha256 !== dirBefore.sha256) {
          push('DEVICE-MISMATCH', `同一个参照副本，两台尺子对不上：我算 ${dirBefore.sha256.slice(0, 12)}…（${dirBefore.files} 份）/ 工具算 ${toolBefore.sha256.slice(0, 12)}…（${toolBefore.files} 份）—— 谁给的"没变"都不算读数`)
        }
        if (commitA.ok && dirBefore.sha256 !== commitA.sha256) push('COPY-CODE-DIGEST-MISMATCH', `参照副本的 CODE 指纹 ${dirBefore.sha256.slice(0, 12)}… ≠ 提交从 git 对象算出来的 ${commitA.sha256.slice(0, 12)}…`)

        // ── B COPY-TOUCHED：只动副本；活树这一侧不许动 ────────────────────────
        const sceneBaseline = path.join(fx.dir, 'live-before.json')
        const saved = saveCodeBaseline(fx.repo, sceneBaseline)
        rec.readings.scene = { baseline: saved.ok ? saved.sha256 : null, problems: saved.problems }
        if (!saved.ok) {
          push('LIVE-BASELINE-SHAPE', `活树基线存不下来（${saved.problems.join('；')}）—— "活树这一侧是干净的"这句话没有读数`)
        } else {
          writeFileSync(path.join(refOut, COPY_TOUCHED), "export const BETA = 'b1-edited-inside-the-copy-by-the-reviewer'\n", 'utf8')
          const dirAfter = codeDigestOfDir(refOut)
          const toolAfter = fingerprintTool(refOut)
          const copyChanged = codeListDiff(dirBefore.list, dirAfter.list)
          const liveCmp = fingerprintCompare(fx.repo, sceneBaseline)
          rec.readings.copy_touched = {
            file: COPY_TOUCHED,
            before: dirBefore.sha256, after: dirAfter.sha256, equal: dirBefore.sha256 === dirAfter.sha256,
            changed: copyChanged.map((d) => `${d.rel}(${d.kind})`), tool_after: toolAfter.ok ? toolAfter.sha256 : null,
          }
          rec.readings.live_clean = { ok: liveCmp.ok, equal: liveCmp.equal, changed: liveCmp.changed.length, problems: liveCmp.problems }
          if (dirBefore.sha256 === dirAfter.sha256) {
            push('COPY-TAMPER-NOT-DETECTED', `把副本里的 \`${COPY_TOUCHED}\` 改了一个字节，副本的 CODE 指纹居然没变（${dirBefore.sha256.slice(0, 12)}…）—— 这把尺子看不见副本被动过，"评审不许动副本"就没有判据`)
          } else if (copyChanged.length !== 1 || copyChanged[0].rel !== COPY_TOUCHED) {
            push('COPY-TAMPER-CHANGED-WRONG', `副本里只动了 \`${COPY_TOUCHED}\`，\`changed[]\` 应当恰好是它，实得 ${copyChanged.length} 处：${copyChanged.map((d) => `${d.rel}(${d.kind})`).join(' · ')}`)
          }
          if (toolBefore.ok && toolAfter.ok && toolBefore.sha256 === toolAfter.sha256) {
            push('COPY-TAMPER-NOT-DETECTED', `\`.tools/fingerprint.mjs\` 在改了副本之后读数没变（${toolBefore.sha256.slice(0, 12)}…）—— 工具那一侧看不见副本被动过`)
          }
          if (!liveCmp.ok) push('LIVE-BASELINE-SHAPE', `活树基线比不了：${liveCmp.problems.join('；')}`)
          else if (liveCmp.equal !== true) {
            push('LIVE-MOVED-WHEN-IT-SHOULD-NOT', `这一格**只**动副本，可活树的 CODE 指纹翻了面（${liveCmp.changed.length} 处：${liveCmp.changed.map((c) => c.rel).join(' · ')}）—— 现场被弄脏了，"作废只能来自副本"这句话就没有证据`)
          }
        }
      }

      // ══ C EXPORT + D WRONG-COMMIT：被测的那条路（新鲜夹具）════════════════════
      const fxTool = buildFixtureRepo(root, 'rev05-tool')
      rec.readings.fixture_tool = { repo: fxTool.repo, pinned_commit: fxTool.commitA, second_commit: fxTool.commitB }
      const ex = exporterPath()
      rec.readings.exporter = { file: ex.file, exists: ex.exists, source: ex.source }
      if (!ex.exists) {
        push('EXPORTER-MISSING', `导出器不在：${ex.file}（来源 ${ex.source}）—— 没有副本就没有"评审只能读、不能写"这一侧可判（落地后用 AGENIA_TREE_AT_COMMIT 也能指过来）`)
      } else {
        const out = path.join(fxTool.dir, `tree-at-${fxTool.commitA.slice(0, 8)}`)
        const baselineFile = path.join(fxTool.dir, 'live-before.json')
        const exp = runExport({ exporter: ex.file, repo: fxTool.repo, commit: fxTool.commitA, out, liveBaseline: baselineFile })
        rec.readings.export = { exit: exp.exit, json: exp.json, json_error: exp.json_error, stderr: exp.stderr.slice(0, 600) }
        let cardBefore = null
        if (exp.exit !== 0 || exp.json === null) {
          push('EXPORT-FAILED', `导出失败：exit=${exp.exit}${exp.json_error === null ? '' : ` · ${exp.json_error}`}${exp.stderr.trim() === '' ? '' : ` · stderr：${exp.stderr.trim().slice(0, 300)}`}`)
        } else if (!existsSync(out)) {
          push('EXPORT-NO-COPY', `导出器说成功，但 \`--out\` 那个目录不在：${out}`)
        } else {
          const j = exp.json
          cardBefore = typeof j.code?.sha256 === 'string' ? j.code.sha256.toLowerCase() : null
          if (cardBefore === null) push('EXPORT-JSON-SHAPE', `导出的读数里没有 \`code.sha256\`（派工卡的 before_sha256 就是它），实得 ${JSON.stringify(j.code)?.slice(0, 120)}`)
          const cv = verifyCopyIsCommit({ repo: fxTool.repo, commit: fxTool.commitA, copyRoot: out })
          rec.readings.export.copy_identity = { ok: cv.ok, files: cv.actual.length, problems: cv.problems.slice(0, 6) }
          if (!cv.ok) push('COPY-NOT-THAT-COMMIT', `副本不是提交 ${fxTool.commitA.slice(0, 12)}…：${cv.problems.slice(0, 6).join('；')}`)
          const toolDigest = codeDigestOfCommit(fxTool.repo, fxTool.commitA)
          if (cardBefore !== null && toolDigest.ok && cardBefore !== toolDigest.sha256) {
            push('CARD-BEFORE-MISMATCH', `导出的 \`code.sha256\` ${cardBefore.slice(0, 12)}… ≠ 从 git 对象独立算出来的 ${toolDigest.sha256.slice(0, 12)}…`)
          }
          // 评审在窗口里动副本
          writeFileSync(path.join(out, COPY_TOUCHED), "export const BETA = 'b1-edited-inside-the-copy-by-the-reviewer'\n", 'utf8')
          const dirAfter = codeDigestOfDir(out)
          const ver = runVerify({ exporter: ex.file, copy: out, repo: fxTool.repo, commit: fxTool.commitA, expect: cardBefore ?? '', liveBaseline: existsSync(baselineFile) ? baselineFile : null, liveRoot: fxTool.repo })
          rec.readings.verify = { exit: ver.exit, json: ver.json, json_error: ver.json_error, stderr: ver.stderr.slice(0, 600) }
          if (ver.json === null) {
            push('VERIFY-FAILED', `校验没给出 JSON：exit=${ver.exit}${ver.json_error === null ? '' : ` · ${ver.json_error}`}${ver.stderr.trim() === '' ? '' : ` · stderr：${ver.stderr.trim().slice(0, 300)}`}`)
          } else {
            const v = ver.json
            const vmiss = missingFields(v, VERIFY_FIELDS)
            if (vmiss.length > 0) push('VERIFY-JSON-SHAPE', `校验的 JSON 缺字段：${vmiss.join(' · ')}（契约 §3：${VERIFY_FIELDS.join(' / ')}）`)
            if (v.equal === true) {
              push('COPY-TAMPER-NOT-DETECTED', `副本里的 \`${COPY_TOUCHED}\` 被改过，校验却报 \`equal:true\` —— 它读的是**卡上的值**（${String(cardBefore).slice(0, 12)}…），不是副本现在的字节（${dirAfter.sha256.slice(0, 12)}…）。校验方必须自己复算`)
            } else if (v.equal !== false) {
              push('VERIFY-JSON-SHAPE', `\`equal\` 必须是布尔，实得 ${JSON.stringify(v.equal)}`)
            }
            const itc = v.is_that_commit
            const itcText = JSON.stringify(itc ?? null) ?? ''
            if (itc === null || typeof itc !== 'object') {
              push('VERIFY-JSON-SHAPE', `\`is_that_commit\` 必须是对象（判"副本是不是那个提交"那一腿），实得 ${itcText.slice(0, 160)}`)
            } else {
              if (itc.ok === true) push('COPY-TAMPER-NOT-DETECTED', `副本已经被改过，\`is_that_commit.ok\` 仍然是 true —— "副本就是那个提交"这一腿没有逐份核 blob（只比了一个总数？）`)
              if (!itcText.includes(COPY_TOUCHED)) {
                push('COPY-MISMATCH-UNNAMED', `作废是判出来了，但 \`is_that_commit\` 里没有点名是哪一份文件（\`${COPY_TOUCHED}\`）—— 读的人只知道"作废了"，不知道"谁动了哪里"：${itcText.slice(0, 300)}`)
              }
            }
            const moved = v.live?.moved ?? v.live?.count ?? null
            rec.readings.verify.live = { moved, detail: v.live?.detail ?? v.live?.note ?? null }
            if (moved !== null && moved !== 0) {
              push('LIVE-COUNT-WRONG', `这一格活树一个字节都没动，校验报的 \`live.moved\` 却是 ${JSON.stringify(moved)} —— 变动数必须按活树基线算`)
            }
          }

          // ── D WRONG-COMMIT：干净的副本 + 另一个提交 ⇒ 两条腿必须分开报 ────
          const out2 = path.join(fxTool.dir, `pristine-tree-at-${fxTool.commitA.slice(0, 8)}`)
          const exp2 = runExport({ exporter: ex.file, repo: fxTool.repo, commit: fxTool.commitA, out: out2 })
          rec.readings.wrong_commit = { export_exit: exp2.exit, json_error: exp2.json_error }
          if (exp2.exit !== 0 || exp2.json === null) {
            push('EXPORT-FAILED', `为"拿错提交去核"那一格再导一次失败：exit=${exp2.exit}${exp2.stderr.trim() === '' ? '' : ` · stderr：${exp2.stderr.trim().slice(0, 300)}`}`)
          } else {
            const pristine = fingerprintTool(out2)
            const pristineCard = typeof exp2.json.code?.sha256 === 'string' ? exp2.json.code.sha256.toLowerCase() : ''
            rec.readings.wrong_commit.pristine_equal_to_card = pristine.ok && pristineCard !== '' ? pristine.sha256 === pristineCard : null
            const verB = runVerify({ exporter: ex.file, copy: out2, repo: fxTool.repo, commit: fxTool.commitB, expect: pristineCard, liveBaseline: null, liveRoot: fxTool.repo })
            rec.readings.wrong_commit.verify = { exit: verB.exit, json: verB.json, json_error: verB.json_error, stderr: verB.stderr.slice(0, 400) }
            const vb = verB.json
            if (vb === null) {
              push('VERIFY-FAILED', `拿提交 B 去核一份提交 A 的副本时校验没给出 JSON：exit=${verB.exit}${verB.json_error === null ? '' : ` · ${verB.json_error}`}`)
            } else {
              if (vb.equal !== true) {
                push('WRONG-COMMIT-CONFUSED', `副本是干净的提交 A、卡片上的 before 也是 A 的值，\`equal\` 必须 true（"副本没动"），实得 ${JSON.stringify(vb.equal)} —— 把"拿错提交"与"副本被动过"混成一个结论，读的人分不出该找谁`)
              }
              if (vb.is_that_commit?.ok !== false) {
                push('WRONG-COMMIT-NOT-CAUGHT', `副本是提交 ${fxTool.commitA.slice(0, 12)}… 的树，却拿提交 ${fxTool.commitB.slice(0, 12)}… 去核，\`is_that_commit.ok\` 却是 ${JSON.stringify(vb.is_that_commit?.ok ?? null)} —— 这一腿没有真的读"提交"（只比哈希 ⇒ 一个目录就能冒充）`)
              }
            }
          }
        }
      }

      caseFail(problems)
    })
  })
})
