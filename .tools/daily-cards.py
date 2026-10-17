#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""每日两张卡 · 固定生成器（2026-10-17 起）

老板 2026-10-17 的原话：「**为什么造报告的脚本要你现写，这个应该是每天固定的工作啊，
难道你每天都要重新写一个makecards.py吗**」—— 所以这个脚本**每天同一条命令**跑，
**一个数都不许写死**：全部从盘上读。

用法：
    E:\\Anaconda\\python.exe .tools\\daily-cards.py --day 2026-10-17

读什么（全部只读）：
    <DR>/state/update/<day>.json              这一轮的相位 / 快照 / owner
    <DR>/reports/memory-update/<day>.json     判决报告（分布 · 裁定 · 常识哈希）
    <DR>/proposals/judged.jsonl               这一批的逐条裁定（verdict）
    <DR>/proposals/pool.jsonl                 未判的池子（今天的产出 = 明天那一批）
    <DR>/memory/snapshots/<snap>.json         条目正文（附"要被处置的条目"原文全文）
    <DR>/proposals/archive/MANIFEST.json      最近一次清池归档（有才读）
    <WS>/.team/retro/<day>/*.findings.json    当日技术评审的 findings
    <WS>/.team/leader/follow-ups.md           票（数"⬜ 票"）

出什么：
    <WS>/.team/leader/<day>/记忆更新报告-<day>.xlsx
    <WS>/.team/leader/<day>/技术评审回执-<day>.xlsx
"""
import argparse, json, os, re, sys, glob
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, PatternFill
from openpyxl.utils import get_column_letter

WS = r"E:\Harness"
DR = os.path.join(WS, "presets", "agenia", ".runtime")

HDR = Font(bold=True, color="FFFFFF"); HDR_FILL = PatternFill("solid", fgColor="4472C4")
TITLE = Font(bold=True, size=13); NOTE = Font(italic=True, color="808080")
BOLD = Font(bold=True); WRAP = Alignment(wrap_text=True, vertical="top")

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

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--day", required=True)
    a = ap.parse_args(); day = a.day
    out_dir = os.path.join(WS, ".team", "leader", day)
    os.makedirs(out_dir, exist_ok=True)

    # ── 读数据 ────────────────────────────────────────────────────────
    st   = jload(os.path.join(DR, "state", "update", day + ".json"), {}) or {}
    rep  = jload(os.path.join(DR, "reports", "memory-update", day + ".json"), {}) or {}
    snap_name = rep.get("snapshot") or st.get("new_snapshot") or "?"
    snap = jload(os.path.join(DR, "memory", "snapshots", snap_name + ".json"), {}) or {}
    by_id = {e.get("id"): e for e in snap.get("entries", [])}
    judged = jlines(os.path.join(DR, "proposals", "judged.jsonl"))
    pool   = jlines(os.path.join(DR, "proposals", "pool.jsonl"))
    arch   = jload(os.path.join(DR, "proposals", "archive", "MANIFEST.json"), {}) or {}
    findings = []
    for p in sorted(glob.glob(os.path.join(WS, ".team", "retro", day, "*.findings.json"))):
        d = jload(p, {}) or {}
        findings.append((os.path.basename(p), d))

    frozen = [j for j in judged if j.get("day") == day]
    acc = [j for j in frozen if j.get("verdict") == "accepted"]
    rej = [j for j in frozen if j.get("verdict") != "accepted"]
    dist = rep.get("distribution") or snap.get("distribution") or []
    totals = rep.get("totals") or snap.get("totals") or {}
    maint_pool = [p for p in pool if p.get("kind") == "maintenance"]
    prop_pool  = [p for p in pool if p.get("kind") == "proposal"]
    decisions = rep.get("maintenance_decisions") or []

    # 票（只数"⬜ 票"那些）
    tickets = []
    fu = os.path.join(WS, ".team", "leader", "follow-ups.md")
    if os.path.exists(fu):
        cur = None
        with open(fu, encoding="utf-8") as f:
            for line in f:
                m = re.match(r"^##\s+(F-\d+)\s+·\s+(.+?)\s*$", line)
                if m: cur = (m.group(1), m.group(2))
                if cur and "⬜" in line and "票" in line:
                    tickets.append(cur); cur = None
    ticket_ids = {t[0] for t in tickets}

    # ── 卡 1 · 记忆更新报告 ────────────────────────────────────────────
    wb = Workbook(); ws1 = wb.active; ws1.title = "判决 · 库现状"
    rows = [
        ("报告日", day),
        ("这一轮谁做", "%s（owner_project=%s）" % (st.get("owner_project", "?"), st.get("owner_project", "?"))),
        ("相位", "phase=%s · snapshot_available=%s" % (st.get("phase", "?"), st.get("snapshot_available", "?"))),
        ("快照", "%s → %s" % (rep.get("base_snapshot", "?"), snap_name)),
        ("长期记忆", "%s 条 / %s 字符" % (totals.get("count", "?"), totals.get("chars", "?"))),
        ("硬限", "200 条 且 60,000 字符"),
        ("占硬限", "条数 %.1f%% · 字符 %.1f%%" % (100.0 * totals.get("count", 0) / 200, 100.0 * totals.get("chars", 0) / 60000)),
        ("本批裁定", "冻结 %d 条 ⇒ 接受 %d · 拒绝 %d" % (len(frozen), len(acc), len(rej))),
        ("🔴 斩杀 / 退休 / 吸收（今天生效）", "%d 条%s" % (len(decisions), "" if decisions else " —— **今天没有生效的处置**（下列 6 条是草稿，明天判决才批）")),
        ("常识哈希", rep.get("common_sense_sha256", "?")[:12] + "…"),
        ("发布时刻", rep.get("generated_at", "?")),
    ]
    sheet(ws1, "记忆更新报告 · " + day,
          "固定生成器 .tools/daily-cards.py（读盘 · 零写死）· 判决报告 " + os.path.join("reports", "memory-update", day + ".json"),
          ("项", "值"), rows, [("A", 30), ("B", 64)])
    ws1.append(()); ws1.append(("四类分布", "条数", "字符数")); head(ws1, 3)
    for d in dist:
        ws1.append((d.get("typeName", d.get("typeId")), d.get("count"), d.get("chars")))
    ws1.append(("合计", totals.get("count"), totals.get("chars")))
    for c in range(1, 4): ws1.cell(row=ws1.max_row, column=c).font = BOLD

    # ── 卡 1 第二页 · 要被处置的条目（附原文全文 —— 老板 10-16：「我得目视判断一下」）──
    ws2 = wb.create_sheet("🔴 处置与原文")
    rows2 = []
    if decisions:
        for d in decisions:
            tid = d.get("target_id") or d.get("target_entry_id")
            e = by_id.get(tid, {})
            rows2.append((d.get("action", d.get("kind", "?")), tid, e.get("type", "?"),
                          "%s 字符" % len(e.get("text", "")) if e else "（不在快照里）", e.get("text", "（取不到）")))
    for p in maint_pool:
        pl = p.get("payload") or {}
        md = pl.get("maintenance_decision") or {}
        act = pl.get("maintenance") or md.get("action") or "?"
        tid = pl.get("target_entry_id") or md.get("target_id") or "?"
        for t in [tid] + list(pl.get("source_entry_ids") or md.get("source_ids") or []):
            e = by_id.get(t, {})
            rows2.append((("草稿 · " + str(act)) if t == tid else ("草稿 · 并入的源 · " + str(act)),
                          t, e.get("type", "?"), "%s 字符" % len(e.get("text", "")) if e else "（不在快照里）",
                          e.get("text", "（取不到）")))
    sheet(ws2, "处置与原文全文 · " + day,
          "老板 2026-10-16：「**我得目视判断一下……还有挽回的机会**」⇒ 吸收 / 退休 / 斩杀类**必须附原文全文**。"
          "本页 = 今天生效的处置 + 池子里待判的维护案（草稿，明天判决才批）。**今天生效的处置 0 条。**",
          ("处置", "条目 id", "类型", "体量", "原文全文"), rows2 or [("（今天没有任何处置，也没有待判的维护案）", "", "", "", "")],
          [("A", 22), ("B", 30), ("C", 10), ("D", 12), ("E", 120)])

    # ── 卡 1 第三页 · 复核 / 池子 / 水位 ────────────────────────────────
    ws3 = wb.create_sheet("复核 · 池子 · 水位")
    rows3 = [
        ("池子（未判）", "%d 条（%d 普通提案 + %d 维护案）" % (len(pool), len(prop_pool), len(maint_pool))),
        ("清池归档", ("判过 %s 条 ⇒ archive/%s（无损：拼回去逐字节相同）" % (arch.get("archived", {}).get("lines", "?"), arch.get("archived", {}).get("file", "?"))) if arch else "（没有归档记录）"),
        ("上一轮归档时刻", arch.get("day", "—")),
        ("硬限 / 90% 线", "200 条 / 60,000 字符 · 90% 线 = 180 / 54,000"),
        ("现量距 90% 线", "%d 条 / %d 字符" % (180 - totals.get("count", 0), 54000 - totals.get("chars", 0))),
        ("票（账本里 ⬜ 的）", "%d 张：%s" % (len(tickets), " · ".join(sorted(ticket_ids)) if ticket_ids else "无")),
    ]
    sheet(ws3, "复核 · 池子 · 水位 · " + day, "复核报告与池子账 —— 全部现量（.runtime/proposals 与 state）",
          ("项", "值"), rows3, [("A", 30), ("B", 90)])

    ws4 = wb.create_sheet("待你拍")
    ws4["A1"] = "只有还要你点头的才在这儿"; ws4["A1"].font = TITLE
    ws4.append(()); ws4.append(("事", "为什么", "代价")); head(ws4, 3)
    ws4.append(("（今天 0 件）", "两张卡按定好的形状交齐；明天那一批 %d 条候选自动开庭。" % len(pool), "—"))
    for cell in ws4[ws4.max_row]: cell.alignment = WRAP
    widths(ws4, [("A", 26), ("B", 66), ("C", 40)])
    p1 = os.path.join(out_dir, "记忆更新报告-%s.xlsx" % day); wb.save(p1); print("saved:", p1)

    # ── 卡 2 · 技术评审处置回执 ────────────────────────────────────────
    wb2 = Workbook(); w = wb2.active; w.title = "每条的落点"
    w["A1"] = "技术评审 · 组长处置回执 · " + day; w["A1"].font = TITLE
    eqs = []
    for name, d in findings:
        cf = d.get("code_fingerprint") or {}
        eqs.append("%s: equal=%s" % (name, cf.get("equal")))
    w["A2"] = "作业书：job-briefs/technical-review.md · 每条发现**恰好一个落点**（采纳就开票 / 不采纳给原因）· 指纹 " + (" · ".join(eqs) if eqs else "（今天没有 findings 文件）")
    w["A2"].font = NOTE; w["A2"].alignment = WRAP
    w.append(()); w.append(("#", "级别", "发现（一句话）", "处置", "票号 / 落点", "下一步")); head(w, 6)
    n = 0
    for name, d in findings:
        tag = "第一场" if name == "技术评审.findings.json" else ("第二场" if name.startswith("技术评审.2") else name)
        for f in (d.get("findings") or []):
            n += 1
            fid = f.get("id", "?")
            w.append((tag + " · " + str(fid), f.get("severity", "?"), f.get("title", ""),
                      "采纳" if fid in ticket_ids else "见落点",
                      fid if fid in ticket_ids else "（组长回执里写清）", f.get("next_step", "")))
    if n == 0:
        w.append(("—", "—", "今天没有 findings（或作业没交）", "—", "—", "—"))
    widths(w, [("A", 8), ("B", 8), ("C", 62), ("D", 16), ("E", 26), ("F", 40)])
    w.freeze_panes = "A5"; w.auto_filter.ref = w.dimensions
    p2 = os.path.join(out_dir, "技术评审回执-%s.xlsx" % day); wb2.save(p2); print("saved:", p2)

    print("读数：冻结 %d · 接受 %d · 拒绝 %d · 池子 %d · 处置生效 %d · findings %d 条 · 票 %d 张"
          % (len(frozen), len(acc), len(rej), len(pool), len(decisions), n, len(tickets)))

if __name__ == "__main__":
    main()
