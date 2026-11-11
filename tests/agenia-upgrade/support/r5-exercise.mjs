/**
 * **R5 撤挂载练习回执的落点解析**（`bug-20261110-18`）。
 *
 * 那一半判据（"撤掉挂载、重启之后新建的会话头仍是 `agentPreset: agenia`"）**必须真的做过一次**
 * 才有读数，所以要认一份**练习回执**。回执从哪来，**只有三种来源**，每一种有自己的名字：
 *
 *   · `env`     —— `AGENIA_R5_REMOVAL_EXERCISE=<json 路径>`（显式指路；测试 / 副本 / 一次性演练用）。
 *   · `default` —— **默认落点**（没人记得设变量时也读得到）：
 *                  ① `<workspace>/.team/leader/_r5/receipt.json`（**规范落点**）
 *                  ② `<workspace>/.team/leader/<YYYY-MM-DD>/_r5/receipt.json`（日期抽屉里那份，**新的先看**）
 *                  —— 一条存在的就用它；`readings.checked` 按顺序写出查过哪几条。
 *   · `none`    —— 两处都没有：**这一次练习没做**（⇒ 调用方记 HOLD，报文必须点名 `none`）。
 *
 * 🔴 为什么要有默认落点：老板花两次重启做完的那一次练习，回执就在盘上；只要没人记得设那个 env，
 *    这条腿就退回 HOLD —— 而"做过但没读到"与"根本没做"长得一模一样（`bug-20261110-06/07` 那一族）。
 *    现在 env 仍然**优先**（测试 / 副本要能指到别处），没 env 才走默认落点。
 *
 * 🔴 `MISSING` 不许同时代表"没设变量"和"没做过练习"：
 *    · env 没设 **且** 默认落点没有 ⇒ `source: 'none'`（唯一的 HOLD 来源）；
 *    · 任何一处**有文件但读不出来**（坏 JSON / 不是对象）⇒ `error` 非空 ⇒ 调用方记 **RED**
 *      （回执坏了，不是"练习没做"）。
 *
 * 🔴 纯读（不写盘、不建目录）。读一份不存在的文件只在 `existsSync` 上过一个名字，
 *    目录不建、时间戳不碰 —— 判据的输入不该被它自己的量具改动。
 */
import path from 'node:path'
import { existsSync, readdirSync, readFileSync } from 'node:fs'

/** 规范落点（**相对工作区**；`writeFileSync` 只写这一条，解析器按下面的顺序找）。 */
export const R5_EXERCISE_DEFAULT_REL = '.team/leader/_r5/receipt.json'
/** 日期抽屉里的那一份（`<workspace>/.team/leader/<YYYY-MM-DD>/_r5/receipt.json`）。 */
export const R5_EXERCISE_DATED_REL = '.team/leader/<day>/_r5/receipt.json'
/** 日期抽屉的父目录（扫它下面的 `YYYY-MM-DD`）。 */
export const R5_EXERCISE_DATED_PARENT_REL = '.team/leader'
/** 三种来源的名字（**冻结**：读数与报文里只许出现这三个词）。 */
export const R5_EXERCISE_SOURCES = Object.freeze(['env', 'default', 'none'])
/** env 变量名（给了就优先，测试 / 副本用）。 */
export const R5_EXERCISE_ENV = 'AGENIA_R5_REMOVAL_EXERCISE'

const toAbs = (workspace, rel) => path.join(workspace, ...String(rel).split('/'))

/**
 * 默认落点的**候选清单**（按查找顺序；每条都带 `how` 说明它是哪一种落点）。
 *
 * @param {{workspace?:string}} [options]
 * @returns {Array<{path:string, how:string}>}
 */
export function rollbackExerciseCandidates({ workspace } = {}) {
  if (typeof workspace !== 'string' || workspace.trim() === '') {
    throw new Error('R5 默认落点要从**工作区**算（`workspace` 必填）—— 猜一个 cwd 会读错树')
  }
  const ws = path.resolve(workspace)
  const out = [{ path: toAbs(ws, R5_EXERCISE_DEFAULT_REL), how: 'default' }]
  const parent = toAbs(ws, R5_EXERCISE_DATED_PARENT_REL)
  let days = []
  try {
    if (existsSync(parent)) {
      days = readdirSync(parent)
        .filter((name) => /^\d{4}-\d{2}-\d{2}$/.test(name))
        .sort()
        .reverse() // 新的先看
    }
  } catch {
    days = []
  }
  for (const day of days) {
    out.push({ path: toAbs(ws, `.team/leader/${day}/_r5/receipt.json`), how: `default:${day}` })
  }
  return out
}

/**
 * 读回执：**env 优先，其次默认落点**；两处都没有 ⇒ `source: 'none'`。
 *
 * @param {{env?:object, workspace?:string}} [options]
 * @returns {{supplied:boolean, source:'env'|'default'|'none', path:string|null,
 *            candidates:Array<{path:string, how:string}>, checked:Array<string>,
 *            receipt:object|null, error:string|null}}
 */
export function readRollbackExercise({ env = process.env, workspace } = {}) {
  const raw = typeof env?.[R5_EXERCISE_ENV] === 'string' ? env[R5_EXERCISE_ENV].trim() : ''
  if (raw !== '') {
    const file = path.resolve(raw)
    if (!existsSync(file)) return { supplied: true, source: 'env', path: file, candidates: [], checked: [file], receipt: null, error: `回执文件不在：${file}` }
    return { supplied: true, source: 'env', path: file, candidates: [], checked: [file], ...parseReceipt(file) }
  }
  const candidates = rollbackExerciseCandidates({ workspace })
  const checked = []
  for (const c of candidates) {
    if (!existsSync(c.path)) { checked.push(c.path); continue }
    checked.push(c.path)
    return { supplied: true, source: 'default', path: c.path, candidates, checked, ...parseReceipt(c.path) }
  }
  return { supplied: false, source: 'none', path: null, candidates, checked, receipt: null, error: null }
}

/** 读 + 解析一份回执：坏 JSON / 不是对象 ⇒ `error`（调用方记 RED，不记 HOLD）。 */
function parseReceipt(file) {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { receipt: null, error: `回执不是 JSON 对象（实得 ${Array.isArray(parsed) ? '数组' : typeof parsed}）：${file}` }
    }
    return { receipt: parsed, error: null }
  } catch (err) {
    return { receipt: null, error: `回执不是合法 JSON：${String(err?.message ?? err)}` }
  }
}
