/* FishShield — cooperative dashboard */
var N = function (n) { return '₦' + Number(n || 0).toLocaleString('en-NG'); };
var $ = function (s) { return document.querySelector(s); };
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

var FISHERMEN = [], CLAIMS = [], POLICIES = [];

function unlock() {
  var pin = $('#pinInput').value.trim();
  if (pin === '1234') {
    $('#view-pin').classList.add('hidden');
    $('#view-dash').classList.remove('hidden');
    loadDashboard();
  } else {
    toast('Wrong PIN — try 1234 (demo)');
    $('#pinInput').value = '';
  }
}
function lock() {
  $('#view-dash').classList.add('hidden');
  $('#view-pin').classList.remove('hidden');
  $('#pinInput').value = '';
}

async function loadDashboard() {
  var online = await FSDB.isOnline();
  $('#dashMode').style.display = '';
  $('#dashModeTxt').textContent = online ? 'Live' : 'Offline demo';
  var results = await Promise.all([
    FSDB.getAllFishermen(), FSDB.getAllClaims(), FSDB.getAllPolicies(), FSDB.getAllWalletTx()
  ]);
  FISHERMEN = results[0]; CLAIMS = results[1]; POLICIES = results[2];
  var tx = results[3];

  var today = new Date().toISOString().slice(0, 10);
  var premiums = tx.filter(function (t) { return t.kind === 'PREMIUM'; });
  var todaySum = premiums.filter(function (t) { return (t.created_at || '').slice(0, 10) === today; })
    .reduce(function (a, t) { return a + Math.abs(Number(t.amount || 0)); }, 0);
  var totalSum = premiums.reduce(function (a, t) { return a + Math.abs(Number(t.amount || 0)); }, 0);
  var pending = CLAIMS.filter(function (c) { return c.status === 'PENDING'; }).length;

  $('#stMembers').textContent = FISHERMEN.length;
  $('#stToday').textContent = N(todaySum);
  $('#stTotal').textContent = N(totalSum);
  $('#stPending').textContent = pending;

  renderClaims();
  renderMembers(tx);
  renderActivity(tx);
}

function fisherName(id) {
  var f = FISHERMEN.find(function (x) { return String(x.id) === String(id); });
  return f ? f.name : 'Unknown fisherman';
}
function fisherMeta(id) {
  var f = FISHERMEN.find(function (x) { return String(x.id) === String(id); });
  return f ? (f.community + ', ' + f.state + ' • ' + f.phone) : '';
}

function renderClaims() {
  var el = $('#claimQueue');
  if (!CLAIMS.length) { el.innerHTML = '<div class="empty glass"><div class="big">✅</div>No claims yet.</div>'; return; }
  el.innerHTML = CLAIMS.map(function (c) {
    var photo = c.photo_data
      ? '<img class="thumb" src="' + c.photo_data + '" alt="Claim photo">'
      : '<div class="thumb" style="display:flex;align-items:center;justify-content:center;font-size:26px;background:#eaf1ff">📷</div>';
    return '<div class="glass item"><div class="claim-row">' + photo +
      '<div class="cb"><div class="row1"><b>' + esc(fisherName(c.fisherman_id)) + '</b>' +
      '<span class="badge b-' + c.status + '">' + c.status + '</span></div>' +
      '<div class="meta">' + esc(c.plan_name) + ' • Claim ' + esc(c.code) + ' • ' + N(c.amount) + '</div>' +
      '<div class="meta2">' + esc(c.description) + '</div>' +
      (c.decision_note ? '<div class="meta2">Note: ' + esc(c.decision_note) + '</div>' : '') +
      (c.status === 'PENDING'
        ? '<button class="buy" style="margin-top:10px" onclick="openClaim(\'' + c.id + '\')">Review claim →</button>'
        : '') +
      '</div></div></div>';
  }).join('');
}

async function renderMembers(tx) {
  var el = $('#memberList');
  var rows = await Promise.all(FISHERMEN.map(async function (f) {
    var pols = POLICIES.filter(function (p) { return String(p.fisherman_id) === String(f.id) && p.status === 'ACTIVE'; });
    var bal = tx.filter(function (t) { return String(t.fisherman_id) === String(f.id); })
      .reduce(function (a, t) { return a + Number(t.amount || 0); }, 0);
    return { f: f, pols: pols, bal: bal };
  }));
  el.innerHTML = rows.length ? rows.map(function (r) {
    return '<div class="glass item"><div class="row1"><b>' + esc(r.f.name) + '</b>' +
      '<span class="badge b-ACTIVE">' + r.pols.length + ' active</span></div>' +
      '<div class="meta">' + esc(r.f.community) + ', ' + esc(r.f.state) + ' • ' + esc(r.f.phone) + '</div>' +
      '<div class="meta2">Cover: ' + (r.pols.length ? r.pols.map(function (p) { return esc(p.plan_name) + ' (' + esc(p.code) + ')'; }).join(', ') : 'None') + ' • Wallet ' + N(r.bal) + '</div></div>';
  }).join('') : '<div class="empty glass"><div class="big">🎣</div>No members yet.</div>';
}

function renderActivity(tx) {
  var el = $('#activityList');
  var rows = tx.slice(0, 12);
  el.innerHTML = rows.length ? rows.map(function (t) {
    var cls = t.amount >= 0 ? 'in' : 'out';
    var sign = t.amount >= 0 ? '+' : '−';
    var label = t.kind === 'TOPUP' ? 'Demo top-up' : t.kind === 'PREMIUM' ? 'Premium payment' : 'Claim payout';
    return '<div class="tx"><div>' + label + '<small>' + esc(fisherName(t.fisherman_id)) + ' • ' + esc(t.note || '') + '</small></div>' +
      '<span class="amt ' + cls + '">' + sign + ' ' + N(Math.abs(t.amount)) + '</span></div>';
  }).join('') : '<div class="empty">No activity yet.</div>';
}

function openClaim(claimId) {
  var c = CLAIMS.find(function (x) { return String(x.id) === String(claimId); });
  if (!c) return;
  $('#sheetRoot').innerHTML =
    '<div class="sheet-bg" onclick="if(event.target===this)closeSheet()">' +
    '<div class="sheet" style="position:relative"><button class="close-x" onclick="closeSheet()">✕</button>' +
    '<div class="sheet-b"><h2>Claim ' + esc(c.code) + '</h2>' +
    '<p class="desc">' + esc(fisherName(c.fisherman_id)) + ' • ' + esc(fisherMeta(c.fisherman_id)) + '<br>' +
    esc(c.plan_name) + ' • Amount claimed: <b style="color:var(--ink)">' + N(c.amount) + '</b></p>' +
    '<div class="glass-soft" style="padding:14px"><b>What happened</b><p style="color:var(--muted);font-size:14px;margin-top:4px">' + esc(c.description) + '</p></div>' +
    (c.photo_data ? '<img class="claim-photo" src="' + c.photo_data + '" alt="Damage photo">' : '<p class="desc" style="margin-top:10px">No photo attached to this claim.</p>') +
    '<div class="field" style="margin-top:12px"><label>Decision note (shown to the fisherman)</label>' +
    '<input id="decNote" placeholder="e.g. Verified — payout approved"></div>' +
    '<button class="cta" id="apBtn" onclick="decideClaim(\'' + c.id + '\',\'APPROVED\')">✓ Approve &amp; pay ' + N(c.amount) + '</button>' +
    '<button class="cta danger" id="rjBtn" onclick="decideClaim(\'' + c.id + '\',\'REJECTED\')">✕ Reject claim</button>' +
    '<button class="cta ghost" onclick="closeSheet()">Decide later</button>' +
    '</div></div></div>';
}

async function decideClaim(claimId, status) {
  var note = ($('#decNote') ? $('#decNote').value.trim() : '');
  var c = CLAIMS.find(function (x) { return String(x.id) === String(claimId); });
  var btn = status === 'APPROVED' ? $('#apBtn') : $('#rjBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Updating…'; }
  try {
    var payout = status === 'APPROVED' ? Number(c.amount || 0) : 0;
    await FSDB.decideClaim(claimId, status, note, payout);
    closeSheet();
    toast(status === 'APPROVED' ? 'Claim approved — ' + N(payout) + ' paid to wallet (demo)' : 'Claim rejected');
    loadDashboard();
  } catch (e) {
    toast('Could not update claim — try again');
    if (btn) { btn.disabled = false; btn.innerHTML = status === 'APPROVED' ? '✓ Approve' : '✕ Reject claim'; }
  }
}

document.addEventListener('DOMContentLoaded', function () {
  var pin = $('#pinInput');
  if (pin) pin.addEventListener('keydown', function (e) { if (e.key === 'Enter') unlock(); });
});
