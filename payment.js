/* Financico — Payment-request (דרישת תשלום) section.
   Lazy-loaded by app.js the first time the user taps "🧾 דרישת תשלום" on the
   chooser, so it never weighs on the main logging screen. Self-contained:
   reads the endpoint/token from localStorage (same keys as app.js), renders its
   own full-screen view over the main app.

   Flow: pick org (channel) -> pick month/year -> previewDoc shows the lines +
   total (the review step) -> הפק calls issueDoc, which mints the PDF, emails it
   to the channel, and logs it server-side. No email preview — send is immediate
   on הפק. */
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
    '.pay-status.ok{color:var(--green)}.pay-status.err{color:var(--err)}'
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
      issueButton(false);
    wireIssue();
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
