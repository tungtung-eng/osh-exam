"""把 App 會念的每一句預先錄成 MP3（docs/audio/<id>.mp3），iPhone 靜音模式也聽得到

用法：python tools/build_audio.py            只錄還沒錄過的句子
      python tools/build_audio.py --prune    另外刪掉已經用不到的舊檔
      python tools/build_audio.py --list     只列出要錄幾句，不錄
      python tools/build_audio.py --redo     全部刪掉重錄

- 句子怎麼切，要跟 docs/app.js 念的方式一模一樣（quizParts、speakCur、qParts、noteLines）
- 檔名 id ＝ cyrb53(VOICE_KEY + '|' + 原句)，app.js 用同一個算法找檔案
- 用 Windows 內建台灣中文語音（tools/tts_batch.ps1），不用連網；再用 ffmpeg 轉 MP3
"""
import concurrent.futures as cf
import json
import re
import subprocess
import sys
import tempfile
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "audio"
VOICE = "Yating"
SPEAKING_RATE = 1.2           # 錄音語速；App 播放時再乘上使用者設定的語速
VOICE_KEY = f"{VOICE}{SPEAKING_RATE}"
NUM = ["", "一", "二", "三", "四"]
# 語音引擎每句頭尾會留 0.1／0.6 秒空白，一段接一段播會拖很久：剪到只剩一點點
_SR = "silenceremove=start_periods=1:start_threshold=-45dB:start_silence="
TRIM = f"{_SR}0.02,areverse,{_SR}0.05,areverse"
FIXED = ["答對了。", "答錯了。", "正確答案是", "答案是", "這是複選題，要選兩個以上", "下一題"]


def cyrb53(s, seed=0):
    """跟 app.js 的 cyrb53 一樣（以 UTF-16 字元計算）"""
    M = 0xFFFFFFFF
    h1, h2 = 0xDEADBEEF ^ seed, 0x41C6CE57 ^ seed
    data = s.encode("utf-16-le")
    for i in range(0, len(data), 2):
        ch = data[i] | (data[i + 1] << 8)
        h1 = ((h1 ^ ch) * 2654435761) & M
        h2 = ((h2 ^ ch) * 1597334677) & M
    h1 = ((h1 ^ (h1 >> 16)) * 2246822507) & M
    h1 ^= ((h2 ^ (h2 >> 13)) * 3266489909) & M
    h2 = ((h2 ^ (h2 >> 16)) * 2246822507) & M
    h2 ^= ((h1 ^ (h1 >> 13)) * 3266489909) & M
    n = 4294967296 * (2097151 & h2) + h1
    digits = "0123456789abcdefghijklmnopqrstuvwxyz"
    out = ""
    while True:
        n, r = divmod(n, 36)
        out = digits[r] + out
        if not n:
            return out


def audio_id(text):
    return cyrb53(VOICE_KEY + "|" + text)


class NoteLines(HTMLParser):
    """跟 app.js 的 noteLines() 一樣：h3、p、li、tr 各念一句（巢狀的 li 外層也算一句）"""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.open = []          # [tag, texts 或 cells]
        self.lines = []         # (開始順序, 句子)
        self.order = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("h3", "p", "li"):
            self.open.append([tag, [], self.order])
            self.order += 1
        elif tag == "tr":
            self.open.append([tag, [], self.order])
            self.order += 1
        elif tag in ("td", "th"):
            for o in reversed(self.open):
                if o[0] == "tr":
                    o[1].append([])
                    break

    def handle_endtag(self, tag):
        if tag not in ("h3", "p", "li", "tr"):
            return
        for i in range(len(self.open) - 1, -1, -1):
            if self.open[i][0] == tag:
                t, data, order = self.open.pop(i)
                if t == "tr":
                    cells = [re.sub(r"\s+", " ", "".join(c)).strip() for c in data]
                    text = "，".join(c for c in cells if c)
                else:
                    text = re.sub(r"\s+", " ", "".join(data)).strip()
                if text:
                    self.lines.append((order, text))
                break

    def handle_data(self, d):
        for o in self.open:
            if o[0] == "tr":
                if o[1]:
                    o[1][-1].append(d)
            else:
                o[1].append(d)


def note_lines(html):
    p = NoteLines()
    p.feed(html)
    return [t for _, t in sorted(p.lines)]


def collect():
    texts = set(FIXED) | {n + "、" for n in NUM[1:]}
    bank = json.loads((ROOT / "data/bank.json").read_text(encoding="utf-8"))["questions"]
    for q in bank:
        texts.add(q["q"])
        if not q.get("img"):
            texts.update(q["opts"])
    texts.update(json.loads((ROOT / "docs/data/explain.json").read_text(encoding="utf-8")).values())
    for n in json.loads((ROOT / "docs/data/notes.json").read_text(encoding="utf-8")).values():
        texts.update(note_lines(n["html"]))
    js = (ROOT / "docs/vis-data.js").read_text(encoding="utf-8")
    for m in re.finditer(r"say:\s*'((?:[^'\\]|\\.)*)'", js):
        texts.add(m.group(1).encode().decode("unicode_escape") if "\\" in m.group(1) else m.group(1))
    return {audio_id(t): t for t in texts if t.strip()}


def for_speech(t):
    """只影響錄音的讀法（不影響 id）"""
    rep = [("①", "一、"), ("②", "二、"), ("③", "三、"), ("④", "四、"), ("℃", "度C"), ("°C", "度C"),
           ("mg/m3", "毫克每立方公尺"), ("mg/m³", "毫克每立方公尺"), ("kg/cm2", "公斤每平方公分"), ("kg/cm 2", "公斤每平方公分"),
           ("kg/cm²", "公斤每平方公分"), ("m³", "立方公尺"), ("m3", "立方公尺"), ("m²", "平方公尺"), ("m/s", "公尺每秒"),
           ("dBA", "分貝"), ("dB", "分貝"), ("CO₂", "二氧化碳"), ("≥", "大於等於"), ("≤", "小於等於"), ("％", "%"),
           ("\n", "，"), ("\t", " ")]
    for a, b in rep:
        t = t.replace(a, b)
    return t


def main():
    items = collect()
    OUT.mkdir(parents=True, exist_ok=True)
    if "--redo" in sys.argv:          # 全部重錄
        for p in OUT.glob("*.mp3"):
            p.unlink()
    have = {p.stem for p in OUT.glob("*.mp3")}
    todo = {k: v for k, v in items.items() if k not in have}
    print(f"共 {len(items)} 句，已有 {len(items) - len(todo)}，要錄 {len(todo)} 句（約 {sum(map(len, todo.values()))} 字）")
    if "--list" in sys.argv:
        return

    work = Path(tempfile.gettempdir()) / "osh_tts_wav"
    work.mkdir(exist_ok=True)
    if todo:
        # 分 4 份同時錄
        keys = sorted(todo)
        parts = [keys[i::4] for i in range(4)]
        procs = []
        for i, part in enumerate(parts):
            lst = work / f"list{i}.txt"
            lst.write_text("\n".join(f"{k}\t{for_speech(todo[k])}" for k in part), encoding="utf-8")
            procs.append(subprocess.Popen(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
                                           str(ROOT / "tools/tts_batch.ps1"), "-List", str(lst), "-OutDir", str(work),
                                           "-Voice", VOICE, "-Rate", str(SPEAKING_RATE)]))
        for p in procs:
            p.wait()

        def conv(k):
            wav = work / f"{k}.wav"
            if not wav.exists():
                return k, False
            r = subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(wav), "-af", TRIM, "-ac", "1", "-ar", "22050",
                                "-b:a", "24k", str(OUT / f"{k}.mp3")], capture_output=True)
            if r.returncode == 0:
                wav.unlink()
            return k, r.returncode == 0

        with cf.ThreadPoolExecutor(8) as ex:
            res = list(ex.map(conv, todo))
        bad = [k for k, ok in res if not ok]
        print(f"轉檔完成，失敗 {len(bad)} 句" + (f"：{bad[:10]}" if bad else ""))

    # 一小段無聲，App 用來在按按鈕時「解鎖」聲音
    sil = OUT / "silence.mp3"
    if not sil.exists():
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=22050:cl=mono", "-t", "0.3",
                        "-b:a", "24k", str(sil)])
    if "--prune" in sys.argv:
        stale = [p for p in OUT.glob("*.mp3") if p.stem not in items and p.stem != "silence"]
        for p in stale:
            p.unlink()
        print(f"刪掉用不到的 {len(stale)} 個")
    ids = sorted(p.stem for p in OUT.glob("*.mp3") if p.stem in items)
    (OUT / "index.json").write_text(json.dumps({"v": VOICE_KEY, "ids": ids}, separators=(",", ":")), encoding="utf-8")
    size = sum(p.stat().st_size for p in OUT.glob("*.mp3"))
    print(f"index.json：{len(ids)} 句，共 {size / 1024 / 1024:.1f} MB")


if __name__ == "__main__":
    main()
