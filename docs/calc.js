/* 計算題：每種先講白話原理，再出隨機題目，對答案時一步一步算給你看
   題目裡的容許濃度等數字都由題目給定（術科也是這樣考），不用背 */
'use strict';
(() => {
  const R = (a, b, step = 1) => Math.round((a + Math.random() * (b - a)) / step) * step;
  const pick = a => a[Math.random() * a.length | 0];
  const f = (x, d = 2) => (+x.toFixed(d)).toLocaleString('en-US', { maximumFractionDigits: d });
  const log10 = Math.log10;

  const CHEM = [['甲苯', 92.14], ['二甲苯', 106.16], ['丙酮', 58.08], ['正己烷', 86.18], ['苯', 78.11],
    ['甲醇', 32.04], ['三氯乙烯', 131.39], ['異丙醇', 60.1], ['乙酸乙酯', 88.11], ['甲基乙基酮', 72.11]];

  const CALCS = [
    {
      key: 'ppm', name: 'ppm 和 mg/m³ 換算',
      why: `ppm 是「一百萬份空氣裡有幾份」，算的是體積；mg/m³ 是「每立方公尺空氣裡有幾毫克」，算的是重量。
要換算就要知道這種氣體 1 莫耳有多重（分子量 M），以及 1 莫耳氣體佔多少體積：在 25°C、一大氣壓下是 24.45 公升。`,
      formula: 'mg/m³ ＝ ppm × M ÷ 24.45\nppm ＝ mg/m³ × 24.45 ÷ M',
      gen() {
        const [n, M] = pick(CHEM), ppm = R(5, 200, 5);
        if (Math.random() < .5) {
          const ans = ppm * M / 24.45;
          return { q: `${n}（分子量 ${M}）濃度 ${ppm} ppm，換算成 mg/m³ 是多少？（25°C、一大氣壓）`, unit: 'mg/m³', ans,
            steps: `mg/m³ ＝ ppm × M ÷ 24.45\n＝ ${ppm} × ${M} ÷ 24.45\n＝ ${f(ans)} mg/m³` };
        }
        const mg = R(20, 600, 10), ans = mg * 24.45 / M;
        return { q: `${n}（分子量 ${M}）濃度 ${mg} mg/m³，換算成 ppm 是多少？（25°C、一大氣壓）`, unit: 'ppm', ans,
          steps: `ppm ＝ mg/m³ × 24.45 ÷ M\n＝ ${mg} × 24.45 ÷ ${M}\n＝ ${f(ans)} ppm` };
      },
    },
    {
      key: 'twa', name: '八小時時量平均濃度（TWA）',
      why: `勞工一天在不同時段吸到的濃度不一樣，要看「整天平均」有沒有超過標準。
做法就是「濃度 × 時間」全部加起來，再除以 8 小時。沒暴露的時間濃度算 0，但分母一樣是 8。`,
      formula: 'TWA ＝ (C₁×t₁ ＋ C₂×t₂ ＋ …) ÷ 8',
      gen() {
        const n = R(2, 4), ts = [], cs = [];
        let left = 8;
        for (let i = 0; i < n; i++) { const t = i === n - 1 ? left : R(1, Math.max(1, left - (n - i - 1)), 0.5); ts.push(t); left -= t; cs.push(R(20, 160, 5)); }
        const pel = pick([50, 100, 200]);
        const sum = ts.reduce((s, t, i) => s + t * cs[i], 0), ans = sum / 8;
        return {
          q: `某勞工一天作業 8 小時，有機溶劑暴露：${ts.map((t, i) => `${t} 小時 ${cs[i]} ppm`).join('、')}。求八小時時量平均濃度（ppm）。（容許濃度 ${pel} ppm）`,
          unit: 'ppm', ans,
          steps: `TWA ＝ (${ts.map((t, i) => `${cs[i]}×${t}`).join(' ＋ ')}) ÷ 8\n＝ ${f(sum)} ÷ 8\n＝ ${f(ans)} ppm\n${ans > pel ? `大於容許濃度 ${pel} ppm → 超過標準` : `小於等於容許濃度 ${pel} ppm → 符合標準`}`,
        };
      },
    },
    {
      key: 'mix', name: '混合物相加效應',
      why: `好幾種有害物同時存在、而且傷害的器官一樣時，影響會疊加。
每種物質算「實際濃度 ÷ 容許濃度」（等於用掉幾成額度），全部加起來，超過 1 就代表超過標準。`,
      formula: '總和 ＝ C₁/PEL₁ ＋ C₂/PEL₂ ＋ …\n總和 ＞ 1 → 超過標準',
      gen() {
        const list = [['甲苯', 100], ['二甲苯', 100], ['丙酮', 200], ['正己烷', 50], ['乙酸乙酯', 400]];
        const k = R(2, 3), chosen = list.sort(() => Math.random() - .5).slice(0, k).map(([n, p]) => [n, p, R(p * 0.1, p * 0.6, 5)]);
        const ans = chosen.reduce((s, [, p, c]) => s + c / p, 0);
        return {
          q: `作業場所同時有 ${chosen.map(([n, p, c]) => `${n} ${c} ppm（容許濃度 ${p} ppm）`).join('、')}，具相加效應，求 Σ(C/PEL)。`,
          unit: '', ans, tol: 0.01,
          steps: `Σ ＝ ${chosen.map(([, p, c]) => `${c}/${p}`).join(' ＋ ')}\n＝ ${chosen.map(([, p, c]) => f(c / p, 3)).join(' ＋ ')}\n＝ ${f(ans, 3)}\n${ans > 1 ? '大於 1 → 超過標準' : '不大於 1 → 符合標準'}`,
        };
      },
    },
    {
      key: 'noise', name: '噪音：容許時間、劑量、八小時平均',
      why: `台灣規定：90 分貝可以待 8 小時，每多 5 分貝，能待的時間就砍一半（95 分貝 4 小時、100 分貝 2 小時）。這叫「5 分貝減半」。
劑量＝「實際待的時間 ÷ 容許時間」全部加起來，超過 1（100%）就超標。
有了劑量，可以反推「等於整天暴露在幾分貝」，就是八小時日時量平均音壓級。`,
      formula: '容許時間 T ＝ 8 ÷ 2^((L−90)/5)\n劑量 D ＝ t₁/T₁ ＋ t₂/T₂ ＋ …\n八小時平均 L ＝ 16.61 × log(D) ＋ 90',
      gen() {
        const kind = pick(['T', 'D', 'L']);
        if (kind === 'T') {
          const L = R(86, 110, 1), ans = 8 / 2 ** ((L - 90) / 5);
          return { q: `勞工暴露於 ${L} dBA 噪音，容許暴露時間是幾小時？`, unit: '小時', ans,
            steps: `T ＝ 8 ÷ 2^((${L}−90)/5)\n＝ 8 ÷ 2^(${f((L - 90) / 5, 2)})\n＝ ${f(ans, 2)} 小時` };
        }
        const n = R(2, 3), seg = [];
        let left = 8;
        for (let i = 0; i < n; i++) { const t = i === n - 1 ? left : R(1, left - (n - i - 1), 1); seg.push([R(85, 100, 1), t]); left -= t; }
        const rows = seg.map(([L, t]) => [L, t, 8 / 2 ** ((L - 90) / 5)]);
        const D = rows.reduce((s, [, t, T]) => s + t / T, 0);
        const desc = seg.map(([L, t]) => `${L} dBA ${t} 小時`).join('、');
        const s1 = rows.map(([L, t, T]) => `${L} dBA：T ＝ 8 ÷ 2^((${L}−90)/5) ＝ ${f(T, 2)} 小時`).join('\n');
        const s2 = `D ＝ ${rows.map(([, t, T]) => `${t}/${f(T, 2)}`).join(' ＋ ')} ＝ ${f(D, 3)}（${f(D * 100, 1)}%）`;
        if (kind === 'D') return { q: `勞工一天噪音暴露：${desc}。求噪音暴露劑量（以小數表示，如 1.25）。`, unit: '', ans: D, tol: 0.01,
          steps: `${s1}\n${s2}\n${D > 1 ? '大於 1 → 超過標準' : '不大於 1 → 符合標準'}` };
        const ans = 16.61 * log10(D) + 90;
        return { q: `勞工一天噪音暴露：${desc}。求八小時日時量平均音壓級（dBA）。`, unit: 'dBA', ans,
          steps: `${s1}\n${s2}\nL ＝ 16.61 × log(${f(D, 3)}) ＋ 90 ＝ ${f(ans, 1)} dBA` };
      },
    },
    {
      key: 'spl', name: '噪音：多個音源合成',
      why: `分貝是「對數」，不能直接相加。兩台 90 分貝的機器加起來不是 180，而是 93 分貝。
做法：每個分貝先「還原」成能量（10 的 L/10 次方），能量相加後，再換回分貝。`,
      formula: 'L ＝ 10 × log(10^(L₁/10) ＋ 10^(L₂/10) ＋ …)\n口訣：兩個一樣大 → 加 3 分貝',
      gen() {
        const Ls = Array.from({ length: R(2, 3) }, () => R(80, 98, 1));
        const sum = Ls.reduce((s, L) => s + 10 ** (L / 10), 0), ans = 10 * log10(sum);
        return { q: `作業場所有 ${Ls.length} 台機器，單獨運轉時音壓級分別為 ${Ls.join('、')} dB，同時運轉時合成音壓級是多少 dB？`, unit: 'dB', ans, tol: 0.1,
          steps: `L ＝ 10 × log(${Ls.map(L => `10^${f(L / 10, 1)}`).join(' ＋ ')})\n＝ 10 × log(${sum.toExponential(3)})\n＝ ${f(ans, 1)} dB` };
      },
    },
    {
      key: 'wbgt', name: '熱危害：綜合溫度熱指數 WBGT',
      why: `熱不熱不只看氣溫，還要看濕度（流汗散不散得掉）和輻射熱（太陽、爐子）。
自然濕球溫度反映濕度，影響最大，所以佔 7 成；黑球溫度反映輻射熱。
有太陽直射時，才把乾球（氣溫）也放進來。`,
      formula: '戶外有日曬：WBGT ＝ 0.7×自然濕球 ＋ 0.2×黑球 ＋ 0.1×乾球\n室內或戶外無日曬：WBGT ＝ 0.7×自然濕球 ＋ 0.3×黑球\n時量平均：Σ(WBGTᵢ × tᵢ) ÷ Σtᵢ',
      gen() {
        const out = Math.random() < .5;
        const nwb = R(24, 30, 0.5), g = R(30, 45, 0.5), a = R(28, 36, 0.5);
        const ans = out ? 0.7 * nwb + 0.2 * g + 0.1 * a : 0.7 * nwb + 0.3 * g;
        return { q: `${out ? '戶外有日曬' : '室內'}作業，測得自然濕球溫度 ${nwb}°C、黑球溫度 ${g}°C、乾球溫度 ${a}°C，求 WBGT（°C）。`, unit: '°C', ans,
          steps: out ? `WBGT ＝ 0.7×${nwb} ＋ 0.2×${g} ＋ 0.1×${a}\n＝ ${f(0.7 * nwb)} ＋ ${f(0.2 * g)} ＋ ${f(0.1 * a)}\n＝ ${f(ans)}°C`
            : `室內不用乾球溫度\nWBGT ＝ 0.7×${nwb} ＋ 0.3×${g}\n＝ ${f(0.7 * nwb)} ＋ ${f(0.3 * g)}\n＝ ${f(ans)}°C` };
      },
    },
    {
      key: 'fr', name: '失能傷害頻率、嚴重率、綜合指數',
      why: `為了讓大公司、小公司能比較，統一換算成「每 100 萬工時」：
頻率 FR：每百萬工時發生幾次失能傷害（看「多常出事」）。
嚴重率 SR：每百萬工時損失幾天（看「傷得多重」）。死亡一律算損失 6000 天。
綜合指數 FSI：把兩個合在一起看。`,
      formula: 'FR ＝ 失能傷害次數 × 10⁶ ÷ 總經歷工時（取到小數 2 位）\nSR ＝ 總損失日數 × 10⁶ ÷ 總經歷工時（取整數）\nFSI ＝ √(FR × SR ÷ 1000)（取到小數 2 位）',
      gen() {
        const workers = R(150, 900, 10), days = R(240, 300, 1), hrs = workers * days * 8;
        const inj = R(1, 6), lost = R(20, 400, 1), dead = Math.random() < .25 ? 1 : 0;
        const fr = Math.floor((inj + dead) * 1e6 / hrs * 100) / 100;
        const totalLost = lost + dead * 6000;
        const sr = Math.floor(totalLost * 1e6 / hrs);
        const kind = pick(['FR', 'SR', 'FSI']);
        const base = `某公司勞工 ${workers} 人，全年工作 ${days} 天、每天 8 小時。全年失能傷害 ${inj} 次共損失 ${lost} 日${dead ? '，另有 1 人死亡' : ''}。`;
        const sHrs = `總經歷工時 ＝ ${workers} × ${days} × 8 ＝ ${hrs.toLocaleString()} 小時`;
        const sFR = `FR ＝ ${inj + dead} × 10⁶ ÷ ${hrs.toLocaleString()} ＝ ${fr}${dead ? '（死亡也算 1 次失能傷害）' : ''}`;
        const sSR = `SR ＝ ${dead ? `(${lost} ＋ 6000)` : lost} × 10⁶ ÷ ${hrs.toLocaleString()} ＝ ${sr}${dead ? '（死亡算 6000 日）' : ''}`;
        if (kind === 'FR') return { q: base + '求失能傷害頻率 FR。', unit: '', ans: fr, tol: 0.011, steps: `${sHrs}\n${sFR}` };
        if (kind === 'SR') return { q: base + '求失能傷害嚴重率 SR。', unit: '', ans: sr, tol: 1, steps: `${sHrs}\n${sSR}` };
        const fsi = Math.floor(Math.sqrt(fr * sr / 1000) * 100) / 100;
        return { q: base + '求失能傷害綜合指數 FSI。', unit: '', ans: fsi, tol: 0.011, steps: `${sHrs}\n${sFR}\n${sSR}\nFSI ＝ √(${fr} × ${sr} ÷ 1000) ＝ ${fsi}` };
      },
    },
    {
      key: 'organic', name: '有機溶劑：換氣能力',
      why: `依有機溶劑中毒預防規則，用整體換氣裝置時，每分鐘換氣量要看「一小時用掉多少克溶劑」，再乘上一個係數。
越毒的溶劑（第一種）係數越大，要換越多空氣。`,
      formula: '第一種有機溶劑：Q ＝ 0.3 × W\n第二種有機溶劑：Q ＝ 0.04 × W\n第三種有機溶劑：Q ＝ 0.01 × W\nQ：m³/min；W：作業時間內 1 小時的消費量（g）',
      gen() {
        const [k, c] = pick([['第一種', 0.3], ['第二種', 0.04], ['第三種', 0.01]]);
        const kg = R(0.5, 6, 0.5), hr = R(2, 8, 1), W = kg * 1000 / hr, ans = c * W;
        return { q: `某作業場所使用${k}有機溶劑，每天 ${hr} 小時共消費 ${kg} 公斤，採整體換氣裝置，每分鐘換氣量至少多少 m³/min？`, unit: 'm³/min', ans,
          steps: `每小時消費量 W ＝ ${kg} × 1000 ÷ ${hr} ＝ ${f(W)} g/hr\n${k}係數 ${c}\nQ ＝ ${c} × ${f(W)} ＝ ${f(ans)} m³/min` };
      },
    },
    {
      key: 'dilution', name: '稀釋通風：理論換氣量',
      why: `每小時有 W 克有害物蒸發到空氣中，要灌進足夠的新鮮空氣把它稀釋到容許濃度以下。
先把 W 克換成體積（用 24.45 和分子量），再看要多少空氣才能稀釋到 C ppm。`,
      formula: 'Q（m³/min）＝ 24.45 × 10³ × W ÷ (60 × C × M)\nW：每小時蒸發量 g/hr　C：ppm　M：分子量',
      gen() {
        const [n, M] = pick(CHEM), W = R(100, 2000, 50), C = pick([50, 100, 200]);
        const ans = 24.45e3 * W / (60 * C * M);
        return { q: `${n}（分子量 ${M}）每小時蒸發 ${W} g，要稀釋到 ${C} ppm，理論換氣量為多少 m³/min？`, unit: 'm³/min', ans,
          steps: `Q ＝ 24.45 × 10³ × ${W} ÷ (60 × ${C} × ${M})\n＝ ${f(24.45e3 * W, 0)} ÷ ${f(60 * C * M, 1)}\n＝ ${f(ans)} m³/min` };
      },
    },
    {
      key: 'hood', name: '局部排氣：風量',
      why: `風量就是「風速 × 開口面積」。風速通常給每秒幾公尺，題目常要每分鐘的量，所以要再乘 60。`,
      formula: 'Q（m³/min）＝ 60 × V（m/s）× A（m²）',
      gen() {
        const w = R(0.3, 1.2, 0.1), h = R(0.3, 1, 0.1), v = R(0.4, 1.5, 0.1), A = w * h, ans = 60 * v * A;
        return { q: `氣罩開口 ${f(w, 1)} m × ${f(h, 1)} m，開口面風速 ${f(v, 1)} m/s，排氣量為多少 m³/min？`, unit: 'm³/min', ans,
          steps: `A ＝ ${f(w, 1)} × ${f(h, 1)} ＝ ${f(A, 2)} m²\nQ ＝ 60 × ${f(v, 1)} × ${f(A, 2)} ＝ ${f(ans)} m³/min` };
      },
    },
    {
      key: 'lel', name: '混合氣體爆炸下限（勒沙特列定律）',
      why: `幾種可燃氣體混在一起時，整體的爆炸下限介於各自之間。
用「各成分佔燃料的百分比 ÷ 各自的爆炸下限」加起來，再用 100 去除。`,
      formula: 'LEL混合 ＝ 100 ÷ (P₁/L₁ ＋ P₂/L₂ ＋ …)\nP：各成分佔可燃氣體的體積 %（加起來 100）',
      gen() {
        const gas = [['甲烷', 5], ['乙烷', 3], ['丙烷', 2.1], ['丁烷', 1.8], ['氫氣', 4]];
        const g = gas.sort(() => Math.random() - .5).slice(0, 2);
        const p1 = R(20, 80, 10), ps = [p1, 100 - p1];
        const sum = g.reduce((s, [, L], i) => s + ps[i] / L, 0), ans = 100 / sum;
        return { q: `混合氣體由 ${g[0][0]} ${ps[0]}%（LEL ${g[0][1]}%）與 ${g[1][0]} ${ps[1]}%（LEL ${g[1][1]}%）組成，求混合氣體的爆炸下限（%）。`, unit: '%', ans,
          steps: `LEL ＝ 100 ÷ (${ps[0]}/${g[0][1]} ＋ ${ps[1]}/${g[1][1]})\n＝ 100 ÷ ${f(sum, 3)}\n＝ ${f(ans)}%` };
      },
    },
  ];

  let cur = null;
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  const list = () => {
    $('#app').innerHTML = `<h1>計算題</h1>
      <div class="card sub">術科是電腦作答，計算題直接填數字。每種先看「為什麼」，懂了公式自然記得；再做隨機題目，要練幾題都有。</div>
      <div class="list">${CALCS.map(c => `<a href="#/calc/${c.key}"><div class="card row"><b class="grow">${c.name}</b><span>›</span></div></a>`).join('')}</div>`;
  };
  const one = key => {
    const c = CALCS.find(x => x.key === key); if (!c) return list();
    if (!cur || cur.key !== key) cur = { key, p: c.gen() };
    const p = cur.p;
    $('#app').innerHTML = `
      <div class="top"><a href="#/calc">‹ 計算題</a></div>
      <h1>${c.name}</h1>
      <div class="card"><h3>💡 為什麼</h3><div class="explain">${esc(c.why)}</div>
        <h3>公式</h3><code class="formula" style="white-space:pre-wrap">${esc(c.formula)}</code></div>
      <h2>練習</h2>
      <div class="card"><div class="q">${esc(p.q)}</div>
        <div class="row"><input id="ca" type="number" inputmode="decimal" step="any" placeholder="答案" class="grow"><span>${p.unit}</span></div>
        <div id="cfb"></div>
        <div class="row" style="margin-top:10px"><button class="btn grow" onclick="calcCheck()">對答案</button>
          <button class="btn ghost" onclick="calcNext()">換一題</button></div></div>`;
  };
  window.calcCheck = () => {
    const v = parseFloat($('#ca').value), p = cur.p;
    const tol = p.tol ?? Math.max(0.05, Math.abs(p.ans) * 0.01);
    const ok = !isNaN(v) && Math.abs(v - p.ans) <= tol;
    $('#cfb').innerHTML = `<div class="fb ${ok ? 'ok' : 'ng'}"><b>${ok ? '✔ 對了' : isNaN(v) ? '看解法' : '✘ 再看一下'}</b>
      <div class="steps" style="margin-top:8px">${esc(p.steps)}</div>
      <div class="sub" style="margin-top:6px">四捨五入差一點點沒關係，看懂步驟最重要。</div></div>`;
  };
  window.calcNext = () => { cur = null; one(location.hash.split('/')[2]); };

  // 掛到主程式的路由
  const wait = setInterval(() => {
    if (typeof routes === 'undefined') return;
    clearInterval(wait);
    routes.calc = k => (k ? one(k) : list());
    if (location.hash.startsWith('#/calc')) render();
  }, 30);
})();
