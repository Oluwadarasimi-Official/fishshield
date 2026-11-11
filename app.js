/* FishShield — fisherman app */
var N = function (n) { return '₦' + Number(n || 0).toLocaleString('en-NG'); };
var $ = function (s) { return document.querySelector(s); };
var $$ = function (s) { return document.querySelectorAll(s); };
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function fmtDate(d) {
  if (!d) return '';
  var dt = new Date(d + (String(d).length === 10 ? 'T00:00:00' : ''));
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function toast(msg) {
  var t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  $('#toastRoot').appendChild(t); setTimeout(function () { t.remove(); }, 2800);
}
function closeSheet() { $('#sheetRoot').innerHTML = ''; }

var ME = null;       // current fisherman
var PLANS = [];
var claimPhoto = '';

function sessionId() { try { return localStorage.getItem('fs_session'); } catch (e) { return null; } }
function setSession(id) { try { localStorage.setItem('fs_session', id); } catch (e) {} }
function clearSession() { try { localStorage.removeItem('fs_session'); } catch (e) {} }

async function init() {
  PLANS = await FSDB.getPlans();
  var sid = sessionId();
  if (sid) {
    var all = await FSDB.getAllFishermen();
    ME = all.find(function (f) { return String(f.id) === String(sid); }) || null;
  }
  if (ME) { enterHome(); } else { showView('auth'); }
  renderPlans();
}

async function enterApp() {
  var name = $('#auName').value.trim();
  var phone = $('#auPhone').value.replace(/\D/g, '');
  var community = $('#auCommunity').value.trim();
  var state = $('#auState').value;
  var btn = $('#authBtn');
  if (!phone || phone.length < 10) { toast('Enter a valid phone number'); return; }
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span>Checking…';
  try {
    var existing = await FSDB.findFishermanByPhone(phone);
    if (existing) {
      ME = existing;
      toast('Welcome back, ' + ME.name.split(' ')[0] + ' 👋');
    } else {
      if (!name) { toast('Enter your name to sign up'); btn.disabled = false; btn.innerHTML = 'Enter FishShield →'; return; }
      if (!community || !state) { toast('Add your community and state'); btn.disabled = false; btn.innerHTML = 'Enter FishShield →'; return; }
      ME = await FSDB.createFisherman({ name: name, phone: phone, community: community, state: state });
      await FSDB.addTx({ fisherman_id: ME.id, kind: 'TOPUP', amount: 5000, note: 'Welcome demo top-up' });
      toast('Welcome to FishShield, ' + name.split(' ')[0] + '! ₦5,000 demo funds added.');
    }
    setSession(ME.id);
    enterHome();
  } catch (e) {
    toast('Could not sign in — try again');
  }
  btn.disabled = false;
  btn.innerHTML = 'Enter FishShield →';
}

function enterHome() {
  $('#homeName').textContent = ME.name;
  $('#homeGreet').textContent = 'Welcome back, ' + ME.name.split(' ')[0] + ' • ' + ME.community + ', ' + ME.state;
  $('#walChip').style.display = '';
  showView('home');
}

function showView(v) {
  ['auth', 'home', 'plans', 'policies', 'claims', 'wallet'].forEach(function (x) {
    var el = $('#view-' + x);
    if (el) el.classList.toggle('hidden', x !== v);
  });
  $$('.nav-in button').forEach(function (b) { b.classList.toggle('on', b.dataset.v === v); });
  if (v === 'home') { renderWallet(); renderPlans(); }
  if (v === 'plans') renderPlans();
  if (v === 'policies') renderPolicies();
  if (v === 'claims') renderClaims();
  if (v === 'wallet') { renderWallet(); renderTx(); }
  window.scrollTo({ top: 0 });
}

async function renderWallet() {
  if (!ME) return;
  var bal = await FSDB.walletBalance(ME.id);
  $('#walBal').textContent = N(bal);
  var b2 = $('#walBal2'); if (b2) b2.textContent = N(bal);
  $('#walChipBal').textContent = N(bal);
}

function planCard(p) {
  return '<article class="glass plan">' +
    '<div class="top-row"><h3>' + esc(p.name) + '</h3><span class="cov">Cover up to ' + N(p.cover_limit) + '</span></div>' +
    '<p>' + esc(p.description) + '</p>' +
    '<div class="nums"><span class="prem"><b>' + N(p.premium) + '</b> <span>/ week</span></span>' +
    '<button class="buy" onclick="buyPlan(\'' + p.id + '\')">Buy cover</button></div>' +
    '</article>';
}
function renderPlans() {
  var html = PLANS.length ? PLANS.map(planCard).join('') : '<div class="empty"><div class="big">🛟</div>No plans right now — check back soon.</div>';
  var a = $('#planList'); if (a) a.innerHTML = html;
  var b = $('#planList2'); if (b) b.innerHTML = html;
}

async function topUp(amount) {
  if (!ME) return;
  await FSDB.addTx({ fisherman_id: ME.id, kind: 'TOPUP', amount: amount, note: 'Demo top-up' });
  toast(N(amount) + ' demo funds added (simulated)');
  renderWallet(); renderTx();
}

function buyPlan(planId) {
  var p = PLANS.find(function (x) { return String(x.id) === String(planId); });
  if (!p || !ME) return;
  $('#sheetRoot').innerHTML =
    '<div class="sheet-bg" onclick="if(event.target===this)closeSheet()">' +
    '<div class="sheet" style="position:relative"><button class="close-x" onclick="closeSheet()">✕</button>' +
    '<div class="sheet-b"><h2>' + esc(p.name) + '</h2>' +
    '<p class="desc">' + esc(p.description) + '</p>' +
    '<div class="glass-soft" style="padding:14px; margin-bottom:14px">' +
    '<div style="display:flex;justify-content:space-between"><span>Premium</span><b>' + N(p.premium) + ' / week</b></div>' +
    '<div style="display:flex;justify-content:space-between;margin-top:6px"><span>Cover limit</span><b>' + N(p.cover_limit) + '</b></div>' +
    '<div style="display:flex;justify-content:space-between;margin-top:6px"><span>Cover period</span><b>' + (p.duration_weeks || 4) + ' weeks</b></div></div>' +
    '<p class="desc">Premium is taken from your wallet now. Demo payment — no real money moves.</p>' +
    '<button class="cta" id="buyBtn" onclick="confirmBuy(\'' + p.id + '\')">Pay ' + N(p.premium) + ' &amp; activate cover</button>' +
    '<button class="cta ghost" onclick="closeSheet()">Not now</button>' +
    '</div></div></div>';
}
async function confirmBuy(planId) {
  var p = PLANS.find(function (x) { return String(x.id) === String(planId); });
  var btn = $('#buyBtn'); if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Activating…'; }
  try {
    var pol = await FSDB.buyPolicy(ME.id, p);
    closeSheet();
    $('#sheetRoot').innerHTML =
      '<div class="sheet-bg" onclick="if(event.target===this)closeSheet()">' +
      '<div class="sheet" style="position:relative"><button class="close-x" onclick="closeSheet()">✕</button>' +
      '<div class="sheet-b" style="text-align:center; padding-top:26px">' +
      '<div style="font-size:52px">🛡️</div><h2>Cover active!</h2>' +
      '<p class="desc">Your ' + esc(p.name) + ' is live until ' + fmtDate(pol.end_date) + '.</p>' +
      '<div class="glass-soft" style="padding:14px"><small style="color:var(--muted)">Policy code</small><div style="font-size:26px;font-weight:800;letter-spacing:2px">' + esc(pol.code) + '</div></div>' +
      '<button class="cta" style="margin-top:16px" onclick="closeSheet();showView(\'policies\')">View my policies →</button>' +
      '</div></div></div>';
    toast('Cover activated — ' + pol.code);
    renderWallet(); renderPlans();
  } catch (e) {
    closeSheet();
    if (e && e.code === 'INSUFFICIENT') {
      toast('Wallet too low — top up first');
      showView('home');
    } else { toast('Could not activate cover — try again'); }
  }
}

async function renderPolicies() {
  if (!ME) return;
  var list = await FSDB.getPolicies(ME.id);
  $('#policyList').innerHTML = list.length ? list.map(function (p) {
    return '<div class="glass item"><div class="row1"><b>' + esc(p.plan_name) + '</b>' +
      '<span class="badge b-' + p.status + '">' + p.status + '</span></div>' +
      '<div class="meta">Policy ' + esc(p.code) + ' • Premium ' + N(p.premium) + '/week • Cover ' + N(p.cover_limit) + '</div>' +
      '<div class="meta2">' + fmtDate(p.start_date) + ' → ' + fmtDate(p.end_date) + '</div></div>';
  }).join('') : '<div class="empty"><div class="big">📋</div>No policies yet.<br>Buy a cover plan to get protected.</div>';
}

async function renderClaims() {
  if (!ME) return;
  var list = await FSDB.getClaims(ME.id);
  $('#claimList').innerHTML = list.length ? list.map(function (c) {
    return '<div class="glass item"><div class="row1"><b>' + esc(c.plan_name) + '</b>' +
      '<span class="badge b-' + c.status + '">' + c.status + '</span></div>' +
      '<div class="meta">Claim ' + esc(c.code) + ' • ' + N(c.amount) + ' claimed</div>' +
      '<div class="meta2">' + esc(c.description) + '</div>' +
      (c.decision_note ? '<div class="meta2">Note: ' + esc(c.decision_note) + '</div>' : '') +
      '</div>';
  }).join('') : '<div class="empty"><div class="big">📸</div>No claims yet.<br>File one if you suffer a loss.</div>';
}

async function renderTx() {
  if (!ME) return;
  var tx = await FSDB.getWalletTx(ME.id);
  $('#txList').innerHTML = tx.length ? tx.map(function (t) {
    var cls = t.amount >= 0 ? 'in' : 'out';
    var sign = t.amount >= 0 ? '+' : '−';
    var label = t.kind === 'TOPUP' ? 'Demo top-up' : t.kind === 'PREMIUM' ? 'Premium payment' : 'Claim payout';
    return '<div class="tx"><div>' + label + '<small>' + esc(t.note || '') + ' • ' + fmtDate((t.created_at || '').slice(0, 10)) + '</small></div>' +
      '<span class="amt ' + cls + '">' + sign + ' ' + N(Math.abs(t.amount)) + '</span></div>';
  }).join('') : '<div class="empty">No transactions yet.</div>';
}

/* ---------- claim flow ---------- */
async function openClaimSheet() {
  if (!ME) return;
  var pols = (await FSDB.getPolicies(ME.id)).filter(function (p) { return p.status === 'ACTIVE'; });
  if (!pols.length) { toast('You need an active policy first'); showView('plans'); return; }
  claimPhoto = '';
  $('#sheetRoot').innerHTML =
    '<div class="sheet-bg" onclick="if(event.target===this)closeSheet()">' +
    '<div class="sheet" style="position:relative"><button class="close-x" onclick="closeSheet()">✕</button>' +
    '<div class="sheet-b"><h2>File a claim</h2>' +
    '<p class="desc">Tell us what happened. Add a photo of the damage — it helps the cooperative decide fast.</p>' +
    '<div class="field"><label>Policy</label><select id="clPolicy">' +
      pols.map(function (p) { return '<option value="' + p.id + '">' + esc(p.plan_name) + ' — ' + esc(p.code) + ' (cover ' + N(p.cover_limit) + ')</option>'; }).join('') +
    '</select></div>' +
    '<div class="field"><label>Amount lost (₦)</label><input id="clAmount" type="number" inputmode="numeric" min="1" placeholder="e.g. 45000"></div>' +
    '<div class="field"><label>What happened?</label><textarea id="clDesc" placeholder="e.g. Storm damaged my boat engine and tore two fishing nets on the way back from the creek."></textarea></div>' +
    '<div class="field"><label>Photo of the damage</label>' +
    '<input id="clPhoto" type="file" accept="image/*" onchange="handlePhoto(this)">' +
    '<div id="photoPreview"></div></div>' +
    '<button class="cta" id="claimBtn" onclick="submitClaim()">Submit claim</button>' +
    '<button class="cta ghost" onclick="closeSheet()">Cancel</button>' +
    '</div></div></div>';
}
function handlePhoto(input) {
  var file = input.files && input.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function (e) {
    var img = new Image();
    img.onload = function () {
      var max = 800, w = img.width, h = img.height;
      if (w > max || h > max) {
        var s = Math.min(max / w, max / h);
        w = Math.round(w * s); h = Math.round(h * s);
      }
      var cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      claimPhoto = cv.toDataURL('image/jpeg', 0.75);
      var pv = $('#photoPreview');
      if (pv) pv.innerHTML = '<img class="claim-photo" src="' + claimPhoto + '" alt="Damage photo preview">';
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}
async function submitClaim() {
  var polId = $('#clPolicy').value;
  var amount = parseInt($('#clAmount').value, 10);
  var desc = $('#clDesc').value.trim();
  var pols = await FSDB.getPolicies(ME.id);
  var pol = pols.find(function (p) { return String(p.id) === String(polId); });
  if (!pol) { toast('Pick a policy'); return; }
  if (!amount || amount <= 0) { toast('Enter the amount you lost'); return; }
  if (amount > pol.cover_limit) { toast('Amount is above your cover limit of ' + N(pol.cover_limit)); return; }
  if (!desc) { toast('Describe what happened'); return; }
  var btn = $('#claimBtn'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Submitting…';
  try {
    var claim = await FSDB.fileClaim({
      policy_id: pol.id, fisherman_id: ME.id, plan_name: pol.plan_name,
      description: desc, amount: amount, photo_data: claimPhoto
    });
    closeSheet();
    toast('Claim submitted — ' + claim.code);
    renderClaims();
  } catch (e) {
    toast('Could not submit claim — try again');
    btn.disabled = false; btn.innerHTML = 'Submit claim';
  }
}

document.addEventListener('DOMContentLoaded', init);
