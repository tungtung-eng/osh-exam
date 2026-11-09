/* 圖解教室：動畫（一步一步出現＋同時念）與圖解卡
   每一課 = 一張 SVG 或 HTML，裡面要分段出現的東西標 data-k="代號"；
   steps 依序列出 {say: 要念的話, show: '代號 代號', hide: '代號'}。
   kind: 'anim' 照步驟播；'card' 一次全部顯示，念的時候照順序念。
   課程內容寫在 vis-data.js（用這裡的 VZ.* 小工具畫圖）。 */
'use strict';
window.VZ = (() => {
  const LESSONS = [];
  const BY_Q = {};

  /* ---------- 畫圖小工具（座標以寬 360 為準） ---------- */
  const k = key => key ? ` data-k="${key}"` : '';
  const fx = o => o && o.fx ? ` data-fx="${o.fx}"` : '';
  const T = (x, y, s, key, o = {}) =>
    `<text x="${x}" y="${y}"${k(key)}${fx(o)} font-size="${o.size || 13}" text-anchor="${o.a || 'middle'}" fill="${o.c || 'var(--ink)'}"${o.b ? ' font-weight="700"' : ''}>${s}</text>`;
  const R = (x, y, w, h, key, o = {}) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${o.r ?? 8}" fill="${o.f || 'var(--card)'}" stroke="${o.s || 'var(--line)'}" stroke-width="${o.sw || 1.5}"${k(key)}${fx(o)}/>`;
  // 方框＋置中多行字（\n 換行）
  const BOX = (x, y, w, h, label, key, o = {}) => {
    const lines = String(label).split('\n'), size = o.size || 13, lh = size * 1.35;
    const y0 = y + h / 2 - (lines.length - 1) * lh / 2 + size * 0.35;
    return `<g${k(key)}${fx(o)}>${R(x, y, w, h, '', Object.assign({}, o, { fx: '' }))}${lines.map((l, i) =>
      T(x + w / 2, y0 + i * lh, l, '', { size, c: o.c, b: o.b !== false && i === 0 })).join('')}</g>`;
  };
  const LINE = (x1, y1, x2, y2, key, o = {}) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${o.s || 'var(--sub)'}" stroke-width="${o.sw || 2}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ''}${o.arrow ? ' marker-end="url(#vzArrow)"' : ''}${k(key)}${fx(o)}/>`;
  const ARROW = (x1, y1, x2, y2, key, o = {}) => LINE(x1, y1, x2, y2, key, Object.assign({ arrow: true }, o));
  const X = (cx, cy, key, r = 14) =>
    `<g${k(key)} data-fx="pop"><line x1="${cx - r}" y1="${cy - r}" x2="${cx + r}" y2="${cy + r}" stroke="var(--ng)" stroke-width="4" stroke-linecap="round"/><line x1="${cx + r}" y1="${cy - r}" x2="${cx - r}" y2="${cy + r}" stroke="var(--ng)" stroke-width="4" stroke-linecap="round"/></g>`;
  const SVG = (h, body) => `<svg viewBox="0 0 360 ${h}" width="100%" role="img" style="max-width:560px;display:block;margin:0 auto">
    <defs><marker id="vzArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--sub)"/></marker></defs>${body}</svg>`;

  function add(lesson) {
    LESSONS.push(lesson);
    for (const q of lesson.qs || []) (BY_Q[q] = BY_Q[q] || []).push(lesson.id);
  }

  /* ---------- 播放器 ---------- */
  let cur = null;   // {lesson, i, playing}
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  function apply(upto) {
    const box = $('#vzStage'); if (!box) return;
    const L = cur.lesson;
    const on = new Set();
    if (L.kind === 'card') box.querySelectorAll('[data-k]').forEach(el => on.add(el.dataset.k));
    else for (let j = 0; j <= upto; j++) {
      const st = L.steps[j];
      (st.show || '').split(/\s+/).filter(Boolean).forEach(x => on.add(x));
      (st.hide || '').split(/\s+/).filter(Boolean).forEach(x => on.delete(x));
    }
    box.querySelectorAll('[data-k]').forEach(el => el.classList.toggle('on', on.has(el.dataset.k)));
    const st = L.steps[Math.max(0, upto)];
    $('#vzSay').textContent = L.kind === 'card' ? '' : (st ? st.say : '');
    $('#vzDots').innerHTML = L.kind === 'card' ? '' : L.steps.map((_, j) => `<i class="${j <= upto ? 'on' : ''}"></i>`).join('');
    $('#vzPlay').textContent = cur.playing ? '⏸ 暫停' : (L.kind === 'card' ? '🔊 念給我聽' : (upto >= L.steps.length - 1 ? '↻ 再播一次' : '▶ 播放（有語音）'));
  }
  function playFrom(i) {
    const L = cur.lesson;
    cur.i = i; cur.playing = true; apply(i);
    if (L.kind === 'card') {
      Speech.say(L.steps.map(s => s.say), () => { cur.playing = false; apply(0); });
      return;
    }
    Speech.say([L.steps[i].say], () => {
      if (!cur || !cur.playing) return;
      if (i + 1 < L.steps.length) setTimeout(() => cur && cur.playing && playFrom(i + 1), 500);
      else { cur.playing = false; apply(i); }
    });
  }
  window.vzToggle = () => {
    const L = cur.lesson;
    if (cur.playing) { cur.playing = false; Speech.stop(); apply(cur.i); return; }
    Speech.unlock();
    if (L.kind === 'anim' && cur.i >= L.steps.length - 1 && cur.started) cur.i = 0;
    cur.started = true;
    playFrom(L.kind === 'card' ? 0 : cur.i);
  };
  window.vzMove = d => {
    const L = cur.lesson;
    const i = Math.max(0, Math.min(L.steps.length - 1, cur.i + d));
    cur.started = true;
    if (cur.playing) playFrom(i); else { cur.i = i; apply(i); Speech.say([L.steps[i].say]); }
  };

  function page(id) {
    const L = LESSONS.find(x => x.id === id);
    if (!L) return list();
    Speech.stop();   // 從上一課直接跳過來時，先停掉上一課的聲音
    cur = { lesson: L, i: 0, playing: false };
    const sameTopic = LESSONS.filter(x => x.topic === L.topic);
    const idx = sameTopic.indexOf(L), nxt = sameTopic[idx + 1];
    $('#app').innerHTML = `
      <div class="top"><a href="javascript:history.back()">‹ 返回</a><span>${L.kind === 'card' ? '🖼 圖解卡' : '🎬 動畫'}</span><span>${idx + 1} / ${sameTopic.length}</span></div>
      <h1>${esc(L.title)}</h1>
      <div class="card vz" id="vzStage">${L.body}</div>
      <div class="vzsay" id="vzSay"></div>
      <div class="vzdots" id="vzDots"></div>
      <div class="row">
        ${L.kind === 'anim' ? '<button class="btn ghost" onclick="vzMove(-1)">⏮</button>' : ''}
        <button class="btn grow" id="vzPlay" onclick="vzToggle()"></button>
        ${L.kind === 'anim' ? '<button class="btn ghost" onclick="vzMove(1)">⏭</button>' : ''}
      </div>
      <div class="row sub" style="justify-content:flex-end;margin:6px 0">語速
        <select style="width:auto;padding:4px 8px" onchange="P.set.rate=+this.value;save()">${RATES.map(r => `<option ${P.set.rate === r ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
      ${L.kind === 'card' ? `<div class="card note">${L.steps.map(s => `<p>• ${esc(s.say)}</p>`).join('')}</div>` : ''}
      ${L.qs && L.qs.length ? `<button class="btn wide ghost" onclick="startQuiz({title:'圖解相關題目',ids:${JSON.stringify(L.qs)},mode:'free'})">練這張圖相關的 ${L.qs.length} 題</button>` : ''}
      ${nxt ? `<a class="btn wide ghost" href="#/vis/${nxt.id}">下一張：${esc(nxt.title)} ›</a>` : ''}`;
    apply(L.kind === 'card' ? 0 : 0);
  }

  function list(topic) {
    const groups = {};
    for (const L of LESSONS) (groups[L.topic] = groups[L.topic] || []).push(L);
    const names = window.OSH_TOPIC_NAMES || {};
    const order = Object.keys(groups).filter(t => !topic || t === topic);
    $('#app').innerHTML = `
      <div class="top"><a href="#/practice">‹ 練習</a></div>
      <h1>🎬 圖解教室</h1>
      <div class="card sub">挑你最常錯的主題做的圖解。🎬 動畫會一步一步出現、同時念說明；🖼 圖解卡是整理好的一張圖。</div>
      ${order.map(t => `<h2>${esc(names[t] || t)}</h2><div class="list">${groups[t].map(L =>
        `<a href="#/vis/${L.id}"><div class="card row"><span>${L.kind === 'card' ? '🖼' : '🎬'}</span><b class="grow">${esc(L.title)}</b><span class="sub">${L.qs ? L.qs.length + ' 題' : ''}</span></div></a>`).join('')}</div>`).join('')}`;
  }

  // 掛到主程式的路由（app.js 先載入）
  routes.vis = id => (id ? page(id) : list());
  return { add, T, R, BOX, LINE, ARROW, X, SVG, LESSONS, BY_Q, stop: () => { if (cur) cur.playing = false; } };
})();
