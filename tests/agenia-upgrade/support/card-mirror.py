#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""把**生成器里的纯函数**喂一份夹具、打一行 JSON —— 测试侧读"第二份实现"的唯一一口。

为什么要有它：卡上有两处**第二份实现**（`daily-cards.py::slot_state_of` 对 `lib/route.mjs::slotBusy`、
`daily-cards.py::default_day` 对本机另外两份 4 小时切点）。它们在盘上是**同一份事实的两份代码**，
而判据若只读卡上的读数，两份分叉时**一起错、一起绿**（`gate4-C2` F-02 / F-11）。
所以判据要能把**同一份输入**喂给两份实现、逐项比 —— 这个脚本就是喂 Python 那一份的那只手。

⚠️ 它 import **被测的那个生成器**（`.tools/daily-cards.py`）并调用它自己的函数 —— 不重写、不复制逻辑。
   `daily-cards.py` 的模块级只有常量与 def（`main()` 在 `__main__` 里），import 无副作用。

用法：
    E:\\Anaconda\\python.exe tests\\agenia-upgrade\\support\\card-mirror.py --op slot \\
        --cards .tools\\daily-cards.py --tasks <tasks.json> [--now 2026-11-02T10:00:00+08:00]
    E:\\Anaconda\\python.exe tests\\agenia-upgrade\\support\\card-mirror.py --op default-day \\
        --cards .tools\\daily-cards.py

输出（stdout **恰好一行** JSON；失败也出这一行）：
    {"ok": true, "op": "slot", "value": {"state": ..., "allow": ..., "holders": [...]}}
    {"ok": true, "op": "default-day", "value": "2026-11-01"}
    {"ok": false, "op": "...", "error": "E_..." }

`--now` 不给时走**生成器自己那个时钟**（`now_instant()` 读 `AGENIA_NOW_FILE`）——
与卡在同一跑里用的是同一个文件，不另造第二套时刻。
"""
import argparse
import importlib.util
import json
import os
import sys

# 🔴 **不许在 `.tools/` 里留字节码**：`importlib` 默认会在被测文件旁边写 `__pycache__/`，
#    那是往**生产目录**里落一个测试的产物（本岗对 `.tools/**` 零字节）。两个闸都关：
#    · 这里关掉本进程的字节码写入；
#    · `card-surface.mjs::pythonMirror()` 另外把 `PYTHONDONTWRITEBYTECODE=1` 传给子进程。
sys.dont_write_bytecode = True

# 控制台默认码页在 Windows 上是 GBK；这一行与另外两个 helper 同一口径（输出必须 UTF-8）。
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:  # pragma: no cover - 老 Python / 被替换过的流
        pass


def emit(payload, code=0):
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    return code


def load_cards(path):
    """把 `.tools/daily-cards.py` 当模块载入（**不执行 main**）。"""
    spec = importlib.util.spec_from_file_location("agenia_daily_cards_sut", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("E_IMPORT: 载入不了 %s" % path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def parse_now(text):
    s = text.strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    from datetime import datetime
    return datetime.fromisoformat(s)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--op", required=True, choices=["slot", "default-day"])
    ap.add_argument("--cards", required=True, help=".tools/daily-cards.py 的路径")
    ap.add_argument("--tasks", default=None, help="--op slot 用：一份 tasks[] 的 JSON 文件")
    ap.add_argument("--now", default=None, help="--op slot 用：ISO8601 带偏移；不给 ⇒ 生成器自己的时钟")
    a = ap.parse_args()

    path = os.path.abspath(a.cards)
    if not os.path.isfile(path):
        return emit({"ok": False, "op": a.op, "error": "E_NO_CARDS: %s" % path})
    try:
        mod = load_cards(path)
    except Exception as exc:
        return emit({"ok": False, "op": a.op, "error": "E_IMPORT: %s: %s" % (type(exc).__name__, exc)})

    if a.op == "default-day":
        fn = getattr(mod, "default_day", None)
        if not callable(fn):
            return emit({"ok": False, "op": a.op, "error": "E_SURFACE_MISSING: default_day"})
        try:
            value = fn()
        except Exception as exc:
            return emit({"ok": False, "op": a.op, "error": "E_CALL: %s: %s" % (type(exc).__name__, exc)})
        return emit({"ok": True, "op": a.op, "value": value})

    # ── slot：同一份 tasks[] 喂 Python 那一份镜像 ────────────────────────────
    fn = getattr(mod, "slot_state_of", None)
    if not callable(fn):
        return emit({"ok": False, "op": a.op, "error": "E_SURFACE_MISSING: slot_state_of"})
    if a.tasks is None:
        return emit({"ok": False, "op": a.op, "error": "E_ARG: --tasks 必填"})
    try:
        with open(a.tasks, encoding="utf-8") as f:
            tasks = json.load(f)
    except Exception as exc:
        return emit({"ok": False, "op": a.op, "error": "E_TASKS: %s: %s" % (type(exc).__name__, exc)})
    if not isinstance(tasks, list):
        return emit({"ok": False, "op": a.op, "error": "E_TASKS_SHAPE: 必须是数组"})
    try:
        now = parse_now(a.now) if a.now else mod.now_instant()
    except Exception as exc:
        return emit({"ok": False, "op": a.op, "error": "E_NOW: %s: %s" % (type(exc).__name__, exc)})
    try:
        value = fn(tasks, now)
    except Exception as exc:
        return emit({"ok": False, "op": a.op, "error": "E_CALL: %s: %s" % (type(exc).__name__, exc)})
    return emit({"ok": True, "op": a.op, "now": now.isoformat() if hasattr(now, "isoformat") else str(now), "value": value})


if __name__ == "__main__":
    sys.exit(main())
