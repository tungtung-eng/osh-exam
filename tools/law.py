"""查條文：python tools/law.py 法規名稱(可部分) 關鍵字 [關鍵字…]   （全部關鍵字都要出現）"""
import json, sys
from pathlib import Path
laws = json.loads((Path(__file__).resolve().parent.parent / "docs/data/laws.json").read_text(encoding="utf-8"))
name, kws = sys.argv[1], sys.argv[2:]
for n, law in laws.items():
    if name not in n:
        continue
    for no, body in law["arts"]:
        if all(k in body for k in kws):
            print(f"【{n} {no}】\n{body}\n")
