/* 手機、電腦進度同步：Supabase 一張表 progress（一人一列 JSON）
   合併規則：每一題看誰最後作答（t 比較新）就用誰的；每天的紀錄取聯集 */
'use strict';
window.Sync = (() => {
  const cfg = window.OSH_CONFIG.supabase;
  let sb = null, user = null, timer = null, busy = false, lastMsg = '';

  async function client() {
    if (sb) return sb;
    if (!cfg.url) return null;
    if (!window.supabase) {
      await new Promise((ok, ng) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
        s.onload = ok; s.onerror = ng; document.head.appendChild(s);
      });
    }
    sb = window.supabase.createClient(cfg.url, cfg.anonKey, { auth: { persistSession: true } });
    return sb;
  }

  function merge(a, b) {
    const out = OSH.blank();
    const newer = (a.upd || 0) >= (b.upd || 0) ? a : b;
    out.set = Object.assign({}, newer.set);
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
    if (busy || !user) return;
    busy = true;
    try {
      const { data, error } = await sb.from('progress').select('data').eq('user_id', user.id).maybeSingle();
      if (error) throw error;
      const merged = data?.data ? merge(OSH.P, data.data) : OSH.P;
      OSH.P = merged;
      localStorage.setItem('oshP', JSON.stringify(merged));
      const up = await sb.from('progress').upsert({ user_id: user.id, data: merged, updated_at: new Date().toISOString() });
      if (up.error) throw up.error;
      lastMsg = '已同步 ' + new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      lastMsg = '同步失敗（沒網路時會先存在手機，有網路再補）';
    }
    busy = false;
    const box = document.getElementById('syncBox'); if (box) draw(box);
  }

  function later() { clearTimeout(timer); if (user) timer = setTimeout(now, 3000); }

  function draw(box) {
    if (!cfg.url) { box.innerHTML = '<span class="sub">雲端還沒設定，進度目前只存在這台裝置。</span>'; return; }
    if (user) {
      box.innerHTML = `<div class="row"><div class="grow">已登入：${user.email}<div class="sub">${lastMsg}</div></div>
        <button class="btn small ghost" onclick="Sync.now()">立即同步</button></div>
        <button class="btn small ghost" style="margin-top:8px" onclick="Sync.out()">登出</button>`;
      return;
    }
    box.innerHTML = `<div class="sub">手機和電腦用同一組帳號登入，進度就會自動同步。</div>
      <input id="se" type="email" placeholder="Email" style="margin-top:8px" autocomplete="username">
      <input id="sp" type="password" placeholder="密碼" style="margin-top:8px" autocomplete="current-password">
      <button class="btn wide" onclick="Sync.login()">登入</button>
      <div class="sub" id="smsg" style="margin-top:6px">${lastMsg}</div>`;
  }

  async function login() {
    const c = await client();
    const { data, error } = await c.auth.signInWithPassword({ email: document.getElementById('se').value.trim(), password: document.getElementById('sp').value });
    if (error) { lastMsg = '登入失敗：帳號或密碼不對'; return draw(document.getElementById('syncBox')); }
    user = data.user; lastMsg = '登入成功，同步中…';
    draw(document.getElementById('syncBox')); await now(); OSH.render();
  }
  async function out() { const c = await client(); await c.auth.signOut(); user = null; lastMsg = ''; OSH.render(); }

  async function start() {
    const c = await client().catch(() => null); if (!c) return;
    const { data } = await c.auth.getSession();
    user = data.session?.user || null;
    if (user) { await now(); OSH.render(); }
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') now().then(() => OSH.render()); });
  }
  setTimeout(start, 500);

  return { later, now, box: draw, login, out, merge };
})();
