/* Financico — הפקת קבלות section.
   Lazy-loaded by app.js the first time the user taps "🧾 הפק קבלות" on the
   chooser, so it never weighs on the main logging screen. It is a hub over the
   three ways a receipt gets issued:

     הפק מהכנסה        -> loads db.js and opens the income list, where rows are
                          picked with checkboxes (door B of issueReceipt).
     הפק מדרישת תשלום  -> loads payment.js and opens the demand screen, where a
                          demand's own "הפק קבלה" sits (door A of issueReceipt).
     הפק כללי           -> this file's own modal (door C, issueGeneralReceipt):
                          a product × quantity at a unit price (+ an optional free
                          description), to any name and mail, unattached to any
                          row. The total is quantity × unit price, computed here
                          and again on the server. Nothing is written to the sheet —
                          the income behind it is already logged there by hand.

   Door C is irreversible and idempotent: the modal mints one reference when it
   opens and resends the SAME one on every retry, so a lost answer costs a lookup
   on the server, never a second legal receipt.

   Self-contained, same shape as db.js / payment.js: reads endpoint + token from
   localStorage, injects its own styles once, renders a full-screen view over the
   main app. Delegating hides this screen, so the sub-flow's own back button
   returns to the main chooser rather than stacking screens. */
(function () {
  "use strict";
  if (window.FinRcpt) return;            // guard: load + init exactly once
  var LS = window.localStorage;

  function endpoint() { return LS.getItem('fin_endpoint') || ''; }
  function token()    { return LS.getItem('fin_token')    || ''; }

  var PAY_METHODS = ['העברה בנקאית', 'Bit', 'מזומן', 'אשראי'];   // same closed list as backend/Sumit.gs

  // ---- styles (injected once, only when this section is first opened) ----
  var css = [
    '.rc-screen{position:fixed;inset:0;z-index:30;background:var(--bg);display:flex;flex-direction:column;max-width:480px;margin:0 auto}',
    '.rc-head{display:flex;align-items:center;gap:10px;background:#b45309;color:#fff;padding:16px 18px calc(16px + env(safe-area-inset-top))}',
    '.rc-head h2{margin:0;font-size:20px;font-weight:700;flex:1}',
    '.rc-back{background:rgba(255,255,255,.18);border:0;color:#fff;height:38px;padding:0 14px;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit}',
    '.rc-body{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:16px;overscroll-behavior:contain}',
    '.rc-lbl{font-size:14px;color:var(--muted);margin:2px 2px 14px;line-height:1.5}',
    '.rc-tiles{display:flex;flex-direction:column;gap:14px}',
    '.rc-tile{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-height:92px;border:0;border-radius:16px;color:#fff;cursor:pointer;font-family:inherit;padding:14px}',
    '.rc-tile b{font-size:21px;font-weight:800}',
    '.rc-tile span{font-size:13px;font-weight:600;opacity:.9;text-align:center;line-height:1.4}',
    '.rc-tile.inc{background:var(--green)}.rc-tile.dem{background:#0f766e}.rc-tile.gen{background:#b45309}',
    // the door-C modal
    '.rc-modal{position:fixed;inset:0;z-index:40;background:rgba(15,22,30,.55);display:flex;align-items:flex-end;justify-content:center}',
    '.rc-sheet{background:var(--card);width:100%;max-width:480px;border-radius:18px 18px 0 0;padding:18px;max-height:92vh;overflow-y:auto}',
    '.rc-sheet h3{margin:2px 0 10px;font-size:18px}',
    '.rc-sheet label{display:block;font-size:13px;color:var(--muted);margin:12px 2px 6px}',
    '.rc-sheet label .need{background:#fee2e2;color:#991b1b;font-size:11px;font-weight:700;border-radius:999px;padding:2px 7px;margin-inline-start:6px}',
    '.rc-sheet input,.rc-sheet select{width:100%;padding:13px;font-size:16px;border:1.5px solid var(--line);border-radius:12px;background:var(--card);color:var(--ink);outline:none;font-family:inherit}',
    '.rc-sheet input.need{border-color:#fca5a5}',
    '.rc-sheet input.rc-amount{font-size:26px;font-weight:700;text-align:center}',
    // quantity × unit price side by side, the computed total under them
    '.rc-line{display:grid;grid-template-columns:1fr 1.6fr;gap:10px}',
    '.rc-line label{margin-top:12px}',
    '.rc-line input{text-align:center;font-weight:700}',
    '.rc-total{display:flex;justify-content:space-between;align-items:baseline;margin:12px 2px 0;padding:10px 12px;background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;font-size:14px;color:#9a3412}',
    '.rc-total b{font-size:22px;color:var(--ink)}',
    '.rc-month{display:flex;flex-direction:column;gap:8px;margin-top:12px}',
    '.rc-warn{background:#fff7ed;color:#9a3412;border:1px solid #fed7aa;border-radius:10px;padding:10px 12px;font-size:13px;line-height:1.5;margin:14px 0 0}',
    '.rc-status{min-height:22px;margin-top:10px;text-align:center;font-size:14px;font-weight:600}',
    '.rc-status.ok{color:var(--green)}.rc-status.err{color:var(--err)}',
    '.rc-acts{display:flex;gap:10px;margin-top:12px}',
    '.rc-acts button{flex:1;padding:14px;border-radius:12px;border:0;font-size:16px;font-weight:700;cursor:pointer;font-family:inherit}',
    '.rc-send{background:#b45309;color:#fff}.rc-send:disabled{opacity:.5}',
    '.rc-cancel{background:#e9edf1;color:var(--ink)}',
    '.rc-done{background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;border-radius:12px;padding:14px;font-size:16px;font-weight:700;text-align:center;margin-top:12px}',
    '.rc-done a{color:#065f46}',
    // the preview: the form steps aside, the receipt as SUMIT will print it steps in
    '.rc-sheet.previewing > :not(h3):not(.rc-preview):not(.rc-status):not(.rc-acts){display:none}',
    '.rc-preview{display:none;margin-top:4px}',
    '.rc-sheet.previewing .rc-preview{display:block}',
    '.rc-pv-note{font-size:13px;color:var(--muted);margin:0 2px 10px;line-height:1.5}',
    '.rc-pv{background:#fff;color:#111;border:1px solid var(--line);border-radius:12px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.08)}',
    '.rc-pv-title{display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:10px}',
    '.rc-pv-title b{font-size:20px}.rc-pv-title span{font-size:12px;color:#666}',
    '.rc-pv-meta{display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;font-size:13px;margin-bottom:10px}',
    '.rc-pv-meta div{min-width:0;overflow-wrap:anywhere}.rc-pv-meta small{display:block;color:#666;font-size:11px}',
    '.rc-pv-desc{font-size:13px;color:#333;margin:0 0 10px;padding:8px 10px;background:#f6f7f9;border-radius:8px}',
    '.rc-pv-lines{width:100%;border-collapse:collapse;font-size:13px}',
    '.rc-pv-lines th{text-align:start;font-weight:600;color:#666;font-size:11px;border-bottom:1px solid #ddd;padding:4px 5px}',
    '.rc-pv-lines td{padding:7px 5px;border-bottom:1px solid #eee;vertical-align:top}',
    '.rc-pv-lines td small{display:block;color:#666;font-size:11px;margin-top:2px}',
    '.rc-pv-lines td.n{white-space:nowrap;text-align:end;font-variant-numeric:tabular-nums}',
    '.rc-pv-total{display:flex;justify-content:space-between;align-items:baseline;margin-top:10px;font-size:15px}',
    '.rc-pv-total b{font-size:20px}'
  ].join('\n');
  var styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  // ---- helpers ----
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function money(n) {
    return '₪' + (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('he-IL', { maximumFractionDigits: 2 });
  }
  function isEmail(s) { return /.+@.+\..+/.test(s || ''); }
  var HEB_MONTHS = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני',
                    'יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
  // "yyyy-mm" -> "יולי 2026" — the same label the server appends to the receipt.
  function monthLabel(v) {
    var m = /^(\d{4})-(\d{2})$/.exec(v || '');
    if (!m) return '';
    var i = Number(m[2]) - 1;
    return HEB_MONTHS[i] ? HEB_MONTHS[i] + ' ' + m[1] : '';
  }
  function todayIso() {
    var t = new Date();
    return t.getFullYear() + '-' + ('0' + (t.getMonth() + 1)).slice(-2) + '-' + ('0' + t.getDate()).slice(-2);
  }
  // One reference per modal: the server turns the same key into the same receipt.
  function newRef() {
    return 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  // "2026-10-19" -> "19/10/2026", the date form SUMIT prints on the receipt.
  function dateHe(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? m[3] + '/' + m[2] + '/' + m[1] : (iso || '');
  }
  // The receipt as SUMIT will print it, drawn from the same pieces the server
  // sends: lines {name, description, date, quantity, unitPrice, amount}, the
  // document description, customer, payment. A picture, not a legal document —
  // the number and the official layout come from SUMIT when it is issued.
  function previewHtml(o) {
    var rows = o.lines.map(function (ln) {
      // As SUMIT prints a חשבון/קבלה line: the product, then (smaller) the free
      // description and the row's date — the same Description buildReceiptPayload_ sends.
      var sub = ((ln.description || '') + (ln.date ? ' (' + ln.date + ')' : '')).trim();
      return '<tr><td>' + esc(ln.name) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</td>'
        + '<td class="n">' + esc(ln.quantity) + '</td>'
        + '<td class="n">' + money(ln.unitPrice) + '</td>'
        + '<td class="n">' + money(ln.amount) + '</td></tr>';
    }).join('');
    return '<p class="rc-pv-note">כך תיראה הקבלה (בקירוב). בדוק לפני האישור — לאחר השליחה אין ביטול.</p>'
      + '<div class="rc-pv">'
      + '<div class="rc-pv-title"><b>חשבון/קבלה</b><span>מספר יינתן ע"י SUMIT</span></div>'
      + '<div class="rc-pv-meta">'
      + '<div><small>לקוח</small>' + esc(o.customer.name) + '</div>'
      + '<div><small>תאריך</small>' + esc(dateHe(o.payment.date)) + '</div>'
      + '<div><small>נשלח אל</small><span dir="ltr">' + esc(o.customer.email) + '</span></div>'
      + '<div><small>אופן תשלום</small>' + esc(o.payment.method) + '</div>'
      + '</div>'
      + (o.description ? '<p class="rc-pv-desc">' + esc(o.description) + '</p>' : '')
      + '<table class="rc-pv-lines"><thead><tr><th>פירוט</th><th>כמות</th><th>מחיר</th><th>סה"כ</th></tr></thead>'
      + '<tbody>' + rows + '</tbody></table>'
      + '<div class="rc-pv-total"><span>סה"כ לתשלום</span><b>' + money(o.total) + '</b></div>'
      + '</div>';
  }
  function post(payload) {
    return fetch(endpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow'
    }).then(function (r) { return r.json(); });
  }

  // ---- screen ----
  var screenEl = document.createElement('div');
  screenEl.className = 'rc-screen hidden';
  screenEl.innerHTML = [
    '<div class="rc-head">',
    '  <button class="rc-back" id="rc-back">חזור</button>',
    '  <h2>הפקת קבלות</h2>',
    '</div>',
    '<div class="rc-body">',
    '  <p class="rc-lbl">כל קבלה כאן היא מסמך חוקי שנשלח ללקוח במייל.</p>',
    '  <div class="rc-tiles">',
    '    <button type="button" class="rc-tile inc" id="rc-from-income">',
    '      <b>הפק מהכנסה</b><span>בחירת שורות מרשימת ההכנסות</span>',
    '    </button>',
    '    <button type="button" class="rc-tile dem" id="rc-from-demand">',
    '      <b>הפק מדרישת תשלום</b><span>קק"ל · הילה · לירן — לפי דרישה שהופקה</span>',
    '    </button>',
    '    <button type="button" class="rc-tile gen" id="rc-general">',
    '      <b>הפק כללי</b><span>מוצר, כמות ומחיר, לכל שם ומייל — ללא קשר לגיליון</span>',
    '    </button>',
    '  </div>',
    '</div>'
  ].join('\n');
  document.body.appendChild(screenEl);

  function mainWrap() { return document.querySelector('.wrap'); }
  function showMain() { var w = mainWrap(); if (w) w.classList.remove('hidden'); }
  function hideMain() { var w = mainWrap(); if (w) w.classList.add('hidden'); }

  screenEl.querySelector('#rc-back').addEventListener('click', function () {
    screenEl.classList.add('hidden');
    showMain();
  });

  // ---- doors A and B: hand over to the existing sections ----
  // This screen steps aside first, so their back button lands on the main chooser.
  function loadScript(name, ready, fail) {
    var s = document.createElement('script');
    s.src = (window.FIN_TYPE ? '../' : './') + name;   // same base rule app.js uses
    s.onload = ready;
    s.onerror = fail;
    document.head.appendChild(s);
  }
  function delegate(globalName, file, open, failMsg) {
    screenEl.classList.add('hidden');
    if (window[globalName]) { open(); return; }
    loadScript(file, function () {
      if (window[globalName]) open();
      else { showMain(); alert(failMsg); }
    }, function () {
      showMain();
      alert(failMsg);
    });
  }
  screenEl.querySelector('#rc-from-income').addEventListener('click', function () {
    delegate('FinDB', 'db.js', function () { window.FinDB.open('income'); },
             'טעינת מסד הנתונים נכשלה — בדוק חיבור');
  });
  screenEl.querySelector('#rc-from-demand').addEventListener('click', function () {
    delegate('FinPay', 'payment.js', function () { window.FinPay.open(); },
             'טעינת דרישת התשלום נכשלה — בדוק חיבור');
  });

  // ---- door C: the general receipt ----
  function fieldHtml(id, label, type, value, extra) {
    return '<label for="' + id + '">' + esc(label) + '</label>'
      + '<input type="' + type + '" id="' + id + '" value="' + esc(value) + '"' + (extra || '') + '>';
  }

  screenEl.querySelector('#rc-general').addEventListener('click', openGeneralModal);

  function openGeneralModal() {
    var ref = newRef();                  // minted once; every retry reuses it
    var modal = document.createElement('div');
    modal.className = 'rc-modal';
    modal.innerHTML = [
      '<div class="rc-sheet">',
      '  <h3>הפקת קבלה כללית</h3>',
      fieldHtml('rc-product', 'מוצר', 'text', ''),
      '  <div class="rc-line">',
      '    <div>',
      '      <label for="rc-qty">כמות</label>',
      '      <input type="number" id="rc-qty" inputmode="decimal" min="0" step="any" value="1">',
      '    </div>',
      '    <div>',
      '      <label for="rc-unit">מחיר ליחידה (₪)</label>',
      '      <input type="number" id="rc-unit" class="rc-amount" inputmode="decimal" min="0" step="any" value="">',
      '    </div>',
      '  </div>',
      '  <div class="rc-total"><span>סה"כ לקבלה</span><b id="rc-total">—</b></div>',
      fieldHtml('rc-desc', 'תיאור חופשי (רשות)', 'text', ''),
      '  <div class="rc-month">',
      '    <button type="button" class="date-btn" id="rc-month-btn">📆 ללא חודש</button>',
      '    <input type="month" id="rc-month" class="hidden">',
      '  </div>',
      fieldHtml('rc-cust', 'לקוח', 'text', ''),
      fieldHtml('rc-email', 'מייל לקוח', 'email', '', ' dir="ltr" inputmode="email"'),
      fieldHtml('rc-paid', 'תאריך התשלום', 'date', todayIso(), ' max="' + todayIso() + '"'),
      '  <label for="rc-method">אופן תשלום</label>',
      '  <select id="rc-method">' + PAY_METHODS.map(function (m) {
        return '<option>' + esc(m) + '</option>';
      }).join('') + '</select>',
      '  <p class="rc-warn">הפעולה בלתי הפיכה: תופק קבלה חוקית ותישלח ללקוח במייל. הקבלה אינה נרשמת בגיליון ואינה משויכת לשורת הכנסה.</p>',
      '  <div class="rc-preview" id="rc-preview"></div>',
      '  <div class="rc-status" id="rc-modal-status"></div>',
      '  <div class="rc-acts">',
      '    <button type="button" class="rc-send">תצוגה מקדימה</button>',
      '    <button type="button" class="rc-cancel">בטל</button>',
      '  </div>',
      '</div>'
    ].join('\n');
    screenEl.appendChild(modal);

    // Optional "for which month". Starts empty and stays empty unless picked — the
    // receipt then carries no month line at all, rather than a guessed one.
    var monthInput = modal.querySelector('#rc-month');
    var monthBtn   = modal.querySelector('#rc-month-btn');
    function refreshMonthBtn(){
      var v = monthInput.value;
      monthBtn.textContent = '📆 ' + (v ? monthLabel(v) : 'ללא חודש');
      monthBtn.classList.toggle('on', !!v);
    }
    monthBtn.addEventListener('click', function () {
      var wasHidden = monthInput.classList.contains('hidden');
      monthInput.classList.toggle('hidden', !wasHidden);
      if (wasHidden) { try { monthInput.showPicker(); } catch (e) { monthInput.focus(); } }
    });
    monthInput.addEventListener('change', refreshMonthBtn);

    // The total is quantity × unit price, to the agora — the same arithmetic the
    // server does; it is shown, never typed.
    var qtyInput  = modal.querySelector('#rc-qty');
    var unitInput = modal.querySelector('#rc-unit');
    var totalEl   = modal.querySelector('#rc-total');
    function lineTotal() {
      var q = parseFloat(qtyInput.value), u = parseFloat(unitInput.value);
      if (!(q > 0) || !(u > 0)) return 0;
      return Math.round(q * u * 100) / 100;
    }
    function refreshTotal() {
      var t = lineTotal();
      totalEl.textContent = t > 0 ? money(t) : '—';
    }
    qtyInput.addEventListener('input', refreshTotal);
    unitInput.addEventListener('input', refreshTotal);

    var sheet    = modal.querySelector('.rc-sheet');
    var sendBtn  = modal.querySelector('.rc-send');
    var statusEl = modal.querySelector('#rc-modal-status');
    function status(msg, cls) {
      statusEl.className = 'rc-status' + (cls ? ' ' + cls : '');
      statusEl.textContent = msg || '';
    }
    function close() { if (modal.parentNode) modal.parentNode.removeChild(modal); }
    var cancelBtn = modal.querySelector('.rc-cancel');
    var previewEl = modal.querySelector('#rc-preview');

    // Two steps: the first tap validates and shows the receipt as it will print;
    // only the second tap, on "אשר ושלח", reaches the server. "ערוך" steps back.
    var previewing = false;
    function enterPreview(o) {
      previewEl.innerHTML = previewHtml(o);
      sheet.classList.add('previewing');
      sendBtn.textContent = 'אשר ושלח';
      cancelBtn.textContent = 'ערוך';
      previewing = true;
      status('');
      sheet.scrollTop = 0;
    }
    function leavePreview() {
      sheet.classList.remove('previewing');
      sendBtn.textContent = 'תצוגה מקדימה';
      cancelBtn.textContent = 'בטל';
      previewing = false;
      status('');
    }
    cancelBtn.addEventListener('click', function () { if (previewing) leavePreview(); else close(); });

    // Issued: the form is replaced by the receipt number, so nothing can be re-sent.
    function showIssued(r, already) {
      var num = r.documentNumber || '';
      var line = (already ? 'הקבלה כבר הופקה — ' : 'הקבלה הופקה ונשלחה — ') + 'קבלה #' + esc(num);
      sheet.innerHTML = '<h3>הפקת קבלה כללית</h3>'
        + '<div class="rc-done">' + (r.downloadUrl
            ? '<a href="' + esc(r.downloadUrl) + '" target="_blank" rel="noopener">' + line + '</a>'
            : line) + '</div>'
        + '<div class="rc-acts"><button type="button" class="rc-cancel">סגור</button></div>';
      sheet.querySelector('.rc-cancel').addEventListener('click', close);
    }

    sendBtn.addEventListener('click', function () {
      var product = modal.querySelector('#rc-product').value.trim();
      var qty     = parseFloat(qtyInput.value);
      var unit    = parseFloat(unitInput.value);
      var desc    = modal.querySelector('#rc-desc').value.trim();
      var amount  = lineTotal();
      var name    = modal.querySelector('#rc-cust').value.trim();
      var mail    = modal.querySelector('#rc-email').value.trim();
      var paid    = modal.querySelector('#rc-paid').value;
      var method  = modal.querySelector('#rc-method').value;

      var why = !product      ? 'חסר מוצר'
              : !(qty > 0)    ? 'חסרה כמות'
              : !(unit > 0)   ? 'חסר מחיר ליחידה'
              : !(amount > 0) ? 'חסר סכום'
              : !name         ? 'חסר שם לקוח'
              : !isEmail(mail)? 'חסר מייל ללקוח'
              : !paid         ? 'חסר תאריך תשלום' : '';
      if (why) { if (previewing) leavePreview(); status(why, 'err'); return; }

      var monthVal = monthInput.value;
      if (!previewing) {
        // Same shapes the server builds: the line text in buildReceiptPayload_,
        // the document description in issueGeneralReceiptLocked_.
        var tag = monthLabel(monthVal);
        enterPreview({
          lines: [{ name: product, description: desc, date: '', quantity: qty,
                    unitPrice: Math.round(unit * 100) / 100, amount: amount }],
          description: product + (tag ? ' — ' + tag : ''),
          total: amount,
          customer: { name: name, email: mail },
          payment: { date: paid, method: method }
        });
        return;
      }

      sendBtn.disabled = true;           // no second submit while in flight
      status('מפיק קבלה של ' + money(amount) + (monthVal ? ' עבור ' + monthLabel(monthVal) : '') + '…', '');
      post({ token: token(), action: 'issueGeneralReceipt',
             product: product, quantity: qty, unitPrice: unit, description: desc,
             month: monthVal,
             customer: { name: name, email: mail },
             payment: { date: paid, method: method },
             ref: ref })
        .then(function (r) {
          if (r && r.ok && r.dryRun) {
            status('מצב בדיקה: נוצרה טיוטה ב-SUMIT, דבר לא נשלח', 'ok');
            sendBtn.disabled = false;
          } else if (r && r.ok) {
            showIssued(r, !!r.alreadyIssued);
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

    modal.querySelector('#rc-product').focus();
  }

  // ---- public entry (called by app.js) ----
  window.FinRcpt = {
    open: function () {
      hideMain();
      screenEl.classList.remove('hidden');
    }
  };
})();
