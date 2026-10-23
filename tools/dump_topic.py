"""把一個主題的題目＋正確答案＋自動配到的條文印出來，寫解說用：python tools/dump_topic.py T17"""
import json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
bank = json.loads((ROOT / "data/bank.json").read_text(encoding="utf-8"))["questions"]
refs = json.loads((ROOT / "docs/data/refs.json").read_text(encoding="utf-8"))
laws = json.loads((ROOT / "docs/data/laws.json").read_text(encoding="utf-8"))
show_law = "--law" in sys.argv
for q in bank:
    if q["topic"] != sys.argv[1]:
        continue
    opts = " | ".join(f"{i+1}{'*' if i+1 in q['ans'] else ''}{o}" for i, o in enumerate(q["opts"]))
    print(f"{q['id']} {q['q']}  {opts}")
    if show_law and q["id"] in refs:
        name, no, sc = refs[q["id"]]
        body = dict(laws[name]["arts"])[no]
        print(f"   ↳ {name}{no}({sc}) {body[:260]}")
