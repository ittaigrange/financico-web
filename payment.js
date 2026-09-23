/* Financico — Payment-request (דרישת תשלום) section.
   Lazy-loaded by app.js the first time the user taps "🧾 דרישת תשלום" on the
   chooser, so it never weighs on the main logging screen. Self-contained:
   reads the endpoint/token from localStorage (same keys as app.js), renders its
   own full-screen view over the main app.

   Flow: pick org (channel) -> pick month/year -> previewDoc shows the lines +
   total (the review step) -> הפק calls issueDoc, which mints the PDF, emails it
   to the channel, and logs it server-side. No email preview — send is immediate
   on הפק.

   Receipt (door A of issueReceipt): once a request exists for the channel+month,
   "הפק קבלה" opens a modal pre-filled from the demand — customer name, email,
   payment date (today), payment method — with any missing field marked for
   entry. Send calls issueReceipt with the demand's income row ids, the customer,
   the payment and the demand serial; the server issues the legal receipt through
   SUMIT, writes it onto the rows and marks the demand paid. Only two conditions
   keep the button locked: a row already on another receipt, and a demand סכום
   that differs from the row sum. The server re-validates everything. */
(function () {
  "use strict";
  if (window.FinPay) return;             // guard: load + init exactly once
  var LS = window.localStorage;

  function endpoint() { return LS.getItem('fin_endpoint') || ''; }
  function token()    { return LS.getItem('fin_token')    || ''; }

  var CHANNELS = [
    { key: 'kkl',   label: 'קק"ל' },
    { key: 'hila',  label: 'הילה' },
    { key: 'liran', label: 'לירן' }
  ];
  var PAY_METHODS = ['העברה בנקאית', 'Bit', 'מזומן', 'אשראי'];   // same closed list as backend/Sumit.gs
  var HEB_MONTHS = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני',
                    'יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];

  // ---- styles (injected once, only when this section is first opened) ----
  var css = [
    '.pay-screen{position:fixed;inset:0;z-index:30;background:var(--bg);display:flex;flex-direction:column;max-width:480px;margin:0 auto}',
    '.pay-head{display:flex;align-items:center;gap:10px;background:#0f766e;color:#fff;padding:16px 18px calc(16px + env(safe-area-inset-top))}',
    '.pay-head h2{margin:0;font-size:20px;font-weight:700;flex:1}',
    '.pay-back{background:rgba(255,255,255,.18);border:0;color:#fff;height:38px;padding:0 14px;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit}',
    '.pay-body{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:16px;overscroll-behavior:contain}',
    '.pay-lbl{font-size:14px;color:var(--muted);margin:4px 2px 8px}',
    '.pay-orgs{display:flex;gap:8px}',
    '.pay-org{flex:1;padding:14px 6px;font-size:17px;font-weight:700;border:1.5px solid var(--line);background:var(--card);border-radius:12px;cursor:pointer;color:var(--ink);font-family:inherit}',
    '.pay-org.on{border-color:#0f766e;background:#ecfdf5;color:#0f766e}',
    '.pay-period{display:flex;gap:8px;margin-top:18px}',
    '.pay-period select{flex:1}',
    '.pay-preview{margin-top:20px}',
    '.pay-recipient{font-size:13px;color:var(--muted);margin:0 2px 10px}',
    '.pay-recipient b{color:var(--ink);font-weight:700}',
    '.pay-state{text-align:center;color:var(--muted);padding:26px 12px;font-size:16px;line-height:1.5}',
    '.pay-note{border-radius:10px;padding:10px 12px;font-size:14px;margin-bottom:12px;line-height:1.5}',
    '.pay-note.amber{background:#fff7ed;color:#9a3412;border:1px solid #fed7aa}',
    '.pay-rows{display:flex;flex-direction:column;gap:8px}',
    '.pay-row{display:flex;align-items:baseline;justify-content:space-between;gap:10px;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 12px}',
    '.pay-row .pn{font-size:16px;font-weight:600;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.pay-row .pd{font-size:13px;color:var(--muted);font-variant-numeric:tabular-nums;margin-inline-start:auto;padding-inline:8px}',
    '.pay-row .pa{font-size:16px;font-weight:700;white-space:nowrap}',
    '.pay-total{display:flex;justify-content:space-between;align-items:baseline;margin-top:14px;padding:12px;background:#ecfdf5;border:1px solid #99f6e4;border-radius:12px;font-size:18px;font-weight:800;color:#0f766e}',
    '.pay-issue{width:100%;margin-top:22px;padding:16px;font-size:18px;font-weight:700;color:#fff;border:0;border-radius:14px;cursor:pointer;background:#0f766e;font-family:inherit}',
    '.pay-issue:disabled{opacity:.45;cursor:default}',
    '.pay-status{min-height:24px;margin-top:14px;text-align:center;font-size:15px;font-weight:600}',
    '.pay-status.ok{color:var(--green)}.pay-status.err{color:var(--err)}',
    '.pay-rcpt{margin-top:26px;padding-top:18px;border-top:1px solid var(--line)}',
    '.pay-rcpt-btn{width:100%;padding:16px;font-size:18px;font-weight:700;color:#fff;border:0;border-radius:14px;cursor:pointer;background:#1d4ed8;font-family:inherit}',
    '.pay-rcpt-btn:disabled{opacity:.45;cursor:default}',
    '.pay-rcpt-why{margin-top:8px;text-align:center;font-size:14px;color:var(--muted)}',
    '.pay-rcpt-done{display:block;text-align:center;padding:14px;font-size:17px;font-weight:700;color:#1d4ed8;background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;text-decoration:none}',
    '.pay-modal{position:fixed;inset:0;z-index:40;background:rgba(0,0,0,.45);display:flex;align-items:flex-end;justify-content:center}',
    '.pay-sheet{width:100%;max-width:480px;background:var(--bg);border-radius:18px 18px 0 0;padding:20px 18px calc(20px + env(safe-area-inset-bottom))}',
    '.pay-sheet h3{margin:0 0 12px;font-size:19px}',
    '.pay-sheet dl{margin:0 0 14px;display:grid;grid-template-columns:auto 1fr;gap:6px 12px;font-size:15px}',
    '.pay-sheet dt{color:var(--muted)}.pay-sheet dd{margin:0;font-weight:600;overflow-wrap:anywhere}',
    '.pay-sheet label{display:block;font-size:14px;color:var(--muted);margin:10px 2px 6px}',
    '.pay-sheet input,.pay-sheet select{width:100%}',
    '.pay-sheet input.need{border-color:#dc2626;background:#fef2f2}',
    '.pay-sheet label .need{color:#dc2626;font-weight:700;margin-inline-start:6px}',
    '.pay-warn{margin:14px 0 0;font-size:14px;line-height:1.5;color:#9a3412}',
    '.pay-acts{display:flex;gap:10px;margin-top:16px}',
    '.pay-acts button{flex:1;padding:14px;font-size:17px;font-weight:700;border-radius:12px;cursor:pointer;font-family:inherit}',
    '.pay-send{background:#1d4ed8;color:#fff;border:0}',
    '.pay-cancel{background:var(--card);color:var(--ink);border:1.5px solid var(--line)}'
  ].join('');
  var styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  // ---- default month = the just-ended month (current - 1; Jan -> Dec prev) ----
  var now = new Date();
  var defD = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  var defMonth = defD.getMonth() + 1;
  var defYear  = defD.getFullYear();

  function monthOptions(sel) {
    return HEB_MONTHS.map(function (name, i) {
      var m = i + 1;
      return '<option value="' + m + '"' + (m === sel ? ' selected' : '') + '>' + name + '</option>';
    }).join('');
  }
  function yearOptions(sel) {
    var cur = now.getFullYear(), out = '';
    for (var y = cur - 2; y <= cur; y++) {
      out += '<option value="' + y + '"' + (y === sel ? ' selected' : '') + '>' + y + '</option>';
    }
    return out;
  }

  // ---- screen markup ----
  var screen = document.createElement('div');
  screen.className = 'pay-screen hidden';
  screen.innerHTML = [
    '<div class="pay-head">',
    '  <button class="pay-back" id="pay-back">חזרה</button>',
    '  <h2>דרישת תשלום</h2>',
    '</div>',
    '<div class="pay-body">',
    '  <div class="pay-lbl">בחר ארגון</div>',
    '  <div class="pay-orgs" id="pay-orgs">',
    CHANNELS.map(function (c) {
      return '    <button class="pay-org" type="button" data-key="' + c.key + '">' + c.label + '</button>';
    }).join('\n'),
    '  </div>',
    '  <div class="pay-period">',
    '    <select id="pay-month">' + monthOptions(defMonth) + '</select>',
    '    <select id="pay-year">' + yearOptions(defYear) + '</select>',
    '  </div>',
    '  <div class="pay-preview" id="pay-preview"></div>',
    '</div>'
  ].join('\n');
  document.body.appendChild(screen);

  var backEl    = screen.querySelector('#pay-back');
  var orgsEl    = screen.querySelector('#pay-orgs');
  var monthEl   = screen.querySelector('#pay-month');
  var yearEl    = screen.querySelector('#pay-year');
  var previewEl = screen.querySelector('#pay-preview');

  var currentKey = null;     // selected channel key
  var lastPreview = null;    // last successful previewDoc result
  var reqSeq = 0;            // guards against out-of-order preview responses

  // ---- helpers ----
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function money(n) {
    var v = Math.round((Number(n) || 0) * 100) / 100;
    var parts = v.toFixed(2).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts[0] + '.' + parts[1] + ' ₪';
  }

  // ---- network (text/plain to dodge CORS preflight, same as app.js) ----
  function post(payload) {
    return fetch(endpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow'
    }).then(function (res) { return res.json(); });
  }

  function selectedMonth() { return parseInt(monthEl.value, 10); }
  function selectedYear()  { return parseInt(yearEl.value, 10); }

  // ---- preview ----
  function runPreview() {
    if (!currentKey) { previewEl.innerHTML = ''; lastPreview = null; return; }
    if (!endpoint() || !token()) {
      previewEl.innerHTML = '<div class="pay-state">צריך להגדיר חיבור קודם — פתח את גלגל השיניים במסך הראשי.</div>';
      lastPreview = null;
      return;
    }
    var seq = ++reqSeq;
    lastPreview = null;
    previewEl.innerHTML = '<div class="pay-state">טוען…</div>';

    post({ token: token(), action: 'previewDoc', channel: currentKey, month: selectedMonth(), year: selectedYear() })
      .then(function (r) {
        if (seq !== reqSeq) return;        // a newer request superseded this one
        if (!r || !r.ok) {
          var why = r && r.reason;
          previewEl.innerHTML = '<div class="pay-state">טעינה נכשלה'
            + (why ? ' (' + esc(why) + ')' : '') + '. נסה שוב.</div>';
          return;
        }
        lastPreview = r;
        renderPreview(r);
      })
      .catch(function () {
        if (seq !== reqSeq) return;
        previewEl.innerHTML = '<div class="pay-state">אין חיבור — נסה שוב.</div>';
      });
  }

  function renderPreview(r) {
    if (r.count === 0) {
      previewEl.innerHTML =
        recipientLine(r.recipient) +
        '<div class="pay-state">אין רשומות לחודש זה</div>' +
        issueButton(true);
      wireIssue();
      return;
    }
    var rows = r.lines.map(function (ln) {
      return '<div class="pay-row">'
        + '<span class="pn">' + esc(ln.name) + '</span>'
        + '<span class="pd">' + esc(ln.date) + '</span>'
        + '<span class="pa">' + money(ln.amount) + '</span></div>';
    }).join('');

    var amber = r.alreadyIssued
      ? '<div class="pay-note amber">כבר הופק עבור חודש זה (מספר ' + esc(r.lastSerial) + ')</div>'
      : '';

    previewEl.innerHTML =
      recipientLine(r.recipient) +
      amber +
      '<div class="pay-rows">' + rows + '</div>' +
      '<div class="pay-total"><span>סה"כ</span><span>' + money(r.total) + '</span></div>' +
      issueButton(false) +
      receiptSection(r);
    wireIssue();
    wireReceipt();
  }

  function recipientLine(recipient) {
    return '<div class="pay-recipient">עבור: <b>' + esc(recipient || '') + '</b></div>';
  }
  function issueButton(disabled) {
    return '<button class="pay-issue" id="pay-issue"' + (disabled ? ' disabled' : '') + '>הפק</button>'
      + '<div class="pay-status" id="pay-status"></div>';
  }

  function wireIssue() {
    var btn = previewEl.querySelector('#pay-issue');
    if (btn && !btn.disabled) btn.addEventListener('click', issue);
  }

  function setStatus(msg, cls) {
    var s = previewEl.querySelector('#pay-status');
    if (s) { s.className = 'pay-status' + (cls ? ' ' + cls : ''); s.textContent = msg || ''; }
  }

  // ---- issue (send) ----
  function issue() {
    if (!currentKey || !lastPreview || lastPreview.count === 0) return;
    var btn = previewEl.querySelector('#pay-issue');
    if (btn) btn.disabled = true;             // guard against double-tap
    setStatus('שולח…', '');

    post({ token: token(), action: 'issueDoc', channel: currentKey, month: selectedMonth(), year: selectedYear() })
      .then(function (r) {
        if (r && r.ok) {
          setStatus('נשלח ✓ — חשבון עסקה ' + r.serial + ' נשלח ל-' + r.sentTo, 'ok');
          if (lastPreview) lastPreview.alreadyIssued = true;   // re-tap would re-send; keep enabled but warned
        } else {
          var why = r && (r.reason || r.error);
          setStatus('השליחה נכשלה' + (why ? ' (' + esc(why) + ')' : '') + ' — נסה שוב', 'err');
          if (btn) btn.disabled = false;
        }
      })
      .catch(function () {
        setStatus('אין חיבור — נסה שוב', 'err');
        if (btn) btn.disabled = false;
      });
  }

  // ---- receipt (הפק קבלה) ----
  // Only the hard blocks lock the button; a missing customer field is collected
  // in the modal instead. Client-side checks are UX only — issueReceipt re-checks.
  function receiptLock(r) {
    var d = r.demand;
    if (!d) return 'טרם הופקה דרישת תשלום לחודש זה';
    if (Math.abs((Number(d.total) || 0) - (Number(r.total) || 0)) >= 0.005) {
      return 'סכום הדרישה (' + money(d.total) + ') שונה מסכום השורות (' + money(r.total) + ')';
    }
    var lines = r.lines || [], n30 = 0;
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i];
      if (!ln.id) return 'שורות ללא מזהה — לא ניתן להפיק קבלה מהאפליקציה';
      if (ln.receiptId && ln.receiptId !== (d.receiptId || '')) return 'שורה בדרישה כבר משויכת לקבלה אחרת';
      if (ln.method === '+30') n30++;
    }
    if (n30 > 0 && n30 < lines.length) return 'בחירה מעורבת: שורות +30 ושורות ששולמו ישירות';
    return '';
  }
  // Modal default: +30 rows were paid by bank transfer; a direct-paid row keeps its
  // own method when it is one SUMIT knows (ביט -> Bit); anything else -> bank transfer.
  function defaultMethod(lines) {
    var methods = {};
    lines.forEach(function (ln) { methods[ln.method || ''] = true; });
    var keys = Object.keys(methods);
    if (keys.length !== 1 || keys[0] === '+30') return 'העברה בנקאית';
    var m = keys[0] === 'ביט' ? 'Bit' : keys[0];
    return PAY_METHODS.indexOf(m) === -1 ? 'העברה בנקאית' : m;
  }

  function receiptSection(r) {
    var d = r.demand, inner;
    if (d && d.receiptNumber) {
      inner = d.receiptUrl
        ? '<a class="pay-rcpt-done" href="' + esc(d.receiptUrl) + '" target="_blank" rel="noopener">קבלה #' + esc(d.receiptNumber) + '</a>'
        : '<div class="pay-rcpt-done">קבלה #' + esc(d.receiptNumber) + '</div>';
    } else {
      var why = receiptLock(r);
      inner = '<button class="pay-rcpt-btn" id="pay-rcpt"' + (why ? ' disabled' : '') + '>הפק קבלה</button>'
        + (why ? '<div class="pay-rcpt-why">' + esc(why) + '</div>' : '')
        + '<div class="pay-status" id="pay-rcpt-status"></div>';
    }
    return '<div class="pay-rcpt">' + inner + '</div>';
  }

  function wireReceipt() {
    var btn = previewEl.querySelector('#pay-rcpt');
    if (btn && !btn.disabled) btn.addEventListener('click', confirmReceipt);
  }

  function setRcptStatus(msg, cls) {
    var s = previewEl.querySelector('#pay-rcpt-status');
    if (s) { s.className = 'pay-status' + (cls ? ' ' + cls : ''); s.textContent = msg || ''; }
  }

  function todayIso() {
    var t = new Date();
    return t.getFullYear() + '-' + ('0' + (t.getMonth() + 1)).slice(-2) + '-' + ('0' + t.getDate()).slice(-2);
  }

  function isEmail(s) { return /.+@.+\..+/.test(s || ''); }

  // A text/date field with a "חסר" mark when its prefill is empty.
  function fieldHtml(id, label, type, value, extra) {
    var missing = !value;
    return '<label for="' + id + '">' + esc(label) + (missing ? '<span class="need">חסר</span>' : '') + '</label>'
      + '<input type="' + type + '" id="' + id + '" class="' + (missing ? 'need' : '') + '" value="' + esc(value) + '"' + (extra || '') + '>';
  }

  function confirmReceipt() {
    var r = lastPreview;
    if (!r || !r.demand || r.demand.receiptNumber) return;
    var d = r.demand;
    var email = isEmail(d.email) ? d.email : '';
    var def = defaultMethod(r.lines || []);
    var modal = document.createElement('div');
    modal.className = 'pay-modal';
    modal.innerHTML = [
      '<div class="pay-sheet">',
      '  <h3>הפקת קבלה — דרישה ' + esc(d.serial) + '</h3>',
      '  <dl>',
      '    <dt>סכום</dt><dd>' + money(d.total) + '</dd>',
      '    <dt>שורות</dt><dd>' + esc(r.count) + '</dd>',
      '  </dl>',
      fieldHtml('pay-cust', 'לקוח', 'text', r.recipient || ''),
      fieldHtml('pay-email', 'מייל לקוח', 'email', email, ' dir="ltr" inputmode="email"'),
      fieldHtml('pay-paid', 'תאריך התשלום', 'date', todayIso(), ' max="' + todayIso() + '"'),
      '  <label for="pay-method">אופן תשלום</label>',
      '  <select id="pay-method">' + PAY_METHODS.map(function (m) {
        return '<option' + (m === def ? ' selected' : '') + '>' + esc(m) + '</option>';
      }).join('') + '</select>',
      '  <p class="pay-warn">הפעולה בלתי הפיכה: תופק קבלה חוקית, תישלח ללקוח במייל, והדרישה תסומן כשולמה.</p>',
      '  <div class="pay-status" id="pay-modal-status"></div>',
      '  <div class="pay-acts">',
      '    <button type="button" class="pay-send">שלח</button>',
      '    <button type="button" class="pay-cancel">בטל</button>',
      '  </div>',
      '</div>'
    ].join('\n');
    screen.appendChild(modal);

    function close() { if (modal.parentNode) modal.parentNode.removeChild(modal); }
    modal.querySelector('.pay-cancel').addEventListener('click', close);
    modal.querySelector('.pay-send').addEventListener('click', function () {
      var name     = modal.querySelector('#pay-cust').value.trim();
      var mail     = modal.querySelector('#pay-email').value.trim();
      var paidDate = modal.querySelector('#pay-paid').value;
      var method   = modal.querySelector('#pay-method').value;
      var st = modal.querySelector('#pay-modal-status');
      var why = !name ? 'חסר שם לקוח' : !isEmail(mail) ? 'חסר מייל ללקוח' : !paidDate ? 'חסר תאריך תשלום' : '';
      if (why) { st.className = 'pay-status err'; st.textContent = why; return; }
      close();
      issueReceipt({
        rowIds:       (r.lines || []).map(function (ln) { return ln.id; }),
        customer:     { name: name, email: mail },
        payment:      { date: paidDate, method: method },
        demandSerial: d.serial
      });
    });
  }

  function issueReceipt(req) {
    var btn = previewEl.querySelector('#pay-rcpt');
    if (!btn || btn.disabled) return;
    btn.disabled = true;                       // no second submit while in flight
    setRcptStatus('מפיק קבלה…', '');
    var seq = reqSeq;                          // the user may switch channel/month meanwhile

    post({ token: token(), action: 'issueReceipt',
           rowIds: req.rowIds, customer: req.customer, payment: req.payment, demandSerial: req.demandSerial })
      .then(function (r) {
        if (seq !== reqSeq) return;
        if (r && r.ok && r.dryRun) {
          setRcptStatus('מצב בדיקה: נוצרה טיוטה ב-SUMIT, דבר לא נרשם', 'ok');
          btn.disabled = false;
        } else if (r && r.ok) {
          runPreview();                        // issued / alreadyIssued -> redraw in the issued state
        } else {
          setRcptStatus((r && (r.userMessage || r.error)) || 'הפקת הקבלה נכשלה — נסה שוב', 'err');
          btn.disabled = false;
        }
      })
      .catch(function () {
        if (seq !== reqSeq) return;
        setRcptStatus('אין חיבור — הקש שוב (לא תופק קבלה כפולה)', 'err');
        btn.disabled = false;
      });
  }

  // ---- wiring ----
  orgsEl.addEventListener('click', function (ev) {
    var b = ev.target.closest('.pay-org');
    if (!b) return;
    currentKey = b.getAttribute('data-key');
    Array.prototype.forEach.call(orgsEl.querySelectorAll('.pay-org'), function (x) {
      x.classList.toggle('on', x === b);
    });
    runPreview();
  });
  monthEl.addEventListener('change', runPreview);
  yearEl.addEventListener('change', runPreview);

  function exitToMain() {
    screen.classList.add('hidden');
    var wrap = document.querySelector('.wrap');
    if (wrap) wrap.classList.remove('hidden');
  }
  backEl.addEventListener('click', exitToMain);

  // ---- public entry (called by app.js) ----
  window.FinPay = {
    open: function () {
      var wrap = document.querySelector('.wrap');
      if (wrap) wrap.classList.add('hidden');
      screen.classList.remove('hidden');
    }
  };
})();
