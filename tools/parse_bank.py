"""把官方學科題庫 PDF 轉成 data/bank.json

用法：python tools/parse_bank.py
來源：source/official/*.pdf（技能檢定中心公告的 116/01/01 起適用版）
"""
import json
import re
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "source" / "official"
OUT = ROOT / "data" / "bank.json"

# 檔名 → 科目代號、簡稱
FILES = [
    ("222002A16.pdf", "22200", "職安乙級"),
    ("900060A10.pdf", "90006", "共同：職業安全衛生"),
    ("900070A19.pdf", "90007", "共同：工作倫理"),
    ("900080A16.pdf", "90008", "共同：環境保護"),
    ("900090A11.pdf", "90009", "共同：節能減碳"),
]

SECTION_RE = re.compile(r"^\s*(\d{5}) .*?工作項目(\d+)：(.+?)\s*$", re.M)
Q_RE = re.compile(r"^\s*(\d+)\.\s*\((\d+)\)", re.M)
MARKS = "①②③④"


def tidy(s: str) -> str:
    """接回 PDF 斷行：中文之間的換行、空白都拿掉，英數之間留一個空白"""
    s = s.replace("　", " ")
    s = re.sub(r"\s*\n\s*", "\n", s.strip())
    out = []
    for i, line in enumerate(s.split("\n")):
        if i and out and re.search(r"[A-Za-z0-9]$", out[-1]) and re.match(r"[A-Za-z]", line):
            out.append(" ")
        out.append(line)
    s = "".join(out)
    s = re.sub(r"(?<=[^\x00-\x7f]) +(?=[^\x00-\x7f])", "", s)
    s = re.sub(r"(?<=[^\x00-\x7f]) +(?=[0-9A-Za-z])", "", s)
    s = re.sub(r"(?<=[0-9A-Za-z%]) +(?=[^\x00-\x7f①②③④])", "", s)
    return re.sub(r" {2,}", " ", s).strip()


def split_options(body: str):
    pos = [body.find(m) for m in MARKS]
    if any(p < 0 for p in pos) or pos != sorted(pos):
        return None
    stem = body[: pos[0]]
    opts = [body[pos[i] + 1 : (pos[i + 1] if i < 3 else len(body))] for i in range(4)]
    opts[3] = re.sub(r"\s*。\s*$", "", opts[3])
    return tidy(stem), [tidy(o) for o in opts]


IMG_DIR = ROOT / "docs" / "img"


def snap(doc, stem, qid):
    """找到題目所在頁，從題幹往下截到下一題之前（含①～④圖片）"""
    for pg in doc:
        hits = pg.search_for(stem[:12])
        if not hits:
            continue
        top = hits[0].y0 - 4
        nxt = [b[1] for b in pg.get_text("blocks") if b[1] > hits[0].y1 + 10 and re.match(r"\s*\d+\.\s*\(", b[4])]
        bottom = min(nxt) - 2 if nxt else pg.rect.y1 - 40
        IMG_DIR.mkdir(parents=True, exist_ok=True)
        pix = pg.get_pixmap(clip=pymupdf.Rect(hits[0].x0 - 6, top, pg.rect.x1 - 30, bottom), dpi=110)
        pix.save(IMG_DIR / f"{qid}.png")
        return f"img/{qid}.png"
    return None


def parse(fname, code, short):
    doc = pymupdf.open(SRC / fname)
    text = "\n".join(pg.get_text() for pg in doc)
    text = re.sub(r"Page \d+ of \d+", "", text)
    sections = [(m.start(), m.group(2), m.group(3).strip()) for m in SECTION_RE.finditer(text)]
    qs, problems = [], []
    marks = list(Q_RE.finditer(text))
    for i, m in enumerate(marks):
        end = marks[i + 1].start() if i + 1 < len(marks) else len(text)
        # 下一個工作項目標題之前就截斷
        for s_pos, _, _ in sections:
            if m.end() < s_pos < end:
                end = s_pos
        sec = [s for s in sections if s[0] < m.start()][-1]
        body = text[m.end() : end]
        parts = split_options(body)
        if not parts:
            problems.append(f"{code}-{sec[1]}-{m.group(1)}")
            continue
        stem, opts = parts
        ans = [int(c) for c in m.group(2)]
        img = None
        if not any(opts):  # 選項是圖片（環保標章、節能標章），整段截圖
            img = snap(doc, stem, f"{code}-{sec[1]}-{int(m.group(1)):03d}")
        qs.append({
            "id": f"{code}-{sec[1]}-{int(m.group(1)):03d}",
            "subj": code,
            "subjName": short,
            "item": sec[1],
            "itemName": sec[2],
            "no": int(m.group(1)),
            "multi": len(ans) > 1,
            "ans": ans,
            "q": stem,
            "opts": opts,
            **({"img": img} if img else {}),
        })
    return qs, problems


def main():
    allq, allp = [], []
    for f in FILES:
        qs, p = parse(*f)
        print(f[0], len(qs), "題", f"單選 {sum(not q['multi'] for q in qs)}／複選 {sum(q['multi'] for q in qs)}",
              "解析失敗：" + ",".join(p) if p else "")
        allq += qs
        allp += p
    ids = [q["id"] for q in allq]
    assert len(ids) == len(set(ids)), "題號重複"
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps({"version": "116-01-01", "questions": allq}, ensure_ascii=False, indent=0),
                   encoding="utf-8")
    print("共", len(allq), "題 →", OUT)


if __name__ == "__main__":
    main()
