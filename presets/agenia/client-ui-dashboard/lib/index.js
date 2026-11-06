/**
 * 看板插件的 **Node 侧**（同一个包的另一半）。
 *
 * 它只做一件事：**把视图算出来写成一份快照文件**（`presets/agenia/.runtime/state/dashboard/view.json`），
 * 让浏览器那一半经 `workspaceFiles` 读它。这样「视图怎么到浏览器」就落成一条能指认的路：
 * 数据层读账本 → 本插件写快照 → 渲染层读快照，三处各自只有一件事。
 *
 * 🔴 为什么不是服务端投影 / 自造 RPC：投影要一份宿主侧的 domain 与一份服务注册（官方 `agentTeam`
 * 那条路的全部代价），自造 RPC 要一套 typert 生成物。快照这条路只用**框架已有**的
 * `workspaceFiles`（有界读、只读），不动 `app.asar`，也不新增任何 RPC 面。
 *
 * 🔴 **日身份**：`day` = **今天这一个周期日**，按 `lib/route.mjs::dayKeyOf`（本地 04:00 切点，
 * 全系统唯一一份日函数）算；**不是**"最近一天有相位文件的那一天"—— 后者会把前一天的相位词与
 * 前一天的回执当成今天的显示（04:00 之后、当天的文件还没写出来时尤其危险）。
 * 当天文件不在 ⇒ 徽标 `null`、回执「未知」（契约 §3.4 / §4），那是**正常态**，不是错误。
 *
 * 从外面驱动它：`refreshSnapshot({root, now})`（导出），或 `bin/snapshot.mjs`（CLI）。
 *
 * @module @agenia/dsh-client-ui-dashboard
 */
import path from 'node:path'
import { now as clockNow } from '../../lib/clock.mjs'
import { dayKeyOf } from '../../lib/route.mjs'
import { DASHBOARD_SNAPSHOT_REL, dashboardSourcePaths, readDashboardSources, writeDashboardSnapshot } from '../../lib/dashboard.mjs'

/** 插件的行名（与 `agent.cordis.yml` 里那一行同名）。 */
export const name = 'agenia-dashboard'

/** 不依赖宿主服务：四份账本都是**文件**，按工作区根直接读。 */
export const inject = []

/** 快照的刷新间隔（毫秒）。看板是"此刻"的读数，15 秒足够跟上一次盘；渲染层每次打开都重读快照。 */
const REFRESH_MS = 15000

/**
 * 重新算一次视图并写快照（**原子写**：同目录 `<file>.tmp` → rename，见 `writeDashboardSnapshot`）。
 *
 * @param {{root:string, now?:Date}} args `root` = 工作区根（绝对路径）；`now` = 可选注入时刻
 *   （默认走 `lib/clock.mjs::now()`：`AGENIA_NOW_FILE` 在就按它，不在就真实时钟）
 * @returns {{ok:true, day:string, file:string, bytes:number}}
 */
export function refreshSnapshot({ root, now = clockNow() } = {}) {
  if (typeof root !== 'string' || root === '') throw new Error('refreshSnapshot: 必须给 root（工作区绝对路径）')
  const day = dayKeyOf(now)
  const { input } = readDashboardSources({ ...dashboardSourcePaths(root, day), day })
  // `generated_at` 由**写手**给（`dashboardOf` 不读时钟）：面板据此说"这份读数有多旧"。
  const stamped = { ...input, generated_at: new Date(now).toISOString() }
  const written = writeDashboardSnapshot({ input: stamped, outFile: path.join(root, DASHBOARD_SNAPSHOT_REL) })
  return { ok: true, day, file: written.file, bytes: written.bytes }
}

/**
 * cordis 插件体：起一次、然后按固定间隔重写快照。
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {{root?:string}} [config] `root` = 工作区根（绝对路径；不给就用进程工作目录）
 */
export function apply(ctx, config = {}) {
  const root = typeof config.root === 'string' && config.root !== '' ? config.root : process.cwd()
  ctx.effect(() => {
    const tick = () => {
      try {
        refreshSnapshot({ root })
      } catch (err) {
        // 定时器里的异常会掀掉宿主进程：写盘失败只记一条警告，下一拍再试。
        if (ctx.logger !== undefined) ctx.logger.warn(`dashboard: 写快照失败：${String(err?.message ?? err)}`)
      }
    }
    tick()
    const timer = setInterval(tick, REFRESH_MS)
    return () => clearInterval(timer)
  }, 'agenia-dashboard: 视图快照（写盘那一侧）')
}
