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
    '.badge.no{background:#f1f5f9;color:#64748b}',
    '.db-detail{position:absolute;inset:0;z-index:5;background:var(--bg);display:flex;flex-direction:column}',
    '.dd-readnote{background:#fff7ed;color:#9a3412;border:1px solid #fed7aa;border-radius:10px;padding:10px 12px;font-size:14px;margin-bottom:8px}',
    '.dd-ro-label{font-size:13px;color:var(--muted);margin:12px 2px 2px}',
    '.dd-ro-val{font-size:17px;font-weight:600;color:var(--ink);padding:8px 0;border-bottom:1px solid var(--line);min-height:20px}',
    '.dd-toggle{display:flex;gap:8px;margin-top:6px}',
    '.dd-toggle button{flex:1;padding:12px;font-size:16px;border:1.5px solid var(--line);background:var(--card);border-radius:12px;cursor:pointer;color:var(--ink);font-family:inherit}',
    '.dd-toggle button.on{border-color:var(--ink);font-weight:700;background:#eef2f5}',
    '.dd-save{width:100%;margin-top:22px;padding:16px;font-size:18px;font-weight:700;color:#fff;border:0;border-radius:14px;cursor:pointer;background:#475569;font-family:inherit}',
    '.dd-save:disabled{opacity:.45}',
    '.dd-status{min-height:22px;margin-top:12px;text-align:center;font-size:15px;font-weight:600}',
    '.dd-status.err{color:var(--err)}.dd-status.ok{color:var(--green)}'
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
    '</div>',
    '<div class="db-detail hidden" id="db-detail">',
    '  <div class="db-head">',
    '    <button class="db-back" id="dd-back">חזרה</button>',
    '    <h2 id="dd-title">עריכה</h2>',
    '  </div>',
    '  <div class="db-body"><div id="dd-form"></div></div>',
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
  var detailEl = screen.querySelector('#db-detail');
  var ddBack   = screen.querySelector('#dd-back');
  var ddTitle  = screen.querySelector('#dd-title');
  var ddForm   = screen.querySelector('#dd-form');

  var view = 'home';          // 'home' | 'list' | 'detail'
  var currentKind = null;     // 'income' | 'expense'
  var currentRows = [];       // the rows backing the current list (full objects)
  var detailState = { kind: null, idx: -1, row: null, editable: false };

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

  // ---- row renderers (inner = the row's content; html = inner wrapped in the
  // tappable card carrying data-idx so a saved edit can refresh it in place) ----
  function rowInner(kind, r) {
    var head = '<div class="r-main"><span class="r-name">' + esc(r.name) + '</span>'
      + '<span class="r-amt">' + money(r.amount) + '</span></div>';
    if (kind === 'income') {
      return head + '<div class="r-sub"><span class="r-date">' + esc(r.date) + '</span>'
        + (r.via ? '<span class="r-via">' + esc(r.via) + '</span>' : '') + '</div>';
    }
    var badge = r.recognized
      ? '<span class="badge ok">עסקי מוכר</span>'
      : '<span class="badge no">לא</span>';
    return head + '<div class="r-sub"><span class="r-date">' + esc(r.date) + '</span>'
      + (r.category ? '<span class="r-cat">' + esc(r.category) + '</span>' : '')
      + badge + '</div>';
  }
  function rowHtml(kind, r, idx) {
    return '<div class="db-row" data-kind="' + kind + '" data-id="' + esc(r.id)
      + '" data-idx="' + idx + '">' + rowInner(kind, r) + '</div>';
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
    detailEl.classList.add('hidden');
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
      currentRows = data;
      rowsEl.innerHTML = data.map(function (r, i) { return rowHtml(kind, r, i); }).join('');
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
    if (view === 'detail') closeDetail();
    else if (view === 'list') showHome();
    else exitToMain();
  });
  ddBack.addEventListener('click', closeDetail);

  // Row tap -> open the detail/edit view for THAT row (no re-fetch; we pass the
  // full row object we already have, looked up by its list index).
  rowsEl.addEventListener('click', function (ev) {
    var el = ev.target.closest('.db-row');
    if (!el) return;
    var idx = parseInt(el.getAttribute('data-idx'), 10);
    if (isNaN(idx) || !currentRows[idx]) return;
    openDetail(currentKind, currentRows[idx], idx);
  });

  function exitToMain() {
    screen.classList.add('hidden');
    var wrap = document.querySelector('.wrap');
    if (wrap) wrap.classList.remove('hidden');
  }

  // ---- detail / edit view -------------------------------------------------
  // dd/mm/yyyy <-> yyyy-mm-dd (the value format an <input type="date"> uses).
  function toInputDate(d) {
    var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(d || '');
    return m ? m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2) : '';
  }
  function fromInputDate(v) {
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v || '');
    return m ? ('0' + m[3]).slice(-2) + '/' + ('0' + m[2]).slice(-2) + '/' + m[1] : '';
  }

  function roField(label, val) {
    var shown = (val === '' || val == null) ? '—' : esc(val);
    return '<div class="dd-ro-label">' + esc(label) + '</div><div class="dd-ro-val">' + shown + '</div>';
  }
  // Imported rows (empty id) -> read-only; updateRow is never called for these.
  function readForm(kind, row) {
    var h = '<div class="dd-readnote">רשומה מיובאת — לא ניתנת לעריכה כאן</div>';
    h += roField('תאריך', row.date) + roField('סכום', money(row.amount));
    if (kind === 'income') {
      h += roField('שם הכנסה', row.name) + roField('דרך', row.via);
    } else {
      h += roField('שם', row.name) + roField('סוג', row.category)
        + roField('מוכרת?', row.recognized ? 'עסקי מוכר' : 'לא');
    }
    return h + roField('הערה', row.note);
  }

  function editForm(kind, row) {
    var h = '';
    h += '<label for="dd-date">תאריך</label>'
       + '<input id="dd-date" type="date" value="' + esc(toInputDate(row.date)) + '">';
    h += '<label for="dd-amount">סכום (₪)</label>'
       + '<input id="dd-amount" class="amount" type="number" inputmode="decimal" min="0" step="any" value="' + esc(row.amount) + '">';
    if (kind === 'income') {
      h += '<label for="dd-name">שם הכנסה</label><input id="dd-name" type="text" value="' + esc(row.name) + '">';
      h += '<label for="dd-via">דרך</label><input id="dd-via" type="text" list="dl-payers" value="' + esc(row.via) + '">';
    } else {
      h += '<label for="dd-name">שם</label><input id="dd-name" type="text" value="' + esc(row.name) + '">';
      h += '<label for="dd-cat">סוג</label><input id="dd-cat" type="text" list="dl-categories" value="' + esc(row.category) + '">';
      h += '<label>מוכרת?</label><div class="dd-toggle" id="dd-rec">'
         + '<button type="button" data-v="1"' + (row.recognized ? ' class="on"' : '') + '>עסקי מוכר</button>'
         + '<button type="button" data-v="0"' + (row.recognized ? '' : ' class="on"') + '>לא</button></div>';
    }
    h += '<label for="dd-note">הערה</label><input id="dd-note" type="text" value="' + esc(row.note) + '">';
    h += '<button type="button" class="dd-save" id="dd-save">שמירה</button>';
    h += '<div class="dd-status" id="dd-status"></div>';
    return h;
  }

  function openDetail(kind, row, idx) {
    var editable = !!(row.id && String(row.id).trim() !== '');
    detailState = { kind: kind, idx: idx, row: row, editable: editable };
    view = 'detail';
    ddTitle.textContent = editable
      ? (kind === 'income' ? 'עריכת הכנסה' : 'עריכת הוצאה')
      : (kind === 'income' ? 'פרטי הכנסה' : 'פרטי הוצאה');
    ddForm.innerHTML = editable ? editForm(kind, row) : readForm(kind, row);
    if (editable) {
      var rec = ddForm.querySelector('#dd-rec');
      if (rec) rec.addEventListener('click', function (ev) {
        var b = ev.target.closest('button'); if (!b) return;
        Array.prototype.forEach.call(rec.querySelectorAll('button'), function (x) { x.classList.remove('on'); });
        b.classList.add('on');
      });
      ddForm.querySelector('#dd-save').addEventListener('click', function () { saveDetail(kind, row, idx); });
    }
    detailEl.classList.remove('hidden');
  }

  function closeDetail() {
    detailEl.classList.add('hidden');
    view = 'list';
  }

  function ddStatus(msg, cls) {
    var s = ddForm.querySelector('#dd-status');
    if (s) { s.className = 'dd-status' + (cls ? ' ' + cls : ''); s.textContent = msg || ''; }
  }

  function saveDetail(kind, row, idx) {
    var dateV   = fromInputDate((ddForm.querySelector('#dd-date').value || '').trim());
    var amountV = parseFloat((ddForm.querySelector('#dd-amount').value || '').trim());
    var nameV   = (ddForm.querySelector('#dd-name').value || '').trim();
    var noteV   = (ddForm.querySelector('#dd-note').value || '').trim();

    // validation (block save, keep edits, show inline message)
    if (!(amountV > 0)) { ddStatus('סכום חייב להיות מספר גדול מאפס', 'err'); return; }
    if (!dateV)         { ddStatus('תאריך לא תקין', 'err'); return; }
    if (!nameV)         { ddStatus('שם חובה', 'err'); return; }

    // build a payload of ONLY the changed fields
    var changed = {};
    if (dateV !== (row.date || ''))          changed.date = dateV;
    if (amountV !== Number(row.amount))      changed.amount = amountV;
    if (nameV !== (row.name || ''))          changed.name = nameV;
    if (kind === 'income') {
      var viaV = (ddForm.querySelector('#dd-via').value || '').trim();
      if (viaV !== (row.via || ''))          changed.via = viaV;
    } else {
      var catV = (ddForm.querySelector('#dd-cat').value || '').trim();
      if (catV !== (row.category || ''))     changed.category = catV;
      var onBtn = ddForm.querySelector('#dd-rec button.on');
      var recV = onBtn ? onBtn.getAttribute('data-v') === '1' : !!row.recognized;
      if (recV !== !!row.recognized)         changed.recognized = recV;
    }
    if (noteV !== (row.note || ''))          changed.note = noteV;

    var keys = Object.keys(changed);
    if (keys.length === 0) { closeDetail(); return; }   // nothing changed -> no-op

    ddStatus('שומר…', '');
    var saveBtn = ddForm.querySelector('#dd-save');
    if (saveBtn) saveBtn.disabled = true;

    var payload = { token: token(), action: 'updateRow', sheet: kind, id: row.id };
    keys.forEach(function (k) { payload[k] = changed[k]; });

    fetch(endpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow'
    }).then(function (res) { return res.json(); }).then(function (r) {
      if (r && r.ok) {
        keys.forEach(function (k) { row[k] = changed[k]; });   // reflect in the list model
        var rowEl = rowsEl.querySelector('.db-row[data-idx="' + idx + '"]');
        if (rowEl) rowEl.innerHTML = rowInner(kind, row);      // refresh the card in place
        closeDetail();
      } else {
        var why = r && (r.reason || r.error);
        ddStatus('השמירה נכשלה — נסה שוב' + (why ? ' (' + esc(why) + ')' : ''), 'err');
        if (saveBtn) saveBtn.disabled = false;
      }
    }).catch(function () {
      ddStatus('השמירה נכשלה — נסה שוב', 'err');
      if (saveBtn) saveBtn.disabled = false;
    });
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
