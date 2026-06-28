/* Financico — Database section.
   Lazy-loaded by app.js the first time the user taps "נתונים" on the chooser,
   so it never weighs on the main logging screen. Self-contained: reads the
   endpoint/token from localStorage (same keys as app.js), renders its own
   full-screen view over the main app, and is purely read-only this stage.

   Views: home (three tiles) -> list (income | expense). Back from a list
   returns to home; back from home returns to the main logging app. */
(function () {
  "use strict";
  if (window.FinDB) return;              // guard: load + init exactly once
  var LS = window.localStorage;

  function endpoint() { return LS.getItem('fin_endpoint') || ''; }
  function token()    { return LS.getItem('fin_token')    || ''; }

  // ---- styles (injected once, only when this section is first opened) ----
  var css = [
    '.db-screen{position:fixed;inset:0;z-index:30;background:var(--bg);display:flex;flex-direction:column;max-width:480px;margin:0 auto}',
    '.db-head{display:flex;align-items:center;gap:10px;background:#475569;color:#fff;padding:16px 18px calc(16px + env(safe-area-inset-top))}',
    '.db-head h2{margin:0;font-size:20px;font-weight:700;flex:1}',
    '.db-back{background:rgba(255,255,255,.18);border:0;color:#fff;height:38px;padding:0 14px;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit}',
    '.db-body{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:16px;overscroll-behavior:contain}',
    '.db-home{display:flex;flex-direction:column;gap:14px}',
    '.db-tile{display:flex;align-items:center;justify-content:center;gap:10px;height:96px;border:0;border-radius:16px;font-size:22px;font-weight:800;color:#fff;cursor:pointer;font-family:inherit}',
    '.db-tile.inc{background:var(--green)}.db-tile.exp{background:var(--blue)}.db-tile.ana{background:#94a3b8}',
    '.db-tile[disabled]{opacity:.6;cursor:default}',
    '.db-tile .soon{font-size:13px;font-weight:700;background:rgba(255,255,255,.25);padding:3px 9px;border-radius:999px}',
    '.db-state{text-align:center;color:var(--muted);padding:30px 12px;font-size:16px;line-height:1.5}',
    '.db-state .retry{margin-top:14px;background:#475569;color:#fff;border:0;border-radius:10px;padding:10px 18px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit}',
    '.db-count{color:var(--muted);font-size:13px;margin:0 2px 10px}',
    '.db-rows{display:flex;flex-direction:column;gap:8px}',
    '.db-row{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;cursor:pointer}',
    '.db-row:active{background:#eef2f5}',
    '.r-main{display:flex;align-items:baseline;justify-content:space-between;gap:10px}',
    '.r-name{font-size:17px;font-weight:700;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.r-amt{font-size:17px;font-weight:800;white-space:nowrap}',
    '.r-sub{display:flex;align-items:center;gap:8px;margin-top:6px;font-size:13px;color:var(--muted);flex-wrap:wrap}',
    '.r-date{font-variant-numeric:tabular-nums}',
    '.r-via,.r-cat{background:#eef2f5;padding:2px 8px;border-radius:999px}',
    '.badge{padding:2px 9px;border-radius:999px;font-weight:700;font-size:12px;margin-inline-start:auto}',
    '.badge.ok{background:#dcfce7;color:#166534}',
    '.badge.no{background:#f1f5f9;color:#64748b}'
  ].join('');
  var styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  // ---- screen markup ----
  var screen = document.createElement('div');
  screen.className = 'db-screen hidden';
  screen.innerHTML = [
    '<div class="db-head">',
    '  <button class="db-back" id="db-back">חזרה</button>',
    '  <h2 id="db-title">מסד נתונים</h2>',
    '</div>',
    '<div class="db-body">',
    '  <section class="db-home" id="db-home">',
    '    <button class="db-tile inc" data-kind="income">נתוני הכנסות</button>',
    '    <button class="db-tile exp" data-kind="expense">נתוני הוצאות</button>',
    '    <button class="db-tile ana" id="db-analysis" disabled>ניתוח <span class="soon">בקרוב</span></button>',
    '  </section>',
    '  <section class="db-list hidden" id="db-list">',
    '    <div class="db-state hidden" id="db-state"></div>',
    '    <div class="db-count hidden" id="db-count"></div>',
    '    <div class="db-rows" id="db-rows"></div>',
    '  </section>',
    '</div>'
  ].join('\n');
  document.body.appendChild(screen);

  var titleEl = screen.querySelector('#db-title');
  var backEl  = screen.querySelector('#db-back');
  var homeEl  = screen.querySelector('#db-home');
  var listEl  = screen.querySelector('#db-list');
  var stateEl = screen.querySelector('#db-state');
  var countEl = screen.querySelector('#db-count');
  var rowsEl  = screen.querySelector('#db-rows');

  var view = 'home';          // 'home' | 'list'
  var currentKind = null;     // 'income' | 'expense'

  // ---- helpers ----
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function money(n) {
    var v = (typeof n === 'number') ? n : parseFloat(n);
    if (isNaN(v)) return esc(n);
    return v.toLocaleString('he-IL', { maximumFractionDigits: 2 }) + ' ₪';
  }
  // dd/mm/yyyy -> sortable yyyymmdd number (blank/garbage -> 0, sorts last)
  function dateKey(s) {
    var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s || '');
    return m ? (+m[3]) * 10000 + (+m[2]) * 100 + (+m[1]) : 0;
  }

  // ---- network (text/plain to dodge CORS preflight, same as app.js) ----
  function listRows(sheet) {
    return fetch(endpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token: token(), action: 'listRows', sheet: sheet }),
      redirect: 'follow'
    }).then(function (res) { return res.json(); });
  }

  // ---- row renderers ----
  function incRow(r) {
    return '<div class="db-row" data-kind="income" data-id="' + esc(r.id) + '">'
      + '<div class="r-main"><span class="r-name">' + esc(r.name) + '</span>'
      + '<span class="r-amt">' + money(r.amount) + '</span></div>'
      + '<div class="r-sub"><span class="r-date">' + esc(r.date) + '</span>'
      + (r.via ? '<span class="r-via">' + esc(r.via) + '</span>' : '')
      + '</div></div>';
  }
  function expRow(r) {
    var badge = r.recognized
      ? '<span class="badge ok">עסקי מוכר</span>'
      : '<span class="badge no">לא</span>';
    return '<div class="db-row" data-kind="expense" data-id="' + esc(r.id) + '">'
      + '<div class="r-main"><span class="r-name">' + esc(r.name) + '</span>'
      + '<span class="r-amt">' + money(r.amount) + '</span></div>'
      + '<div class="r-sub"><span class="r-date">' + esc(r.date) + '</span>'
      + (r.category ? '<span class="r-cat">' + esc(r.category) + '</span>' : '')
      + badge + '</div></div>';
  }

  // ---- state line (loading / empty / error / missing settings) ----
  function setState(kind, detail) {
    countEl.className = 'db-count hidden';
    if (kind == null) { stateEl.className = 'db-state hidden'; stateEl.innerHTML = ''; return; }
    stateEl.className = 'db-state';
    if (kind === 'loading') {
      stateEl.textContent = 'טוען…';
    } else if (kind === 'empty') {
      stateEl.textContent = 'אין רשומות להצגה';
    } else if (kind === 'nosettings') {
      stateEl.textContent = 'צריך להגדיר חיבור קודם — פתח את גלגל השיניים במסך הראשי.';
    } else { // error
      stateEl.innerHTML = 'טעינה נכשלה. בדוק חיבור ונסה שוב.'
        + (detail ? ' (' + esc(detail) + ')' : '')
        + '<br><button class="retry" id="db-retry">נסה שוב</button>';
      var rb = stateEl.querySelector('#db-retry');
      if (rb) rb.addEventListener('click', function () { openList(currentKind); });
    }
  }

  // ---- views ----
  function showHome() {
    view = 'home'; currentKind = null;
    titleEl.textContent = 'מסד נתונים';
    listEl.classList.add('hidden');
    homeEl.classList.remove('hidden');
    setState(null);
    rowsEl.innerHTML = '';
  }

  function openList(kind) {
    currentKind = kind; view = 'list';
    titleEl.textContent = kind === 'income' ? 'נתוני הכנסות' : 'נתוני הוצאות';
    homeEl.classList.add('hidden');
    listEl.classList.remove('hidden');
    rowsEl.innerHTML = '';
    setState('loading');

    if (!endpoint() || !token()) { setState('nosettings'); return; }

    listRows(kind).then(function (data) {
      if (currentKind !== kind) return;             // user navigated away mid-fetch
      if (!Array.isArray(data)) {
        var why = data && (data.error || data.reason);
        setState('error', why === 'unauthorized' ? 'טוקן שגוי' : why);
        return;
      }
      if (data.length === 0) { setState('empty'); return; }
      data.sort(function (a, b) { return dateKey(b.date) - dateKey(a.date); });
      rowsEl.innerHTML = data.map(kind === 'income' ? incRow : expRow).join('');
      setState(null);
      countEl.className = 'db-count';
      countEl.textContent = data.length + ' רשומות';
    }).catch(function () {
      if (currentKind === kind) setState('error');
    });
  }

  // ---- wiring ----
  homeEl.querySelector('[data-kind="income"]').addEventListener('click', function () { openList('income'); });
  homeEl.querySelector('[data-kind="expense"]').addEventListener('click', function () { openList('expense'); });

  backEl.addEventListener('click', function () {
    if (view === 'list') showHome();
    else exitToMain();
  });

  // Stage 3 will open the row editor here; for now a tap just logs.
  rowsEl.addEventListener('click', function (ev) {
    var row = ev.target.closest('.db-row');
    if (!row) return;
    console.log('row tap', row.getAttribute('data-kind'), row.getAttribute('data-id'));
  });

  function exitToMain() {
    screen.classList.add('hidden');
    var wrap = document.querySelector('.wrap');
    if (wrap) wrap.classList.remove('hidden');
  }

  // ---- public entry (called by app.js) ----
  window.FinDB = {
    open: function () {
      var wrap = document.querySelector('.wrap');
      if (wrap) wrap.classList.add('hidden');
      screen.classList.remove('hidden');
      showHome();
    }
  };
})();
