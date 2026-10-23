"""整理成網站要用的資料，改完內容跑這支：python tools/build.py

- content/explain/*.json → web/data/explain.json（每題解說）
- content/notes/T10.html …  → web/data/notes.json（主題重點，第一行 <h1> 當標題）
- data/bank.json → web/data/bank.json
- sw.js 版本、config.js build 日期自動更新（手機才會抓新版）
"""
import datetime
import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "docs"


def main():
    bank = json.loads((ROOT / "data/bank.json").read_text(encoding="utf-8"))["questions"]
    ids = {q["id"] for q in bank}
    ex = {}
    for f in sorted((ROOT / "content/explain").glob("*.json")):
        d = json.loads(f.read_text(encoding="utf-8"))
        bad = [k for k in d if k not in ids]
        assert not bad, f"{f.name} 有題庫裡沒有的題號：{bad}"
        ex.update(d)
    notes = {}
    for f in sorted((ROOT / "content/notes").glob("*.html")):
        html = f.read_text(encoding="utf-8")
        m = re.match(r"\s*<h1>(.*?)</h1>", html)
        notes[f.stem] = {"title": m.group(1) if m else "", "html": html[m.end():] if m else html}
    (WEB / "data/explain.json").write_text(json.dumps(ex, ensure_ascii=False), encoding="utf-8")
    (WEB / "data/notes.json").write_text(json.dumps(notes, ensure_ascii=False), encoding="utf-8")
    shutil.copy(ROOT / "data/bank.json", WEB / "data/bank.json")

    stamp = datetime.datetime.now().strftime("%Y%m%d%H%M")
    sw = (WEB / "sw.js").read_text(encoding="utf-8")
    (WEB / "sw.js").write_text(re.sub(r"const VER = '[^']*';", f"const VER = 'osh-{stamp}';", sw), encoding="utf-8")
    cfg = (WEB / "config.js").read_text(encoding="utf-8")
    (WEB / "config.js").write_text(re.sub(r"build: '[^']*'", f"build: '{stamp}'", cfg), encoding="utf-8")

    by_topic = {}
    for q in bank:
        t = by_topic.setdefault(q["topic"], [0, 0, q["topicName"]])
        t[0] += 1
        t[1] += q["id"] in ex
    print(f"解說 {len(ex)} 題、重點 {len(notes)} 個主題，版本 {stamp}")
    for k, (n, e, name) in sorted(by_topic.items()):
        print(f"  {k} {name}：解說 {e}/{n}" + ("　📘" if k in notes else ""))


if __name__ == "__main__":
    main()
