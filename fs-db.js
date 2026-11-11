/* FishShield — shared data layer.
   Talks to Supabase PostgREST with plain fetch (no CDN bundle).
   If Supabase is unreachable (offline / sandboxed browser), every read and
   write falls back to a local store in localStorage, seeded with the same
   demo data as the database — so the app works end to end either way.
   Money is DEMO/SIMULATED: top-ups and premium payments are simulated
   confirmations. No real money moves. */
(function () {
  'use strict';
  var CFG = window.FS_SUPABASE || {};
  var BASE = CFG.url ? CFG.url + '/rest/v1' : '';
  var KEY = CFG.publishableKey || '';
  var LS_PREFIX = 'fs_local_';
  var ONLINE = null; // null = unknown, true/false once probed

  var EMBEDDED_PLANS = [
    { id: 'p1', name: 'Boat & Net Cover', description: 'Covers damage to your boat and fishing nets from storms, accidents and rough seas. Repairs or replacement, up to the cover limit.', premium: 1500, cover_limit: 150000, duration_weeks: 4, active: true, sort: 1 },
    { id: 'p2', name: 'Catch Loss Cover', description: 'Covers lost catch from bad weather, engine failure on the water, or spoilage before market. Paid per verified loss, up to the cover limit.', premium: 1000, cover_limit: 80000, duration_weeks: 4, active: true, sort: 2 },
    { id: 'p3', name: 'Family Support Cover', description: 'Support for your family when injury or sickness keeps you off the water. A weekly allowance while you recover, up to the cover limit.', premium: 800, cover_limit: 50000, duration_weeks: 4, active: true, sort: 3 }
  ];
  var EMBEDDED_FISHERMEN = [
    { id: 'f1', name: 'Emeka Okafor', phone: '08030000001', community: 'Makoko', state: 'Lagos' },
    { id: 'f2', name: 'Tamara Ebiye', phone: '08030000002', community: 'Nembe', state: 'Bayelsa' },
    { id: 'f3', name: 'Chinedu Eze', phone: '08030000003', community: 'Bonny', state: 'Rivers' },
    { id: 'f4', name: 'Aisha Bello', phone: '08030000004', community: 'Warri', state: 'Delta' }
  ];
  var EMBEDDED_TX = [
    { id: 't1', fisherman_id: 'f1', kind: 'TOPUP', amount: 20000, note: 'Demo top-up', created_at: '2026-11-10T10:00:00Z' },
    { id: 't2', fisherman_id: 'f2', kind: 'TOPUP', amount: 15000, note: 'Demo top-up', created_at: '2026-11-10T10:00:00Z' },
    { id: 't3', fisherman_id: 'f3', kind: 'TOPUP', amount: 10000, note: 'Demo top-up', created_at: '2026-11-10T10:00:00Z' },
    { id: 't4', fisherman_id: 'f4', kind: 'TOPUP', amount: 12000, note: 'Demo top-up', created_at: '2026-11-10T10:00:00Z' },
    { id: 't5', fisherman_id: 'f1', kind: 'PREMIUM', amount: -1500, note: 'Weekly premium — Boat & Net Cover (FS-7K2P9Q)', created_at: '2026-11-10T11:00:00Z' },
    { id: 't6', fisherman_id: 'f2', kind: 'PREMIUM', amount: -1000, note: 'Weekly premium — Catch Loss Cover (FS-9M4D2X)', created_at: '2026-11-10T11:00:00Z' }
  ];
  var EMBEDDED_POLICIES = [
    { id: 'pol1', code: 'FS-7K2P9Q', fisherman_id: 'f1', plan_id: 'p1', plan_name: 'Boat & Net Cover', premium: 1500, cover_limit: 150000, start_date: '2026-11-04', end_date: '2026-12-02', status: 'ACTIVE', created_at: '2026-11-04T09:00:00Z' },
    { id: 'pol2', code: 'FS-9M4D2X', fisherman_id: 'f2', plan_id: 'p2', plan_name: 'Catch Loss Cover', premium: 1000, cover_limit: 80000, start_date: '2026-11-08', end_date: '2026-12-06', status: 'ACTIVE', created_at: '2026-11-08T09:00:00Z' }
  ];
  var EMBEDDED_CLAIMS = [
    { id: 'c1', code: 'CLM-3H8K2M', policy_id: 'pol1', fisherman_id: 'f1', plan_name: 'Boat & Net Cover', description: 'Storm damaged my boat engine and tore two fishing nets on the way back from the creek.', amount: 45000, photo_data: '', status: 'PENDING', decision_note: '', created_at: '2026-11-10T12:00:00Z', decided_at: null }
  ];

  function lsRead(key, seed) {
    try {
      var raw = localStorage.getItem(LS_PREFIX + key);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* fall through */ }
    var copy = JSON.parse(JSON.stringify(seed || []));
    lsWrite(key, copy);
    return copy;
  }
  function lsWrite(key, val) {
    try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(val)); } catch (e) {}
  }
  function uid() {
    return (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
      : 'id-' + Date.now() + '-' + Math.floor(Math.random() * 1e9);
  }
  function code(prefix) {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', out = '';
    for (var i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return prefix + '-' + out;
  }
  function todayISO(offsetDays) {
    var d = new Date();
    if (offsetDays) d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  }

  async function rest(table, opts) {
    opts = opts || {};
    var method = opts.method || 'GET';
    var url = BASE + '/' + table + (opts.query || '');
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 5000);
    try {
      var res = await fetch(url, {
        method: method,
        headers: {
          'apikey': KEY,
          'Authorization': 'Bearer ' + KEY,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        signal: ctrl.signal
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var data = await res.json();
      return data;
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
  }

  async function isOnline() {
    if (ONLINE !== null) return ONLINE;
    if (!BASE || !KEY) { ONLINE = false; return false; }
    try {
      await rest('fs_plans', { query: '?select=id&limit=1' });
      ONLINE = true;
    } catch (e) { ONLINE = false; }
    return ONLINE;
  }

  var DB = {
    isOnline: isOnline,
    online: function () { return ONLINE; },
    todayISO: todayISO,
    code: code,

    async getPlans() {
      if (await isOnline()) {
        try {
          var rows = await rest('fs_plans', { query: '?select=*&active=eq.true&order=sort' });
          if (rows && rows.length) return rows;
        } catch (e) { ONLINE = false; }
      }
      return lsRead('plans', EMBEDDED_PLANS);
    },

    async findFishermanByPhone(phone) {
      phone = String(phone || '').replace(/\D/g, '');
      if (await isOnline()) {
        try {
          var rows = await rest('fs_fishermen', { query: '?select=*&phone=eq.' + encodeURIComponent(phone) + '&limit=1' });
          if (rows && rows.length) return rows[0];
          return null;
        } catch (e) { ONLINE = false; }
      }
      var all = lsRead('fishermen', EMBEDDED_FISHERMEN);
      return all.find(function (f) { return String(f.phone).replace(/\D/g, '') === phone; }) || null;
    },

    async createFisherman(data) {
      var row = { name: data.name, phone: data.phone, community: data.community, state: data.state };
      if (await isOnline()) {
        try {
          var rows = await rest('fs_fishermen', { method: 'POST', body: row });
          if (rows && rows.length) return rows[0];
        } catch (e) { ONLINE = false; }
      }
      row.id = uid();
      row.created_at = new Date().toISOString();
      var all = lsRead('fishermen', EMBEDDED_FISHERMEN);
      all.push(row);
      lsWrite('fishermen', all);
      return row;
    },

    async getAllFishermen() {
      if (await isOnline()) {
        try {
          var rows = await rest('fs_fishermen', { query: '?select=*&order=created_at.desc' });
          if (rows) return rows;
        } catch (e) { ONLINE = false; }
      }
      return lsRead('fishermen', EMBEDDED_FISHERMEN).slice().reverse();
    },

    async getPolicies(fishermanId) {
      if (await isOnline()) {
        try {
          var rows = await rest('fs_policies', { query: '?select=*&fisherman_id=eq.' + fishermanId + '&order=created_at.desc' });
          if (rows) return rows;
        } catch (e) { ONLINE = false; }
      }
      return lsRead('policies', EMBEDDED_POLICIES)
        .filter(function (p) { return p.fisherman_id === fishermanId; })
        .sort(function (a, b) { return (b.created_at || '').localeCompare(a.created_at || ''); });
    },

    async getAllPolicies() {
      if (await isOnline()) {
        try {
          var rows = await rest('fs_policies', { query: '?select=*&order=created_at.desc' });
          if (rows) return rows;
        } catch (e) { ONLINE = false; }
      }
      return lsRead('policies', EMBEDDED_POLICIES).slice().reverse();
    },

    async getWalletTx(fishermanId) {
      if (await isOnline()) {
        try {
          var rows = await rest('fs_wallet_tx', { query: '?select=*&fisherman_id=eq.' + fishermanId + '&order=created_at.desc' });
          if (rows) return rows;
        } catch (e) { ONLINE = false; }
      }
      return lsRead('wallet_tx', EMBEDDED_TX)
        .filter(function (t) { return t.fisherman_id === fishermanId; })
        .sort(function (a, b) { return (b.created_at || '').localeCompare(a.created_at || ''); });
    },

    async getAllWalletTx() {
      if (await isOnline()) {
        try {
          var rows = await rest('fs_wallet_tx', { query: '?select=*&order=created_at.desc&limit=200' });
          if (rows) return rows;
        } catch (e) { ONLINE = false; }
      }
      return lsRead('wallet_tx', EMBEDDED_TX).slice().reverse();
    },

    async walletBalance(fishermanId) {
      var tx = await this.getWalletTx(fishermanId);
      return tx.reduce(function (a, t) { return a + Number(t.amount || 0); }, 0);
    },

    async addTx(tx) {
      if (await isOnline()) {
        try {
          var rows = await rest('fs_wallet_tx', { method: 'POST', body: tx });
          if (rows && rows.length) return rows[0];
        } catch (e) { ONLINE = false; }
      }
      tx.id = uid();
      tx.created_at = new Date().toISOString();
      var all = lsRead('wallet_tx', EMBEDDED_TX);
      all.push(tx);
      lsWrite('wallet_tx', all);
      return tx;
    },

    async buyPolicy(fishermanId, plan) {
      var bal = await this.walletBalance(fishermanId);
      if (bal < plan.premium) {
        var err = new Error('Insufficient wallet balance');
        err.code = 'INSUFFICIENT';
        throw err;
      }
      var pol = {
        code: code('FS'),
        fisherman_id: fishermanId,
        plan_id: plan.id,
        plan_name: plan.name,
        premium: plan.premium,
        cover_limit: plan.cover_limit,
        start_date: todayISO(0),
        end_date: todayISO((plan.duration_weeks || 4) * 7),
        status: 'ACTIVE'
      };
      if (await isOnline()) {
        try {
          var rows = await rest('fs_policies', { method: 'POST', body: pol });
          if (rows && rows.length) pol = rows[0];
          await this.addTx({ fisherman_id: fishermanId, kind: 'PREMIUM', amount: -plan.premium, note: 'Weekly premium — ' + plan.name + ' (' + pol.code + ')' });
          return pol;
        } catch (e) { ONLINE = false; }
      }
      pol.id = uid();
      pol.created_at = new Date().toISOString();
      var all = lsRead('policies', EMBEDDED_POLICIES);
      all.push(pol);
      lsWrite('policies', all);
      await this.addTx({ fisherman_id: fishermanId, kind: 'PREMIUM', amount: -plan.premium, note: 'Weekly premium — ' + plan.name + ' (' + pol.code + ')' });
      return pol;
    },

    async fileClaim(data) {
      var claim = {
        code: code('CLM'),
        policy_id: data.policy_id,
        fisherman_id: data.fisherman_id,
        plan_name: data.plan_name,
        description: data.description,
        amount: data.amount,
        photo_data: data.photo_data || '',
        status: 'PENDING',
        decision_note: ''
      };
      if (await isOnline()) {
        try {
          var rows = await rest('fs_claims', { method: 'POST', body: claim });
          if (rows && rows.length) return rows[0];
        } catch (e) { ONLINE = false; }
      }
      claim.id = uid();
      claim.created_at = new Date().toISOString();
      claim.decided_at = null;
      var all = lsRead('claims', EMBEDDED_CLAIMS);
      all.push(claim);
      lsWrite('claims', all);
      return claim;
    },

    async getClaims(fishermanId) {
      if (await isOnline()) {
        try {
          var rows = await rest('fs_claims', { query: '?select=*&fisherman_id=eq.' + fishermanId + '&order=created_at.desc' });
          if (rows) return rows;
        } catch (e) { ONLINE = false; }
      }
      return lsRead('claims', EMBEDDED_CLAIMS)
        .filter(function (c) { return c.fisherman_id === fishermanId; })
        .sort(function (a, b) { return (b.created_at || '').localeCompare(a.created_at || ''); });
    },

    async getAllClaims() {
      if (await isOnline()) {
        try {
          var rows = await rest('fs_claims', { query: '?select=*&order=created_at.desc' });
          if (rows) return rows;
        } catch (e) { ONLINE = false; }
      }
      return lsRead('claims', EMBEDDED_CLAIMS).slice().reverse();
    },

    async decideClaim(claimId, status, note, payoutAmount) {
      if (await isOnline()) {
        try {
          var rows = await rest('fs_claims', {
            method: 'PATCH',
            query: '?id=eq.' + claimId,
            body: { status: status, decision_note: note || '', decided_at: new Date().toISOString() }
          });
          if (rows && rows.length) {
            if (status === 'APPROVED' && payoutAmount > 0) {
              await this.addTx({ fisherman_id: rows[0].fisherman_id, kind: 'CLAIM_PAYOUT', amount: payoutAmount, note: 'Claim payout — ' + rows[0].code });
            }
            return rows[0];
          }
        } catch (e) { ONLINE = false; }
      }
      var all = lsRead('claims', EMBEDDED_CLAIMS);
      var claim = all.find(function (c) { return String(c.id) === String(claimId); });
      if (!claim) throw new Error('Claim not found');
      claim.status = status;
      claim.decision_note = note || '';
      claim.decided_at = new Date().toISOString();
      lsWrite('claims', all);
      if (status === 'APPROVED' && payoutAmount > 0) {
        await this.addTx({ fisherman_id: claim.fisherman_id, kind: 'CLAIM_PAYOUT', amount: payoutAmount, note: 'Claim payout — ' + claim.code });
      }
      return claim;
    }
  };

  window.FSDB = DB;
})();
