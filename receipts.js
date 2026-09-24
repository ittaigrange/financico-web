/* Financico — הפקת קבלות section.
   Lazy-loaded by app.js the first time the user taps "🧾 הפק קבלות" on the
   chooser, so it never weighs on the main logging screen. It is a hub over the
   three ways a receipt gets issued:

     הפק מהכנסה        -> loads db.js and opens the income list, where rows are
                          picked with checkboxes (door B of issueReceipt).
     הפק מדרישת תשלום  -> loads payment.js and opens the demand screen, where a
                          demand's own "הפק קבלה" sits (door A of issueReceipt).
     הפק כללי           -> this file's own modal (door C, issueGeneralReceipt):
                          a free amount for a free פירוט, to any name and mail,
                          unattached to any row. Nothing is written to the sheet —
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
    '.rc-warn{background:#fff7ed;color:#9a3412;border:1px solid #fed7aa;border-radius:10px;padding:10px 12px;font-size:13px;line-height:1.5;margin:14px 0 0}',
    '.rc-status{min-height:22px;margin-top:10px;text-align:center;font-size:14px;font-weight:600}',
    '.rc-status.ok{color:var(--green)}.rc-status.err{color:var(--err)}',
    '.rc-acts{display:flex;gap:10px;margin-top:12px}',
    '.rc-acts button{flex:1;padding:14px;border-radius:12px;border:0;font-size:16px;font-weight:700;cursor:pointer;font-family:inherit}',
    '.rc-send{background:#b45309;color:#fff}.rc-send:disabled{opacity:.5}',
    '.rc-cancel{background:#e9edf1;color:var(--ink)}',
    '.rc-done{background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;border-radius:12px;padding:14px;font-size:16px;font-weight:700;text-align:center;margin-top:12px}',
    '.rc-done a{color:#065f46}'
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
  function todayIso() {
    var t = new Date();
    return t.getFullYear() + '-' + ('0' + (t.getMonth() + 1)).slice(-2) + '-' + ('0' + t.getDate()).slice(-2);
  }
  // One reference per modal: the server turns the same key into the same receipt.
  function newRef() {
    return 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
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
    '      <b>הפק כללי</b><span>סכום ופירוט חופשיים, לכל שם ומייל — ללא קשר לגיליון</span>',
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
      '  <label for="rc-amount">סכום (₪)</label>',
      '  <input type="number" id="rc-amount" class="rc-amount" inputmode="decimal" min="0" step="any" value="">',
      fieldHtml('rc-for', 'עבור (הפירוט שיופיע בקבלה)', 'text', ''),
      fieldHtml('rc-cust', 'לקוח', 'text', ''),
      fieldHtml('rc-email', 'מייל לקוח', 'email', '', ' dir="ltr" inputmode="email"'),
      fieldHtml('rc-paid', 'תאריך התשלום', 'date', todayIso(), ' max="' + todayIso() + '"'),
      '  <label for="rc-method">אופן תשלום</label>',
      '  <select id="rc-method">' + PAY_METHODS.map(function (m) {
        return '<option>' + esc(m) + '</option>';
      }).join('') + '</select>',
      '  <p class="rc-warn">הפעולה בלתי הפיכה: תופק קבלה חוקית ותישלח ללקוח במייל. הקבלה אינה נרשמת בגיליון ואינה משויכת לשורת הכנסה.</p>',
      '  <div class="rc-status" id="rc-modal-status"></div>',
      '  <div class="rc-acts">',
      '    <button type="button" class="rc-send">שלח</button>',
      '    <button type="button" class="rc-cancel">בטל</button>',
      '  </div>',
      '</div>'
    ].join('\n');
    screenEl.appendChild(modal);

    var sheet    = modal.querySelector('.rc-sheet');
    var sendBtn  = modal.querySelector('.rc-send');
    var statusEl = modal.querySelector('#rc-modal-status');
    function status(msg, cls) {
      statusEl.className = 'rc-status' + (cls ? ' ' + cls : '');
      statusEl.textContent = msg || '';
    }
    function close() { if (modal.parentNode) modal.parentNode.removeChild(modal); }
    modal.querySelector('.rc-cancel').addEventListener('click', close);

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
      var amount = parseFloat(modal.querySelector('#rc-amount').value);
      var forWhat = modal.querySelector('#rc-for').value.trim();
      var name    = modal.querySelector('#rc-cust').value.trim();
      var mail    = modal.querySelector('#rc-email').value.trim();
      var paid    = modal.querySelector('#rc-paid').value;
      var method  = modal.querySelector('#rc-method').value;

      var why = !(amount > 0) ? 'חסר סכום'
              : !forWhat      ? 'חסר פירוט ("עבור")'
              : !name         ? 'חסר שם לקוח'
              : !isEmail(mail)? 'חסר מייל ללקוח'
              : !paid         ? 'חסר תאריך תשלום' : '';
      if (why) { status(why, 'err'); return; }

      sendBtn.disabled = true;           // no second submit while in flight
      status('מפיק קבלה של ' + money(amount) + '…', '');
      post({ token: token(), action: 'issueGeneralReceipt',
             amount: amount, description: forWhat,
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

    modal.querySelector('#rc-amount').focus();
  }

  // ---- public entry (called by app.js) ----
  window.FinRcpt = {
    open: function () {
      hideMain();
      screenEl.classList.remove('hidden');
    }
  };
})();
