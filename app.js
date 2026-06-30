/* Financico shared app. Injects its own markup into #app, then wires up
   both forms, settings, suggestions, and the save flow. Mode is read from
   window.FIN_TYPE (set by the income/expense entry pages), else ?type=, else
   it shows the chooser. */
(function(){
  "use strict";
  var LS = window.localStorage;

  // ---- markup (one source, reused by root + the two entry pages) ----
  document.getElementById('app').innerHTML = [
    '<div class="wrap">',
    '  <header>',
    '    <h1 id="title">Financico</h1>',
    '    <div class="hdr-actions">',
    '      <a class="navbtn" id="nav-home" hidden>בית</a>',
    '      <a class="navbtn" id="nav-switch" hidden></a>',
    '      <button class="gear" id="gear" title="הגדרות" aria-label="הגדרות">⚙</button>',
    '    </div>',
    '  </header>',
    '  <main>',
    '    <section id="chooser" class="chooser hidden">',
    '      <div class="brand">מה לרשום?</div>',
    '      <a class="c-income"  href="./income/">＋ הכנסה</a>',
    '      <a class="c-expense" href="./expense/">－ הוצאה</a>',
    '      <button class="c-data" id="c-data" type="button">📊 נתונים</button>',
    '      <button class="c-pay" id="c-pay" type="button">🧾 דרישת תשלום</button>',
    '    </section>',
    '    <form id="form-expense" class="form hidden" autocomplete="off">',
    '      <label for="e-amount">סכום (₪)</label>',
    '      <input id="e-amount" class="amount" type="number" inputmode="decimal" min="0" step="any" required>',
    '      <label for="e-name">שם</label>',
    '      <input id="e-name" type="text" required>',
    '      <label for="e-category">סוג</label>',
    '      <input id="e-category" type="text" list="dl-categories">',
    '      <label>שיוך</label>',
    '      <div class="toggle" id="e-scope">',
    '        <button type="button" data-v="עסקי" class="on">עסקי</button>',
    '        <button type="button" data-v="אישי">אישי</button>',
    '      </div>',
    '      <label for="e-note">הערה</label>',
    '      <input id="e-note" type="text">',
    '      <button type="submit" class="save" disabled>שמירה</button>',
    '      <div class="status" id="e-status"></div>',
    '    </form>',
    '    <form id="form-income" class="form hidden" autocomplete="off">',
    '      <label for="i-amount">סכום (₪)</label>',
    '      <input id="i-amount" class="amount" type="number" inputmode="decimal" min="0" step="any" required>',
    '      <label for="i-name">שם הכנסה</label>',
    '      <input id="i-name" type="text" required>',
    '      <label for="i-payer">דרך</label>',
    '      <input id="i-payer" type="text" list="dl-payers">',
    '      <label for="i-method">אופן תשלום</label>',
    '      <input id="i-method" type="text" list="dl-methods">',
    '      <label for="i-note">הערה</label>',
    '      <input id="i-note" type="text">',
    '      <button type="submit" class="save" disabled>שמירה</button>',
    '      <div class="status" id="i-status"></div>',
    '    </form>',
    '  </main>',
    '</div>',
    '<datalist id="dl-categories"></datalist>',
    '<datalist id="dl-payers"></datalist>',
    '<datalist id="dl-methods"></datalist>',
    '<div id="panel" class="panel hidden">',
    '  <div class="sheet">',
    '    <h2>הגדרות חיבור</h2>',
    '    <p>הזן פעם אחת את כתובת ה-/exec והטוקן. נשמרים רק במכשיר הזה (localStorage), לא ברשת.</p>',
    '    <label for="s-endpoint">כתובת endpoint (/exec)</label>',
    '    <input id="s-endpoint" type="url" placeholder="https://script.google.com/.../exec">',
    '    <label for="s-token">טוקן</label>',
    '    <input id="s-token" type="text" placeholder="הטוקן הסודי">',
    '    <label for="s-dashboard">כתובת דשבורד "סיכום" (אופציונלי)</label>',
    '    <input id="s-dashboard" type="url" placeholder="https://docs.google.com/spreadsheets/.../#gid=...">',
    '    <div class="row">',
    '      <button class="cancel" id="s-cancel">ביטול</button>',
    '      <button class="save-set" id="s-save">שמירה</button>',
    '    </div>',
    '  </div>',
    '</div>'
  ].join('\n');

  // ---- seeds ----
  var SEED = {
    fin_categories: ['דלק','ציוד משרדי','ביטוח','הוצאות הדרכה','ציוד הדרכה','ביגוד','שכירות סטודיו'],
    fin_payers:     ['קק"ל','הילה','לירן','רוקט'],
    fin_methods:    ['פייבוקס','מזומן','העברה בנקאית','אשראי','ביט']
  };

  // payer -> default payment method (Tweak A). Only used to fill an EMPTY method.
  var PAYER_METHOD = {
    'קק"ל': 'העברה בנקאית',
    'הילה': 'העברה בנקאית',
    'לירן': 'העברה בנקאית'
  };

  function getList(key){
    var stored = [];
    try { stored = JSON.parse(LS.getItem(key) || '[]'); } catch(e){ stored = []; }
    var merged = SEED[key].slice();
    stored.forEach(function(v){ if (v && merged.indexOf(v) === -1) merged.push(v); });
    return merged;
  }
  function addToList(key, value){
    value = (value || '').trim();
    if (!value) return;
    var stored = [];
    try { stored = JSON.parse(LS.getItem(key) || '[]'); } catch(e){ stored = []; }
    if (SEED[key].indexOf(value) === -1 && stored.indexOf(value) === -1){
      stored.push(value);
      LS.setItem(key, JSON.stringify(stored));
    }
  }
  function fillDatalist(id, key){
    var dl = document.getElementById(id);
    dl.innerHTML = '';
    getList(key).forEach(function(v){
      var o = document.createElement('option'); o.value = v; dl.appendChild(o);
    });
  }
  function refreshDatalists(){
    fillDatalist('dl-categories','fin_categories');
    fillDatalist('dl-payers','fin_payers');
    fillDatalist('dl-methods','fin_methods');
  }

  // ---- settings ----
  function endpoint(){ return LS.getItem('fin_endpoint') || ''; }
  function token(){ return LS.getItem('fin_token') || ''; }
  function hasSettings(){ return !!endpoint() && !!token(); }

  var panel = document.getElementById('panel');
  function openSettings(){
    document.getElementById('s-endpoint').value = endpoint();
    document.getElementById('s-token').value = token();
    document.getElementById('s-dashboard').value = LS.getItem('fin_dashboard_url') || '';
    panel.classList.remove('hidden');
  }
  function closeSettings(){ panel.classList.add('hidden'); }

  document.getElementById('gear').addEventListener('click', openSettings);
  document.getElementById('s-cancel').addEventListener('click', function(){
    if (hasSettings()) closeSettings();   // can't cancel out of first-run with nothing set
  });
  document.getElementById('s-save').addEventListener('click', function(){
    var ep = document.getElementById('s-endpoint').value.trim();
    var tk = document.getElementById('s-token').value.trim();
    if (!ep || !tk){ alert('צריך גם כתובת וגם טוקן'); return; }
    LS.setItem('fin_endpoint', ep);
    LS.setItem('fin_token', tk);
    LS.setItem('fin_dashboard_url', document.getElementById('s-dashboard').value.trim()); // optional
    closeSettings();
  });

  // ---- POST (text/plain to dodge CORS preflight) ----
  async function postEntry(payload){
    var res = await fetch(endpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow'
    });
    return await res.json(); // { ok:true, id, tab, row }
  }

  // ---- form wiring ----
  function setupForm(opts){
    var form   = document.getElementById(opts.formId);
    var amount = document.getElementById(opts.amountId);
    var name   = document.getElementById(opts.nameId);
    var save   = form.querySelector('.save');
    var status = document.getElementById(opts.statusId);

    function valid(){ return parseFloat(amount.value) > 0 && name.value.trim() !== ''; }
    function refresh(){ save.disabled = !valid(); }
    form.addEventListener('input', refresh);

    form.addEventListener('submit', async function(ev){
      ev.preventDefault();
      if (!valid()) return;
      if (!hasSettings()){ openSettings(); return; }

      save.disabled = true;
      status.className = 'status';
      status.textContent = 'שומר…';

      var payload = opts.build();
      try {
        var r = await postEntry(payload);
        if (r && r.ok){
          status.className = 'status ok';
          status.textContent = 'נשמר ✓';
          opts.remember(payload);
          refreshDatalists();
          form.reset();
          opts.afterReset();
          amount.focus();
          setTimeout(function(){ if (status.textContent === 'נשמר ✓') status.textContent = ''; }, 2000);
        } else {
          status.className = 'status err';
          var err = r && r.error;
          status.textContent = err === 'unauthorized' ? 'טוקן שגוי, בדוק הגדרות'
                             : ('שגיאת שרת: ' + (err || 'לא ידועה'));
        }
      } catch (e){
        status.className = 'status err';
        status.textContent = 'אין חיבור — נסה שוב';
      } finally {
        refresh();
      }
    });

    return { refresh: refresh };
  }

  // expense scope toggle
  var scopeVal = 'עסקי';
  Array.prototype.forEach.call(document.querySelectorAll('#e-scope button'), function(b){
    b.addEventListener('click', function(){
      scopeVal = b.getAttribute('data-v');
      document.querySelectorAll('#e-scope button').forEach(function(x){ x.classList.remove('on'); });
      b.classList.add('on');
    });
  });

  // Tweak A — fill אופן תשלום from דרך only when method is empty; never overwrite.
  var payerInput  = document.getElementById('i-payer');
  var methodInput = document.getElementById('i-method');
  function maybeFillMethod(){
    if (methodInput.value.trim() !== '') return;          // never overwrite a typed value
    var def = PAYER_METHOD[payerInput.value.trim()];
    if (def) methodInput.value = def;
  }
  payerInput.addEventListener('change', maybeFillMethod);  // datalist pick
  payerInput.addEventListener('blur', maybeFillMethod);    // leaving the field

  var expenseForm = setupForm({
    formId:'form-expense', amountId:'e-amount', nameId:'e-name', statusId:'e-status',
    build: function(){
      var amount = parseFloat(document.getElementById('e-amount').value);
      var name = document.getElementById('e-name').value.trim();
      return {
        token: token(), stream:'expense', amount: amount, name: name,
        category: document.getElementById('e-category').value.trim(),
        scope: scopeVal,
        note: document.getElementById('e-note').value.trim(),
        raw: name + ' ' + amount
      };
    },
    remember: function(p){ addToList('fin_categories', p.category); },
    afterReset: function(){
      scopeVal = 'עסקי';
      document.querySelectorAll('#e-scope button').forEach(function(x){
        x.classList.toggle('on', x.getAttribute('data-v') === 'עסקי');
      });
    }
  });

  var incomeForm = setupForm({
    formId:'form-income', amountId:'i-amount', nameId:'i-name', statusId:'i-status',
    build: function(){
      var amount = parseFloat(document.getElementById('i-amount').value);
      var name = document.getElementById('i-name').value.trim();
      return {
        token: token(), stream:'income', amount: amount, name: name,
        payer: document.getElementById('i-payer').value.trim(),
        method: document.getElementById('i-method').value.trim(),
        scope:'עסקי',
        note: document.getElementById('i-note').value.trim(),
        raw: name + ' ' + amount
      };
    },
    remember: function(p){ addToList('fin_payers', p.payer); addToList('fin_methods', p.method); },
    afterReset: function(){}
  });

  // ---- in-app nav (relative, same-origin, stays standalone/full-screen) ----
  // Subfolder entry pages (income/ , expense/) sit one level under the chooser,
  // so home is '../' and the sibling form is '../income|expense/'. At the root
  // (chooser / ?type=) it's './'. No target=_blank — keeps the installed app full-screen.
  function setNav(mode){
    var inSub = !!window.FIN_TYPE;
    var home = document.getElementById('nav-home');
    var sw   = document.getElementById('nav-switch');
    home.setAttribute('href', inSub ? '../' : './');
    if (mode === 'expense'){
      home.hidden = false;
      sw.hidden = false; sw.textContent = 'להכנסה';
      sw.setAttribute('href', inSub ? '../income/' : './income/');
    } else if (mode === 'income'){
      home.hidden = false;
      sw.hidden = false; sw.textContent = 'להוצאה';
      sw.setAttribute('href', inSub ? '../expense/' : './expense/');
    } else { // chooser — already at start, no nav needed
      home.hidden = true;
      sw.hidden = true;
    }
  }

  // ---- routing ----
  function show(which){
    var body = document.body;
    document.getElementById('chooser').classList.add('hidden');
    document.getElementById('form-expense').classList.add('hidden');
    document.getElementById('form-income').classList.add('hidden');
    setNav(which);

    if (which === 'expense'){
      body.className = 'theme-expense';
      document.getElementById('title').textContent = 'הוצאה';
      document.getElementById('form-expense').classList.remove('hidden');
      expenseForm.refresh();
      document.getElementById('e-amount').focus();
    } else if (which === 'income'){
      body.className = 'theme-income';
      document.getElementById('title').textContent = 'הכנסה';
      document.getElementById('form-income').classList.remove('hidden');
      incomeForm.refresh();
      document.getElementById('i-amount').focus();
    } else {
      body.className = 'theme-income';
      document.getElementById('title').textContent = 'Financico';
      document.getElementById('chooser').classList.remove('hidden');
    }
  }

  // mode: window.FIN_TYPE (entry pages) -> ?type= -> chooser
  var type = window.FIN_TYPE || new URLSearchParams(location.search).get('type');
  refreshDatalists();
  show(type === 'expense' ? 'expense' : type === 'income' ? 'income' : 'chooser');
  if (!hasSettings()) openSettings();

  // ---- database section (lazy: only fetch db.js when first entered) ----
  // Keeps the main logging screen lean — the list/render code never loads
  // until the user taps "נתונים". db.js lives at the root next to app.js.
  var dataBtn = document.getElementById('c-data');
  if (dataBtn){
    dataBtn.addEventListener('click', function(){
      if (window.FinDB){ window.FinDB.open(); return; }
      var base = window.FIN_TYPE ? '../' : './';
      var s = document.createElement('script');
      s.src = base + 'db.js';
      s.onload  = function(){ if (window.FinDB) window.FinDB.open(); };
      s.onerror = function(){ alert('טעינת מסד הנתונים נכשלה — בדוק חיבור'); };
      document.head.appendChild(s);
    });
  }

  // ---- payment-request section (lazy: only fetch payment.js when first tapped) ----
  // Same pattern as the database section above — keeps the main screen lean.
  var payBtn = document.getElementById('c-pay');
  if (payBtn){
    payBtn.addEventListener('click', function(){
      if (window.FinPay){ window.FinPay.open(); return; }
      var base = window.FIN_TYPE ? '../' : './';
      var s = document.createElement('script');
      s.src = base + 'payment.js';
      s.onload  = function(){ if (window.FinPay) window.FinPay.open(); };
      s.onerror = function(){ alert('טעינת דרישת התשלום נכשלה — בדוק חיבור'); };
      document.head.appendChild(s);
    });
  }

  // ---- service worker (root sw.js, root scope, covers the subfolders) ----
  if ('serviceWorker' in navigator){
    var inSub = !!window.FIN_TYPE;            // income/ and expense/ live one level down
    var swPath = inSub ? '../sw.js' : './sw.js';
    var swScope = inSub ? '../' : './';
    window.addEventListener('load', function(){
      navigator.serviceWorker.register(swPath, { scope: swScope }).catch(function(){});
    });
  }
})();
