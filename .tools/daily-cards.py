#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""每日两张卡 · 固定生成器（2026-10-17 起）

老板 2026-10-17 的原话：「**为什么造报告的脚本要你现写，这个应该是每天固定的工作啊，
难道你每天都要重新写一个makecards.py吗**」—— 所以这个脚本**每天同一条命令**跑，
**一个数都不许写死**：全部从盘上读。

用法：
    E:\\Anaconda\\python.exe .tools\\daily-cards.py --day 2026-10-17
    E:\\Anaconda\\python.exe .tools\\daily-cards.py            # 不给 --day ⇒ 本地 04:00 切之下的"今天"

读什么（全部只读）：
    <DR>/state/update/<day>.json              这一轮的相位 / 快照 / owner
    <DR>/reports/memory-update/<day>.json     判决报告（分布 · 裁定 · 常识哈希）
    <DR>/proposals/judged.jsonl               这一批的逐条裁定（verdict）
    <DR>/proposals/pool.jsonl                 未判的池子（今天的产出 = 明天那一批）
    <DR>/memory/snapshots/<snap>.json         条目正文 + `totals`（容量**实际占用**）
    <DR>/proposals/archive/MANIFEST.json      最近一次清池归档（有才读）
    <WS>/.team/retro/<day>/*.findings.json    当日技术评审的 findings
    <WS>/.team/retro/<day>/{技术评审,会话评审}.md   两份评审报告在不在（carrier）
    <WS>/.team/route/current.json             路线账本（第一行 / 模式 / 暂停 / 票段）
    <WS>/.team/bug/ledger.json                bug 台账（开放数 / 50-30 / 严重线 / SLA）
    <WS>/.team/state/local/<day>.json         两段回执的节点（技术评审 / 会话评审）
    <WS>/.team/state/identity/<day>.json      身份报警（未知预设 / 预设降级；注入器写）
    <WS>/.team/tickets/legacy.json            legacy 票店（还剩几张 = 迁移没做完）
    <WS>/presets/agenia/lib/memory.mjs        容量参考线（CAP_COUNT / CAP_CHARS）

出什么：
    <WS>/.team/leader/<day>/记忆更新报告-<day>.xlsx     ← 人读四页 + `C2 · 验收格`（40 格机器读面：
                                                        契约 §2.3 的 39 个冻结 key + `capacity.cap_source`）
    <WS>/.team/leader/<day>/技术评审回执-<day>.xlsx     ← 人读一页 + `C2 · 回执格`（6 格机器读面）

🔴 **两个读面与正文必须同值**（契约 C2 §2.2）：正文里出现的每一个数都要等于机器格里那一格 ——
   老板读的是正文，只有机器格对不算对。

🔴 **生成失败不许静默**（契约 C2 §3.8）：退出码非 0 · **没有卡**（绝不绿兜底）·
   往 `<WS>/.team/leader/<day>/记忆更新报告-FAILED.jsonl` **追加**一行 `{at, day, code, message}` ·
   stderr 一行 `🔴 <E_*码>: …`。`at` 取注入时钟那一刻（不是 `datetime.now()`）。
"""
import argparse, json, os, re, sys, glob
from datetime import datetime, date
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, PatternFill
from openpyxl.utils import get_column_letter

# 🔴 输出必须是 UTF-8，**不能**跟控制台的默认码页走：失败那一行是 `🔴 <E_*码>`（契约 C2 §3.8），
#    而 Windows 的 stderr 默认是 GBK ⇒ 那个 emoji 会被写成字面量 `\U0001f534`、中文变成 `????`，
#    于是"会话里一行红"在会话里根本看不见（读的人只看到一串问号）。同 `support/card-xlsx.py` 那一段。
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:  # pragma: no cover - 老 Python / 被替换过的流
        pass

# 必须由 --workspace 给。不许写死：写死会让"我这个工作区"和"别人的工作区"变成同一个字符串，
# 于是另一个会话跑同一个脚本时，卡就落进了别人的抽屉（2026-10-17 实测发生过一次）。
WS = None
DR = None

HDR = Font(bold=True, color="FFFFFF"); HDR_FILL = PatternFill("solid", fgColor="4472C4")
TITLE = Font(bold=True, size=13); NOTE = Font(italic=True, color="808080")
BOLD = Font(bold=True); WRAP = Alignment(wrap_text=True, vertical="top")
RED_TITLE = Font(bold=True, size=13, color="C00000")


# ── 失败落点（契约 C2 §3.8）──────────────────────────────────────────────────
# 生成器唯一能写的"日志"位：append-only 的失败标记。**不许**往 `log.md` 里写（那是别人的档案）。
FAIL_MARKER_NAME = "记忆更新报告-FAILED.jsonl"
_FAIL_CTX = {"day": None, "dir": None}


class CardFailure(Exception):
    """带 `E_*` 码的生成失败。`sys.exit("E_…")` 那条老路只留 stderr，没有失败标记。"""

    def __init__(self, code, message):
        super().__init__("%s: %s" % (code, message))
        self.code = code
        self.message = message


def iso_of(moment):
    """ISO8601 **带本地时区偏移**（`2026-11-02T10:00:00+08:00`）。

    注入时钟给的是带偏移的串 ⇒ 原样留住（`fromisoformat` 的 tzinfo 会把它带出来）；
    没有偏移（真实时钟那一支）⇒ 补上本机偏移。判据要的是"带偏移"这个形状。
    """
    if moment is None:
        return ""
    return moment.isoformat() if moment.tzinfo is not None else moment.astimezone().isoformat()


def report_failure(code, message):
    """失败三件套里生成器能做的两件：追加失败标记 + stderr 一行「🔴」。第三件是退出码（调用方给）。"""
    at_text = ""
    try:
        at_text = iso_of(now_instant())
    except BaseException:
        at_text = ""
    line = json.dumps({"at": at_text, "day": _FAIL_CTX.get("day") or "", "code": code, "message": message}, ensure_ascii=False)
    out_dir = _FAIL_CTX.get("dir")
    if out_dir:
        try:
            os.makedirs(out_dir, exist_ok=True)
            with open(os.path.join(out_dir, FAIL_MARKER_NAME), "a", encoding="utf-8") as f:
                f.write(line + "\n")
        except BaseException:
            # 标记写不进去不许盖住真正的原因 —— 但也不许静默：下面那行 stderr 一定出。
            pass
    sys.stderr.write("🔴 %s: %s\n" % (code, message))
    sys.stderr.flush()


def read_capacity():
    """参考线只认一个真源：`presets/agenia/lib/memory.mjs` 的 `CAP_COUNT` / `CAP_CHARS`。

    🔴 卡片里**不再写死** 200 / 60000 / 80000 —— 写死的那一份会漂（2026-11-02 实测：卡上还是
    60,000，权威常量已是 80,000，虚报 20,000 字符）。读不到就当场停，不许回落到旧值。
    但「哪儿去找这份真源」不能只认工作区那一条路：没有装预设的工作区（例：AdvancedEnemyWeapon
    只有 `src/` `config/` `data/`）会连卡都出不来（`E_CAP_SOURCE`）。照 `route_source_path()` 的
    形状给三级回退：工作区 → 这份生成器自己的树 → cwd；三级都读不到才停。

    返 `(CAP_COUNT, CAP_CHARS, path)`，**`path` 是赢下来那一条候选自己的路径**（三级里第一个
    有文件的那一份）。为什么要把它交出去：同一对数字可以来自三棵内容不同的树（一个没装预设的
    工区读到的是生成器那棵树的值、一个装了旧预设的工区读到的是它自己那棵旧树的值），
    只印两个数、不印路径，读卡的人分不出是哪一份给的 —— 那一格是 `capacity.cap_source`。
    """
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    candidates = []
    if isinstance(WS, str) and WS.strip():
        candidates.append(os.path.join(WS, "presets", "agenia", "lib", "memory.mjs"))
    candidates += [
        os.path.join(here, "presets", "agenia", "lib", "memory.mjs"),
        os.path.join(os.getcwd(), "presets", "agenia", "lib", "memory.mjs"),
    ]
    path = next((candidate for candidate in candidates if os.path.isfile(candidate)), None)
    if path is None:
        raise CardFailure("E_CAP_SOURCE", "读不到 memory.mjs（找过 %s）—— 容量参考线从它解析，不另抄一份" % " · ".join(candidates))
    try:
        text = open(path, encoding="utf-8").read()
    except OSError as exc:
        raise CardFailure("E_CAP_SOURCE", "读不到 %s：%s" % (path, exc))
    m_count = re.search(r"^const CAP_COUNT\s*=\s*(\d+)", text, re.M)
    m_chars = re.search(r"^const CAP_CHARS\s*=\s*([\d_]+)", text, re.M)
    if not (m_count and m_chars):
        raise CardFailure("E_CAP_SOURCE", "%s 里找不到 CAP_COUNT / CAP_CHARS" % path)
    return int(m_count.group(1)), int(m_chars.group(1).replace("_", "")), path

# ── 路线那一侧的两个常量：**解析**，不手抄（`presets/agenia/lib/route.mjs`）──────────
# 为什么解析：`ROUTE_TASK_KINDS`（槽谓词）与 `DAY_CUT_HOURS`（04:00 切）在实现里**已经各有一份**，
# 在这儿再写一遍就是第二份真相；两份飘了不会有人发现 —— 卡不会红，只会读错：
#   · 词表飘了 ⇒ 一个合法的 `implement` / `bug-repair` 在途任务被当成"不占槽"（`slot_not_enforced`
#     与 `stale_slot` 假绿，`slotBusy()` 与卡两套结论）；
#   · 切点飘了 ⇒ 凌晨 0–4 点写下的身份报警落进**另一天**的文件，卡读到"没有报警"。
# 口径与 `read_capacity()` 相同：读不到 / 解析不了 ⇒ 当场停（`E_ROUTE_SOURCE`），**不许**回落到旧值。
_ROUTE_CONSTANTS = None


def route_source_path():
    """`route.mjs` 在哪：先**工作区自己那份**，再这份生成器旁边那份。

    为什么有两个根：真工作区里两处是同一棵树（`--workspace` 就是仓库根）；而合成工作区只挂它
    真正需要的那几份预设文件（夹具只挂 `lib/memory.mjs`），这时读仓库里这一份 —— 与
    `stage-from-preset.mjs` 保证"靶子 = 现役逐字节相同"是同一条事实。
    """
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    candidates = []
    if isinstance(WS, str) and WS.strip():
        candidates.append(os.path.join(WS, "presets", "agenia", "lib", "route.mjs"))
    candidates += [
        os.path.join(here, "presets", "agenia", "lib", "route.mjs"),
        os.path.join(os.getcwd(), "presets", "agenia", "lib", "route.mjs"),
    ]
    for path in candidates:
        if os.path.isfile(path):
            return path
    raise CardFailure("E_ROUTE_SOURCE", "读不到 route.mjs（找过 %s）—— 槽谓词与切点都从它解析，不另抄一份" % " · ".join(candidates))


def route_constants():
    """从 `route.mjs` **解析** `ROUTE_TASK_KINDS` / `DAY_CUT_HOURS`（解析不了 ⇒ 当场停）。

    解析的是**权威那一份**（`presets/agenia/lib/route.mjs`）的两行原文 —— 与 `read_capacity()`
    读 `memory.mjs` 同一个姿势：手抄的副本会分叉，解析的那一份不会。
    """
    global _ROUTE_CONSTANTS
    if _ROUTE_CONSTANTS is not None:
        return _ROUTE_CONSTANTS
    path = route_source_path()
    try:
        text = open(path, encoding="utf-8").read()
    except OSError as exc:
        raise CardFailure("E_ROUTE_SOURCE", "读不到 %s：%s" % (path, exc))
    m_kinds = re.search(r"^export const ROUTE_TASK_KINDS\s*=\s*(?:Object\.freeze\()?\[(.*?)\]", text, re.M | re.S)
    m_cut = re.search(r"^export const DAY_CUT_HOURS\s*=\s*(\d+)", text, re.M)
    if not (m_kinds and m_cut):
        raise CardFailure("E_ROUTE_SOURCE", "%s 里找不到 ROUTE_TASK_KINDS / DAY_CUT_HOURS（写法变了？）" % path)
    kinds = tuple(quoted or double for quoted, double in re.findall(r"'([^']*)'|\"([^\"]*)\"", m_kinds.group(1)))
    if not kinds:
        raise CardFailure("E_ROUTE_SOURCE", "%s 的 ROUTE_TASK_KINDS 解析出来是空的（实得 %r）" % (path, m_kinds.group(1)))
    _ROUTE_CONSTANTS = {"path": path, "task_kinds": kinds, "day_cut_hours": int(m_cut.group(1))}
    return _ROUTE_CONSTANTS


def route_task_kinds():
    """槽谓词认的工作种类 —— 与 `lib/route.mjs::slotBusy()` **同一个元组**（解析来的，不手抄）。"""
    return route_constants()["task_kinds"]


def day_cut_hours():
    """一天的切点（本地小时）—— 与 `lib/route.mjs::dayKeyOf()` 同一个数（解析来的，不手抄）。"""
    return route_constants()["day_cut_hours"]


# ── "今天"是哪一天：本地 04:00 切（契约 CONTRACT.md §13.1 · F-158）────────────
# 一天的边界在**本地 04:00** —— 00:00–03:59 归**前一天**。老板原话（2026-10-24）：
# 「改成从凌晨4点切分，不要在半夜一点我正在干活的时候嚷嚷"新的一天了，得先派记忆更新呀"」。
# 🔴 与 JS 侧同口径、**同一份**注入时钟：切点**只有一个家** = `lib/route.mjs::dayKeyOf`
#    （`DAY_CUT_HOURS` 用 `day_cut_hours()` 从那里解析），时钟是 `lib/clock.mjs` 的
#    `AGENIA_NOW_FILE`（这里读同一个变量，不另造第二套）。
ISO_WITH_OFFSET = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$")
DAY_KEY_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def is_day_key(value):
    """`YYYY-MM-DD` 且**日历上真有这一天** —— 与 `lib/state.mjs::isDayKey` 同一口径（契约 §13.3）。

    只验形状不够：`2026-13-40` / `2026-02-30` 形状全合法、日历上没有那一天，收下它们就会把
    卡落进一个永远不会有人读的抽屉（`<WS>/.team/leader/2026-13-40/`）。日历那一关交给
    `datetime.strptime`：闰年规则不在这里再手写一份。
    """
    if not isinstance(value, str):
        return False
    s = value.strip()
    if not DAY_KEY_RE.match(s):
        return False
    try:
        datetime.strptime(s, "%Y-%m-%d")
    except ValueError:
        return False
    return True

def now_instant():
    """现在几点 —— 与 `lib/clock.mjs::now()` 同一套：没设变量 / 文件不在 ⇒ 真实时钟；在但内容坏 ⇒ 当场停。"""
    raw = os.environ.get("AGENIA_NOW_FILE", "")
    if not raw.strip():
        return datetime.now()
    try:
        with open(raw, encoding="utf-8") as f:
            text = f.read()
    except FileNotFoundError:
        return datetime.now()
    except OSError as e:
        raise CardFailure("E_CLOCK_FILE", "可注入时钟文件读不到：%s（%s）" % (raw, e))
    line = next((s.strip() for s in text.splitlines() if s.strip()), "")
    if not line:
        raise CardFailure("E_CLOCK_FILE", "可注入时钟文件是空的：%s" % raw)
    if not ISO_WITH_OFFSET.match(line):
        raise CardFailure("E_CLOCK_FILE", "可注入时钟文件必须是 ISO8601 带时区偏移的一行，实得 %r" % line[:60])
    try:
        return datetime.fromisoformat(line)
    except ValueError:
        raise CardFailure("E_CLOCK_FILE", "可注入时钟文件里的时间解析不了：%r" % line)

def default_day():
    """`(now − DAY_CUT_HOURS)` 的本地日期 —— 与 `lib/route.mjs::dayKeyOf` 逐字同一口径（形如 YYYY-MM-DD）。

    切点那个数从 `route.mjs` **解析**（`day_cut_hours()`），本文件不再存一份。
    """
    return datetime.fromtimestamp(now_instant().timestamp() - day_cut_hours() * 3600).strftime("%Y-%m-%d")

def jload(p, default=None):
    try:
        with open(p, encoding="utf-8") as f: return json.load(f)
    except Exception: return default

def jlines(p):
    out = []
    try:
        with open(p, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    try: out.append(json.loads(line))
                    except Exception: pass
    except Exception: pass
    return out

def filled(value):
    """非空白的字符串才算"有值" —— 与 JS 侧 `isFilledString` 同一判断。"""
    return isinstance(value, str) and value.strip() != ""

def is_int(value):
    """JSON 里的**整数**（`true`/`false` 在 Python 里也是 `int` 的子类 ⇒ 得单独挡掉）。

    机器格要的是数（契约 §2.3 #25）：`null` / `"73"` / `true` 都是"判不了"，不是 0、也不是 1。
    """
    return isinstance(value, int) and not isinstance(value, bool)

def parse_iso(text):
    """JSON 里的时刻串 → `datetime`；解不动 ⇒ `None`（判不了不是 0）。"""
    if not filled(text):
        return None
    s = text.strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(s)
    except ValueError:
        return None

def local_day_number(moment):
    """一个时刻的**本地日历日号**（只吃年月日）—— 与 `lib/bug-ledger.mjs::calendarDayDiff` 同一口径。"""
    if moment is None:
        return None
    try:
        d = moment.astimezone()
    except Exception:
        d = moment
    return (d.date() - date(1970, 1, 1)).days

def calendar_day_diff(start, end):
    """两个时刻之间的**本地日历天差**（起点那一天 → 终点那一天）。解不动 ⇒ `None`。"""
    a = local_day_number(start)
    b = local_day_number(end)
    return None if (a is None or b is None) else b - a

def head(ws, cols):
    for c in range(1, cols + 1):
        cell = ws.cell(row=ws.max_row, column=c); cell.font = HDR; cell.fill = HDR_FILL

def widths(ws, spec):
    for c, w in spec: ws.column_dimensions[c].width = w

def sheet(ws, title, sub, cols, rows, ws_widths, freeze="A5"):
    ws["A1"] = title; ws["A1"].font = TITLE
    ws["A2"] = sub; ws["A2"].font = NOTE; ws["A2"].alignment = WRAP
    ws.append(()); ws.append(cols); head(ws, len(cols))
    for r in rows: ws.append(r)
    widths(ws, ws_widths); ws.freeze_panes = freeze; ws.auto_filter.ref = ws.dimensions


# ══════════════════════════════════════════════════════════════════════════════════════
# C2 · 机器读面（契约 `.team/test/CONTRACT-C2.md`）
#
# 为什么卡要有机器读面：定形的验收格子一半在 GUI（老板点一次）、一半是**数**。数要么有落点、
# 要么靠人抄 —— 人抄的那一半会漂（`mig-rules-18`：同一个数不许担两个意思）。
# ⇒ 卡的三个区照旧给人看；**同一批值另有一页机器读的单元格**，两边必须同值（§2.2）。
#
# 页名 / key / 十二格 / producer 串 / 红因码 **只在这里出现一次**（与测试侧
# `tests/agenia-upgrade/support/card-surface.mjs` 逐字相同；改名字要同批改两边）。
# ══════════════════════════════════════════════════════════════════════════════════════
C2_SHEET = "C2 · 验收格"          # 卡 1 的机器读页（39 格）
C2_SHEET2 = "C2 · 回执格"         # 卡 2 的机器读页（6 格；第二段回执落在这里）
C2_HEADER = ("格", "值", "来源")

# 卡 2 的卡名（第一张卡叫 `记忆更新报告`，见 CARD1_NAME）
CARD1_NAME = "记忆更新报告"
CARD2_NAME = "技术评审回执"
GENERATOR_NAME = ".tools/daily-cards.py"

# `route.mode` 的四值闭集（C1 §2.2）。`paused` 是**任务状态**，不是模式。
ROUTE_MODES = ("uninitialized", "build", "build-paused", "maintain")
# 槽谓词认的"工作写"任务种类：**不在本地存一份** —— `slot_state_of()` 用 `route_task_kinds()`
# 从 `lib/route.mjs::ROUTE_TASK_KINDS` 解析（解析不了的现场当场停，不回落旧值）。
SLOT_STALE_MS = 30 * 60 * 1000

# 封顶的两条线（`lib/bug-ledger.mjs::CAP`）：`>= 50` 红 · `> 30` 日历天红。
CAP_BUG_OPEN = 50
CAP_AGE_DAYS = 30

# 严重 bug 的四个出口（三条线 + `unclassified`；次序冻结 —— 契约 §3.5）。
SEVERITY_LINE_ORDER = ("data_broken", "function_broken_repro", "reading_lies", "unclassified")
# 被采样过的线（`function_broken_repro` 没被采样 ⇒ `calibrated:false`；第三线那一对必须有两个）。
SEVERITY_SAMPLED_LINES = ("data_broken", "reading_lies")

# 十二格状态条的 producer 串（契约 §4.2，逐字；次序即表序）。
STATUS_CELLS = (
    ("cap_50_30", "50/30", "bug.bug-read.cap"),
    ("uninitialized", "未建账", "route.mode-of"),
    ("memory_chain", "记忆链红", "memory.report-read"),
    ("sla", "SLA 红", "bug.sla"),
    ("carrier_missing", "carrier 缺", "review.carrier"),
    ("observation_count", "observation 数", "bug.bug-read.counts.observation_open"),
    ("unknown_preset", "未知预设报警", "identity.<day>.json"),
    ("preset_downgrade", "预设降级", "identity.<day>.json"),
    ("legacy_sessions", "legacy 会话数", "route.legacy"),
    ("slot_not_enforced", "单写者未执行", "route.read.slot"),
    ("stale_slot", "stale 槽", "route.read.slot.holders"),
    ("red_bar", "红条", "card.reasons"),
)
STATUSBAR_COUNT = 12
# 只许"探针降级"的两格（C1 §11：A0b / A0d 不成立 ⇒ 卡槽格黄）。别的格显 unknown/黄 = 拿它当挡箭牌。
PROBE_DEGRADED_KEYS = ("slot_not_enforced", "stale_slot")

# 🔴 **同一个查询的机械形态**（定形 §6.2：卡区与 50/30 格读同一个查询，不许各算）。
#    两个格（`bug.open.source` / `cap.bug_open.source`）都写这一个串，判据逐字比。
BUG_QUERY_SOURCE = "bug-read:entries[kind=bug ∧ disposition=null] · .team/bug/ledger.json"


# ── ① 路线账本（C1 §2.2 / §6.1 / §7.5）────────────────────────────────────────
def read_route(ws):
    """读 `<WS>/.team/route/current.json`。

    返回 `(route, state)`，`state` ∈ `absent`（没有账）/ `broken`（在盘上读不出来）/ `ok`。
    🔴 **卡读文件、不走 `--op read`**（契约 §6 第 2 条）：read 会因审计链坏整条拒，
       "老账本 headline 空"这个**真实形态**就再也印不出来。
    """
    path = os.path.join(ws, ".team", "route", "current.json")
    if not os.path.exists(path):
        return None, "absent"
    try:
        with open(path, encoding="utf-8") as f:
            value = json.load(f)
    except Exception:
        return None, "broken"
    if not isinstance(value, dict):
        return None, "broken"
    return value, "ok"


def route_first_line(route, state):
    """`route.first_line` —— **唯一载体是账上的 `headline` 字段**（C1 §6.1），不许自己拼。

    五种现场（契约 §3.1）：
      ① 没有账 ⇒ 逐字 `未建账`（不带目标 / 阶段 / 间隔号）
      ② headline 有值 ⇒ 逐字那一行
      ③ headline 缺键 / ④ 空串 / 全空白 ⇒ 逐字 `（目标未填）` + 红条
      ⑤ 有暂停 ⇒ **第一行与 ② 逐字相同**（暂停只出第二行徽标）
      账本坏了 ⇒ 按 ③ 处理（那一条另配 `ROUTE_UNREADABLE`）
    """
    if state == "absent":
        return "未建账"
    if state == "broken":
        return "（目标未填）"
    return route["headline"] if filled(route.get("headline")) else "（目标未填）"


def route_mode(route, state):
    """`route.mode` 四值闭集（C1 §2.2：阶段类型 + 暂停位；**headline 空不影响模式**）。

    ⚠️ 账本**在盘上但读不出来** ⇒ 印 `uninitialized`：闭集只有四值，而"这条路线当前不可用"
      最接近它。真相由 `route.red_bar` 与 `card.reasons` 的 `ROUTE_UNREADABLE` 说 ——
      别把这个值读成"没建过账"。
    """
    if state != "ok":
        return "uninitialized"
    stages = route.get("stages") if isinstance(route.get("stages"), list) else []
    stage_id = route.get("current_stage_id")
    stage = next((s for s in stages if isinstance(s, dict) and s.get("id") == stage_id), None)
    kind = (stage or {}).get("kind") or "build"
    if kind == "maintain":
        return "maintain"
    pauses = route.get("pauses") if isinstance(route.get("pauses"), list) else []
    return "build-paused" if any(isinstance(p, dict) and p.get("state") == "open" for p in pauses) else "build"


def route_pause_badge(route, state):
    """第二行的暂停徽标：非空且含「暂停」；没有暂停 / 未建账 ⇒ `null`（契约 §6 第 10 条：措辞归实现）。"""
    if state != "ok":
        return None
    pauses = route.get("pauses") if isinstance(route.get("pauses"), list) else []
    opened = [p for p in pauses if isinstance(p, dict) and p.get("state") == "open"]
    if not opened:
        return None
    reason = opened[0].get("reason")
    tail = "：" + str(reason).strip()[:40] if filled(reason) else ""
    return "⏸ 暂停中（%d 条%s）" % (len(opened), tail)


def project_tickets(route):
    """路线票段的**投影**（C1 §7.5 那张表，唯一一份；口径逐条照抄，不从实现反推）。

    投影次序：`void_reason` 非空（或 `status === 'void'`）⇒ `void`；否则有任务且任一
    `status ∈ {in_progress, paused}` ⇒ `in_progress`；否则任务全 `done` ⇒ `done`；否则有任务
    ⇒ `open`；**没有任务**时 `legacy_status ∈ {open,in_progress,done}` ⇒ 该值；两者都没有 ⇒ `open`。

    `legacy` 是**子集计数**（`legacy_status` 非空的张数 = 迁移票）：它**不进**四数、
    **不加进** `total` —— 所以恒有 `0 <= legacy <= total`（组长 2026-11-02 裁定第 4 条）。
    """
    tickets = route.get("tickets") if isinstance(route.get("tickets"), list) else []
    tasks = route.get("tasks") if isinstance(route.get("tasks"), list) else []
    counts = {"open": 0, "in_progress": 0, "done": 0, "void": 0}

    def status_of(ticket):
        if not isinstance(ticket, dict):
            return "open"
        if filled(ticket.get("void_reason")) or ticket.get("status") == "void":
            return "void"
        mine = [x for x in tasks if isinstance(x, dict) and x.get("ticket_id") == ticket.get("id")]
        if any(x.get("status") in ("in_progress", "paused") for x in mine):
            return "in_progress"
        if mine and all(x.get("status") == "done" for x in mine):
            return "done"
        if mine:
            return "open"
        if ticket.get("legacy_status") in ("open", "in_progress", "done"):
            return ticket["legacy_status"]
        return "open"

    for ticket in tickets:
        counts[status_of(ticket)] += 1
    legacy = len([t for t in tickets if filled((t or {}).get("legacy_status") if isinstance(t, dict) else None)])
    return {
        "open": counts["open"],
        "in_progress": counts["in_progress"],
        "done": counts["done"],
        "void": counts["void"],
        "legacy": legacy,
        "total": len(tickets),
    }


def void_with_live_task(route):
    """**负样本的读面**（契约 §3.2）：`void` 的票上挂着一条**在途**任务 ⇒ 点名那些票号。

    写面拒这一种（`E_TICKET_LIVE_TASK`），但账本已经坏成这个样子时（旧数据 / 手改 / 实现回归）
    **卡必须喊**，不许照常印数。
    """
    tickets = route.get("tickets") if isinstance(route.get("tickets"), list) else []
    tasks = route.get("tasks") if isinstance(route.get("tasks"), list) else []
    bad = []
    for ticket in tickets:
        if not isinstance(ticket, dict):
            continue
        is_void = filled(ticket.get("void_reason")) or ticket.get("status") == "void"
        if not is_void:
            continue
        live = [x for x in tasks if isinstance(x, dict) and x.get("ticket_id") == ticket.get("id") and x.get("status") != "done"]
        if live:
            bad.append(ticket.get("id") or "(缺票号)")
    return bad


def slot_state_of(tasks, now):
    """**槽谓词**的 Python 一份（`lib/route.mjs::slotBusy` 的镜像，只算卡要的两格）。

    ⚠️ 这是**第二份实现**，判定次序照抄那条注释（`session_exit` → `fence` → `ref` 空 →
    心跳不可读 → 心跳停 → 活会话），聚合次序也照抄（`busy` → `unknown` → `crash` → `exited`）。
    为什么不去调 `--op read`：契约 §6 第 2 条把"卡读文件"钉死了（read op 只做对账，
    而夹具手写的账没有审计链，read 会整条拒）。
    🔴 **词表不在这里**：`route_task_kinds()` 从 `lib/route.mjs` 解析 —— 手抄过一版
    （`implementation / bug-fix / review / …`），与 `slotBusy()` 分叉 ⇒ 一个合法的 `implement`
    在途任务被当成"不占槽"，两格假绿。同一个词表两个值，就会有两个结论。
    """
    kinds = route_task_kinds()
    holders = []
    for task in tasks if isinstance(tasks, list) else []:
        if not isinstance(task, dict):
            continue
        if task.get("status") not in ("in_progress", "paused"):
            continue
        kind = task.get("kind")
        if kind is not None and kind not in kinds:
            continue
        holder = {"task_id": task.get("id"), "kind": kind, "state": None, "why": None}
        fence = task.get("fence")
        if filled(task.get("session_exit")):
            holder["state"], holder["why"] = "exited", "session-exit"
        elif type(fence) is int and fence >= 1:
            holder["state"], holder["why"] = "exited", "fenced"
        elif not filled(task.get("session_ref")):
            holder["state"], holder["why"] = "busy", "ref-empty"
        elif now is None:
            holder["state"], holder["why"] = "unknown", "clock-unreadable"
        else:
            beat = parse_iso(task.get("heartbeat"))
            if beat is None:
                holder["state"], holder["why"] = "unknown", "heartbeat-unreadable"
            elif beat.tzinfo is None or now.tzinfo is None:
                holder["state"], holder["why"] = "unknown", "clock-unreadable"
            elif (now - beat).total_seconds() * 1000 > SLOT_STALE_MS:
                holder["state"], holder["why"] = "crash", "heartbeat-stale"
            else:
                holder["state"] = "busy"
                holder["why"] = "paused-with-live-session" if task.get("status") == "paused" else "live"
        holders.append(holder)
    seen = [h["state"] for h in holders]
    if "busy" in seen:
        state = "busy"
    elif "unknown" in seen:
        state = "unknown"
    elif "crash" in seen:
        state = "crash"
    else:
        state = "exited"
    allow = state == "exited"
    return {"state": state, "free": allow, "allow": allow, "holders": holders,
            "code": None if allow else "E_GUARD_SLOT_BUSY"}


# ── ② bug 台账（B §5 / §7 / 裁定第 2 条）──────────────────────────────────────
def read_bug_ledger(ws):
    """读 `<WS>/.team/bug/ledger.json`。返回 `(ledger, state)`，`state` ∈ `absent` / `broken` / `ok`。

    `absent` = 这个工作区从没登记过 bug（**不是**错：卡上那一格印 `0`，见契约 §6 第 1 条）；
    `broken` = 在盘上但读不出来 —— 那个形状卡答不上来（`bug.open` 的形状是 `int`，没有"判不了"），
    所以生成**当场失败**（宁可没有卡 + 一行红，也不要一张印着 0 的卡）。
    """
    path = os.path.join(ws, ".team", "bug", "ledger.json")
    if not os.path.exists(path):
        return None, "absent"
    try:
        with open(path, encoding="utf-8") as f:
            value = json.load(f)
    except Exception as exc:
        return None, "broken:%s" % exc
    if not isinstance(value, dict) or not isinstance(value.get("entries", []), list):
        return None, "broken:形状不对（不是对象 / entries 不是数组）"
    return value, "ok"


def bug_entries(ledger):
    return [e for e in (ledger.get("entries") if isinstance(ledger, dict) else []) or [] if isinstance(e, dict)]


def is_open_bug(entry):
    """`kind === 'bug'` 且 `disposition === null`（observation 不计、票不进这个数）。"""
    return entry.get("kind") == "bug" and entry.get("disposition") is None


def cap_of(entries, now):
    """50/30 读数（B §5.3 冻结形状的卡侧那几格）：条数那一半 + 日历天那一半。"""
    open_bugs = [e for e in entries if is_open_bug(e)]
    oldest = 0
    for entry in open_bugs:
        age = calendar_day_diff(parse_iso(entry.get("registered_at")), now)
        if age is not None and age > oldest:
            oldest = age
    reasons = []
    if len(open_bugs) >= CAP_BUG_OPEN:
        reasons.append("count: bug_open=%d ≥ %d" % (len(open_bugs), CAP_BUG_OPEN))
    if oldest > CAP_AGE_DAYS:
        reasons.append("age: 最老一条 %d 天 > %d 天" % (oldest, CAP_AGE_DAYS))
    return {
        "bug_open": len(open_bugs),
        "oldest_age_days": oldest,
        "red": len(open_bugs) >= CAP_BUG_OPEN or oldest > CAP_AGE_DAYS,
        "reasons": reasons,
    }


# **assessment** 四值里"真正做过判定"的那三个（`lib/bug-ledger.mjs::ASSESSED_VERDICTS` 同值）。
# `unknown` 是"判不了"，**不是**"已评估" —— 它让条目保留 open，SLA 照样算超期。
ASSESSED_VERDICTS = ("true", "false", "duplicate")


def is_assessed(entry):
    """一条条目**是否已经被评估过**（SLA 的豁免之一；与 `bug-ledger.mjs::isAssessed` 同一条判据）。

    `assessment` 必须是对象、且 `verdict` 落在那三个真判定里。`None` / 形状坏 /
    `verdict:'unknown'` / `verdict` 缺失 ⇒ **没评估过**（保守读法：超期照算）。
    """
    assessment = entry.get("assessment")
    if not isinstance(assessment, dict):
        return False
    return assessment.get("verdict") in ASSESSED_VERDICTS


def sla_of(entries, cycle_day):
    """**SLA**（契约 §3.7.1 / 组长裁定第 2 条）：`opened_at` 早于当前开工周期 **且**
    还没被真正评估过（`is_assessed()`）⇒ 在 `over` 里。

    ⚠️ 只有两个豁免：同一天开的、已经评估过的。`assessment.verdict === 'unknown'`（判不了）
    **不是**"已评估"—— 它保留 open，所以照样算超期；不要把"判不了"读成"已经处理过了"。
    ⚠️ 这里只数 `kind === 'bug'`：observation 不是 bug，不进 SLA。
    """
    over = []
    oldest = 0
    cycle_number = local_day_number_of_key(cycle_day)
    for entry in entries:
        if entry.get("kind") != "bug":
            continue
        if is_assessed(entry):
            continue
        opened = parse_iso(entry.get("opened_at")) or parse_iso(entry.get("registered_at"))
        if opened is None or cycle_number is None:
            continue
        opened_number = local_day_number(opened)
        if opened_number is None or opened_number >= cycle_number:
            continue
        over.append(entry.get("id") or "(缺 id)")
        oldest = max(oldest, cycle_number - opened_number)
    return {"over": over, "oldest_age": oldest, "cycle": cycle_day}


def local_day_number_of_key(day_key):
    """`YYYY-MM-DD` → 本地日历日号（与 `local_day_number` 同一把尺子）。"""
    if not is_day_key(day_key):
        return None
    try:
        return (datetime.strptime(day_key.strip(), "%Y-%m-%d").date() - date(1970, 1, 1)).days
    except ValueError:
        return None


def severity_of(ledger):
    """严重度那一排（B §7）：四出口 / 样本四个 / 被采样的线 / 升级与"判不了"。

    🔴 两个词**不混**（契约 §6 第 5 条）：`assessment.verdict === 'unknown'`（bug 评估里的判不了）
       只让条目保留 open；只有 `severity_confidence === 'cannot'` 或 `severity_line === 'unclassified'`
       才是"严重线判不了" ⇒ 升级 + 卡红。
    """
    entries = bug_entries(ledger) if isinstance(ledger, dict) else []
    samples_block = ledger.get("severity_samples") if isinstance(ledger, dict) else None
    raw_samples = samples_block.get("samples") if isinstance(samples_block, dict) else None
    samples = ["%s:%s" % ((s or {}).get("line"), (s or {}).get("polarity"))
               for s in (raw_samples or []) if isinstance(s, dict)]
    sampled_lines = sorted({s.split(":", 1)[0] for s in samples if ":" in s})
    calibrated = {line: line in sampled_lines for line in SEVERITY_LINE_ORDER if line != "unclassified"}

    def cannot(entry):
        assessment = entry.get("assessment")
        if not isinstance(assessment, dict):
            return False
        return assessment.get("severity_confidence") == "cannot" or assessment.get("severity_line") == "unclassified"

    escalations = [e.get("id") or "(缺 id)" for e in entries if filled(e.get("escalated_at"))]
    unescalated = [e.get("id") or "(缺 id)" for e in entries if cannot(e) and not filled(e.get("escalated_at"))]
    card_red = any(e.get("card_red") is True or filled(e.get("escalated_at")) for e in entries)
    return {
        "lines": list(SEVERITY_LINE_ORDER),
        "samples": samples,
        "calibrated": calibrated,
        "card_red": card_red,
        "escalations": escalations,
        "cant_unescalated": unescalated,
    }


# ── ③ 状态条那五格的 producer（裁定第 1 条：全部接线）────────────────────────
def read_identity(ws, day):
    """`unknown_preset` / `preset_downgrade` 的读面：`.team/state/identity/<day>.json`（注入器写）。

    三种现场**分开**（缺 ≠ 空 ≠ 坏）：
      · `absent` —— 文件不在：这一天没有报警，两格读 `0 条`（绿）；
      · `broken` —— 文件在盘上但不是对象 / 读不出来：**不知道有没有报警** ⇒ 两格**红**
        （判不了不是"0 条"；把坏 JSON 读成"没有报警"就是让注入器那一侧的坏静默通过）；
      · `ok` —— 两个数组照读。
    """
    path = os.path.join(ws, ".team", "state", "identity", "%s.json" % day)
    if not os.path.exists(path):
        return {"present": False, "broken": False, "unknown_preset": [], "preset_downgrade": []}
    value = jload(path, None)
    if not isinstance(value, dict):
        return {"present": True, "broken": True, "unknown_preset": [], "preset_downgrade": []}
    return {
        "present": True,
        "broken": False,
        "unknown_preset": value.get("unknown_preset") if isinstance(value.get("unknown_preset"), list) else [],
        "preset_downgrade": value.get("preset_downgrade") if isinstance(value.get("preset_downgrade"), list) else [],
    }


def review_dirs(ws, day):
    """当日评审产物的候选抽屉（**按存在性逐个看**，不是只认一个）。

    四类一次性作业各有自己的落点（`.team/retro/` · `.team/technical-review/` ·
    `.team/conversation-review/` —— 见 `leader.md` 的目录图），而 `--day` 决定的是"哪一天"、
    不是"哪个抽屉"：只认一个抽屉 ⇒ 评审按派工卡落进另一个抽屉时，卡上会印成"作业没交"。
    """
    out = []
    for sub in ("retro", "technical-review", "conversation-review"):
        base = os.path.join(ws, ".team", sub, day)
        if os.path.isdir(base):
            out.append(base)
    return out


def review_carriers(ws, day):
    """`carrier_missing` 的读面：两份评审报告在不在（`review.carrier`）。"""
    dirs = review_dirs(ws, day)
    return {
        "technical": any(os.path.isfile(os.path.join(d, "技术评审.md")) for d in dirs),
        "conversation": any(os.path.isfile(os.path.join(d, "会话评审.md")) for d in dirs),
    }


def legacy_remaining(ws):
    """`legacy_sessions` 的读面：legacy 票店里还剩几张（C1a 之后应当是 0）。

    返回 `(count, state)`，`state` ∈ `absent`（没有票店 ⇒ 没有待迁移的）/ `ok` / `broken`。
    """
    path = os.path.join(ws, ".team", "tickets", "legacy.json")
    if not os.path.exists(path):
        return 0, "absent"
    value = jload(path)
    if not isinstance(value, dict) or not isinstance(value.get("tickets"), list):
        return None, "broken"
    return len(value["tickets"]), "ok"


def local_state_of(ws, day):
    """读 `.team/state/local/<day>.json`（`F-156` / `F-162` 的形状；`local-read` 是它的读面）。"""
    value = jload(os.path.join(ws, ".team", "state", "local", "%s.json" % day))
    return value if isinstance(value, dict) else None


def node_of_local_state(state, node_key):
    """本地状态里三段节点的读面：**顶层那一个**是今天的形状（`technical` / `conversation` / `memory_review`）；
    别处/老形状可能把它收在 `nodes` 下面 —— 两种都认，顶层优先。"""
    if not isinstance(state, dict):
        return None
    top = state.get(node_key)
    if isinstance(top, dict):
        return top
    nodes = state.get("nodes")
    if isinstance(nodes, dict) and isinstance(nodes.get(node_key), dict):
        return nodes[node_key]
    return None


def receipt_segment(ws, day, node_key):
    """两段回执里的一段。三态 + `day` / `report_path`（契约 §3.7）。

    · 本周期文件里 `state === 'done'` 且 `report_path` 非空 ⇒ `present`；
    · 本周期文件不在 / 节点不是 `done` ⇒ 只有**更早**的周期 `done` 才算 `expired`（超一个开工周期）；
    · 都没有 ⇒ `missing`。
    周期号 = `<day>`（与 `--day` 同一个键）—— **不按 24h 算**：同一场里先后生成两张卡会互相判过期。
    """
    current = local_state_of(ws, day)
    node = node_of_local_state(current, node_key)
    if isinstance(node, dict) and node.get("state") == "done" and filled(node.get("report_path")):
        return {"state": "present", "day": day, "report_path": node.get("report_path")}

    state_dir = os.path.join(ws, ".team", "state", "local")
    try:
        names = sorted(os.listdir(state_dir), reverse=True)
    except OSError:
        names = []
    for name in names:
        earlier = name[:-5] if name.endswith(".json") else None
        if not is_day_key(earlier) or earlier >= day:
            continue
        other = local_state_of(ws, earlier)
        other_node = node_of_local_state(other, node_key)
        if isinstance(other_node, dict) and other_node.get("state") == "done" and filled(other_node.get("report_path")):
            return {"state": "expired", "day": earlier, "report_path": other_node.get("report_path")}
    return {"state": "missing", "day": None, "report_path": None}


# ── ④ 机器读面那一页（两张卡共用形状）────────────────────────────────────────
def write_c2_sheet(wb, sheet_name, entries):
    """一页 `格 / 值 / 来源`：`值` 是 **JSON 文本**（数当数、串当串、数组/对象原样）。

    🔴 **第 1 行就是表头**（契约 §2.1 逐字：「两页的第 1 行都是表头：`格` | `值` | `来源`」）——
       页里不放标题 / 说明行：读面那一侧按"跳过第 1 行、其余每一行是一格"来读，
       多一行散文会变成一格假 key（"缺键"判据看不见它，读的人却被它绊一下）。
       这一页是**机器读面**，给老板看的那几页在前头（标题 / as-of 那些在正文区）。

    🔴 不许把 `0` 写成 `""`、把 `[]` 写成 `"无"` —— 卡上的 `0` 与空串是两件事。
    """
    ws = wb.create_sheet(sheet_name)
    ws.append(C2_HEADER); head(ws, 3)
    for key, value, producer in entries:
        ws.append((key, json.dumps(value, ensure_ascii=False), producer))
    widths(ws, [("A", 26), ("B", 96), ("C", 34)])
    ws.freeze_panes = "A2"
    return ws


def main():
    global WS, DR
    ap = argparse.ArgumentParser()
    ap.add_argument("--day", default=None,
                    help="哪一天（YYYY-MM-DD）。不给 = 本地 04:00 切之下的\"今天\""
                         "（00:00–03:59 归前一天 · 契约 CONTRACT.md §13.1）")
    ap.add_argument("--workspace", required=True,
                    help="工作区根（必填·不许猜：写死会让别的会话把卡落进你的抽屉）")
    ap.add_argument("--data-root", default=None,
                    help="数据根（预设级·所有工作区共用）。不给就按 --workspace 推；推出来的不存在会当场停")
    a = ap.parse_args()
    WS = os.path.abspath(a.workspace)
    # 契约 §13.3：`--day` **给了就必须是 day key** —— `""` / 全空白 / `2026-13-40` 一律当场拒，
    # **绝不**吞成"没给"（那会让一次拼错的 --day 静默落到"今天"的抽屉上）。只有**没给**才走缺省。
    # ⚠️ 缺省日要读切点，而切点从 `<WS>/presets/agenia/lib/route.mjs` 解析 ⇒ `WS` 必须先就位。
    if a.day is None:
        day = default_day()
    elif is_day_key(a.day):
        day = a.day.strip()
    else:
        raise CardFailure("E_ARG_SCHEMA", "--day 给了就必须是日历上真实存在的一天（YYYY-MM-DD），实得 %r" % a.day)
    # 🔴 2026-10-20（`F-111` ⑤）：`DR` 原来**只按 WS 推**，新工作区里那个路径根本不存在
    #    而 `jload` 读不到就返回 `{}` ⇒ 一路空到底 ⇒ **出一张零值卡，还 exit 0**。
    #    零值卡比"没卡"更坏：它看起来成功了。⇒ 数据根不存在就当场停，别往下算。
    #    数据根是**预设级**的（所有工作区共用一个），所以允许显式给 `--data-root`。
    if a.data_root:
        DR = os.path.abspath(a.data_root)
    else:
        DR = os.path.join(WS, "presets", "agenia", ".runtime")
    out_dir = os.path.join(WS, ".team", "leader", day)
    # 失败落点先记下：`report_failure()` 靠它把失败标记追加到当天那个抽屉里。
    _FAIL_CTX["day"] = day
    _FAIL_CTX["dir"] = out_dir
    print("workspace:", WS)
    print("data-root:", DR)
    print("cards  -> ", out_dir)
    if not os.path.isdir(os.path.join(WS, ".team")):
        raise CardFailure("E_NO_TEAM", "%s 下没有 .team/ —— 工作区给错了？" % WS)
    if not os.path.isdir(DR):
        raise CardFailure(
            "E_DATA_ROOT_MISSING",
            "数据根不存在：%s\n"
            "  · 数据根是**预设级**的，不在工作区里 —— 用 --data-root 指过去"
            "（本机是 E:\\Harness\\presets\\agenia\\.runtime）\n"
            "  · 不指的话这里会读出一张**零值卡**，那比没卡更坏（看起来成功了）" % DR
        )
    os.makedirs(out_dir, exist_ok=True)

    # ── 读数据 ────────────────────────────────────────────────────────
    # 路线那两个常量的来源（槽词表 / 切点）—— 打印出来，读证据的人一眼看到**读的是哪一棵树**。
    print("route-src:", route_constants()["path"])
    st   = jload(os.path.join(DR, "state", "update", day + ".json"), {}) or {}
    rep  = jload(os.path.join(DR, "reports", "memory-update", day + ".json"), {}) or {}
    snap_name = rep.get("snapshot") or st.get("new_snapshot") or "?"
    snap_path = os.path.join(DR, "memory", "snapshots", snap_name + ".json")
    snap = jload(snap_path, None)
    snap_ok = isinstance(snap, dict)
    if not snap_ok:
        snap = {}
    by_id = {e.get("id"): e for e in snap.get("entries", [])}
    # 🔴 退休 / 斩杀 的条目**已经不在新快照里** ⇒ 原文要去上一版（base_snapshot）找。
    #    （2026-10-18 老板："你这个记忆报告里 retire 的取不到也太抽象了"）
    prev_name = rep.get("base_snapshot") or st.get("base_snapshot") or None
    prev = jload(os.path.join(DR, "memory", "snapshots", str(prev_name) + ".json"), {}) or {} if prev_name else {}
    by_id_prev = {e.get("id"): e for e in prev.get("entries", [])}

    def find_entry(eid):
        """先在新快照找，找不到去上一版找。返回 (entry, 来源说明)。"""
        if eid in by_id:
            return by_id[eid], ""
        if eid in by_id_prev:
            return by_id_prev[eid], "（已从新快照移除 ⇒ 原文取自 %s）" % prev_name
        return {}, "（两版都没有这个 id）"
    judged = jlines(os.path.join(DR, "proposals", "judged.jsonl"))
    pool   = jlines(os.path.join(DR, "proposals", "pool.jsonl"))
    arch   = jload(os.path.join(DR, "proposals", "archive", "MANIFEST.json"), {}) or {}
    findings = []
    for base in review_dirs(WS, day):
        for p in sorted(glob.glob(os.path.join(base, "*.findings.json"))):
            d = jload(p, {}) or {}
            findings.append((os.path.basename(p), d))

    frozen = [j for j in judged if j.get("day") == day]
    acc = [j for j in frozen if j.get("verdict") == "accepted"]
    rej = [j for j in frozen if j.get("verdict") != "accepted"]
    dist = rep.get("distribution") or snap.get("distribution") or []
    # 容量的**实际占用** = 快照的 `totals`（契约 §3.6：路线账本不存这个数）。
    # 🔴 快照读不出来 ⇒ 那两个数是 `null`（判不了不是 0）—— **不许**退回报告里那份 totals：
    #    报告点名了一个读不出来的快照时，"73 条"是**上一个读者**的读数，不是现在的。
    # 🔴 快照读到了、`totals` 缺 / 两个数不是整数 ⇒ **同样判不了**（`capacity.state` 红）：
    #    契约 §2.3 #25 要的是 int，`null` 与 `"73"` 都不是 int —— 一格"看起来绿"的 null 比红更坏。
    raw_totals = (rep.get("totals") or snap.get("totals") or {}) if snap_ok else {}
    totals = raw_totals if isinstance(raw_totals, dict) else {}
    totals_ok = bool(snap_ok and is_int(totals.get("count")) and is_int(totals.get("chars")))
    cap_count, cap_chars, cap_path = read_capacity()
    maint_pool = [p for p in pool if p.get("kind") == "maintenance"]
    prop_pool  = [p for p in pool if p.get("kind") == "proposal"]
    decisions = rep.get("maintenance_decisions") or []

    # ── C2 · 收集读数（一次读、两处用：机器格与正文都从这里取值）────────────
    now = now_instant()
    route, route_state = read_route(WS)
    tickets = project_tickets(route or {})
    live_voids = void_with_live_task(route or {})
    ledger, ledger_state = read_bug_ledger(WS)
    if isinstance(ledger_state, str) and ledger_state.startswith("broken"):
        # `bug.open` / `cap.bug_open` 的形状是 `int`（没有"判不了"那一格），而印 0 会让老板以为
        # "一条 open bug 都没有"。⇒ 宁可**没有卡 + 一行红**，也不要一张印着 0 的卡（§3.8 零值卡）。
        raise CardFailure("E_BUG_LEDGER_UNREADABLE",
                          "bug 台账在盘上但读不出来（%s）—— 卡上有两格的形状是数，印 0 就是撒谎" % ledger_state.split(":", 1)[-1])
    entries = bug_entries(ledger)
    cap = cap_of(entries, now)
    observation_open = len([e for e in entries if e.get("kind") == "observation" and e.get("disposition") is None])
    sla = sla_of(entries, day)
    severity = severity_of(ledger)
    identity = read_identity(WS, day)
    carriers = review_carriers(WS, day)
    legacy_count, legacy_state = legacy_remaining(WS)
    bug_tasks = (ledger or {}).get("tasks") if isinstance((ledger or {}).get("tasks"), list) else []
    route_tasks = (route or {}).get("tasks") if isinstance((route or {}).get("tasks"), list) else []
    slot = slot_state_of(list(route_tasks) + list(bug_tasks), now)

    # `receipt.required` = 有路线账本 **OR** 任务段非空（两者都无 ⇒ 未建账期无活动，回执无从谈起）
    receipt_required = route_state in ("ok", "broken") or len(route_tasks) > 0
    seg_technical = receipt_segment(WS, day, "technical")
    seg_conversation = receipt_segment(WS, day, "conversation")
    if not receipt_required:
        seg_technical = {"state": "na", "day": None, "report_path": None}
        seg_conversation = {"state": "na", "day": None, "report_path": None}

    # ── 红因（契约 §5 的闭集；新码要同批进那张表）──────────────────────────
    # 槽两格的红判读**先**算出来（下面状态条还要用同一份）：`card.reasons` 必须点名它们 ——
    # 契约 §5 末条：红了却不说哪一格与没红等价；`SLOT_NOT_ENFORCED` / `STALE_SLOT` 两个码
    # 在这之前从来没被写进过 `card.reasons`，等于死码。
    live_holders = [h for h in slot["holders"] if h["state"] == "busy" and h["why"] in ("live", "paused-with-live-session")]
    crash_holders = [h for h in slot["holders"] if h["state"] == "crash"]
    slot_unknown = slot["state"] == "unknown"
    slot_bad = len(live_holders) >= 2 or (slot["allow"] is False and not slot["code"])
    slot_reading = "state=%s · allow=%s · code=%s · 活持有者 %d 个%s" % (
        slot["state"], "true" if slot["allow"] else "false", slot["code"] or "null", len(live_holders),
        ("（%s）" % " · ".join("%s(%s)" % (h["task_id"], h["why"]) for h in slot["holders"])) if slot["holders"] else "（没有工作写任务）")

    reasons1 = []
    if route_state == "absent":
        reasons1.append({"code": "ROUTE_MISSING", "detail": "没有 .team/route/current.json（未建账）"})
    if route_state == "broken":
        reasons1.append({"code": "ROUTE_UNREADABLE", "detail": "路线账本在盘上但读不出来 ⇒ 第一行按「（目标未填）」+ 红条"})
    if route_state == "ok" and not filled(route.get("headline")):
        reasons1.append({"code": "HEADLINE_EMPTY", "detail": "账上的 headline 缺 / 空 ⇒ 第一行「（目标未填）」+ 红条"})
    for ticket_id in live_voids:
        reasons1.append({"code": "VOID_WITH_LIVE_TASK", "detail": "%s（void 的票上挂着在途任务）" % ticket_id})
    if cap["red"]:
        reasons1.append({"code": "CAP_50_30", "detail": " · ".join(cap["reasons"]) or "50/30 越界"})
    for entry_id in severity["cant_unescalated"]:
        reasons1.append({"code": "SEVERITY_CANNOT_UNESCALATED",
                         "detail": "条目 %s：严重线判不了（cannot / unclassified）却**没有** escalated_at —— 判不了不许静默" % entry_id})
    if severity["card_red"]:
        reasons1.append({"code": "SEVERITY_CARD_RED", "detail": "已升级的判不了：%s" % (" · ".join(severity["escalations"]) or "见台账")})
    if not totals_ok:
        if snap_ok:
            reasons1.append({"code": "CAPACITY_UNREADABLE",
                             "detail": "快照 %s 读到了，但没有两个整数 totals（count=%r / chars=%r）⇒ 容量判不了（不出 0）"
                                       % (snap_path.replace(os.sep, "/"), totals.get("count"), totals.get("chars"))})
        else:
            reasons1.append({"code": "CAPACITY_UNREADABLE",
                             "detail": "快照 %s 读不出来 ⇒ 容量判不了（不出 0）" % snap_path.replace(os.sep, "/")})
    if receipt_required and seg_technical["state"] != "present":
        if seg_technical["state"] == "expired":
            reasons1.append({"code": "RECEIPT_EXPIRED:technical",
                             "detail": "技术评审回执停在上一个开工周期（%s），本周期 %s 没有" % (seg_technical["day"], day)})
        else:
            reasons1.append({"code": "RECEIPT_MISSING:technical",
                             "detail": "本周期 %s 没有技术评审回执（nodes.technical 不是 done / 文件不在）" % day})
    if sla["over"]:
        reasons1.append({"code": "SLA_OVER_CYCLE",
                         "detail": "%d 条 bug 超一个开工周期仍未评估，最老 %d 天：%s"
                                   % (len(sla["over"]), sla["oldest_age"], " · ".join(sla["over"]))})
    if slot_bad:
        reasons1.append({"code": "SLOT_NOT_ENFORCED",
                         "detail": "单写者门禁没执行（state=%s · 活持有者 %d 个）%s"
                                   % (slot["state"], len(live_holders),
                                      " · ".join("%s(%s)" % (h["task_id"], h["why"]) for h in live_holders)
                                      or " · ".join("%s(%s/%s)" % (h["task_id"], h["state"], h["why"]) for h in slot["holders"])
                                      or "（没有工作写任务）")})
    if crash_holders:
        reasons1.append({"code": "STALE_SLOT",
                         "detail": "心跳停了的持有者 %d 个（不自动回收）：%s"
                                   % (len(crash_holders), " · ".join("%s(%s)" % (h["task_id"], h["why"]) for h in crash_holders))})

    # ── 十二格（次序 = 契约 §4.2 那张表；每格六样，探针降级才多一样）──────────
    bar = []

    def add_cell(key, state, reading, extra=None):
        label = next((c[1] for c in STATUS_CELLS if c[0] == key), key)
        producer = next((c[2] for c in STATUS_CELLS if c[0] == key), "?")
        cell = {"key": key, "label": label, "state": state, "reading": reading,
                "producer": producer, "wired": True}
        if isinstance(extra, dict):
            cell.update(extra)
        bar.append(cell)

    add_cell("cap_50_30", "red" if cap["red"] else "green",
             "bug_open=%d · 最老 %d 天（参考 %d 条 / %d 天）%s"
             % (cap["bug_open"], cap["oldest_age_days"], CAP_BUG_OPEN, CAP_AGE_DAYS,
                " —— " + " · ".join(cap["reasons"]) if cap["reasons"] else ""))
    mode = route_mode(route, route_state)
    add_cell("uninitialized", "red" if mode == "uninitialized" else "green",
             "mode=%s%s" % (mode, "（没有账本，或账本读不出来）" if route_state != "ok" else ""))
    report_rel = "reports/memory-update/%s.json" % day
    add_cell("memory_chain", "green" if (os.path.isfile(os.path.join(DR, "reports", "memory-update", day + ".json")) and snap_ok) else "red",
             "报告 %s=%s · 快照 %s=%s" % (report_rel, "在" if os.path.isfile(os.path.join(DR, "reports", "memory-update", day + ".json")) else "不在",
                                        snap_name, "可读" if snap_ok else "读不出来"))
    add_cell("sla", "red" if sla["over"] else "green",
             "超期 %d 条 · 最老 %d 天 · 周期 %s" % (len(sla["over"]), sla["oldest_age"], sla["cycle"]))
    add_cell("carrier_missing", "red" if (receipt_required and not (carriers["technical"] and carriers["conversation"])) else "green",
             "需要回执=%s · 技术评审.md=%s · 会话评审.md=%s"
             % ("是" if receipt_required else "否（未建账期无活动）",
                "在" if carriers["technical"] else "不在", "在" if carriers["conversation"] else "不在"))
    add_cell("observation_count", "green", "observation_open=%d（这是个数，红不红由 50/30 与 SLA 那两格说）" % observation_open)
    for key, values in (("unknown_preset", identity["unknown_preset"]), ("preset_downgrade", identity["preset_downgrade"])):
        if identity["broken"]:
            # 文件在盘上、读不出来 ⇒ **判不了**（不是"0 条报警"）：坏 JSON 读成"没有报警"
            # 就是让注入器那一侧的坏静默通过（架构判据 4）。契约 §5 的闭集里没有身份码 ⇒
            # 这一格只落在状态条上（与 carrier_missing / legacy_sessions 同一个形状）。
            add_cell(key, "red",
                     "`.team/state/identity/%s.json` 在盘上但读不出来 ⇒ 判不了（不是 0 条报警）" % day)
        else:
            add_cell(key, "red" if values else "green",
                     "%d 条%s" % (len(values), ("：" + " · ".join(str(v) for v in values[:4])) if values else "（.team/state/identity/%s.json）" % day))
    if legacy_state == "broken":
        add_cell("legacy_sessions", "red", "legacy 票店（.team/tickets/legacy.json）读不出来 ⇒ 迁移进度判不了")
    else:
        add_cell("legacy_sessions", "red" if (legacy_count or 0) > 0 else "green",
                 "还剩 %d 张待迁移%s" % (legacy_count or 0, "" if legacy_state == "ok" else "（没有 legacy 票店）"))
    # 单写者两格：门禁的读数只有"活会话怎么判"这一份输入（`slot_state_of`；判读在红因那一段已算）。
    add_cell("slot_not_enforced", "yellow" if slot_unknown else ("red" if slot_bad else "green"), slot_reading,
             {"degraded_by": "A0b"} if slot_unknown else None)
    add_cell("stale_slot", "yellow" if slot_unknown else ("red" if crash_holders else "green"),
             "crash 持有者 %d 个（心跳停了不自动回收）%s" % (
                 len(crash_holders),
                 ("：" + " · ".join("%s(%s)" % (h["task_id"], h["why"]) for h in crash_holders)) if crash_holders
                 else ("；判不了：%s" % " · ".join("%s(%s)" % (h["task_id"], h["why"]) for h in slot["holders"]) if slot_unknown else "")),
             {"degraded_by": "A0b"} if slot_unknown else None)

    # ── 红条格是**总闸**（契约 §4.1 末条）：它的 `state` 必须等于 `card.red` ──────
    # `card.red` = 有红因 **或** 状态条上任何一格是红的。§5 的闭集里没有"记忆链红 / carrier 缺 /
    # 身份报警 / legacy 未迁空"这几个码（它们只落在状态条上）⇒ 只看 reasons 会让卡"格红了而卡没红"。
    card_red = bool(reasons1) or any(c["state"] == "red" for c in bar)
    add_cell("red_bar", "red" if card_red else "green",
             "卡红=%s · 红因 %d 条" % ("是" if card_red else "否", len(reasons1)))

    # ── 卡 1 · 记忆更新报告 ────────────────────────────────────────────
    wb = Workbook(); ws1 = wb.active; ws1.title = "判决 · 库现状"
    ticket_line = ("open %d · in_progress %d · done %d · void %d · 迁移票 %d · 合计 %d"
                   % (tickets["open"], tickets["in_progress"], tickets["done"], tickets["void"],
                      tickets["legacy"], tickets["total"]))
    rows = [
        ("目标 · 大阶段", route_first_line(route, route_state)),
    ]
    if route_pause_badge(route, route_state):
        # 暂停 = **第二行**徽标；第一行一字不动（定形 §3.2）。
        rows.append(("暂停", route_pause_badge(route, route_state)))
    rows += [
        ("路线模式", "%s（路线账本：%s）" % (mode, {"ok": "读到了", "absent": "没有", "broken": "在盘上但读不出来"}[route_state])),
        ("报告日", day),
        ("这一轮谁做", "%s（owner_project=%s）" % (st.get("owner_project", "?"), st.get("owner_project", "?"))),
        ("相位", "phase=%s · snapshot_available=%s" % (st.get("phase", "?"), st.get("snapshot_available", "?"))),
        ("快照", "%s → %s" % (rep.get("base_snapshot", "?"), snap_name)),
        ("长期记忆", "%s 条 / %s 字符" % (capacity_value(totals, "count", totals_ok), capacity_value(totals, "chars", totals_ok))),
        ("容量（只作读数）", "参考线 %d 条 / %s 字符 —— 🔴 2026-10-18 起**不是闸**，超了照写" % (cap_count, format(cap_chars, ","))),
        ("现量 vs 参考线", "%s 条 / %s 字符%s" % (
            capacity_value(totals, "count", totals_ok), capacity_value(totals, "chars", totals_ok),
            "" if not (totals_ok and is_int(totals.get("chars"))) else (
                "（超 %d 字符）" % (totals["chars"] - cap_chars) if totals["chars"] > cap_chars else "（在参考线内）"))),
        ("票（路线票段投影 · 唯一真源）", ticket_line),
        ("bug 开放数", "open %d（kind=bug 且无 disposition；observation 与票都不在这个数里）" % cap["bug_open"]),
        ("50/30", "bug_open=%d · 最老 %d 天 · 参考 %d 条 / %d 天 ⇒ %s%s"
         % (cap["bug_open"], cap["oldest_age_days"], CAP_BUG_OPEN, CAP_AGE_DAYS,
            "🔴 红" if cap["red"] else "绿",
            ("（" + " · ".join(cap["reasons"]) + "）") if cap["reasons"] else "")),
        ("严重 bug 判定", "出口四条：%s · 样本 %d 个 · 已升级 %d 条%s"
         % (" · ".join(SEVERITY_LINE_ORDER), len(severity["samples"]), len(severity["escalations"]),
            " ⇒ 🔴 判不了且未升级：%s" % " · ".join(severity["cant_unescalated"]) if severity["cant_unescalated"] else "")),
        ("评审回执（技术评审 · 第一段）", "state=%s · day=%s · report=%s"
         % (seg_technical["state"], seg_technical["day"] or "—", seg_technical["report_path"] or "—")),
        ("本批裁定", "冻结 %d 条 ⇒ 接受 %d · 拒绝 %d" % (len(frozen), len(acc), len(rej))),
        ("🔴 斩杀 / 退休 / 吸收（今天生效）", "%d 条%s" % (len(decisions), "" if decisions else " —— **今天没有生效的处置**（下列 %d 条是草稿，明天判决才批）" % len(maint_pool))),
        ("常识哈希", rep.get("common_sha256", rep.get("common_sense_sha256", "?"))[:12] + "…"),
        ("发布时刻", rep.get("generated_at", "?")),
        ("as-of（只显示）", iso_of(now)),
    ]
    if card_red:
        # 红条：老板一眼看到的那一行。卡红统一落在状态条「红条」格上（§4.1），这一行是它的正文面。
        rows.insert(0, ("🔴 卡红", " · ".join(r["code"] for r in reasons1) or "状态条上有红格"))
    sheet(ws1, ("🔴 " if card_red else "") + CARD1_NAME + " · " + day,
          "固定生成器 .tools/daily-cards.py（读盘 · 零写死）· 判决报告 " + os.path.join("reports", "memory-update", day + ".json")
          + " · 同一批值另有一页机器读的「%s」" % C2_SHEET,
          ("项", "值"), rows, [("A", 30), ("B", 64)])
    if card_red:
        ws1["A1"].font = RED_TITLE
    ws1.append(()); ws1.append(("四类分布", "条数", "字符数")); head(ws1, 3)
    for d in dist:
        ws1.append((d.get("typeName", d.get("typeId")), d.get("count"), d.get("chars")))
    ws1.append(("合计", capacity_value(totals, "count", totals_ok), capacity_value(totals, "chars", totals_ok)))
    for c in range(1, 4): ws1.cell(row=ws1.max_row, column=c).font = BOLD

    # 状态条（十二格）—— 卡上那条横条；值必须与 `C2 · 验收格` 的 `statusbar` 同值（同一批 dict）。
    ws1.append(()); ws1.append(("状态条 · 十二格", "标签", "状态", "读数", "producer", "已接线")); head(ws1, 6)
    for c in bar:
        ws1.append((c["key"], c["label"], c["state"], c["reading"], c["producer"], "✅" if c["wired"] else "🔴"))
    widths(ws1, [("A", 30), ("B", 30), ("C", 12), ("D", 70), ("E", 40), ("F", 10)])

    # 容量**单独一行**（卡下方另列；既不在三区里、也不在状态条里）
    ws1.append(()); ws1.append(("容量（卡下方另列）",
        "%s 条 / %s 字符 · 参考线 %d 条 / %s 字符 · 来源 %s · %s"
        % (capacity_value(totals, "count", totals_ok), capacity_value(totals, "chars", totals_ok), cap_count, format(cap_chars, ","),
           snap_path.replace(os.sep, "/"), "绿" if totals_ok else "🔴 判不了（快照读不到 / totals 不是两个整数 —— 不是 0）"))); head(ws1, 2)

    # ── 卡 1 第二页 · 要被处置的条目（附原文全文 —— 老板 10-16：「我得目视判断一下」）──
    ws2 = wb.create_sheet("🔴 处置与原文")
    rows2 = []
    if decisions:
        for d in decisions:
            tid = d.get("target_id") or d.get("target_entry_id")
            e, src = find_entry(tid)
            rows2.append((d.get("action", d.get("kind", "?")), tid, e.get("type", "?"),
                          ("%s 字符" % len(e.get("text") or "")) if e else "（两版都没有）",
                          (e.get("text") or "（取不到）") + src))
    for p in maint_pool:
        pl = p.get("payload") or {}
        # `maintenance_decision` 有两种合法形状：对象（评审岗草稿：action/target_id/source_ids）
        # 或者一个动作字符串（组长批量退休案：payload.maintenance 才是权威动作）。
        # 只认对象 ⇒ 池子里混进一条字符串就把整张卡打成 AttributeError —— 那不是"数据错"，是这里太窄。
        raw_md = pl.get("maintenance_decision")
        md = raw_md if isinstance(raw_md, dict) else {}
        if not isinstance(raw_md, dict) and isinstance(raw_md, str) and raw_md.strip():
            act = pl.get("maintenance") or raw_md.strip()
        else:
            act = pl.get("maintenance") or md.get("action") or "?"
        tid = pl.get("target_entry_id") or md.get("target_id") or "?"
        for t in [tid] + list(pl.get("source_entry_ids") or md.get("source_ids") or []):
            e, src = find_entry(t)
            rows2.append((("草稿 · " + str(act)) if t == tid else ("草稿 · 并入的源 · " + str(act)),
                          t, e.get("type", "?"),
                          ("%s 字符" % len(e.get("text") or "")) if e else "（两版都没有）",
                          (e.get("text") or "（取不到）") + src))
    sheet(ws2, "处置与原文全文 · " + day,
          "老板 2026-10-16：「**我得目视判断一下……还有挽回的机会**」⇒ 吸收 / 退休 / 斩杀类**必须附原文全文**。"
          "本页 = 今天生效的处置 + 池子里待判的维护案（草稿，明天判决才批）。"
          "**今天生效的处置 %d 条，待判草稿 %d 条。**" % (len(decisions), len(maint_pool)),
          ("处置", "条目 id", "类型", "体量", "原文全文"), rows2 or [("（今天没有任何处置，也没有待判的维护案）", "", "", "", "")],
          [("A", 22), ("B", 30), ("C", 10), ("D", 12), ("E", 120)])

    # ── 卡 1 第三页 · 复核 / 池子 / 水位 ────────────────────────────────
    ws3 = wb.create_sheet("复核 · 池子 · 水位")
    rows3 = [
        ("池子（未判）", "%d 条（%d 普通提案 + %d 维护案）" % (len(pool), len(prop_pool), len(maint_pool))),
        ("清池归档", ("判过 %s 条 ⇒ archive/%s（无损：拼回去逐字节相同）" % (arch.get("archived", {}).get("lines", "?"), arch.get("archived", {}).get("file", "?"))) if arch else "（没有归档记录）"),
        ("上一轮归档时刻", arch.get("day", "—")),
        ("容量（只作读数）", "参考线 %d 条 / %s 字符 —— 2026-10-18 起不是闸；🔴 **实际到没到上限没人管**" % (cap_count, format(cap_chars, ","))),
        ("超参考线多少", "%s 条 / %s 字符" % (
            (max(0, totals["count"] - cap_count) if is_int(totals.get("count")) else "?"),
            (max(0, totals["chars"] - cap_chars) if is_int(totals.get("chars")) else "?"))),
        ("票（路线票段投影）", ticket_line),
        ("legacy 票店", "还剩 %s 张待迁移（%s）" % (legacy_count if legacy_count is not None else "?", "没有票店" if legacy_state == "absent" else ("读不出来" if legacy_state == "broken" else "已迁空" if not legacy_count else "迁移没做完"))),
    ]
    sheet(ws3, "复核 · 池子 · 水位 · " + day, "复核报告与池子账 —— 全部现量（.runtime/proposals 与 state）",
          ("项", "值"), rows3, [("A", 30), ("B", 90)])

    ws4 = wb.create_sheet("待你拍")
    ws4["A1"] = "只有还要你点头的才在这儿"; ws4["A1"].font = TITLE
    ws4.append(()); ws4.append(("事", "为什么", "代价")); head(ws4, 3)
    ws4.append(("（今天 0 件）", "两张卡按定好的形状交齐；明天那一批 %d 条候选自动开庭。" % len(pool), "—"))
    for cell in ws4[ws4.max_row]: cell.alignment = WRAP
    widths(ws4, [("A", 26), ("B", 66), ("C", 40)])

    # ── 卡 1 的机器读面（40 格 = 契约 §2.3 那 39 格 + `capacity.cap_source`；次序 = 契约 §2.3 那张表）
    card1_entries = [
        ("route.first_line", route_first_line(route, route_state), "route.headline"),
        ("route.mode", mode, "route.mode-of"),
        ("route.pause_badge", route_pause_badge(route, route_state), "route.pauses"),
        ("route.red_bar", route_state == "broken" or (route_state == "ok" and not filled(route.get("headline"))), "route.headline"),
        ("tickets.open", tickets["open"], "route.tickets.projection"),
        ("tickets.in_progress", tickets["in_progress"], "route.tickets.projection"),
        ("tickets.done", tickets["done"], "route.tickets.projection"),
        ("tickets.void", tickets["void"], "route.tickets.projection"),
        ("tickets.legacy", tickets["legacy"], "route.tickets.projection"),
        ("tickets.total", tickets["total"], "route.tickets.projection"),
        ("bug.open", cap["bug_open"], "bug.bug-read.counts.bug_open"),
        ("bug.open.source", BUG_QUERY_SOURCE, "bug.bug-read"),
        ("cap.bug_open", cap["bug_open"], "bug.bug-read.cap.bug_open"),
        ("cap.bug_open.source", BUG_QUERY_SOURCE, "bug.bug-read"),
        ("cap.oldest_age_days", cap["oldest_age_days"], "bug.bug-read.cap.oldest_age_days"),
        ("cap.red", cap["red"], "bug.bug-read.cap.red"),
        ("cap.reasons", cap["reasons"], "bug.bug-read.cap.reasons"),
        ("severity.lines", severity["lines"], "bug.ledger.severity_samples"),
        ("severity.samples", severity["samples"], "bug.ledger.severity_samples"),
        ("severity.calibrated", severity["calibrated"], "bug.ledger.severity_samples"),
        ("severity.card_red", severity["card_red"], "bug.bug-read.card_red.red"),
        ("severity.escalations", severity["escalations"], "bug.ledger.entries"),
        ("statusbar", bar, "card.statusbar"),
        ("statusbar.count", len(bar), "card.statusbar"),
        ("capacity.count", totals.get("count") if totals_ok else None, "memory.snapshot.totals"),
        ("capacity.chars", totals.get("chars") if totals_ok else None, "memory.snapshot.totals"),
        ("capacity.cap_count", cap_count, "memory.mjs"),
        ("capacity.cap_chars", cap_chars, "memory.mjs"),
        # 参考线的**来源**：三级候选（工作区 → 生成器那棵树 → cwd）里赢下来那一份的路径。
        # 与 `capacity.source`（快照，管"实际占用"）是两个来源，不许合成一格。
        ("capacity.cap_source", cap_path.replace(os.sep, "/"), "daily-cards.read_capacity"),
        ("capacity.source", snap_path.replace(os.sep, "/"), "memory.snapshot"),
        ("capacity.state", "green" if totals_ok else "red", "card.capacity"),
        ("receipt.required", receipt_required, "card.receipt"),
        ("receipt.technical", seg_technical, "local.local-read"),
        ("receipt.red", bool(receipt_required and seg_technical["state"] != "present"), "card.receipt"),
        ("card.name", CARD1_NAME, "generator"),
        ("card.generator", GENERATOR_NAME, "generator"),
        ("card.day", day, "generator"),
        ("card.as_of", iso_of(now), "generator"),
        ("card.red", card_red, "card.reasons"),
        ("card.reasons", reasons1, "card.reasons"),
    ]
    p1 = os.path.join(out_dir, "记忆更新报告-%s.xlsx" % day)

    # ── 卡 2 · 技术评审处置回执（第二段回执落在这一张上：组长 2026-11-02 裁定第 5 条）────
    wb2 = Workbook(); w = wb2.active; w.title = "每条的落点"
    w["A1"] = CARD2_NAME + " · 组长处置 · " + day; w["A1"].font = TITLE
    eqs = []
    for name, d in findings:
        cf = d.get("code_fingerprint") or {}
        eqs.append("%s: equal=%s" % (name, cf.get("equal")))
    w["A2"] = "作业书：job-briefs/technical-review.md · 每条发现**恰好一个落点**（采纳就开票 / 不采纳给原因）· 指纹 " + (" · ".join(eqs) if eqs else "（今天没有 findings 文件）")
    w["A2"].font = NOTE; w["A2"].alignment = WRAP
    w.append(()); w.append(("#", "级别", "发现（一句话）", "处置", "票号 / 落点", "下一步")); head(w, 6)
    n = 0
    fmap = (jload(os.path.join(out_dir, "findings-map.json"), {}) or {}).get("map", {})
    for name, d in findings:
        tag = "第一场" if name == "技术评审.findings.json" else ("第二场" if name.startswith("技术评审.2") else name)
        per = fmap.get(name, {})
        for f in (d.get("findings") or []):
            n += 1
            fid = f.get("id", "?")
            landing = per.get(fid)
            w.append((tag + " · " + str(fid), f.get("severity", "?"), f.get("title", ""),
                      "采纳" if landing else "🔴 未登记落点",
                      landing or "（组长还没写 findings-map.json —— 不许猜）",
                      f.get("next_step", "")))
        if per.get("_ticket"):
            w.append(("", "", "▲ " + tag + "：" + per["_ticket"], "", "", ""))
    if n == 0:
        w.append(("—", "—", "今天没有 findings（或作业没交）", "—", "—", "—"))
    widths(w, [("A", 8), ("B", 8), ("C", 62), ("D", 16), ("E", 26), ("F", 40)])
    w.freeze_panes = "A5"; w.auto_filter.ref = w.dimensions

    # 第二段（会话评审回执）——**只在这张卡上**，记忆更新报告那张不放（裁定第 5 条）。
    reasons2 = []
    if receipt_required and seg_conversation["state"] != "present":
        if seg_conversation["state"] == "expired":
            reasons2.append({"code": "RECEIPT_EXPIRED:conversation",
                             "detail": "会话评审回执停在上一个开工周期（%s），本周期 %s 没有" % (seg_conversation["day"], day)})
        else:
            reasons2.append({"code": "RECEIPT_MISSING:conversation",
                             "detail": "本周期 %s 没有会话评审回执（nodes.conversation 不是 done / 文件不在）" % day})
    card2_red = bool(reasons2)
    w.append(()); w.append(("会话评审回执（第二段）", "状态", "周期", "报告", "", "")); head(w, 4)
    w.append(("会话评审", seg_conversation["state"], seg_conversation["day"] or "—", seg_conversation["report_path"] or "—", "", ""))
    w.append(("卡 2 红", "🔴 是" if card2_red else "否",
              " · ".join(r["code"] for r in reasons2) or "—", "", "", ""))
    if card2_red:
        w["A1"].font = RED_TITLE

    card2_entries = [
        ("card.name", CARD2_NAME, "generator"),
        ("card.day", day, "generator"),
        ("receipt.required", receipt_required, "card.receipt"),
        ("receipt.conversation", seg_conversation, "local.local-read"),
        ("receipt.red", card2_red, "card.receipt"),
        ("card.reasons", reasons2, "card.receipt"),
    ]
    p2 = os.path.join(out_dir, "技术评审回执-%s.xlsx" % day)

    write_c2_sheet(wb, C2_SHEET, card1_entries)
    write_c2_sheet(wb2, C2_SHEET2, card2_entries)

    # ── 落盘（两张一起；中途失败 ⇒ 一张都不留 —— 绝不绿兜底）────────────────
    saved = []
    try:
        wb.save(p1); saved.append(p1); print("saved:", p1)
        wb2.save(p2); saved.append(p2); print("saved:", p2)
    except OSError as exc:
        for f in saved:
            try: os.remove(f)
            except OSError: pass
        raise CardFailure("E_CARD_WRITE", "卡写不进去：%s" % exc)

    print("读数：冻结 %d · 接受 %d · 拒绝 %d · 池子 %d · 处置生效 %d · findings %d 条 · 票 %d 张 · bug open %d · 状态条 %d 格（红 %d）· 卡红 %s"
          % (len(frozen), len(acc), len(rej), len(pool), len(decisions), n, tickets["total"], cap["bug_open"],
             len(bar), len([c for c in bar if c["state"] == "red"]), "是" if card_red else "否"))


def capacity_value(totals, key, ok):
    """容量那一行的读数：判不了（快照读不到 / 不是整数）时是 `?`（不是 0；机器格那边是 `null`）。"""
    if not ok:
        return "?"
    value = totals.get(key)
    return "?" if not is_int(value) else value


if __name__ == "__main__":
    try:
        main()
    except CardFailure as exc:
        report_failure(exc.code, exc.message)
        sys.exit(1)
    except SystemExit:
        raise
    except BaseException as exc:  # 任何没预料到的崩：也走同一条失败落点（不许静默 exit 0）
        report_failure("E_INTERNAL", "%s: %s" % (type(exc).__name__, exc))
        sys.exit(1)
