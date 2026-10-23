/* 手機、電腦進度同步：存在東東 GitHub 的私人 Gist（osh-exam-progress.json）
   鑰匙（GitHub token，只需 gist 權限）存在這台裝置的 oshGH，不會跟著進度上傳
   合併規則：每一題看誰最後作答（t 比較新）就用誰的；每天的紀錄取聯集 */
'use strict';
window.Sync = (() => {
  const FILE = 'osh-exam-progress.json';
  const API = 'https://api.github.com';
  let auth = null, timer = null, busy = false, lastMsg = '';

  function loadAuth() { try { auth = JSON.parse(localStorage.getItem('oshGH') || 'null'); } catch (e) { auth = null; } }
  function saveAuth() { try { auth ? localStorage.setItem('oshGH', JSON.stringify(auth)) : localStorage.removeItem('oshGH'); } catch (e) { } }

  async function gh(path, opt = {}) {
    const r = await fetch(API + path, Object.assign({}, opt, {
      headers: { Authorization: 'Bearer ' + auth.token, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
      cache: 'no-store',
    }));
    if (r.status === 401) throw new Error('key');
    if (!r.ok) throw new Error('http ' + r.status);
    return r.json();
  }

  // 找到（或第一次建立）放進度的私人 Gist
  async function findGist() {
    for (let page = 1; page <= 5; page++) {
      const list = await gh(`/gists?per_page=100&page=${page}`);
      const g = list.find(x => x.files && x.files[FILE]);
      if (g) return g.id;
      if (list.length < 100) break;
    }
    const g = await gh('/gists', { method: 'POST', body: JSON.stringify({ description: '職安乙級 App 讀書進度（App 自動維護，請勿手動修改）', public: false, files: { [FILE]: { content: JSON.stringify(OSH.P) } } }) });
    return g.id;
  }

  async function readRemote() {
    const g = await gh('/gists/' + auth.gist);
    const f = g.files[FILE];
    if (!f) return null;
    let text = f.content;
    if (f.truncated) text = await (await fetch(f.raw_url, { cache: 'no-store' })).text();
    try { return JSON.parse(text); } catch (e) { return null; }
  }

  function merge(a, b) {
    const out = OSH.blank();
    const newer = (a.upd || 0) >= (b.upd || 0) ? a : b;
    out.set = Object.assign({}, out.set, newer.set);
    for (const src of [a, b]) for (const [id, r] of Object.entries(src.q || {})) {
      const o = out.q[id];
      if (!o || (r.t || 0) > (o.t || 0)) out.q[id] = r;
    }
    for (const src of [a, b]) for (const [d, r] of Object.entries(src.days || {})) {
      const o = out.days[d];
      if (!o) { out.days[d] = JSON.parse(JSON.stringify(r)); continue; }
      for (const k of ['n', 'r', 'ok', 'ng']) o[k] = Math.max(o[k] || 0, r[k] || 0);
      o.ids = [...new Set([...(o.ids || []), ...(r.ids || [])])];
      if (r.listened) o.listened = 1;
      if (r.mock) o.mock = 1;
    }
    const seen = new Set();
    out.mocks = [...(a.mocks || []), ...(b.mocks || [])].filter(m => { const k = m.d + '|' + m.s; if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((x, y) => x.d.localeCompare(y.d));
    out.upd = Math.max(a.upd || 0, b.upd || 0);
    return out;
  }

  async function now() {
    if (busy || !auth) return;
    busy = true;
    try {
      if (!auth.gist) { auth.gist = await findGist(); saveAuth(); }
      const remote = await readRemote();
      const merged = remote ? merge(OSH.P, remote) : OSH.P;
      OSH.P = merged;
      localStorage.setItem('oshP', JSON.stringify(merged));
      await gh('/gists/' + auth.gist, { method: 'PATCH', body: JSON.stringify({ files: { [FILE]: { content: JSON.stringify(merged) } } }) });
      lastMsg = '已同步 ' + new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      lastMsg = e.message === 'key' ? '鑰匙失效（過期或被刪掉），請重新貼一把新的' : '這次沒同步到（沒網路時先存在這台，有網路會再補）';
    }
    busy = false;
    const box = document.getElementById('syncBox'); if (box) draw(box);
  }

  function later() { clearTimeout(timer); if (auth) timer = setTimeout(now, 3000); }

  function draw(box) {
    if (auth) {
      box.innerHTML = `<div class="row"><div class="grow">已連上 GitHub：${auth.user || ''}<div class="sub">${lastMsg || '每次作答後自動同步'}</div></div>
        <button class="btn small ghost" onclick="Sync.now()">立即同步</button></div>
        <button class="btn small ghost" style="margin-top:8px" onclick="Sync.out()">取消連線</button>`;
      return;
    }
    box.innerHTML = `<div class="sub">手機和電腦各貼一次同一把 GitHub 鑰匙，進度就會自動同步。</div>
      <input id="gk" type="password" placeholder="貼上鑰匙（ghp_ 開頭）" style="margin-top:8px" autocomplete="off">
      <button class="btn wide" onclick="Sync.login()">連線</button>
      <div class="sub" style="margin-top:8px">還沒有鑰匙？<a href="https://github.com/settings/tokens/new?scopes=gist&description=osh-exam" target="_blank" rel="noopener">到 GitHub 產生</a>：只勾 gist、期限選到 2027 年 4 月以後，按 Generate token，複製整串。</div>
      <div class="sub" style="margin-top:6px">${lastMsg}</div>`;
  }

  async function login() {
    const token = document.getElementById('gk').value.trim();
    if (!token) return;
    auth = { token };
    try {
      const me = await gh('/user');
      auth.user = me.login; saveAuth();
      lastMsg = '連線成功，同步中…';
      draw(document.getElementById('syncBox'));
      await now(); OSH.render();
    } catch (e) {
      auth = null;
      lastMsg = e.message === 'key' ? '鑰匙不對，請確認有整串貼上' : '連不上 GitHub，請確認有網路';
      draw(document.getElementById('syncBox'));
    }
  }
  function out() {
    if (!confirm('取消連線後，這台裝置就不會再同步（進度還在）。確定？')) return;
    auth = null; saveAuth(); lastMsg = ''; OSH.render();
  }

  loadAuth();
  // 同步完只重畫首頁、練習、我的（作答中重畫會跳回頁首）
  const refresh = () => { if (/^(#\/(today|practice|me)?)?$/.test(location.hash)) OSH.render(); };
  setTimeout(() => { if (auth) now().then(refresh); }, 500);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && auth) now().then(refresh); });

  return { later, now, box: draw, login, out, merge };
})();
