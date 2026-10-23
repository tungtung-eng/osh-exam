# 職安乙級（osh-exam）

東東準備「職業安全衛生管理乙級」技術士考試用的手機網頁 App。
目標：116 年度第一梯次（報名 2027/1/4～1/13，學科 2027/3/14）。

**完全獨立**：不放在 `D:\工程先生AI`、不用工程先生雲端、不用 Supabase，跟監造數位化等專案互不影響。

**同步**：讀書進度存在東東 GitHub 的私人 Gist（`osh-exam-progress.json`，App 自動建立）。
每台裝置在「我的」貼一次 GitHub token（只勾 gist 權限）。token 只存在該裝置，不會進 Gist。

## 資料夾

| 位置 | 內容 |
|---|---|
| `docs/` | 網站本體（GitHub Pages 發布這個資料夾） |
| `docs/data/bank.json` | 題庫 1354 題（工具產生，不要手改） |
| `docs/data/laws.json` | 45 部法規現行條文（`fetch_laws.py` 產生） |
| `docs/data/refs.json` | 每題自動配對的相關條文（`match_refs.py`） |
| `content/explain/<主題>.json` | **每題白話解說**（手寫，`{題號: 解說}`） |
| `content/notes/<主題>.html` | **主題重點整理**（手寫，第一行 `<h1>` 是標題） |
| `source/official/` | 技能檢定中心下載的原始 PDF |
| `tools/` | 產生資料的程式 |

## 更新流程

```
python tools/parse_bank.py     # 題庫 PDF → data/bank.json（題庫改版才要）
python tools/tag_topics.py     # 分主題
python tools/fetch_laws.py --refresh   # 重抓法規（法規有修正時）
python tools/match_refs.py     # 重新配對相關條文
python tools/build.py          # 合併解說、重點 → docs/data，更新版本號
```

查條文：`python tools/law.py 營造安全 護欄 九十`

## 考試重點（官方資料）

- 學科：單選 60（專業 44＋共同科目 16）、複選 20；單選 1 分、複選 2 分，60 分及格。
  題庫 222002A16（116/01/01 起報檢適用）＋共同科目 90006～90009。
- 術科：**電腦測試**（110 年起），100 分鐘、10 題組各 10 分，題型是非、選擇、配合、填空、排序、連連看、計算。
  題目不公開，範圍同學科三大類。練習網址 https://oshm.wdasec.gov.tw/WDA_SimTest/Home/Login
