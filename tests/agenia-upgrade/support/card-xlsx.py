#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""把一张 `.xlsx` 的**单元格值**打成一行 JSON —— 测试侧读卡的唯一一口（`C2 · 验收格`）。

为什么单开一个 python 小工具，而不是在 Node 里读 xlsx：
  · 生成器（`.tools/daily-cards.py`）用的就是 **openpyxl**；读它用**同一把尺子**，
    "写得出来、读不回来"那种半修在这里会当场翻面；
  · 单元格的**类型**（数 / 串 / 布尔 / None）必须原样带出来 ——
    卡上的 `0` 与 `""` 是两件事（契约 §2.1），Node 侧再写一个 xlsx 解析器就会把这个差别吃掉。

用法：
    E:\\Anaconda\\python.exe tests\\agenia-upgrade\\support\\card-xlsx.py --xlsx <path> [--sheet <name>]
    E:\\Anaconda\\python.exe tests\\agenia-upgrade\\support\\card-xlsx.py --xlsx <path> ^
        --copy-to <new.xlsx> --set "<行标签>=<值>" [--set "<另一行>=<值>" ...]

输出（stdout **恰好一行** JSON；失败也出这一行，`ok:false` + `error`）：
    {"ok": true, "file": "...", "sheet_names": ["..."],
     "sheets": [{"name": "C2 · 验收格", "rows": [[...], ...]}]}

⚠️ 只读：不写盘、不建目录、不改任何 xlsx。文件不在 ⇒ `ok:false` + `error:"E_NO_FILE"`。

`--copy-to` 那一支是**唯一的写**，而且**只写新文件**（`--xlsx` 那一份一个字节都不动 ——
`cand-20261022-0208`：读数 / 产物不许原地重写）：把卡复制一份、只改**第一张 sheet** 里
`格 == <行标签>` 那几行的值，机器读那一页不动。用途是"正文 ↔ 机器格同值"（契约 §2.2）的**负样本**：
造一张"正文与机器格各说各的"的卡，看判据抓不抓得到（`gate4-C2` F-08）。
"""
import argparse
import json
import os
import sys

# 🔴 输出必须是 UTF-8，**不能**跟控制台的默认码页走：生成器的卡里有一页叫「🔴 处置与原文」，
#    在 Windows 上 sys.stdout 默认是 GBK ⇒ `json.dumps(..., ensure_ascii=False)` 写不出去、
#    整个 helper 以 Traceback 收场 ⇒ 读卡一侧读成 `E_DUMP_JSON`，六格会一起报"页不在"，
#    而那其实是**量具崩了**，不是被测对象的样子（`mig-test-05`）。
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:  # pragma: no cover - 老 Python / 被替换过的流
        pass

try:
    from openpyxl import load_workbook
except Exception as exc:  # pragma: no cover - 环境问题，但要如实报
    sys.stdout.write(json.dumps({"ok": False, "error": "E_NO_OPENPYXL: %s" % exc}, ensure_ascii=False) + "\n")
    sys.exit(7)


def cell_value(cell):
    """单元格的原值：openpyxl 已经给了 Python 类型；这里只把"非基本类型"转成字符串。"""
    value = cell.value
    if value is None:
        return None
    if isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--xlsx", required=True)
    ap.add_argument("--sheet", default=None)
    ap.add_argument("--copy-to", default=None,
                    help="复制到哪（**只写这个新文件**；给了它就走 --set 那一支）")
    ap.add_argument("--set", action="append", default=[],
                    help='改第一张 sheet 的某一行，形如 "<行标签>=<值>"（可重复）')
    a = ap.parse_args()
    path = os.path.abspath(a.xlsx)
    if not os.path.isfile(path):
        sys.stdout.write(json.dumps({"ok": False, "file": path, "error": "E_NO_FILE"}, ensure_ascii=False) + "\n")
        return 0
    try:
        wb = load_workbook(path, read_only=False, data_only=True)
    except Exception as exc:
        sys.stdout.write(json.dumps({"ok": False, "file": path, "error": "E_OPEN_FAILED: %s" % exc}, ensure_ascii=False) + "\n")
        return 0

    # ── --copy-to：复制一份、只改正文那几格（负样本用；原卡不动）────────────────
    if a.copy_to:
        target = os.path.abspath(a.copy_to)
        if target == path:
            sys.stdout.write(json.dumps({"ok": False, "file": target, "error": "E_SAME_FILE"}, ensure_ascii=False) + "\n")
            return 0
        if not a.set:
            sys.stdout.write(json.dumps({"ok": False, "file": target, "error": "E_NO_SET"}, ensure_ascii=False) + "\n")
            return 0
        ws = wb[wb.sheetnames[0]]
        patched = []
        for spec in a.set:
            label, sep, value = spec.partition("=")
            if not sep:
                sys.stdout.write(json.dumps({"ok": False, "file": target, "error": "E_SET_SHAPE: %s" % spec}, ensure_ascii=False) + "\n")
                return 0
            want = label.strip()
            hit = None
            for row in ws.iter_rows(min_row=1):
                cell = row[0]
                if isinstance(cell.value, str) and cell.value.strip() == want:
                    hit = row
                    break
            if hit is None:
                sys.stdout.write(json.dumps({"ok": False, "file": target, "error": "E_SET_NO_ROW: %s" % want}, ensure_ascii=False) + "\n")
                return 0
            before = hit[1].value
            hit[1].value = value
            patched.append({"row": want, "before": before, "after": value})
        try:
            os.makedirs(os.path.dirname(target), exist_ok=True)
            wb.save(target)
        except Exception as exc:
            sys.stdout.write(json.dumps({"ok": False, "file": target, "error": "E_WRITE_FAILED: %s" % exc}, ensure_ascii=False) + "\n")
            return 0
        sys.stdout.write(json.dumps({"ok": True, "file": target, "source": path, "patched": patched},
                                    ensure_ascii=False) + "\n")
        return 0

    names = list(wb.sheetnames)
    wanted = names if a.sheet is None else ([a.sheet] if a.sheet in names else [])
    sheets = []
    for name in wanted:
        ws = wb[name]
        rows = [[cell_value(c) for c in row] for row in ws.iter_rows()]
        # 去掉尾部整行空行（openpyxl 的 max_row 会把"只设过格式的空行"也算进来）；
        # 行内的 None **保留** —— 列位是信息。
        while rows and all(v is None for v in rows[-1]):
            rows.pop()
        sheets.append({"name": name, "rows": rows})
    out = {
        "ok": True,
        "file": path,
        "sheet_names": names,
        "sheets": sheets,
        "missing_sheet": (a.sheet is not None and a.sheet not in names) or None,
    }
    sys.stdout.write(json.dumps(out, ensure_ascii=False) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
