window.__ModuleLoader__.load({
	id: "@agenia/dsh-client-ui-dashboard",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		let react_dom = require("react-dom");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		//#region lib/DashboardAction.module.css.mjs
		// 照抄官方 `client-ui-agent-team/lib/client.js` L12 那条 CSS 的形状与那四个尺寸原值；
		// 唯一按定形 §八.1 改过的格子是 `roster` 的列数（官方 2 列 → 我们 3 列）。
		const css = ".DASHB1_root{position:relative}.DASHB1_trigger{min-height:28px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:0;border-radius:6px;align-items:center;gap:5px;padding:3px 7px;font-size:12px;display:inline-flex}.DASHB1_trigger:hover,.DASHB1_trigger:focus-visible{color:var(--dsw-alias-label-primary)}@container (width<=480px){.DASHB1_triggerLabel{display:none}}.DASHB1_count{color:var(--dsw-alias-label-caption);font-variant-numeric:tabular-nums;font-size:12px;font-weight:400;line-height:16px}.DASHB1_panel{--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);z-index:100;box-sizing:border-box;--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);width:min(500px,100vw - 32px);max-height:min(680px,100vh - 32px);box-shadow:var(--dsw-elevation-prominent);border:0;border-radius:12px;flex-direction:column;padding:8px 2px 0;display:flex;position:fixed;overflow:hidden;background:var(--dsw-specific-menu)}.DASHB1_body{--dsh-scrollbar-track-margin:8px;scrollbar-gutter:stable;flex:auto;min-height:0;padding:0 9px 16px 14px;overflow-y:auto}.DASHB1_error{color:var(--dsw-alias-label-error);align-items:center;gap:6px;margin:8px 0;font-size:12px;display:flex}.DASHB1_notice{color:var(--dsw-alias-label-tertiary);align-items:center;gap:6px;margin:8px 0;font-size:12px;display:flex}.DASHB1_panel h3{color:var(--dsw-alias-label-primary);align-items:center;gap:8px;margin:16px 0 8px 4px;font-size:13px;font-weight:500;display:flex}.DASHB1_body section:first-of-type h3{margin-top:8px}.DASHB1_tasks{flex-direction:column;gap:7px;display:flex}.DASHB1_task{--dsw-elevation-stroke-color:var(--dsw-alias-border-l2);box-shadow:var(--dsw-elevation-stroke);background:var(--dsw-alias-bg-layer-2);border-radius:9px;padding:11px 13px}.DASHB1_taskTitle{align-items:center;gap:8px;display:flex}.DASHB1_taskTitle strong{font-size:13px;font-weight:500}.DASHB1_taskState{color:var(--dsw-alias-label-caption);align-items:center;gap:4px;font-size:11px;display:inline-flex}.DASHB1_clampedDescription{color:var(--dsw-alias-label-secondary);-webkit-line-clamp:2;-webkit-box-orient:vertical;margin:6px 0 0;font-size:12px;display:-webkit-box;overflow:hidden}.DASHB1_meta{color:var(--dsw-alias-label-caption);flex-wrap:wrap;align-items:center;gap:8px;margin-top:8px;font-size:11px;line-height:20px;display:flex}.DASHB1_emptyNotice{color:var(--dsw-alias-label-tertiary);margin:0 0 0 4px;font-size:12px}.DASHB1_roster{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;display:grid}.DASHB1_member{--dsw-elevation-stroke-color:var(--dsw-alias-border-l2);min-width:0;box-shadow:var(--dsw-elevation-stroke);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);text-align:left;border:0;border-radius:9px;flex-direction:column;gap:2px;padding:9px 11px;display:flex}.DASHB1_memberDot{align-items:center;display:inline-flex}.DASHB1_memberName{color:var(--dsw-alias-label-primary);align-items:center;gap:6px;font-size:12px;font-weight:500;display:flex}.DASHB1_memberText{color:var(--dsw-alias-label-caption);font-variant-numeric:tabular-nums;font-size:11px;line-height:20px}";
		const tagId = "@agenia/dsh-client-ui-dashboard/DashboardAction.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@agenia/dsh-client-ui-dashboard";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var Dashboard_module_css_default = {
			"body": "DASHB1_body",
			"clampedDescription": "DASHB1_clampedDescription",
			"count": "DASHB1_count",
			"emptyNotice": "DASHB1_emptyNotice",
			"error": "DASHB1_error",
			"member": "DASHB1_member",
			"memberDot": "DASHB1_memberDot",
			"memberName": "DASHB1_memberName",
			"memberText": "DASHB1_memberText",
			"meta": "DASHB1_meta",
			"notice": "DASHB1_notice",
			"panel": "DASHB1_panel",
			"root": "DASHB1_root",
			"roster": "DASHB1_roster",
			"task": "DASHB1_task",
			"taskState": "DASHB1_taskState",
			"taskTitle": "DASHB1_taskTitle",
			"tasks": "DASHB1_tasks",
			"trigger": "DASHB1_trigger",
			"triggerLabel": "DASHB1_triggerLabel"
		};
		//#endregion
		//#region lib/types/client/DashboardAction.js
		/** 欠账那一格的状态点：`done` / `warning` / `error` 三值，颜色由 primitives 的 token 决定。 */
		function debtDotState(debt) {
			return debt.state === "done" ? "done" : debt.state === "warning" ? "ongoing" : "error";
		}
		/**
		 * 主行（E24/E25）：标题与五关**同一个 flex 行**（`div.taskTitle`）——
		 * 定形 R4 的"一行"就落在这里，拆成两块就是两行。
		 */
		function TaskRow({ task }) {
			return (0, react_jsx_runtime.jsxs)("article", {
				className: Dashboard_module_css_default.task,
				children: [
					(0, react_jsx_runtime.jsxs)("div", {
						className: Dashboard_module_css_default.taskTitle,
						children: [(0, react_jsx_runtime.jsx)("strong", { children: task.title }), (0, react_jsx_runtime.jsxs)("span", {
							className: Dashboard_module_css_default.taskState,
							children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: "ongoing" }), (0, react_jsx_runtime.jsx)("span", { children: task.gate })]
						})]
					}),
					task.note !== null && (0, react_jsx_runtime.jsx)("p", {
						className: Dashboard_module_css_default.clampedDescription,
						children: task.note
					}),
					(0, react_jsx_runtime.jsx)("div", {
						className: Dashboard_module_css_default.meta,
						children: (0, react_jsx_runtime.jsx)("span", { children: task.taskId })
					})
				]
			});
		}
		/** 欠账一格（E11–E15）：状态点 + 格名 + 数字行；**0 也照画**（R5：没有就写 0）。 */
		function DebtCell({ debt }) {
			return (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				disabled: true,
				className: Dashboard_module_css_default.member,
				children: [(0, react_jsx_runtime.jsxs)("span", {
					className: Dashboard_module_css_default.memberName,
					children: [(0, react_jsx_runtime.jsx)("span", {
						className: Dashboard_module_css_default.memberDot,
						children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: debtDotState(debt) })
					}), (0, react_jsx_runtime.jsx)("span", { children: debt.label })]
				}), (0, react_jsx_runtime.jsx)("span", {
					className: Dashboard_module_css_default.memberText,
					children: debt.text
				})]
			});
		}
		/**
		 * 看板面板：第一行 = 目标 · 当前大阶段（`view.header.text`）、主行一行、欠账三格。
		 *
		 * 🔴 这里**不读盘、不算账**：视图由 Node 侧算好写成一份快照（`dashboard.mjs`），
		 * 本组件只经 `ctx.remote.workspaceFiles.read` 把那一份快照读进来画。
		 */
		function DashboardAction({ sessionId, t, readSnapshot }) {
			const [open, setOpen] = (0, react.useState)(false);
			const [view, setView] = (0, react.useState)(null);
			const [failure, setFailure] = (0, react.useState)(null);
			const rootRef = (0, react.useRef)(null);
			const panelRef = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				if (!open) return;
				setFailure(null);
				readSnapshot(sessionId).then((text) => {
					setView(JSON.parse(text));
				}).catch((reason) => {
					setFailure(String(reason && reason.message ? reason.message : reason));
				});
			}, [open, sessionId]);
			(0, react.useEffect)(() => {
				if (!open) return;
				const dismiss = (event) => {
					if (event.key !== "Escape") return;
					event.preventDefault();
					setOpen(false);
				};
				document.addEventListener("keydown", dismiss);
				return () => {
					document.removeEventListener("keydown", dismiss);
				};
			}, [open]);
			return (0, react_jsx_runtime.jsxs)("div", {
				ref: rootRef,
				className: Dashboard_module_css_default.root,
				"data-dashboard-action": true,
				children: [(0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: Dashboard_module_css_default.trigger,
					"aria-label": t("trigger"),
					"aria-haspopup": "dialog",
					"aria-expanded": open,
					onClick: () => {
						setOpen(!open);
					},
					children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconUsersOutlineRegular, { size: 14 }), (0, react_jsx_runtime.jsx)("span", {
						className: Dashboard_module_css_default.triggerLabel,
						children: t("trigger")
					})]
				}), open && (0, react_dom.createPortal)((0, react_jsx_runtime.jsxs)("div", {
					ref: panelRef,
					className: Dashboard_module_css_default.panel,
					role: "dialog",
					tabIndex: -1,
					"aria-label": t("trigger"),
					"data-dashboard-panel": true,
					children: [(0, react_jsx_runtime.jsxs)("div", {
						className: Dashboard_module_css_default.body,
						children: [view === null && (0, react_jsx_runtime.jsxs)("div", {
							className: Dashboard_module_css_default.notice,
							role: "status",
							children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: "ongoing" }), t("loading")]
						}), failure !== null && (0, react_jsx_runtime.jsxs)("div", {
							className: Dashboard_module_css_default.error,
							role: "alert",
							children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: "error" }), failure]
						}), view !== null && view.alerts.length > 0 && (0, react_jsx_runtime.jsx)("div", {
							className: Dashboard_module_css_default.error,
							role: "alert",
							children: view.alerts.map((alert) => (0, react_jsx_runtime.jsx)("span", { children: alert.message }, alert.code))
						}), view !== null && (0, react_jsx_runtime.jsxs)("section", {
							children: [(0, react_jsx_runtime.jsxs)("h3", { children: [view.header.text, view.badge !== null && (0, react_jsx_runtime.jsx)("span", {
								className: Dashboard_module_css_default.count,
								children: view.badge.word
							})] }), (0, react_jsx_runtime.jsx)("div", {
								className: Dashboard_module_css_default.tasks,
								children: view.main !== null ? (0, react_jsx_runtime.jsx)(TaskRow, { task: view.main }) : (0, react_jsx_runtime.jsx)("p", {
									className: Dashboard_module_css_default.emptyNotice,
									children: view.emptyNotice
								})
							})]
						}), view !== null && (0, react_jsx_runtime.jsxs)("section", {
							children: [(0, react_jsx_runtime.jsx)("h3", { children: t("debts") }), (0, react_jsx_runtime.jsx)("div", {
								className: Dashboard_module_css_default.roster,
								children: view.debts.map((debt) => (0, react_jsx_runtime.jsx)(DebtCell, { debt }, debt.key))
							})]
						})]
					})]
				}), document.body)]
			});
		}
		//#endregion
		//#region lib/types/client/locales.js
		/** 看板自己的词典（文案是我们的；键与官方那两个包同形）。 */
		const NS = "dashboard";
		const zh = {
			trigger: "看板",
			loading: "正在读账本…",
			unavailable: "账本暂不可用",
			debts: "欠着的东西"
		};
		const en = {
			trigger: "Dashboard",
			loading: "Reading the ledger…",
			unavailable: "Ledger unavailable",
			debts: "Outstanding"
		};
		//#endregion
		//#region lib/types/client/mount.js
		/** 视图快照在工作区里的相对路径（Node 侧写它；本插件只读它）。 */
		const SNAPSHOT_PATH = "presets/agenia/.runtime/state/dashboard/view.json";
		/** 本插件用到的浏览器服务：槽位 + 词典 + 会话 + 读文件的那条 Remote。 */
		const inject = [
			"sessions",
			"uiWorkspace",
			"slots",
			"locale",
			"remote.workspaceFiles"
		];
		/**
		 * 注册看板：词典 + 会话头部的那个槽位（官方 `agent-team` 的同位）。
		 * 这一层**不读账本** —— 它只把 Node 侧算好的那一份快照读进来。
		 */
		function registerDashboardUi(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "client-ui-dashboard: dictionaries");
			const actions = { readSnapshot(sessionId) {
				return ctx.remote.workspaceFiles.read(sessionId, SNAPSHOT_PATH, { offset: 1, limit: 200 }).then((page) => page.text);
			} };
			ctx.slots.inject("conversation.session.header.actions", () => ctx.slots.register({
				name: "conversation.session.header.actions",
				id: "dashboard",
				order: -19,
				locale: NS,
				inject: () => actions
			}, DashboardAction));
		}
		//#endregion
		//#region lib/types/client/index.js
		function apply(ctx) {
			registerDashboardUi(ctx);
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
