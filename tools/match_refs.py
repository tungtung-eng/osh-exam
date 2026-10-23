"""每一題自動找「最相關的條文」→ web/data/refs.json  {題號: [法規名, 條號]}

做法：題幹＋正確選項切成兩字詞，跟條文比對重疊程度（越少見的詞越加分）。
題目寫明「依○○規定」的只在那部法規裡找；沒寫的，分數夠高才配。
抽樣檢查：python tools/match_refs.py --show 20
"""
import collections
import json
import math
import random
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BANK = json.loads((ROOT / "data/bank.json").read_text(encoding="utf-8"))["questions"]
LAWS = json.loads((ROOT / "docs/data/laws.json").read_text(encoding="utf-8"))
OUT = ROOT / "docs/data/refs.json"

CN_NUM = {"0": "零", "1": "一", "2": "二", "3": "三", "4": "四", "5": "五", "6": "六", "7": "七", "8": "八", "9": "九"}
STOP = set("下列 何者 規定 雇主 勞工 應依 依下 列何 正確 錯誤 哪些 以上 以下 多少 下列哪 之規 有關 屬於 對於 應於 不得 其他".split())


def cn_number(s):
    """題目寫 1.5、90，條文寫一點五、九十：把阿拉伯數字轉成條文的寫法，兩種都比對"""
    def conv(m):
        t = m.group(0)
        if "." in t:
            a, b = t.split(".")
            return conv_int(a) + "點" + "".join(CN_NUM[c] for c in b)
        return conv_int(t)

    def conv_int(t):
        n = int(t)
        if n == 0:
            return "零"
        if n >= 10000:
            return t
        units = [(1000, "千"), (100, "百"), (10, "十")]
        out, zero = "", False
        for u, ch in units:
            d = n // u
            n %= u
            if d:
                if zero:
                    out += "零"
                out += ("" if (u == 10 and d == 1 and not out) else CN_NUM[str(d)]) + ch
                zero = False
            elif out:
                zero = True
        if n:
            out += ("零" if zero else "") + CN_NUM[str(n)]
        return out
    return re.sub(r"\d+(?:\.\d+)?", conv, s)


def grams(s):
    s = re.sub(r"[\s，。、；：（）()「」？?！!,.:;]", "", s)
    return {s[i:i + 2] for i in range(len(s) - 1)} - STOP


def main():
    # 每部法規、每一條的詞
    docs = []
    for name, law in LAWS.items():
        for no, body in law["arts"]:
            docs.append((name, no, grams(body)))
    df = collections.Counter(g for _, _, gs in docs for g in gs)
    N = len(docs)
    idf = {g: math.log(N / c) for g, c in df.items()}

    refs, scores = {}, {}
    for q in BANK:
        if q["subj"] != "22200":
            continue
        right = " ".join(q["opts"][a - 1] for a in q["ans"])
        text = q["q"] + right
        qg = grams(text) | grams(cn_number(text))
        m = re.search(r"依(.{2,25}?)(?:之)?規定", q["q"])
        law = m.group(1) if m else None
        law = next((n for n in LAWS if law and (n == law or law.startswith(n))), None)
        pool = [d for d in docs if d[0] == law] if law else docs
        best, bs = None, 0
        for name, no, gs in pool:
            s = sum(idf.get(g, 0) for g in qg & gs)
            if s > bs:
                best, bs = (name, no), s
        # 沒指定法規時，分數要夠高才採用，免得硬配
        if best and (law or bs >= 45):
            refs[q["id"]] = [*best, round(bs)]
            scores[q["id"]] = bs
    OUT.write_text(json.dumps(refs, ensure_ascii=False), encoding="utf-8")
    print(f"配到 {len(refs)} / {sum(q['subj'] == '22200' for q in BANK)} 題 → {OUT}")

    if "--show" in sys.argv:
        k = int(sys.argv[sys.argv.index("--show") + 1])
        byid = {q["id"]: q for q in BANK}
        for qid in random.sample(list(refs), k):
            name, no = refs[qid][:2]
            body = dict(LAWS[name]["arts"])[no]
            q = byid[qid]
            print(f"\n{qid} ({scores[qid]:.0f}) {q['q'][:60]} ＝ {q['opts'][q['ans'][0] - 1][:30]}\n  → {name} {no}：{body[:90]}")


if __name__ == "__main__":
    main()
