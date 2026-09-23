/* Financico — Database section.
   Lazy-loaded by app.js the first time the user taps "נתונים" on the chooser,
   so it never weighs on the main logging screen. Self-contained: reads the
   endpoint/token from localStorage (same keys as app.js), renders its own
   full-screen view over the main app, and is purely read-only this stage.

   Views: home (three tiles) -> list (income | expense). Back from a list
   returns to home; back from home returns to the main logging app.

   Receipts (door B of issueReceipt): on the income list, rows that carry a מזהה
   and are not yet on a receipt get a checkbox. Selecting one or more shows an
   action bar with "הפק קבלה"; the modal pre-fills customer name / email from the
   rows' לקוח / מייל לקוח columns (missing fields marked for entry), payment date
   (today) and method, and sends issueReceipt({rowIds, customer, payment}). The
   server writes the receipt onto the rows and the customer back where empty. A
   selection mixing +30 rows with direct-paid rows is refused with a message. */
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
    '.db-tile.inc{background:var(--green)}.db-tile.exp{background:var(--blue)}.db-tile.ana{background:#7c3aed}',
    '.db-tile[disabled]{opacity:.6;cursor:default}',
    '.db-tile .soon{font-size:13px;font-weight:700;background:rgba(255,255,255,.25);padding:3px 9px;border-radius:999px}',
    '.db-tile .ext{font-size:18px;opacity:.85}',
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
    '.dd-status.err{color:var(--err)}.dd-status.ok{color:var(--green)}',
    '.badge.miss{background:#fff7ed;color:#9a3412}',
    '.db-filter{display:flex;align-items:center;gap:8px;margin:0 2px 12px;font-size:14px;color:var(--muted)}',
    '.dd-rcpt{margin-top:10px}',
    '.rcpt-actions{display:flex;gap:8px}',
    '.rcpt-btn{flex:1;padding:11px;font-size:14px;border:1.5px solid var(--line);background:var(--card);border-radius:10px;cursor:pointer;color:var(--ink);font-family:inherit}',
    '.rcpt-view-row{display:flex;gap:14px;margin-top:8px}',
    '.rcpt-link{background:none;border:0;padding:0;font-size:13px;font-weight:700;color:#475569;cursor:pointer;text-decoration:underline;font-family:inherit}',
    '.rcpt-link.rcpt-danger{color:var(--err)}',
    '.rcpt-preview{margin-top:10px}',
    '.rcpt-preview img{width:100%;border-radius:10px;display:block;border:1px solid var(--line)}',
    '.dd-rcpt-status{min-height:18px;margin-top:6px;font-size:13px;font-weight:600}',
    '.dd-rcpt-status.err{color:var(--err)}.dd-rcpt-status.ok{color:var(--green)}',
    // --- receipt selection (income list) ---
    '.db-row.sel{border-color:#1d4ed8;background:#eff6ff}',
    '.r-sel{width:22px;height:22px;margin:0 0 0 10px;flex:none;accent-color:#1d4ed8;cursor:pointer}',
    '.r-main .r-sel{align-self:center}',
    '.badge.rcpt{background:#dbeafe;color:#1e40af}',
    '.badge.rcpt a{color:inherit;text-decoration:none}',
    '.db-selbar{position:sticky;bottom:0;margin:12px -16px -16px;padding:12px 16px calc(12px + env(safe-area-inset-bottom));background:var(--bg);border-top:1px solid var(--line);display:flex;align-items:center;gap:10px}',
    '.db-selbar .sum{flex:1;font-size:14px;color:var(--muted);line-height:1.4}',
    '.db-selbar .sum b{color:var(--ink);font-size:16px}',
    '.db-selbar .sum .err{color:var(--err);font-weight:600}',
    '.db-selbar button{padding:12px 16px;font-size:16px;font-weight:700;color:#fff;border:0;border-radius:12px;cursor:pointer;background:#1d4ed8;font-family:inherit;white-space:nowrap}',
    '.db-selbar button:disabled{opacity:.45;cursor:default}',
    '.db-modal{position:fixed;inset:0;z-index:40;background:rgba(0,0,0,.45);display:flex;align-items:flex-end;justify-content:center}',
    '.db-sheet{width:100%;max-width:480px;max-height:92vh;overflow-y:auto;background:var(--bg);border-radius:18px 18px 0 0;padding:20px 18px calc(20px + env(safe-area-inset-bottom))}',
    '.db-sheet h3{margin:0 0 12px;font-size:19px}',
    '.db-sheet dl{margin:0 0 14px;display:grid;grid-template-columns:auto 1fr;gap:6px 12px;font-size:15px}',
    '.db-sheet dt{color:var(--muted)}.db-sheet dd{margin:0;font-weight:600;overflow-wrap:anywhere}',
    '.db-sheet label{display:block;font-size:14px;color:var(--muted);margin:10px 2px 6px}',
    '.db-sheet label .need{color:#dc2626;font-weight:700;margin-inline-start:6px}',
    '.db-sheet input,.db-sheet select{width:100%}',
    '.db-sheet input.need{border-color:#dc2626;background:#fef2f2}',
    '.db-warn{margin:14px 0 0;font-size:14px;line-height:1.5;color:#9a3412}',
    '.db-acts{display:flex;gap:10px;margin-top:16px}',
    '.db-acts button{flex:1;padding:14px;font-size:17px;font-weight:700;border-radius:12px;cursor:pointer;font-family:inherit}',
    '.db-send{background:#1d4ed8;color:#fff;border:0}',
    '.db-cancel{background:var(--card);color:var(--ink);border:1.5px solid var(--line)}',
    '.db-modal-status{min-height:22px;margin-top:10px;text-align:center;font-size:15px;font-weight:600}',
    '.db-modal-status.err{color:var(--err)}.db-modal-status.ok{color:var(--green)}'
  ].join('');
  var PAY_METHODS = ['העברה בנקאית', 'Bit', 'מזומן', 'אשראי'];   // same closed list as backend/Sumit.gs
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
    '    <button class="db-tile ana" id="db-analysis">ניתוח <span class="ext">↗</span></button>',
    '  </section>',
    '  <section class="db-list hidden" id="db-list">',
    '    <div class="db-filter hidden" id="db-filter"><label><input type="checkbox" id="db-filter-missing"> הצג רק חסרות קבלה</label></div>',
    '    <div class="db-state hidden" id="db-state"></div>',
    '    <div class="db-count hidden" id="db-count"></div>',
    '    <div class="db-rows" id="db-rows"></div>',
    '    <div class="db-selbar hidden" id="db-selbar"><div class="sum" id="db-selsum"></div><button type="button" id="db-selgo">הפק קבלה</button></div>',
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
  var filterEl = screen.querySelector('#db-filter');
  var filterMissingEl = screen.querySelector('#db-filter-missing');
  var selBarEl = screen.querySelector('#db-selbar');
  var selSumEl = screen.querySelector('#db-selsum');
  var selGoEl  = screen.querySelector('#db-selgo');
  var detailEl = screen.querySelector('#db-detail');
  var ddBack   = screen.querySelector('#dd-back');
  var ddTitle  = screen.querySelector('#dd-title');
  var ddForm   = screen.querySelector('#dd-form');

  var view = 'home';          // 'home' | 'list' | 'detail'
  var currentKind = null;     // 'income' | 'expense'
  var currentRows = [];       // the rows backing the current list (full objects)
  var detailState = { kind: null, idx: -1, row: null, editable: false };
  var selected = {};          // income rows picked for a receipt: id -> true

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
  function postAction(payload) {
    return fetch(endpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow'
    }).then(function (res) { return res.json(); });
  }
  function listRows(sheet) {
    return postAction({ token: token(), action: 'listRows', sheet: sheet });
  }
  function uploadReceipt(dataUrl) {
    return postAction({ token: token(), action: 'uploadReceipt', image: dataUrl });
  }
  function getReceipt(ref) {
    return postAction({ token: token(), action: 'getReceipt', ref: ref });
  }
  function deleteReceipt(ref) {
    return postAction({ token: token(), action: 'deleteReceipt', ref: ref });
  }
  function updateReceiptField(id, ref) {
    return postAction({ token: token(), action: 'updateRow', sheet: 'expense', id: id, receipt: ref });
  }

  // ---- receipt-photo compression (canvas downscale, client-side, same recipe as app.js) ----
  function compressImage(file, maxDim, quality) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('read failed')); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('decode failed')); };
        img.onload = function () {
          var scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          var w = Math.max(1, Math.round(img.width * scale));
          var h = Math.max(1, Math.round(img.height * scale));
          var canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // ---- row renderers (inner = the row's content; html = inner wrapped in the
  // tappable card carrying data-idx so a saved edit can refresh it in place) ----
  // An income row can go on a receipt when it has a מזהה and no receipt yet.
  function selectable(r) {
    return !!(r.id && String(r.id).trim() !== '' && !r.receiptId && !r.receiptNumber);
  }
  function receiptBadge(r) {
    if (!r.receiptNumber) return '';
    var label = 'קבלה #' + esc(r.receiptNumber);
    return '<span class="badge rcpt">' + (r.receiptUrl
      ? '<a href="' + esc(r.receiptUrl) + '" target="_blank" rel="noopener">' + label + '</a>' : label) + '</span>';
  }
  function rowInner(kind, r) {
    var check = (kind === 'income' && selectable(r))
      ? '<input type="checkbox" class="r-sel" aria-label="בחר לקבלה"' + (selected[r.id] ? ' checked' : '') + '>'
      : '';
    var head = '<div class="r-main">' + check + '<span class="r-name">' + esc(r.name) + '</span>'
      + '<span class="r-amt">' + money(r.amount) + '</span></div>';
    if (kind === 'income') {
      return head + '<div class="r-sub"><span class="r-date">' + esc(r.date) + '</span>'
        + (r.via ? '<span class="r-via">' + esc(r.via) + '</span>' : '')
        + (r.method === '+30' ? '<span class="r-via">+30</span>' : '')
        + receiptBadge(r) + '</div>';
    }
    var badge = r.recognized
      ? '<span class="badge ok">עסקי מוכר</span>'
      : '<span class="badge no">לא</span>';
    var missing = (r.recognized && !r.receipt) ? '<span class="badge miss">📷 חסרה קבלה</span>' : '';
    return head + '<div class="r-sub"><span class="r-date">' + esc(r.date) + '</span>'
      + (r.category ? '<span class="r-cat">' + esc(r.category) + '</span>' : '')
      + badge + missing + '</div>';
  }
  function rowHtml(kind, r, idx) {
    return '<div class="db-row' + (selected[r.id] ? ' sel' : '') + '" data-kind="' + kind + '" data-id="' + esc(r.id)
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
    filterMissingEl.checked = false;
    filterEl.classList.toggle('hidden', kind !== 'expense'); // missing-photo filter: expense only
    selected = {};
    renderSelBar();
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
      setState(null);
      renderRows();
    }).catch(function () {
      if (currentKind === kind) setState('error');
    });
  }

  // Re-draws #db-rows from currentRows, applying the missing-photo filter when
  // active on the expense list. data-idx always refers to the row's index in
  // currentRows (not its filtered position), so tap-to-open keeps working.
  function renderRows() {
    var missingOnly = currentKind === 'expense' && filterMissingEl.checked;
    var visible = [];
    currentRows.forEach(function (r, i) {
      if (missingOnly && !(r.recognized && !r.receipt)) return;
      visible.push({ r: r, i: i });
    });
    countEl.className = 'db-count';
    if (visible.length === 0 && missingOnly) {
      rowsEl.innerHTML = '';
      countEl.textContent = 'אין רשומות חסרות קבלה';
      return;
    }
    rowsEl.innerHTML = visible.map(function (x) { return rowHtml(currentKind, x.r, x.i); }).join('');
    countEl.textContent = visible.length + ' רשומות' + (missingOnly ? ' (חסרות קבלה)' : '');
  }
  filterMissingEl.addEventListener('change', renderRows);

  // ---- receipt selection (income list) ------------------------------------
  function selectedRows() {
    return currentRows.filter(function (r) { return selected[r.id]; });
  }
  // '' when the selection can go on one receipt, else the reason it cannot.
  function selectionProblem(rows) {
    var n30 = rows.filter(function (r) { return r.method === '+30'; }).length;
    if (n30 > 0 && n30 < rows.length) return 'בחירה מעורבת: שורות +30 ושורות ששולמו ישירות — הפק קבלה נפרדת לכל סוג';
    return '';
  }
  function renderSelBar() {
    var rows = currentKind === 'income' ? selectedRows() : [];
    if (!rows.length) { selBarEl.classList.add('hidden'); return; }
    var total = 0;
    rows.forEach(function (r) { total += Number(r.amount) || 0; });
    var why = selectionProblem(rows);
    selSumEl.innerHTML = 'נבחרו <b>' + rows.length + '</b> · סה"כ <b>' + money(total) + '</b>'
      + (why ? '<br><span class="err">' + esc(why) + '</span>' : '');
    selGoEl.disabled = !!why;
    selBarEl.classList.remove('hidden');
  }
  function toggleSelect(id, on, rowEl) {
    if (on) selected[id] = true; else delete selected[id];
    if (rowEl) rowEl.classList.toggle('sel', !!on);
    renderSelBar();
  }
  selGoEl.addEventListener('click', function () {
    var rows = selectedRows();
    if (!rows.length || selectionProblem(rows)) return;
    openReceiptModal(rows);
  });

  // ---- wiring ----
  homeEl.querySelector('[data-kind="income"]').addEventListener('click', function () { openList('income'); });
  homeEl.querySelector('[data-kind="expense"]').addEventListener('click', function () { openList('expense'); });
  homeEl.querySelector('#db-analysis').addEventListener('click', openAnalysis);

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
    if (ev.target.closest('.badge.rcpt a')) return;                 // receipt link: let it open
    var cb = ev.target.closest('.r-sel');
    if (cb) { toggleSelect(currentRows[idx].id, cb.checked, el); return; }   // checkbox: select, don't open
    openDetail(currentKind, currentRows[idx], idx);
  });

  function exitToMain() {
    screen.classList.add('hidden');
    var wrap = document.querySelector('.wrap');
    if (wrap) wrap.classList.remove('hidden');
  }

  // ---- analysis tile: open the Google Sheets "סיכום" dashboard externally ----
  // The dashboard URL is stored per-device in settings (fin_dashboard_url) so the
  // private sheet's address never lives in the public repo. The sheet has its own
  // month/year selector + month/YTD columns, so there's no in-app period control.
  function openAnalysis() {
    var url = (LS.getItem('fin_dashboard_url') || '').trim();
    if (url) {
      window.open(url, '_blank', 'noopener');   // external -> browser / Custom Tab in the TWA
      return;
    }
    alert('כדי לראות את הניתוח, הדבק תחילה את כתובת לשונית "סיכום" בהגדרות (גלגל השיניים במסך הראשי).');
    exitToMain();
    var gear = document.getElementById('gear');
    if (gear) gear.click();
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
      h += roField('שם הכנסה', row.name) + roField('דרך', row.via)
        + roField('לקוח', row.customer) + roField('מייל לקוח', row.customerEmail);
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
      h += '<label for="dd-cust">לקוח (לקבלה)</label><input id="dd-cust" type="text" value="' + esc(row.customer) + '">';
      h += '<label for="dd-cemail">מייל לקוח</label><input id="dd-cemail" type="email" dir="ltr" inputmode="email" value="' + esc(row.customerEmail) + '">';
      if (row.receiptNumber) h += roField('קבלה', '#' + row.receiptNumber);
    } else {
      h += '<label for="dd-name">שם</label><input id="dd-name" type="text" value="' + esc(row.name) + '">';
      h += '<label for="dd-cat">סוג</label><input id="dd-cat" type="text" list="dl-categories" value="' + esc(row.category) + '">';
      h += '<label>מוכרת?</label><div class="dd-toggle" id="dd-rec">'
         + '<button type="button" data-v="1"' + (row.recognized ? ' class="on"' : '') + '>עסקי מוכר</button>'
         + '<button type="button" data-v="0"' + (row.recognized ? '' : ' class="on"') + '>לא</button></div>';
      // Receipt affordance: future app-created, business-recognized rows only.
      h += '<div class="dd-rcpt" id="dd-rcpt"' + (row.recognized ? '' : ' style="display:none"') + '>'
         + receiptContentHtml(row) + '</div>';
    }
    h += '<label for="dd-note">הערה</label><input id="dd-note" type="text" value="' + esc(row.note) + '">';
    h += '<button type="button" class="dd-save" id="dd-save">שמירה</button>';
    h += '<div class="dd-status" id="dd-status"></div>';
    return h;
  }

  // ---- receipt widget (expense edit view only) ----------------------------
  function receiptContentHtml(row) {
    var has = !!row.receipt;
    var h = '<label>קבלה</label>';
    h += '<div class="rcpt-actions">';
    h += '<button type="button" class="rcpt-btn" id="dd-rcpt-cam">📷 ' + (has ? 'צלם מחדש' : 'צלם') + '</button>';
    h += '<button type="button" class="rcpt-btn" id="dd-rcpt-gal">🖼 גלריה</button>';
    h += '</div>';
    h += '<div class="rcpt-view-row" id="dd-rcpt-view-row"' + (has ? '' : ' style="display:none"') + '>';
    h += '<button type="button" class="rcpt-link" id="dd-rcpt-show">הצג קבלה</button>';
    h += '<button type="button" class="rcpt-link rcpt-danger" id="dd-rcpt-remove">הסר קבלה</button>';
    h += '</div>';
    h += '<div class="rcpt-preview hidden" id="dd-rcpt-preview"><img id="dd-rcpt-img" alt="קבלה"></div>';
    h += '<input type="file" accept="image/*" capture="environment" id="dd-rcpt-cam-input" class="hidden">';
    h += '<input type="file" accept="image/*" id="dd-rcpt-gal-input" class="hidden">';
    h += '<div class="dd-rcpt-status" id="dd-rcpt-status"></div>';
    return h;
  }

  // Wires the receipt widget's buttons. Called after every innerHTML swap
  // (initial render + after each add/replace/remove), since those replace
  // the buttons' DOM nodes and drop their old listeners.
  function wireReceiptWidget(row) {
    var wrap = ddForm.querySelector('#dd-rcpt');
    if (!wrap) return;
    var camBtn    = wrap.querySelector('#dd-rcpt-cam');
    var galBtn    = wrap.querySelector('#dd-rcpt-gal');
    var camInput  = wrap.querySelector('#dd-rcpt-cam-input');
    var galInput  = wrap.querySelector('#dd-rcpt-gal-input');
    var showBtn   = wrap.querySelector('#dd-rcpt-show');
    var removeBtn = wrap.querySelector('#dd-rcpt-remove');
    var preview   = wrap.querySelector('#dd-rcpt-preview');
    var img       = wrap.querySelector('#dd-rcpt-img');
    var statusEl  = wrap.querySelector('#dd-rcpt-status');

    function setStatus(msg, cls) {
      statusEl.className = 'dd-rcpt-status' + (cls ? ' ' + cls : '');
      statusEl.textContent = msg || '';
    }
    function redraw() {
      wrap.innerHTML = receiptContentHtml(row);
      wireReceiptWidget(row);
    }
    function handleFile(file) {
      if (!file) return;
      setStatus('מעלה…', '');
      compressImage(file, 1400, 0.7).then(function (dataUrl) {
        return uploadReceipt(dataUrl);
      }).then(function (up) {
        if (!up || !up.ok) {
          setStatus('העלאה נכשלה' + (up && up.reason ? ' (' + esc(up.reason) + ')' : ''), 'err');
          return;
        }
        var oldRef = row.receipt;
        return updateReceiptField(row.id, up.ref).then(function (r) {
          if (r && r.ok) {
            row.receipt = up.ref;
            if (oldRef) deleteReceipt(oldRef); // best-effort cleanup of the replaced file
            renderRows();
            redraw();
          } else {
            setStatus('שמירת הקבלה נכשלה', 'err');
          }
        });
      }).catch(function () { setStatus('שגיאה בטיפול בתמונה', 'err'); });
    }

    camBtn.addEventListener('click', function () { camInput.click(); });
    galBtn.addEventListener('click', function () { galInput.click(); });
    camInput.addEventListener('change', function () { handleFile(this.files[0]); });
    galInput.addEventListener('change', function () { handleFile(this.files[0]); });

    showBtn.addEventListener('click', function () {
      if (!preview.classList.contains('hidden')) {
        preview.classList.add('hidden');
        showBtn.textContent = 'הצג קבלה';
        return;
      }
      setStatus('טוען…', '');
      getReceipt(row.receipt).then(function (r) {
        if (r && r.ok) {
          img.src = r.image;
          preview.classList.remove('hidden');
          showBtn.textContent = 'הסתר קבלה';
          setStatus('', '');
        } else {
          setStatus('טעינת הקבלה נכשלה', 'err');
        }
      });
    });

    removeBtn.addEventListener('click', function () {
      if (!confirm('להסיר את הקבלה?')) return;
      setStatus('מסיר…', '');
      var ref = row.receipt;
      updateReceiptField(row.id, '').then(function (r) {
        if (r && r.ok) {
          row.receipt = '';
          deleteReceipt(ref); // best-effort
          renderRows();
          redraw();
        } else {
          setStatus('ההסרה נכשלה', 'err');
        }
      });
    });
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
        var rcptWrap = ddForm.querySelector('#dd-rcpt');
        if (rcptWrap) rcptWrap.style.display = (b.getAttribute('data-v') === '1') ? '' : 'none';
      });
      ddForm.querySelector('#dd-save').addEventListener('click', function () { saveDetail(kind, row, idx); });
      if (kind === 'expense') wireReceiptWidget(row);
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
      var custV = (ddForm.querySelector('#dd-cust').value || '').trim();
      if (custV !== (row.customer || ''))    changed.customer = custV;
      var cemV = (ddForm.querySelector('#dd-cemail').value || '').trim();
      if (cemV !== (row.customerEmail || '')) changed.customerEmail = cemV;
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
        renderRows();                                          // recognized can change filter membership
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

  // ---- receipt modal (door B) ---------------------------------------------
  function isEmail(s) { return /.+@.+\..+/.test(s || ''); }
  function todayIso() {
    var t = new Date();
    return t.getFullYear() + '-' + ('0' + (t.getMonth() + 1)).slice(-2) + '-' + ('0' + t.getDate()).slice(-2);
  }
  // Modal default: +30 rows were paid by bank transfer; a direct-paid row keeps its
  // own method when it is one SUMIT knows (ביט -> Bit); anything else -> bank transfer.
  function defaultMethod(rows) {
    var methods = {};
    rows.forEach(function (r) { methods[r.method || ''] = true; });
    var keys = Object.keys(methods);
    if (keys.length !== 1 || keys[0] === '+30') return 'העברה בנקאית';
    var m = keys[0] === 'ביט' ? 'Bit' : keys[0];
    return PAY_METHODS.indexOf(m) === -1 ? 'העברה בנקאית' : m;
  }
  // First non-empty value of a field across the selected rows.
  function firstOf(rows, field, test) {
    for (var i = 0; i < rows.length; i++) {
      var v = String(rows[i][field] || '').trim();
      if (v && (!test || test(v))) return v;
    }
    return '';
  }
  // A text/date field with a "חסר" mark when its prefill is empty.
  function fieldHtml(id, label, type, value, extra) {
    var missing = !value;
    return '<label for="' + id + '">' + esc(label) + (missing ? '<span class="need">חסר</span>' : '') + '</label>'
      + '<input type="' + type + '" id="' + id + '" class="' + (missing ? 'need' : '') + '" value="' + esc(value) + '"' + (extra || '') + '>';
  }

  function openReceiptModal(rows) {
    var total = 0;
    rows.forEach(function (r) { total += Number(r.amount) || 0; });
    var def = defaultMethod(rows);
    var names = rows.map(function (r) { return esc(r.name) + ' (' + esc(r.date) + ')'; }).join('<br>');
    var modal = document.createElement('div');
    modal.className = 'db-modal';
    modal.innerHTML = [
      '<div class="db-sheet">',
      '  <h3>הפקת קבלה — ' + rows.length + ' שורות</h3>',
      '  <dl>',
      '    <dt>שורות</dt><dd>' + names + '</dd>',
      '    <dt>סכום</dt><dd>' + money(total) + '</dd>',
      '  </dl>',
      fieldHtml('db-cust', 'לקוח', 'text', firstOf(rows, 'customer')),
      fieldHtml('db-email', 'מייל לקוח', 'email', firstOf(rows, 'customerEmail', isEmail), ' dir="ltr" inputmode="email"'),
      fieldHtml('db-paid', 'תאריך התשלום', 'date', todayIso(), ' max="' + todayIso() + '"'),
      '  <label for="db-method">אופן תשלום</label>',
      '  <select id="db-method">' + PAY_METHODS.map(function (m) {
        return '<option' + (m === def ? ' selected' : '') + '>' + esc(m) + '</option>';
      }).join('') + '</select>',
      '  <p class="db-warn">הפעולה בלתי הפיכה: תופק קבלה חוקית ותישלח ללקוח במייל. הלקוח והמייל יישמרו על השורות.</p>',
      '  <div class="db-modal-status" id="db-modal-status"></div>',
      '  <div class="db-acts">',
      '    <button type="button" class="db-send">שלח</button>',
      '    <button type="button" class="db-cancel">בטל</button>',
      '  </div>',
      '</div>'
    ].join('\n');
    screen.appendChild(modal);

    var sendBtn = modal.querySelector('.db-send');
    var statusEl = modal.querySelector('#db-modal-status');
    function status(msg, cls) { statusEl.className = 'db-modal-status' + (cls ? ' ' + cls : ''); statusEl.textContent = msg || ''; }
    function close() { if (modal.parentNode) modal.parentNode.removeChild(modal); }
    modal.querySelector('.db-cancel').addEventListener('click', close);

    sendBtn.addEventListener('click', function () {
      var name     = modal.querySelector('#db-cust').value.trim();
      var mail     = modal.querySelector('#db-email').value.trim();
      var paidDate = modal.querySelector('#db-paid').value;
      var method   = modal.querySelector('#db-method').value;
      var why = !name ? 'חסר שם לקוח' : !isEmail(mail) ? 'חסר מייל ללקוח' : !paidDate ? 'חסר תאריך תשלום' : '';
      if (why) { status(why, 'err'); return; }

      sendBtn.disabled = true;                 // no second submit while in flight
      status('מפיק קבלה…', '');
      var rowIds = rows.map(function (r) { return String(r.id); }).sort();
      postAction({ token: token(), action: 'issueReceipt', rowIds: rowIds,
                   customer: { name: name, email: mail }, payment: { date: paidDate, method: method } })
        .then(function (r) {
          if (r && r.ok && r.dryRun) {
            status('מצב בדיקה: נוצרה טיוטה ב-SUMIT, דבר לא נרשם', 'ok');
            sendBtn.disabled = false;
          } else if (r && r.ok) {
            close();
            openList('income');                // redraw from the sheet: receipt badges, customer written back
          } else {
            status((r && (r.userMessage || r.error)) || 'הפקת הקבלה נכשלה — נסה שוב', 'err');
            sendBtn.disabled = false;
          }
        })
        .catch(function () {
          status('אין חיבור — הקש שוב (לא תופק קבלה כפולה)', 'err');
          sendBtn.disabled = false;
        });
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
