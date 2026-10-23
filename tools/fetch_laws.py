"""從全國法規資料庫抓考試範圍的法規（現行條文）→ web/data/laws.json

用法：python tools/fetch_laws.py        （已抓過的會用 source/law_html 裡的檔，加 --refresh 重抓）
法規名稱照題庫裡「依○○規定」出現的整理；pcode 第一次用搜尋頁查，記在 data/law_pcode.json
"""
import html
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "source" / "law_html"
PCODE = ROOT / "data" / "law_pcode.json"
OUT = ROOT / "docs" / "data" / "laws.json"

LAWS = [
    "職業安全衛生法", "職業安全衛生法施行細則", "職業安全衛生設施規則", "職業安全衛生管理辦法",
    "職業安全衛生教育訓練規則", "營造安全衛生設施標準", "缺氧症預防規則", "危險性工作場所審查及檢查辦法",
    "危害性化學品標示及通識規則", "危害性化學品評估及分級管理辦法", "新化學物質登記管理辦法",
    "管制性化學品之指定及運作許可管理辦法", "優先管理化學品之指定及運作管理辦法",
    "機械類產品型式驗證實施及監督管理辦法", "機械設備器具安全資訊申報登錄辦法", "機械設備器具監督管理辦法",
    "機械設備器具安全標準", "勞工作業環境監測實施辦法", "勞工健康保護規則", "特定化學物質危害預防標準",
    "有機溶劑中毒預防規則", "鉛中毒預防規則", "四烷基鉛中毒預防規則", "粉塵危害預防標準",
    "起重升降機具安全規則", "危險性機械及設備安全檢查規則", "鍋爐及壓力容器安全規則", "高壓氣體勞工安全規則",
    "高架作業勞工保護措施標準", "高溫作業勞工作息時間標準", "異常氣壓危害預防標準",
    "重體力勞動作業勞工保護措施標準", "精密作業勞工視機能保護設施標準", "女性勞工母性健康保護實施辦法",
    "製程安全評估定期實施辦法", "勞工作業場所容許暴露標準", "勞動檢查法", "勞動基準法", "勞動基準法施行細則",
    "勞工請假規則", "職工福利金條例", "勞工保險條例", "就業保險法", "勞工職業災害保險及保護法",
    "職業安全衛生標示設置準則",
]

UA = {"User-Agent": "Mozilla/5.0"}


def get(url):
    for i in range(5):  # 網站連太快會斷線，等一下再試
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode("utf-8")
        except Exception as e:
            print("  重試", i + 1, e)
            time.sleep(5 * (i + 1))
    raise RuntimeError("抓不到 " + url)


def find_pcode(name):
    s = get("https://law.moj.gov.tw/Law/LawSearchResult.aspx?ty=ONEBAR&kw=" + urllib.parse.quote(name))
    # 搜尋結果裡找名稱完全一樣的那一筆
    for m in re.finditer(r'pcode=([A-Z0-9]+)[^>]*>\s*(?:<[^>]+>)*([^<]+)<', s):
        if html.unescape(m.group(2)).strip() == name:
            return m.group(1)
    # 只有一筆時會直接跳到法規頁
    m = re.search(r'LawAll\.aspx\?pcode=([A-Z0-9]+)', s)
    return m.group(1) if m else None


def parse(page):
    title = html.unescape(re.search(r'<a id="hlLawName"[^>]*>([^<]+)<', page).group(1)).strip()
    date = re.search(r'id="trLNNDate"[\s\S]*?<td>([^<]+)<', page) or re.search(r'id="trLNODate"[\s\S]*?<td>([^<]+)<', page)
    arts = []
    # 有附件的條文，條號前面多一個迴紋針圖示
    for m in re.finditer(r'<div class="row">\s*<div class="col-no">((?:(?!</div>)[\s\S])*?)<a[^>]*>(第 [^<]+ 條)</a>[\s\S]*?<div class="law-article">([\s\S]*?)</div>\s*</div>\s*</div>', page):
        body = re.sub(r'<div class="line-\d+[^"]*">', "\n", m.group(3))
        body = html.unescape(re.sub(r"<[^>]+>", "", body))
        body = "\n".join(x.strip() for x in body.split("\n") if x.strip())
        if "本條文有附件" in m.group(1):
            body += "\n（本條有附表／附件，請到全國法規資料庫看）"
        arts.append([m.group(2).replace(" ", ""), body])
    return {"name": title, "date": html.unescape(date.group(1)).strip() if date else "", "arts": arts}


def main():
    refresh = "--refresh" in sys.argv
    RAW.mkdir(parents=True, exist_ok=True)
    pc = json.loads(PCODE.read_text(encoding="utf-8")) if PCODE.exists() else {}
    out = {}
    for name in LAWS:
        if name not in pc:
            pc[name] = find_pcode(name)
            PCODE.write_text(json.dumps(pc, ensure_ascii=False, indent=1), encoding="utf-8")
            time.sleep(2)
        code = pc[name]
        if not code:
            print("找不到", name)
            continue
        f = RAW / f"{code}.html"
        if refresh or not f.exists():
            f.write_text(get(f"https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode={code}"), encoding="utf-8")
            time.sleep(2)
        law = parse(f.read_text(encoding="utf-8"))
        law["pcode"] = code
        out[name] = law
        print(f"{name}  {code}  {law['date']}  {len(law['arts'])} 條" + ("" if law["name"] == name else f"  （頁面名稱：{law['name']}）"))
    PCODE.write_text(json.dumps(pc, ensure_ascii=False, indent=1), encoding="utf-8")
    OUT.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print("共", len(out), "部 →", OUT, f"{OUT.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
