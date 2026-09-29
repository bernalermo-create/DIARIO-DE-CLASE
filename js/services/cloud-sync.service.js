/* ═══════════════════════════════════════════════════════════════
   cloud-sync.service.js — Inicio de sesión con Google + sincronización
   con Firestore (reemplaza a Google Sheets como destino principal).

   Modelo:   users/{uid}/{grupos|clases|horario|estudiantes}/{id}
             users/{uid}/eliminados/{id}   ← registro de borrados
   Cada documento guarda el registro tal cual + "_sv" (hora del servidor,
   solo sirve como cursor de sincronización incremental).

   Algoritmo de cada pasada (misma lógica de fusión que ya se probó con Sheets):
   1) Traer SOLO lo nuevo desde el último cursor (_sv > cursor).
   2) Fusionar con lo local por id: gana el "updatedAt" más reciente.
   3) Aplicar borrados (un borrado gana salvo que se re-edite después).
   4) Subir SOLO lo que la nube aún no tiene (mapa id → updatedAt conocido).
   Nunca se sube "a ciegas" ni se descarga todo en cada pasada.
═══════════════════════════════════════════════════════════════ */

var CloudSync = (function () {
  'use strict';

  var TABLES = ['grupos', 'clases', 'horario', 'estudiantes'];
  var _auth = null, _db = null, _user = null;
  var _inFlight = null, _again = false, _skipped = false, _errShown = false;

  function available() {
    return typeof firebase !== 'undefined' && !!window.FIREBASE_CONFIG;
  }

  function col(name) {
    return _db.collection('users').doc(_user.uid).collection(name);
  }

  function clean(o) { return JSON.parse(JSON.stringify(o)); } // Firestore no acepta undefined

  function sig(arr) {
    return arr.map(function (x) { return x.id + '|' + (x.updatedAt || ''); }).sort().join(',');
  }

  function mergeTombstones(a, b) {
    var map = {};
    (a || []).concat(b || []).forEach(function (t) {
      if (!t || !t.id) return;
      if (!map[t.id] || t.at > map[t.id].at) map[t.id] = t;
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }

  function friendly(err) {
    var code = (err && err.code) || '';
    if (code.indexOf('permission-denied') >= 0) return 'Esta cuenta no tiene permiso sobre los datos (revisa las reglas de Firestore y la cuenta).';
    if (code.indexOf('unavailable') >= 0 || /network|offline/i.test((err && err.message) || '')) return 'Sin conexión con la nube.';
    return (err && err.message) || String(err);
  }

  async function _pass() {
    var cursorMs = +(await DB.getCfg('cloudCursor')) || 0;
    var known    = (await DB.getCfg('cloudKnown')) || {};      // id → updatedAt que la nube ya tiene
    var knownT   = (await DB.getCfg('cloudKnownTombs')) || {}; // id → true (borrados ya en la nube)
    var passStart = new Date().toISOString();
    var maxSv = cursorMs;

    /* 1) Traer lo nuevo */
    function query(name) {
      var c = col(name);
      return cursorMs ? c.where('_sv', '>', firebase.firestore.Timestamp.fromMillis(cursorMs)) : c;
    }
    var snaps = await Promise.all(TABLES.concat(['eliminados']).map(function (n) { return query(n).get(); }));
    var remote = {}, remoteTombs = [];
    TABLES.forEach(function (t, i) {
      remote[t] = [];
      snaps[i].forEach(function (d) {
        var r = d.data();
        if (r._sv) maxSv = Math.max(maxSv, r._sv.toMillis());
        delete r._sv;
        remote[t].push(r);
      });
    });
    snaps[TABLES.length].forEach(function (d) {
      var r = d.data();
      if (r._sv) maxSv = Math.max(maxSv, r._sv.toMillis());
      delete r._sv;
      remoteTombs.push(r);
      knownT[r.id] = true;
    });

    /* 2) y 3) Fusionar con lo local y aplicar borrados */
    var local = await DB.exportAll();
    var tombs = mergeTombstones(await DB.getTombstones(), remoteTombs);
    var tombAt = {};
    tombs.forEach(function (t) { tombAt[t.id] = t.at; });

    var merged = {};
    TABLES.forEach(function (t) {
      var map = {};
      local[t].forEach(function (l) { map[l.id] = l; });
      remote[t].forEach(function (r) {
        known[r.id] = r.updatedAt || '';
        var l = map[r.id];
        if (!l || (r.updatedAt || '') > (l.updatedAt || '')) map[r.id] = r;
      });
      merged[t] = Object.keys(map).map(function (k) {
        var rec = map[k];
        if (!rec.updatedAt) { rec = Object.assign({}, rec, { updatedAt: rec.createdAt || passStart }); }
        return rec;
      }).filter(function (rec) {
        var at = tombAt[rec.id];
        return !(at && at >= rec.updatedAt);
      });
    });
    var ok = {};
    merged.grupos.forEach(function (g) { ok[g.id] = true; });
    ['clases', 'horario', 'estudiantes'].forEach(function (t) {
      merged[t] = merged[t].filter(function (r) { return ok[r.groupId]; });
    });

    var changed = TABLES.some(function (t) { return sig(merged[t]) !== sig(local[t]); });
    if (changed) await DB.importAll(merged);
    await DB.setTombstones(tombs);

    /* 4) Subir solo lo que la nube no tiene */
    var ops = [];
    TABLES.forEach(function (t) {
      merged[t].forEach(function (rec) {
        if (known[rec.id] === rec.updatedAt) return;
        ops.push({ kind: 'set', ref: col(t).doc(rec.id), data: Object.assign(clean(rec), { _sv: firebase.firestore.FieldValue.serverTimestamp() }), id: rec.id, up: rec.updatedAt });
      });
    });
    tombs.forEach(function (t) {
      if (knownT[t.id]) return;
      if (TABLES.indexOf(t.tabla) >= 0) ops.push({ kind: 'del', ref: col(t.tabla).doc(t.id) });
      ops.push({ kind: 'set', ref: col('eliminados').doc(t.id), data: { id: t.id, tabla: t.tabla, at: t.at, _sv: firebase.firestore.FieldValue.serverTimestamp() }, tomb: t.id });
    });

    for (var i = 0; i < ops.length; i += 400) {
      var batch = _db.batch();
      ops.slice(i, i + 400).forEach(function (op) {
        if (op.kind === 'del') batch.delete(op.ref); else batch.set(op.ref, op.data);
      });
      await batch.commit();
      ops.slice(i, i + 400).forEach(function (op) {
        if (op.id) known[op.id] = op.up;
        if (op.tomb) knownT[op.tomb] = true;
      });
    }

    /* Guardar estado de sincronización (margen de 5 s: releer es inofensivo, perder no) */
    await DB.setCfg('cloudKnown', known);
    await DB.setCfg('cloudKnownTombs', knownT);
    if (maxSv > cursorMs) await DB.setCfg('cloudCursor', maxSv - 5000);
    await DB.clearDirty();

    return { ok: true, gruposCount: merged.grupos.length, clasesCount: merged.clases.length,
             horarioCount: merged.horario.length, estudiantesCount: merged.estudiantes.length,
             subidos: ops.length, descargados: TABLES.reduce(function (n, t) { return n + remote[t].length; }, 0) };
  }

  return {
    available: available,

    /** Prepara Firebase y espera el estado de sesión. Devuelve el usuario o null. */
    async init() {
      if (!available()) return null;
      if (!_auth) {
        if (!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);
        _auth = firebase.auth();
        _db   = firebase.firestore();
        try { await _auth.getRedirectResult(); } catch (e) { console.warn('[Cloud] redirect:', e); }
        _user = await new Promise(function (res) {
          var un = _auth.onAuthStateChanged(function (u) { un(); res(u); });
        });
        _auth.onAuthStateChanged(function (u) { _user = u; });
      }
      return _user;
    },

    user() { return _user; },
    active() { return !!(_user && _db && !_skipped); },
    skip() { _skipped = true; },

    async signIn() {
      var provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      try {
        var res = await _auth.signInWithPopup(provider);
        _user = res.user;
      } catch (err) {
        if (err.code === 'auth/popup-blocked' || err.code === 'auth/operation-not-supported-in-this-environment') {
          await _auth.signInWithRedirect(provider); // la página se recarga al volver
          return null;
        }
        throw err;
      }
      return _user;
    },

    async signOut() {
      await _auth.signOut();
      _user = null;
    },

    /** Sincronización serializada; si se pide durante otra, corre una vez más al terminar. */
    sync() {
      if (!this.active()) return Promise.resolve({ ok: false, error: 'Sin sesión en la nube.' });
      if (_inFlight) { _again = true; return _inFlight; }
      _inFlight = (async function () {
        try {
          var r = await _pass();
          while (_again) { _again = false; r = await _pass(); }
          _errShown = false;
          return r;
        } catch (err) {
          console.warn('[Cloud] sync falló:', err);
          var msg = friendly(err);
          if (!_errShown && typeof Toast !== 'undefined' && /permiso/.test(msg)) { _errShown = true; Toast.error(msg); }
          return { ok: false, error: msg };
        } finally {
          _inFlight = null;
          _again = false;
        }
      })();
      return _inFlight;
    }
  };
})();
