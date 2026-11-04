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
 * @module @agenia/dsh-client-ui-dashboard
 */
import path from 'node:path'
import { DASHBOARD_SNAPSHOT_REL, dashboardSourcePaths, latestUpdateDay, readDashboardSources, writeDashboardSnapshot } from '../../lib/dashboard.mjs'

/** 插件的行名（与 `agent.cordis.yml` 里那一行同名）。 */
export const name = 'agenia-dashboard'

/** 不依赖宿主服务：四份账本都是**文件**，按工作区根直接读。 */
export const inject = []

/** 快照的刷新间隔（毫秒）。看板是"此刻"的读数，15 秒足够跟上一次盘；渲染层每次打开都重读快照。 */
const REFRESH_MS = 15000

/**
 * 重新算一次视图并写快照。
 *
 * `day` 取**最近一天有相位文件**的那一天：跨越本地 04:00 的开工切点、而当天相位文件还没写出来时，
 * 看板显示上一份而不是一片空白（"今天还没写"与"写坏了"是两件事）。
 *
 * @param {{root:string}} args
 * @returns {{ok:boolean, file?:string, bytes?:number, day?:string|null, reason?:string}}
 */
export function refreshSnapshot({ root }) {
  const day = latestUpdateDay(root)
  if (day === null) return { ok: false, reason: '没有任何一天的相位文件（`.runtime/state/update/` 里一份 <day>.json 都没有）' }
  const { input } = readDashboardSources({ ...dashboardSourcePaths(root, day), day })
  const written = writeDashboardSnapshot({ input, outFile: path.join(root, DASHBOARD_SNAPSHOT_REL) })
  return { ok: true, file: written.file, bytes: written.bytes, day }
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
      const result = refreshSnapshot({ root })
      if (!result.ok && ctx.logger !== undefined) ctx.logger.warn(`dashboard: ${result.reason}`)
    }
    tick()
    const timer = setInterval(tick, REFRESH_MS)
    return () => clearInterval(timer)
  }, 'agenia-dashboard: 视图快照（写盘那一侧）')
}
