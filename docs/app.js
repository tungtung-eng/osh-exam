/* 職安乙級 — 主程式
   資料：data/bank.json（官方題庫）、data/explain.json（解說）、data/notes.json（主題重點）
   進度：存在 localStorage（oshP），有登入就由 sync.js 同步到雲端 */
'use strict';

const EXAM = window.OSH_CONFIG.exam;
// 讀書順序：先從工地熟的開始，再接工廠類；共同科目穿插（好拿分、換換口味）
const ORDER = ['T10', 'T17', 'T12', 'T11', 'T13', 'T07', 'T02', 'C1', 'T01', 'T03', 'T04', 'T15', 'C2',
  'T05', 'T06', 'T08', 'C3', 'T09', 'T14', 'T18', 'T19', 'T16', 'C4'];
const BOX_DAYS = [0, 1, 2, 4, 8, 16, 32];   // 答對一次升一格，下次隔幾天再考
const MASTER = 4;                           // 到第 4 格算「熟了」
const SPRINT_DAYS = 21;                     // 考前 3 週衝刺：不學新的，只複習＋模擬考
const NUM = ['', '一', '二', '三', '四'];
const MARK = ['', '①', '②', '③', '④'];

let BANK = [], BY_ID = {}, TOPICS = {}, EXPLAIN = {}, NOTES = {}, REFS = {}, LAWS = null;
let P;          // 進度
let S = null;   // 目前的作答回合

/* ---------- 小工具 ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function ymd(d = new Date()) {
  const z = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
const today = () => ymd();
function addDays(s, n) { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return ymd(d); }
function daysBetween(a, b) { return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 864e5); }
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0;[a[i], a[j]] = [a[j], a[i]]; } return a; }
function toast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 2200);
}
function lawOf(q) { const m = q.q.match(/依(.{2,25}?)(?:之)?規定/); return m ? m[1].replace(/[，,].*$/, '') : null; }
function lawLink(name) { return 'https://law.moj.gov.tw/Law/LawSearchResult.aspx?ty=ONEBAR&kw=' + encodeURIComponent(name); }
async function laws() {
  if (!LAWS) { try { LAWS = await (await fetch('data/laws.json')).json(); } catch (e) { LAWS = {}; } }
  return LAWS;
}
function artText(law, no) { return (law?.arts || []).find(a => a[0] === no)?.[1] || ''; }
// 作答後的「相關條文」：點開才載入法規
window.showRef = async (id, el) => {
  const [name, no] = REFS[id], L = await laws();
  el.outerHTML = `<div class="steps" style="margin-top:6px">${esc(artText(L[name], no))}</div>
    <a class="sub" href="#/law/${encodeURIComponent(name)}/${encodeURIComponent(no)}">看整部法規 ›</a>`;
};

/* ---------- 進度 ---------- */
function blank() { return { v: 1, q: {}, days: {}, set: { rate: 1, wait: 4, readOpts: true, shuffle: true }, upd: 0 }; }
function load() {
  try { P = Object.assign(blank(), JSON.parse(localStorage.getItem('oshP') || '{}')); } catch (e) { P = blank(); }
  P.set = Object.assign(blank().set, P.set);
}
function save() {
  P.upd = Date.now();
  try { localStorage.setItem('oshP', JSON.stringify(P)); } catch (e) { }
  if (window.Sync) Sync.later();
}
function day(d = today()) { return P.days[d] || (P.days[d] = { n: 0, r: 0, ok: 0, ng: 0, ids: [] }); }

function grade(id, ok) {
  const t = today(), d = day(t);
  let r = P.q[id];
  const isNew = !r;
  if (!r) r = P.q[id] = { b: 0, r: 0, w: 0, s: t };
  if (ok) { r.r++; r.b = Math.min(r.b + 1, 6); d.ok++; }
  else { r.w++; r.b = 1; d.ng++; }
  r.due = addDays(t, BOX_DAYS[r.b]);
  r.t = Date.now();
  if (isNew) d.n++; else d.r++;
  if (!d.ids.includes(id)) d.ids.push(id);
  save();
}

const seen = id => !!P.q[id];
const mastered = id => (P.q[id]?.b || 0) >= MASTER;
function dueIds(d = today()) {
  return BANK.filter(q => P.q[q.id] && P.q[q.id].due <= d)
    .sort((a, b) => (P.q[b.id].w - P.q[a.id].w) || P.q[a.id].due.localeCompare(P.q[b.id].due))
    .map(q => q.id);
}
function wrongIds() {
  return BANK.filter(q => P.q[q.id]?.w > 0 && !mastered(q.id))
    .sort((a, b) => P.q[b.id].w - P.q[a.id].w).map(q => q.id);
}
function orderedNew() {
  const out = [];
  for (const t of ORDER) for (const q of TOPICS[t]?.qs || []) if (!seen(q.id)) out.push(q.id);
  return out;
}

/* 今天要學幾題新的：剩下沒碰過的題目，平均分到衝刺期之前 */
function plan() {
  const t = today();
  const sprint = addDays(EXAM.written, -SPRINT_DAYS);
  const left = orderedNew();
  const doneToday = day(t).n;
  const daysLeft = Math.max(1, daysBetween(t, sprint));
  const inSprint = t >= sprint;
  const target = inSprint ? 0 : Math.max(8, Math.ceil((left.length + doneToday) / daysLeft));
  return { sprint, inSprint, left, target, doneToday, daysLeft };
}

function streak() {
  let n = 0, d = today();
  if (!(P.days[d]?.ids?.length)) d = addDays(d, -1);
  while (P.days[d]?.ids?.length) { n++; d = addDays(d, -1); }
  return n;
}

/* ---------- 畫面路由 ---------- */
const routes = {};
function go(h) { location.hash = h; }
function render() {
  const [, name, arg] = (location.hash || '#/today').split('/');
  document.querySelectorAll('nav a').forEach(a => a.classList.toggle('on', a.dataset.tab === name ||
    (a.dataset.tab === 'practice' && ['topic', 'quiz', 'note', 'mock', 'laws', 'law'].includes(name))));
  if (name !== 'listen' && window.speechSynthesis) speechSynthesis.cancel();
  (routes[name] || routes.today)(arg ? decodeURIComponent(arg) : undefined);
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', render);

/* ---------- 今天 ---------- */
routes.today = () => {
  const t = today(), d = day(t), pl = plan();
  const due = dueIds();
  const toExam = daysBetween(t, EXAM.written);
  const nextNew = pl.left[0] ? BY_ID[pl.left[0]] : null;
  const topic = nextNew ? TOPICS[nextNew.topic] : null;
  const newLeft = Math.max(0, pl.target - pl.doneToday);
  const regOpen = t >= EXAM.reg[0] && t <= EXAM.reg[1];
  const regSoon = t < EXAM.reg[0] && daysBetween(t, EXAM.reg[0]) <= 14;
  const slot = (time, title, body, done, btn) => `
    <div class="card slot ${done ? 'done' : ''}">
      <div class="time">${done ? '✔' : time}</div>
      <div class="grow"><b>${title}</b><div class="sub">${body}</div></div>
      ${btn || ''}
    </div>`;
  $('#app').innerHTML = `
    <h1>今天 ${t.slice(5).replace('-', '/')}</h1>
    <div class="card row">
      <div class="grow"><div class="sub">距離學科考試（${EXAM.written.replace(/-/g, '/')}）</div>
        <div class="big">${toExam} <span style="font-size:18px">天</span></div></div>
      <div style="text-align:right"><div class="sub">連續讀書</div><div class="big">${streak()} <span style="font-size:18px">天</span></div></div>
    </div>
    ${regOpen ? `<div class="card" style="background:var(--warnbg)"><b>⚠ 現在是報名期間</b>（到 ${EXAM.reg[1].slice(5).replace('-', '/')}），記得上技檢中心網站報名！</div>` : ''}
    ${regSoon ? `<div class="card" style="background:var(--warnbg)"><b>報名快到了</b>：${EXAM.reg[0].slice(5).replace('-', '/')}～${EXAM.reg[1].slice(5).replace('-', '/')}</div>` : ''}
    <h2>今日任務</h2>
    ${pl.inSprint
      ? slot('09:00', '衝刺：模擬考一回', '照考試題數計時，考完看哪裡弱', d.mock, `<a class="btn small" href="#/mock">開始</a>`)
      : slot('09:00', `學新的 ${newLeft ? newLeft + ' 題' : ''}`, topic
        ? `主題：${esc(topic.name)}${NOTES[topic.code] ? `　<a href="#/note/${topic.code}">先看重點</a>` : ''}`
        : '題庫都讀過一輪了 🎉', newLeft === 0,
        newLeft ? `<button class="btn small" onclick="startNew()">開始</button>` : '')}
    ${slot('14:00', `刷題＋錯題 ${due.length ? due.length + ' 題' : ''}`,
      due.length ? '快忘的、答錯的，現在補回來' : '今天到期的都複習完了', due.length === 0 && (d.r > 0 || d.n > 0),
      due.length ? `<button class="btn small" onclick="startReview()">開始</button>` : '')}
    ${slot('22:00', '睡前用聽的', '把今天讀的再聽一遍', d.listened,
      `<a class="btn small ghost" href="#/listen/today">播放</a>`)}
    <div class="card sub">今天：新學 ${d.n} 題、複習 ${d.r} 題，答對 ${d.ok}、答錯 ${d.ng}。
      ${pl.inSprint ? '' : `<br>照進度每天學 ${pl.target} 題新的，${pl.sprint.replace(/-/g, '/')} 起進入考前衝刺。`}</div>
  `;
};
window.startNew = () => {
  const pl = plan();
  const n = Math.max(1, pl.target - pl.doneToday);
  const first = BY_ID[pl.left[0]];
  // 一次只學同一個主題，不夠就到下一個主題
  startQuiz({ title: '學新的：' + TOPICS[first.topic].name, ids: pl.left.slice(0, n), mode: 'learn' });
};
window.startReview = () => startQuiz({ title: '刷題＋錯題', ids: dueIds().slice(0, 40), mode: 'review' });

/* ---------- 練習 ---------- */
routes.practice = () => {
  const wr = wrongIds();
  const rows = ORDER.filter(c => TOPICS[c]).map(c => {
    const tp = TOPICS[c], n = tp.qs.length;
    const s = tp.qs.filter(q => seen(q.id)).length, m = tp.qs.filter(q => mastered(q.id)).length;
    return `<a href="#/topic/${c}"><div class="card">
      <div class="row"><b class="grow">${esc(tp.name)}</b><span class="sub">${n} 題</span></div>
      <div class="bar" style="margin:6px 0 2px"><i style="width:${(m / n * 100).toFixed(0)}%"></i></div>
      <div class="sub">讀過 ${s}、熟了 ${m}${NOTES[c] ? '　📘 有重點整理' : ''}</div></div></a>`;
  }).join('');
  $('#app').innerHTML = `
    <h1>練習</h1>
    <div class="row">
      <button class="btn grow" onclick="go('#/mock')">📝 模擬考</button>
      <button class="btn ghost grow" ${wr.length ? '' : 'disabled'} onclick="startQuiz({title:'錯題本',ids:wrongIds(),mode:'review'})">❌ 錯題本 ${wr.length}</button>
    </div>
    <a class="btn wide ghost" href="#/laws">📖 法規條文查詢（${'45'} 部，離線可看）</a>
    <h2>依主題</h2><div class="list">${rows}</div>`;
};

routes.topic = code => {
  const tp = TOPICS[code]; if (!tp) return go('#/practice');
  const qs = tp.qs, unseen = qs.filter(q => !seen(q.id)), weak = qs.filter(q => seen(q.id) && !mastered(q.id));
  $('#app').innerHTML = `
    <div class="top"><a href="#/practice">‹ 練習</a></div>
    <h1>${esc(tp.name)}</h1>
    ${NOTES[code] ? `<a class="btn wide ghost" href="#/note/${code}">📘 先看重點整理</a>` : ''}
    <button class="btn wide" ${unseen.length ? '' : 'disabled'} onclick="startQuiz({title:'${esc(tp.name)}',ids:${JSON.stringify(unseen.map(q => q.id).slice(0, 15))},mode:'learn'})">學沒讀過的（${unseen.length}）</button>
    <button class="btn wide ghost" ${weak.length ? '' : 'disabled'} onclick="startQuiz({title:'${esc(tp.name)}',ids:${JSON.stringify(shuffle(weak.map(q => q.id)).slice(0, 20))},mode:'review'})">練還不熟的（${weak.length}）</button>
    <button class="btn wide ghost" onclick="startQuiz({title:'${esc(tp.name)}',ids:${JSON.stringify(shuffle(qs.map(q => q.id)).slice(0, 20))},mode:'free'})">隨機 20 題</button>
    <h2>題目一覽</h2>
    <div class="card">${qs.map(q => {
    const r = P.q[q.id];
    const tag = !r ? '<span class="pill" style="opacity:.5">未讀</span>' : mastered(q.id) ? '<span class="pill">熟</span>' : r.w ? `<span class="pill ng">錯 ${r.w}</span>` : '<span class="pill warn">讀過</span>';
    return `<div class="row" style="padding:6px 0;border-bottom:1px solid var(--line)"><span class="grow" style="font-size:15px">${esc(q.q.slice(0, 48))}${q.q.length > 48 ? '…' : ''}</span>${tag}</div>`;
  }).join('')}</div>`;
};

routes.note = code => {
  const n = NOTES[code]; if (!n) return go('#/topic/' + code);
  $('#app').innerHTML = `
    <div class="top"><a href="#/topic/${code}">‹ ${esc(TOPICS[code].name)}</a>
      <button class="btn small ghost" onclick="speakNote()">🔊 朗讀</button></div>
    <h1>${esc(n.title || TOPICS[code].name)}</h1>
    <div class="card note" id="noteBody">${n.html}</div>
    <a class="btn wide" href="#/topic/${code}">看完了，去做題</a>`;
};
window.speakNote = () => {
  const txt = $('#noteBody').innerText;
  Speech.say(txt.split(/\n+/).filter(Boolean));
};

/* ---------- 法規 ---------- */
routes.laws = async kw => {
  const L = await laws();
  kw = kw || '';
  const names = Object.keys(L);
  let hits = '';
  if (kw.length >= 2) {
    const out = [];
    for (const n of names) for (const [no, body] of L[n].arts) if (body.includes(kw)) out.push([n, no, body]);
    hits = `<div class="sub">找到 ${out.length} 條${out.length > 80 ? '（只列前 80 條）' : ''}</div>` + out.slice(0, 80).map(([n, no, body]) => {
      const i = body.indexOf(kw), cut = body.slice(Math.max(0, i - 30), i + 50);
      return `<a href="#/law/${encodeURIComponent(n)}/${encodeURIComponent(no)}"><div class="card"><b>${esc(n)} ${no}</b><div class="sub">…${esc(cut).replace(esc(kw), `<mark>${esc(kw)}</mark>`)}…</div></div></a>`;
    }).join('');
  }
  $('#app').innerHTML = `
    <div class="top"><a href="#/practice">‹ 練習</a></div>
    <h1>法規條文</h1>
    <input type="text" id="lkw" placeholder="搜尋關鍵字，例如：護欄、缺氧、每週" value="${esc(kw)}"
      onkeydown="if(event.key==='Enter')go('#/laws/'+encodeURIComponent(this.value.trim()))">
    <div class="list">${hits || names.map(n => `<a href="#/law/${encodeURIComponent(n)}"><div class="card row"><span class="grow">${esc(n)}</span><span class="sub">${esc(L[n].date.replace('民國 ', ''))}</span></div></a>`).join('')}</div>`;
};
routes.law = async arg => {
  const [name, no] = location.hash.split('/').slice(2).map(decodeURIComponent);
  const L = await laws(), law = L[name];
  if (!law) return go('#/laws');
  $('#app').innerHTML = `
    <div class="top"><a href="javascript:history.back()">‹ 返回</a><span>${esc(law.date)}</span></div>
    <h1>${esc(name)}</h1>
    ${law.arts.map(([n, b]) => `<div class="card" id="a-${esc(n)}" ${n === no ? 'style="border:2px solid var(--main)"' : ''}><b>${esc(n)}</b><div class="explain">${esc(b)}</div></div>`).join('')}`;
  if (no) setTimeout(() => document.getElementById('a-' + no)?.scrollIntoView({ block: 'start' }), 50);
};

/* ---------- 作答 ---------- */
window.startQuiz = opt => {
  if (!opt.ids.length) return toast('沒有題目');
  S = Object.assign({ i: 0, res: {}, picks: {}, first: {}, order: {}, requeued: {}, back: location.hash || '#/today' }, opt);
  for (const id of S.ids) S.order[id] = P.set.shuffle ? shuffle([1, 2, 3, 4]) : [1, 2, 3, 4];
  if (S.mode === 'mock') S.end = Date.now() + 100 * 60e3;
  go('#/quiz/' + Date.now());
};

routes.quiz = () => {
  if (!S) return go('#/today');
  if (S.i >= S.ids.length) return quizDone();
  const id = S.ids[S.i], q = BY_ID[id], ord = S.order[id];
  const pick = S.picks[S.i] || [], judged = S.res[S.i] !== undefined && S.mode !== 'mock';
  const opts = ord.map((o, k) => {
    let cls = pick.includes(o) ? 'pick' : '';
    if (judged) cls = q.ans.includes(o) ? 'ok' : pick.includes(o) ? 'ng' : '';
    return `<button class="opt ${cls}" ${judged ? 'disabled' : ''} onclick="tapOpt(${o})"><b>${NUM[k + 1]}</b><span>${q.img ? '圖 ' + MARK[o] : esc(q.opts[o - 1])}</span></button>`;
  }).join('');
  const law = lawOf(q), ex = EXPLAIN[id];
  const right = q.ans.map(o => ord.indexOf(o) + 1).sort().map(n => NUM[n]).join('、');
  $('#app').innerHTML = `
    <div class="top"><a href="javascript:quitQuiz()">✕ 結束</a><span>${esc(S.title)}</span><span>${S.i + 1} / ${S.ids.length}${S.mode === 'mock' ? ` ・ <span id="clock"></span>` : ''}</span></div>
    <div class="row" style="margin-top:8px"><span class="pill">${esc(q.topicName)}</span>${q.multi ? '<span class="pill warn">複選：選 2 個以上，全對才給分</span>' : ''}</div>
    <div class="q">${esc(q.q)}</div>
    ${q.img ? `<img class="qimg" src="${q.img}" alt="">` : ''}
    ${opts}
    ${judged ? `<div class="fb ${S.res[S.i] ? 'ok' : 'ng'}">
        <b>${S.res[S.i] ? '✔ 答對了' : '✘ 答錯了'}</b>　正確答案：${right}
        ${ex ? `<div class="explain" style="margin-top:8px">${esc(ex)}</div>` : ''}
        ${REFS[id] ? `<div style="margin-top:8px">📖 ${REFS[id][2] < 40 ? '可能相關：' : ''}<b>${esc(REFS[id][0])} ${esc(REFS[id][1])}</b>
            <button class="btn small ghost" onclick="showRef('${id}',this)">看條文</button></div>`
        : law ? `<div class="sub" style="margin-top:8px">📖 <a href="${lawLink(law)}" target="_blank" rel="noopener">查「${esc(law)}」條文</a></div>` : ''}
      </div>
      <div class="row"><button class="btn ghost" onclick="speakQ('${id}',true)">🔊</button>
        <button class="btn grow" onclick="nextQ()">下一題 ›</button></div>`
      : q.multi || S.mode === 'mock'
        ? `<div class="row">${S.mode === 'mock' && S.i > 0 ? '<button class="btn ghost" onclick="S.i--;render()">‹</button>' : ''}
           <button class="btn grow" ${S.mode !== 'mock' && pick.length < 2 ? 'disabled' : ''} onclick="${S.mode === 'mock' ? 'nextQ()' : 'judge()'}">${S.mode === 'mock' ? (S.i + 1 < S.ids.length ? '下一題 ›' : '交卷') : '確定'}</button></div>`
        : ''}
    ${S.mode === 'mock' ? `<button class="btn wide ghost" onclick="if(confirm('確定交卷？'))quizDone()">交卷</button>` : ''}`;
  if (S.mode === 'mock') tick();
};
function tick() {
  const el = $('#clock'); if (!el || !S) return;
  const left = Math.max(0, S.end - Date.now());
  el.textContent = `${Math.floor(left / 60e3)}:${String(Math.floor(left / 1e3) % 60).padStart(2, '0')}`;
  if (left <= 0) return quizDone();
  clearTimeout(tick.t); tick.t = setTimeout(tick, 1000);
}
window.tapOpt = o => {
  const id = S.ids[S.i], q = BY_ID[id];
  let p = S.picks[S.i] || [];
  if (q.multi) p = p.includes(o) ? p.filter(x => x !== o) : [...p, o];
  else p = [o];
  S.picks[S.i] = p;
  if (!q.multi && S.mode !== 'mock') return judge();
  render();
};
window.judge = () => {
  const id = S.ids[S.i], q = BY_ID[id], p = (S.picks[S.i] || []).slice().sort();
  const ok = p.join() === q.ans.slice().sort().join();
  S.res[S.i] = ok;
  if (S.first[id] === undefined) { S.first[id] = ok; grade(id, ok); }
  // 答錯的同一回合再出一次（隔 3 題），加深印象
  if (!ok && !S.requeued[id] && S.mode !== 'mock') {
    S.requeued[id] = 1;
    S.ids.splice(Math.min(S.i + 4, S.ids.length), 0, id);
  }
  render();
};
window.nextQ = () => { S.i++; render(); };
window.quitQuiz = () => {
  if (S.mode === 'mock' && !confirm('結束模擬考？這回不計分。')) return;
  const back = S.back; S = null; go(back.startsWith('#/quiz') ? '#/today' : back);
};

function quizDone() {
  clearTimeout(tick.t);
  const ids = [...new Set(S.ids)];
  let html;
  if (S.mode === 'mock') {
    let score = 0;
    const wrong = [];
    for (const id of ids) {
      const q = BY_ID[id], p = (S.picks[S.ids.indexOf(id)] || []).slice().sort();
      const ok = p.join() === q.ans.slice().sort().join();
      if (ok) score += q.multi ? 2 : 1; else wrong.push(id);
      grade(id, ok);
    }
    day().mock = 1; save();
    (P.mocks = P.mocks || []).push({ d: today(), s: score }); save();
    const byT = {};
    for (const id of wrong) byT[BY_ID[id].topicName] = (byT[BY_ID[id].topicName] || 0) + 1;
    html = `<div class="big" style="color:${score >= 60 ? 'var(--ok)' : 'var(--ng)'}">${score} 分</div>
      <div class="sub">${score >= 60 ? '及格！' : '還差 ' + (60 - score) + ' 分'}（單選 1 分、複選 2 分，60 分及格）</div>
      <h3>錯最多的主題</h3><table>${Object.entries(byT).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v} 題</td></tr>`).join('')}</table>
      ${wrong.length ? `<button class="btn wide" onclick='startQuiz({title:"模擬考錯題",ids:${JSON.stringify(wrong)},mode:"review"})'>把錯的再做一次（${wrong.length}）</button>` : ''}`;
  } else {
    const ok = ids.filter(id => S.first[id]).length;
    html = `<div class="big">${ok} / ${ids.length}</div><div class="sub">第一次就答對的題數</div>`;
    if (S.mode === 'learn') html += `<p>這些題目明天、後天、一週後會再出現考你，記不住也沒關係，錯了就再來。</p>`;
  }
  S = null;
  $('#app').innerHTML = `<h1>完成 👍</h1><div class="card">${html}</div>
    <a class="btn wide ghost" href="#/today">回今天</a>`;
}

/* ---------- 模擬考：照乙級學科題數（單選 60＝專業 44＋共同 16、複選 20） ---------- */
routes.mock = () => {
  const hist = (P.mocks || []).slice(-8).reverse();
  $('#app').innerHTML = `
    <div class="top"><a href="#/practice">‹ 練習</a></div>
    <h1>模擬考</h1>
    <div class="card">單選 60 題（專業 44＋共同科目 16）、複選 20 題，100 分鐘。<br>
      單選每題 1 分、複選每題 2 分（全對才給分），60 分及格。<br>
      <span class="sub">題目照各主題題庫比例抽，考完才對答案。</span></div>
    <button class="btn wide" onclick="startMock()">開始（計時 100 分鐘）</button>
    ${hist.length ? `<h2>最近成績</h2><div class="card"><table>${hist.map(h => `<tr><td>${h.d}</td><td style="color:${h.s >= 60 ? 'var(--ok)' : 'var(--ng)'}">${h.s} 分</td></tr>`).join('')}</table></div>` : ''}`;
};
window.startMock = () => {
  const pro = BANK.filter(q => q.subj === '22200');
  const pick = (arr, n) => shuffle(arr).slice(0, n).map(q => q.id);
  const ids = [
    ...pick(pro.filter(q => !q.multi), 44),
    ...['90006', '90007', '90008', '90009'].flatMap(s => pick(BANK.filter(q => q.subj === s), 4)),
    ...pick(pro.filter(q => q.multi), 20),
  ];
  startQuiz({ title: '模擬考', ids, mode: 'mock' });
};

/* ---------- 朗讀 ---------- */
const Speech = {
  voice: null,
  init() {
    if (!window.speechSynthesis) return;
    const pickV = () => {
      const vs = speechSynthesis.getVoices();
      this.voice = vs.find(v => /zh[-_]TW/i.test(v.lang)) || vs.find(v => /zh/i.test(v.lang)) || null;
    };
    pickV(); speechSynthesis.onvoiceschanged = pickV;
  },
  clean(s) {
    return String(s).replace(/①/g, '一、').replace(/②/g, '二、').replace(/③/g, '三、').replace(/④/g, '四、')
      .replace(/℃/g, '度C').replace(/m3|m³/g, '立方公尺').replace(/mg\/m3/g, '毫克每立方公尺').replace(/％|%/g, '%');
  },
  // parts：字串或 {wait:秒}，一段一段念，念完呼叫 done
  say(parts, done) {
    if (!window.speechSynthesis) return toast('這台裝置不支援朗讀');
    speechSynthesis.cancel();
    const list = parts.slice();
    const next = () => {
      if (this.stopped) return;
      const p = list.shift();
      if (p === undefined) return done && done();
      if (typeof p === 'object') { this.timer = setTimeout(next, p.wait * 1000); return; }
      const u = new SpeechSynthesisUtterance(this.clean(p));
      u.lang = 'zh-TW'; if (this.voice) u.voice = this.voice; u.rate = P.set.rate;
      u.onend = next; u.onerror = next;
      speechSynthesis.speak(u);
    };
    this.stopped = false; clearTimeout(this.timer); next();
  },
  stop() { this.stopped = true; clearTimeout(this.timer); if (window.speechSynthesis) speechSynthesis.cancel(); },
};
function qParts(q, withAns, withOpts = true) {
  const parts = [q.q];
  if (withOpts && !q.img) q.opts.forEach((o, i) => parts.push(NUM[i + 1] + '、' + o));
  if (q.multi) parts.push('這是複選題');
  if (withAns) {
    parts.push({ wait: P.set.wait });
    parts.push('答案是' + q.ans.map(a => NUM[a]).join('、') + '。' + (q.img ? '' : q.ans.map(a => q.opts[a - 1]).join('；')));
    if (EXPLAIN[q.id]) parts.push(EXPLAIN[q.id]);
  }
  return parts;
}
window.speakQ = (id, withAns) => Speech.say(qParts(BY_ID[id], withAns, true));

/* ---------- 用聽的 ---------- */
let L = null;
routes.listen = src => {
  src = src || L?.src || 'today';
  const srcs = {
    today: ['今天讀的', () => (P.days[today()]?.ids || [])],
    yday: ['昨天讀的', () => (P.days[addDays(today(), -1)]?.ids || [])],
    due: ['快忘的（到期複習）', () => dueIds()],
    wrong: ['錯題本', () => wrongIds()],
    ...Object.fromEntries(ORDER.filter(c => TOPICS[c]).map(c => ['t' + c, ['主題：' + TOPICS[c].name, () => TOPICS[c].qs.filter(q => seen(q.id)).map(q => q.id)]])),
  };
  if (!srcs[src]) src = 'today';
  if (!L || L.src !== src) { Speech.stop(); L = { src, ids: srcs[src][1](), i: 0, playing: false }; }
  const q = BY_ID[L.ids[L.i]];
  $('#app').innerHTML = `
    <h1>用聽的</h1>
    <div class="card">
      <label class="sub">要聽什麼</label>
      <select onchange="go('#/listen/'+this.value)">${Object.entries(srcs).map(([k, v]) => `<option value="${k}" ${k === src ? 'selected' : ''}>${esc(v[0])}</option>`).join('')}</select>
      <div class="sub" style="margin-top:6px">共 ${L.ids.length} 題。念題目 → 停 ${P.set.wait} 秒讓你想 → 念答案和解說。</div>
    </div>
    ${q ? `<div class="card"><div class="sub">${L.i + 1} / ${L.ids.length}　${esc(q.topicName)}</div><div class="q" style="font-size:16px">${esc(q.q)}</div>
      ${q.img ? '' : `<div class="sub">${q.opts.map((o, i) => NUM[i + 1] + '、' + esc(o)).join('<br>')}</div>`}</div>` : '<div class="card sub">這裡還沒有題目，先去做題吧。</div>'}
    <div class="row">
      <button class="btn ghost" onclick="lMove(-1)">⏮</button>
      <button class="btn grow" ${q ? '' : 'disabled'} onclick="lToggle()">${L.playing ? '⏸ 暫停' : '▶ 播放'}</button>
      <button class="btn ghost" onclick="lMove(1)">⏭</button>
    </div>
    <div class="card">
      <div class="row"><span class="grow">語速</span><select style="width:auto" onchange="P.set.rate=+this.value;save()">${[0.8, 0.9, 1, 1.1, 1.2, 1.4].map(r => `<option ${P.set.rate === r ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
      <div class="row" style="margin-top:8px"><span class="grow">想答案的時間（秒）</span><select style="width:auto" onchange="P.set.wait=+this.value;save();render()">${[2, 3, 4, 6, 8, 10].map(r => `<option ${P.set.wait === r ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
      <div class="sub" style="margin-top:8px">iPhone 鎖螢幕後朗讀會停，開車聽請讓螢幕保持亮著。</div>
    </div>`;
};
function lPlay() {
  const q = BY_ID[L.ids[L.i]];
  if (!q) { L.playing = false; return render(); }
  Speech.say([`第${L.i + 1}題`, ...qParts(q, true)], () => {
    if (!L.playing) return;
    if (L.src === 'today') { day().listened = 1; save(); }
    if (L.i + 1 < L.ids.length) { L.i++; render(); lPlay(); }
    else { L.playing = false; toast('播完了'); render(); }
  });
}
window.lToggle = () => {
  L.playing = !L.playing;
  if (L.playing) lPlay(); else Speech.stop();
  render();
};
window.lMove = n => {
  L.i = Math.max(0, Math.min(L.ids.length - 1, L.i + n));
  Speech.stop(); render(); if (L.playing) lPlay();
};

/* ---------- 我的 ---------- */
routes.me = () => {
  const total = BANK.length, s = Object.keys(P.q).length, m = BANK.filter(q => mastered(q.id)).length;
  const base = location.href.split('#')[0];
  $('#app').innerHTML = `
    <h1>我的</h1>
    <div class="card"><div class="row"><div class="grow">讀過</div><b>${s} / ${total}</b></div>
      <div class="bar" style="margin:6px 0"><i style="width:${s / total * 100}%"></i></div>
      <div class="row"><div class="grow">熟了</div><b>${m} / ${total}</b></div>
      <div class="bar" style="margin:6px 0"><i style="width:${m / total * 100}%"></i></div></div>
    <h2>手機和電腦同步</h2><div class="card" id="syncBox"></div>
    <h2>每天提醒（iPhone）</h2>
    <div class="card">用 iPhone 內建「提醒事項」最穩：
      <ol style="margin:6px 0;padding-left:22px">
        <li>打開「提醒事項」，新增「職安：學新的」</li>
        <li>點 ⓘ → 打開「日期」「時間」，設 <b>09:00</b>，「重複」選「每天」</li>
        <li>「URL」貼上 App 網址（按下面按鈕複製）</li>
        <li>同樣再建 <b>14:00</b>「職安：刷題」、<b>22:00</b>「職安：用聽的」</li>
      </ol>
      <button class="btn small ghost" onclick="navigator.clipboard.writeText('${base}').then(()=>toast('網址已複製'))">複製 App 網址</button></div>
    <h2>設定</h2>
    <div class="card">
      <label class="row"><span class="grow">選項順序打亂（避免背位置）</span><input type="checkbox" ${P.set.shuffle ? 'checked' : ''} onchange="P.set.shuffle=this.checked;save()"></label>
    </div>
    <h2>備份</h2>
    <div class="card"><div class="row">
      <button class="btn small ghost" onclick="exportP()">匯出進度</button>
      <label class="btn small ghost">匯入進度<input type="file" accept=".json" hidden onchange="importP(this.files[0])"></label>
    </div></div>
    <div class="sub" style="margin:16px 0">題庫：技能檢定中心公告 222002A16（116/01/01 起報檢適用）、共同科目 90006～90009。
      題目共 ${total} 題。版本 ${window.OSH_CONFIG.build}</div>`;
  if (window.Sync) Sync.box($('#syncBox')); else $('#syncBox').textContent = '尚未設定';
};
window.exportP = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(P)], { type: 'application/json' }));
  a.download = `職安乙級進度-${today()}.json`; a.click();
};
window.importP = f => {
  if (!f) return;
  f.text().then(t => { const x = JSON.parse(t); if (!x.q) throw 0; P = Object.assign(blank(), x); save(); toast('已匯入'); render(); })
    .catch(() => toast('檔案不對'));
};

/* ---------- 啟動 ---------- */
async function boot() {
  load(); Speech.init();
  const j = async (u, d) => { try { const r = await fetch(u); return r.ok ? r.json() : d; } catch (e) { return d; } };
  const [bank, ex, notes, refs] = await Promise.all([j('data/bank.json', { questions: [] }), j('data/explain.json', {}), j('data/notes.json', {}), j('data/refs.json', {})]);
  BANK = bank.questions; EXPLAIN = ex; NOTES = notes; REFS = refs;
  for (const q of BANK) {
    BY_ID[q.id] = q;
    (TOPICS[q.topic] = TOPICS[q.topic] || { code: q.topic, name: q.topicName, qs: [] }).qs.push(q);
  }
  render();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js');
}
// 給 sync.js 用
window.OSH = { get P() { return P; }, set P(x) { P = x; }, save, render, blank };
boot();
