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
		const css = ".DASHB1_root{position:relative}.DASHB1_trigger{min-height:28px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:0;border-radius:6px;align-items:center;gap:5px;padding:3px 7px;font-size:12px;display:inline-flex}.DASHB1_trigger:hover,.DASHB1_trigger:focus-visible{color:var(--dsw-alias-label-primary)}@container (width<=480px){.DASHB1_triggerLabel{display:none}}.DASHB1_count{color:var(--dsw-alias-label-caption);font-variant-numeric:tabular-nums;font-size:12px;font-weight:400;line-height:16px}.DASHB1_panel{--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);z-index:100;box-sizing:border-box;--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);width:min(500px,100vw - 32px);max-height:min(680px,100vh - 32px);box-shadow:var(--dsw-elevation-prominent);border:0;border-radius:12px;flex-direction:column;padding:8px 2px 0;display:flex;position:fixed;overflow:hidden}.DASHB1_panel:before{content:\"\";z-index:-1;background:var(--dsw-specific-menu);backdrop-filter:var(--dsw-menu-backdrop-filter);border-radius:12px;position:absolute;inset:0}.DASHB1_body{--dsh-scrollbar-track-margin:8px;scrollbar-gutter:stable;flex:auto;min-height:0;padding:0 9px 16px 14px;overflow-y:auto}.DASHB1_error{color:var(--dsw-alias-label-error);align-items:center;gap:6px;margin:8px 0;font-size:12px;display:flex}.DASHB1_notice{color:var(--dsw-alias-label-tertiary);align-items:center;gap:6px;margin:8px 0;font-size:12px;display:flex}.DASHB1_panel h3{color:var(--dsw-alias-label-primary);align-items:center;gap:8px;margin:16px 0 8px 4px;font-size:13px;font-weight:500;display:flex}.DASHB1_body section:first-of-type h3{margin-top:8px}.DASHB1_tasks{flex-direction:column;gap:7px;display:flex}.DASHB1_task{--dsw-elevation-stroke-color:var(--dsw-alias-border-l2);box-shadow:var(--dsw-elevation-stroke);background:var(--dsw-alias-bg-layer-2);border-radius:9px;padding:11px 13px}.DASHB1_taskTitle{align-items:center;gap:8px;display:flex}.DASHB1_taskTitle strong{font-size:13px;font-weight:500}.DASHB1_taskState{color:var(--dsw-alias-label-caption);align-items:center;gap:4px;font-size:11px;display:inline-flex}.DASHB1_clampedDescription{color:var(--dsw-alias-label-secondary);-webkit-line-clamp:2;-webkit-box-orient:vertical;margin:6px 0 0;font-size:12px;display:-webkit-box;overflow:hidden}.DASHB1_meta{color:var(--dsw-alias-label-caption);flex-wrap:wrap;align-items:center;gap:8px;margin-top:8px;font-size:11px;line-height:20px;display:flex}.DASHB1_emptyNotice{color:var(--dsw-alias-label-tertiary);margin:0 0 0 4px;font-size:12px}.DASHB1_roster{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;display:grid}.DASHB1_member{--dsw-elevation-stroke-color:var(--dsw-alias-border-l2);min-width:0;box-shadow:var(--dsw-elevation-stroke);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);text-align:left;cursor:pointer;border:0;border-radius:8px;align-items:flex-start;gap:8px;padding:10px 12px;display:flex;flex-direction:column}.DASHB1_member:disabled{cursor:default}.DASHB1_memberDot{flex:none;align-items:center;height:1lh;display:inline-flex}.DASHB1_memberName{color:var(--dsw-alias-label-primary);align-items:center;gap:6px;font-size:12px;font-weight:500;display:flex}.DASHB1_memberText{color:var(--dsw-alias-label-caption);font-variant-numeric:tabular-nums;font-size:11px;line-height:20px}.DASHB1_expandToggle{float:right;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:0;align-items:center;gap:2px;margin-left:10px;padding:0;font-size:11px;line-height:20px;display:inline-flex}.DASHB1_expandToggle:hover,.DASHB1_expandToggle:focus-visible{color:var(--dsw-alias-label-primary)}.DASHB1_expandToggle svg{transition:transform .12s}.DASHB1_expandToggleOpen{transform:rotate(180deg)}";
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
			"expandToggle": "DASHB1_expandToggle",
			"expandToggleOpen": "DASHB1_expandToggleOpen",
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
		 *
		 * 说明段照抄官方 `TaskCard`（官方 L146-195）：两行截断 + **真的量溢出**（`scrollHeight >
		 * clientHeight + 1`，`ResizeObserver` 跟着尺寸变），溢出才在 `div.meta` 里出 `button.expandToggle`
		 * （展开/收起，箭头 `.expandToggleOpen` 转 180°）。没有这条测量，"截断两行"就没有展开路径。
		 */
		function TaskRow({ task, t }) {
			const [expanded, setExpanded] = (0, react.useState)(false);
			const [clamped, setClamped] = (0, react.useState)(false);
			const textRef = (0, react.useRef)(null);
			(0, react.useLayoutEffect)(() => {
				if (expanded) return;
				const paragraph = textRef.current;
				if (paragraph === null) return;
				const measure = () => {
					setClamped(paragraph.scrollHeight > paragraph.clientHeight + 1);
				};
				measure();
				if (typeof ResizeObserver === "undefined") return;
				const observer = new ResizeObserver(measure);
				observer.observe(paragraph);
				return () => {
					observer.disconnect();
				};
			}, [task.note, expanded]);
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
						ref: textRef,
						className: expanded ? void 0 : Dashboard_module_css_default.clampedDescription,
						children: task.note
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						className: Dashboard_module_css_default.meta,
						children: [(clamped || expanded) && (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							className: Dashboard_module_css_default.expandToggle,
							"aria-expanded": expanded,
							onClick: () => {
								setExpanded((current) => !current);
							},
							children: [t(expanded ? "collapse" : "expand"), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutlineRegular, {
								size: 12,
								className: expanded ? Dashboard_module_css_default.expandToggleOpen : void 0
							})]
						}), (0, react_jsx_runtime.jsx)("span", { children: task.taskId })]
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
		 * 视图模型版本号的**渲染层那一半**：与 `lib/dashboard.mjs::DASHBOARD_SCHEMA` 同号。
		 * 浏览器模块 import 不了 Node 那一份，所以两半各持一份；形状一改两边同批改。
		 * 对不上就画错误条、**不硬画**（否则旧客户端会对着新视图静默画错）。
		 */
		const VIEW_SCHEMA = 1;
		/**
		 * 看板面板，自上而下：第一行 = 目标 · 当前大阶段（`view.header.text`）· 主行一行 · 欠账三格 ·
		 * **最下面一行 `读数日 <day>`**。日期**不许**跑到第一行上面去 —— 定形 §六.3 / GUI 清单 #3
		 * 要求"面板里最上面那一行字"是 headline（第 4 关 R2-1 就是这两行抢位置）。
		 *
		 * 🔴 这里**不读盘、不算账**：视图由 Node 侧算好写成一份快照（`dashboard.mjs`），
		 * 本组件只经 `ctx.remote.workspaceFiles.read` 把那一份快照读进来画。
		 *
		 * 🔴 **定位**照抄官方（官方 L230-236 + L327-331）：`useAnchoredPosition` 拿触发器的
		 * `getBoundingClientRect()` 算 `{left, top}`（`gap:5` / `margin:16`，越界夹回视口内），
		 * 结果塞进面板的 `style`；**还没算出来**（`null`）⇒ 兜底是**可见**的安全位置
		 * （`position:fixed; left:16; top:64`），下一帧再挪到位 ——
		 * 🔴 **不许**用 `visibility:hidden` 兜底：面板是 portal 到 `<body>` 末尾的，隐藏着等定位
		 * 在实测里表现为"挂上了、永远看不见"。没有兜底的那一帧会落在页面末尾，但那样看得见。
		 */
		function DashboardAction({ sessionId, t, readSnapshot }) {
			const [open, setOpen] = (0, react.useState)(false);
			const [view, setView] = (0, react.useState)(null);
			const [failure, setFailure] = (0, react.useState)(null);
			/** 这个工作区还没有快照（`workspace-file/not-found`）—— 一条状态，不是故障；值是它找的那个路径。 */
			const [absent, setAbsent] = (0, react.useState)(null);
			const rootRef = (0, react.useRef)(null);
			const triggerRef = (0, react.useRef)(null);
			const panelRef = (0, react.useRef)(null);
			const position = _deepseek_ai_dsh_client_ui_primitives.useAnchoredPosition({
				open,
				anchorRef: triggerRef,
				panelRef,
				gap: 5,
				margin: 16
			});
			const readable = view !== null && view.schema === VIEW_SCHEMA;
			(0, react.useEffect)(() => {
				if (!open) return;
				setFailure(null);
				setAbsent(null);
				readSnapshot(sessionId).then((result) => {
					if (result && typeof result.absent === "string") {
						setAbsent(result.absent);
						return;
					}
					setView(JSON.parse(result.text));
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
					ref: triggerRef,
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
					// 🔴 2026-11-06：定位还没算出来时**不许** `visibility:hidden` —— 那一刻面板是挂上的、只是看不见，
					//    读的人会以为"点一下什么都没发生"。改成落到视口左上角附近的一个安全位置（可见），
					//    下一帧定位算出来会把它挪到位。宁可偏一点，也不许整块看不见。
					style: position ?? {
						position: "fixed",
						left: 16,
						top: 64,
						visibility: "visible"
					},
					role: "dialog",
					tabIndex: -1,
					"aria-label": t("trigger"),
					"data-dashboard-panel": true,
					children: [(0, react_jsx_runtime.jsxs)("div", {
						className: Dashboard_module_css_default.body,
						children: [view === null && failure === null && absent === null && (0, react_jsx_runtime.jsxs)("div", {
							// 官方 E06 那一格（`div.notice[role=status]`）只装**读盘状态**：只有"读的中途"这一行；
							// 读完了（成功或失败）它就什么也不画 —— 空分支 = 没有提示。日期不在这一格。
							className: Dashboard_module_css_default.notice,
							role: "status",
							children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: "ongoing" }), t("loading")]
						}), absent !== null && (0, react_jsx_runtime.jsxs)("div", {
							// 「这个工作区还没有快照」= 一条状态：灰点 + 一句人话 + 找的是哪个路径。
							// 它不是故障，不许用 `role=alert`，也不许把远端错误对象整段倒出来。
							className: Dashboard_module_css_default.notice,
							role: "status",
							"data-dashboard-absent": true,
							children: (0, react_jsx_runtime.jsxs)("span", {
								children: [t("absent"), " ", (0, react_jsx_runtime.jsx)("code", {
									children: absent
								})]
							})
						}), failure !== null && (0, react_jsx_runtime.jsxs)("div", {
							className: Dashboard_module_css_default.error,
							role: "alert",
							children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: "error" }), failure]
						}), view !== null && !readable && (0, react_jsx_runtime.jsxs)("div", {
							className: Dashboard_module_css_default.error,
							role: "alert",
							children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: "error" }), `视图版本不认识（schema ${String(view.schema)}）；这一版客户端只认 ${VIEW_SCHEMA} —— 数据层与渲染层要同批改`]
						}), readable && view.alerts.length > 0 && (0, react_jsx_runtime.jsx)("div", {
							className: Dashboard_module_css_default.error,
							role: "alert",
							children: view.alerts.map((alert) => (0, react_jsx_runtime.jsx)("span", { children: alert.message }, alert.code))
						}), readable && (0, react_jsx_runtime.jsxs)("section", {
							children: [(0, react_jsx_runtime.jsxs)("h3", { children: [view.header.text, view.badge !== null && (0, react_jsx_runtime.jsx)("span", {
								className: Dashboard_module_css_default.count,
								children: view.badge.word
							})] }), (0, react_jsx_runtime.jsx)("div", {
								className: Dashboard_module_css_default.tasks,
								children: view.main !== null ? (0, react_jsx_runtime.jsx)(TaskRow, { task: view.main, t }) : (0, react_jsx_runtime.jsx)("p", {
									className: Dashboard_module_css_default.emptyNotice,
									children: view.emptyNotice
								})
							})]
						}), readable && (0, react_jsx_runtime.jsxs)("section", {
							children: [(0, react_jsx_runtime.jsx)("h3", { children: t("debts") }), (0, react_jsx_runtime.jsx)("div", {
								className: Dashboard_module_css_default.roster,
								children: view.debts.map((debt) => (0, react_jsx_runtime.jsx)(DebtCell, { debt }, debt.key))
							})]
						}),
						// 读数日 <day>：面板**最下面**那一行（欠账网格之下）。它是"这堆数字是哪一天"的唯一载体，
						// 所以必须看得见；但**不许**跑到第一行上面 —— 那一行是 headline（定形 §六.3 / GUI 清单 #3，
						// 第 4 关 R2-1）。类名沿用官方 E06 那一格（`notice`：tertiary / 12px = 小、灰），位置在末尾。
						readable && (0, react_jsx_runtime.jsxs)("div", {
							className: Dashboard_module_css_default.notice,
							role: "status",
							children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: "ongoing" }), `读数日 ${view.day ?? "未知"}`]
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
			absent: "这个工作区还没有看板快照（账本还没在这儿跑过），找的是",
			debts: "欠着的东西",
			expand: "展开",
			collapse: "收起"
		};
		const en = {
			trigger: "Dashboard",
			loading: "Reading the ledger…",
			unavailable: "Ledger unavailable",
			absent: "This workspace has no dashboard snapshot yet (the ledger has never run here); looked for",
			debts: "Outstanding",
			expand: "Show more",
			collapse: "Show less"
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
			// 🔴 2026-11-06：**父级键也要写**。只写 `remote.workspaceFiles` 会报
			//    `cannot get property 'remote' without inject` —— 拿不到 `ctx.remote`，那一步就抛，
			//    面板读不到快照（症状：按钮在、点开什么都没有）。官方 `dsh-client-ui-sidebar-files` 也是父子都写。
			"remote",
			"remote.workspaceFiles"
		];
		/**
		 * 从 `remote.workspaceFiles.read` 的返回值里**取出正文**。
		 *
		 * 🔴 为什么要这一层：2026-11-06 实测，点开面板报 `"undefined" is not valid JSON`
		 * —— 说明拿到的**不是** `WorkspaceFileText`（或它被包了一层），`page.text` 是 `undefined`。
		 * 我们看不到浏览器的返回值，所以这里**先认几种可能的形状，认不出就把实际形状说出来** ——
		 * 面板那条红条就是量具：它必须告诉我们"拿到的是个什么东西"，而不是只说"JSON 坏了"。
		 */
		function pickPageText(page) {
			if (typeof page === "string") return page;
			const shapes = [
				page,
				page && page.value,
				page && page.result
			];
			for (const shape of shapes) {
				if (shape && typeof shape.text === "string") return shape.text;
				if (shape && Array.isArray(shape.chunks)) return shape.chunks.join("\n");
			}
			throw new Error(`读回来的东西里没有正文（${describeShape(page)}）`);
		}
		/** 把"拿到的是个什么东西"说人话：类型 + 顶层键 + 一段短预览。 */
		function describeShape(value) {
			if (value === undefined) return "undefined";
			if (value === null) return "null";
			const type = typeof value;
			if (type !== "object") return previewOf(type, value);
			const keys = Object.keys(value);
			let preview = "";
			try {
				preview = JSON.stringify(value).slice(0, 160);
			} catch {
				preview = String(value).slice(0, 160);
			}
			return `object · 键=[${keys.join(", ")}] · 预览=${preview}`;
		}
		function previewOf(type, value) {
			return `${type} · 值=${String(value).slice(0, 120)}`;
		}
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
				// 🔴 2026-11-06：读盘这一步**不许把组件带崩**。浏览器侧抛一个同步错误，React 会把整个槽位拆掉
				//    （实测症状：点一下按钮，按钮自己消失、面板一个字都不留）。所以这里同步/异步都兜住，
				//    失败一律变成一条 rejected promise —— 面板会画一条红条，按钮留着。
				try {
					const svc = ctx.remote && ctx.remote.workspaceFiles;
					if (!svc || typeof svc.read !== "function") {
						return Promise.reject(new Error("remote.workspaceFiles 不可用（浏览器侧没有这个服务）"));
					}
					return Promise.resolve(svc.read(sessionId, SNAPSHOT_PATH, { offset: 1, limit: 200 })).then(pickPageText).then((text) => {
						return {
							text
						};
					}).catch((reason) => {
						// 🔴 2026-11-06：「这个工作区还没有快照」**不是故障**，是一条状态。
						//    实测另一个工作区（RealisticAccessories）点开看板会拿到 `workspace-file/not-found`：
						//    那边的 `.runtime/state/dashboard/view.json` 根本不存在（账本没在那儿跑过）。
						//    这种情况要画一句人话（+ 找的是哪个路径），**不许**画成一条红错。
						const code = reason && (reason.code || (reason.details && reason.details.code));
						const path = reason && reason.details && reason.details.path;
						if (code === "workspace-file/not-found") {
							return {
								absent: path || SNAPSHOT_PATH
							};
						}
						throw reason;
					});
				} catch (err) {
					return Promise.reject(err);
				}
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
