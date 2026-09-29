/* ═══════════════════════════════════════════════════════════════
   sheets-sync.service.js — Lógica compartida de sincronización
   con Google Sheets, usada por Configuración y por la carga
   automática al iniciar la app.

   ARQUITECTURA — IDs estables + fusión bidireccional:

   1) Cada grupo/clase/horario/estudiante viaja con su ID real y su
      fecha de última modificación (columna "ActualizadoEn").

   2) Sincronizar SIEMPRE es: traer lo último de Sheets → fusionar con
      lo local por ID (gana el más reciente por ActualizadoEn) → aplicar
      los borrados registrados (pestaña "Eliminados") → subir el
      resultado. Nunca se sube la copia local "a ciegas".

   3) Si NO hay cambios locales pendientes, simplemente se reemplaza lo
      local por lo de la hoja.

   4) Todas las sincronizaciones pasan por una sola cola: si llega una
      mientras otra está corriendo, se ejecuta una vez más al terminar.

   5) La asistencia por clase (asistencia / asistenciaLista) también
      viaja a la hoja.

   Se mantiene un formato "legado" (por nombre, sin columna ID) por
   compatibilidad con hojas viejas.
═══════════════════════════════════════════════════════════════ */

var SheetsSyncService = (function () {
  'use strict';

  var _syncInFlight = null;
  var _syncAgain    = false;
  var _pullInFlight = null;

  var TABLES = ['grupos', 'clases', 'horario', 'estudiantes'];

  function toISODate(v) {
    if (!v) return '';
    if (typeof v === 'string') {
      var m = v.match(/^\d{4}-\d{2}-\d{2}/);
      if (m) return m[0];
      var d = new Date(v);
      return isNaN(d) ? '' : d.toISOString().slice(0, 10);
    }
    var d2 = new Date(v);
    return isNaN(d2) ? '' : d2.toISOString().slice(0, 10);
  }

  /** Normaliza una marca de tiempo leída de la hoja (texto ISO o fecha convertida por Sheets) */
  function _stamp(v) {
    if (!v) return '';
    var d = new Date(v.toString());
    return isNaN(d) ? '' : d.toISOString();
  }

  function _isSi(v) {
    var s = (v || '').toString().trim().toLowerCase();
    return s === 'sí' || s === 'si';
  }

  function _parseList(v) {
    if (!v) return [];
    try { var a = JSON.parse(v.toString()); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }

  /** Limpia una hora corrompida por la auto-conversión de fecha/hora de Sheets */
  function _cleanTimeValue(v) {
    if (!v) return '';
    var s = v.toString().trim();
    if (/^\d{1,2}:\d{2}$/.test(s)) return s;
    var m = s.match(/^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2}):(\d{2})/);
    if (m) {
      var totalMin = (+m[1] * 60 + +m[2]) - 300; // UTC → Bogotá (UTC-5)
      totalMin = ((totalMin % 1440) + 1440) % 1440;
      totalMin = Math.round(totalMin / 10) * 10;
      var h = Math.floor(totalMin / 60), mm = totalMin % 60;
      return (h < 10 ? '0' : '') + h + ':' + (mm < 10 ? '0' : '') + mm;
    }
    return s;
  }

  /** ¿Debe ganar el registro local frente al remoto? Gana el modificado más recientemente. */
  function _localWins(l, r) {
    var lu = l.updatedAt || '', ru = r.updatedAt || '';
    if (lu && ru) return lu >= ru;
    if (ru) return false;
    return true;
  }

  /** Combina dos listas por "id", sin duplicar. */
  function _mergeById(localArr, remoteArr) {
    var map = {};
    (remoteArr || []).forEach(function (r) { if (r && r.id) map[r.id] = r; });
    (localArr || []).forEach(function (l) {
      if (!l || !l.id) return;
      var r = map[l.id];
      map[l.id] = (!r || _localWins(l, r)) ? l : r;
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }

  /** Une los borrados locales y remotos (se conserva la fecha más reciente por id) */
  function _mergeTombstones(a, b) {
    var map = {};
    (a || []).concat(b || []).forEach(function (t) {
      if (!t || !t.id) return;
      if (!map[t.id] || t.at > map[t.id].at) map[t.id] = t;
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }

  /** Quita lo que fue borrado, salvo que se haya vuelto a editar DESPUÉS del borrado */
  function _applyTombstones(rows, tombs) {
    var by = {};
    tombs.forEach(function (t) { by[t.id] = t.at; });
    return rows.filter(function (r) {
      var at = by[r.id];
      return !(at && (!r.updatedAt || at >= r.updatedAt));
    });
  }

  /** Quita hijos cuyo grupo ya no existe */
  function _dropOrphans(m) {
    var ok = {};
    m.grupos.forEach(function (g) { ok[g.id] = true; });
    ['clases', 'horario', 'estudiantes'].forEach(function (t) {
      m[t] = m[t].filter(function (r) { return ok[r.groupId]; });
    });
    return m;
  }

  async function _token() { return (await DB.getCfg('sheetsToken')) || ''; }

  async function _fetchJson(url, init) {
    var res = await fetch(url, init);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  /** Trae y reconstruye (sin aplicar a la BD local) lo que hay en Sheets ahora mismo */
  async function _fetchRemote(url) {
    var token = await _token();
    var getUrl = token ? url + (url.indexOf('?') >= 0 ? '&' : '?') + 'token=' + encodeURIComponent(token) : url;
    var json = await _fetchJson(getUrl, { method: 'GET' });
    if (!json || !json.ok) return { ok: false, error: (json && json.error) || 'desconocido' };

    var gData = json.grupos      || { header: [], rows: [] };
    var cData = json.clases      || { header: [], rows: [] };
    var hData = json.horario     || { header: [], rows: [] };
    var eData = json.estudiantes || { header: [], rows: [] };
    var xData = json.eliminados  || { header: [], rows: [] };

    var tombs = xData.rows.map(function (r) {
      return { id: (r[0] || '').toString().trim(), tabla: (r[1] || '').toString().trim(), at: _stamp(r[2]) };
    }).filter(function (t) { return t.id && t.at; });

    if (!gData.rows.length && !cData.rows.length && !hData.rows.length && !eData.rows.length) {
      return { ok: true, empty: true, tombstones: tombs, data: { grupos: [], clases: [], horario: [], estudiantes: [] } };
    }

    var isNewFormat = (gData.header[0] || '').toString().trim().toUpperCase() === 'ID';
    var data = isNewFormat
      ? _reconstructStable(gData.rows, cData.rows, hData.rows, eData.rows)
      : _reconstructLegacyByName(gData.rows, cData.rows, hData.rows, eData.rows);

    return { ok: true, empty: false, tombstones: tombs, data: data };
  }

  function _counts(data) {
    return { gruposCount: data.grupos.length, clasesCount: data.clases.length,
             horarioCount: data.horario.length, estudiantesCount: data.estudiantes.length };
  }

  /** Sube el estado local actual (ya fusionado) a la hoja */
  async function _push(url) {
    var clases      = await ClassesService.getAll();
    var grupos      = await GroupsService.getAll();
    var horario     = await ScheduleService.getAll();
    var estudiantes = await DB.getAll('estudiantes');
    var tombs       = await DB.getTombstones();
    if (!grupos.length && !tombs.length) return { ok: false, error: 'No hay grupos para sincronizar.' };

    var payload = {
      token: await _token(),
      allowEmpty: !grupos.length,
      grupos: {
        header: ['ID', 'Nombre', 'Asignatura', 'Grado', 'Color', 'Icono', 'ActualizadoEn'],
        rows: grupos.map(function (g) {
          return [g.id, g.nombre || '', g.asignatura || '', g.grado || '', g.color || '', g.icono || '', g.updatedAt || ''];
        })
      },
      clases: {
        header: ['ID', 'GrupoID', 'Fecha', 'Periodo', 'Tema', 'Desarrollo', 'Tarea', 'FechaEntrega', 'Revisada', 'Observaciones', 'Cancelada', 'Motivo', 'Destacada', 'Asistencia', 'AsistenciaLista', 'ActualizadoEn'],
        rows: clases.map(function (c) {
          return [c.id, c.groupId, c.fecha, c.periodo, c.tema, c.desarrollo, c.tarea, c.fechaTarea,
                  +c.tareaRevisada ? 'Sí' : 'No', c.observaciones,
                  +c.cancelada ? 'Sí' : 'No', c.motivo || '', +c.destacado ? 'Sí' : 'No',
                  c.asistencia || '', JSON.stringify(c.asistenciaLista || []), c.updatedAt || ''];
        })
      },
      horario: {
        header: ['ID', 'GrupoID', 'Dia', 'HoraInicio', 'HoraFin', 'Aula', 'ActualizadoEn'],
        rows: horario.map(function (h) {
          return [h.id, h.groupId, h.dia, h.horaInicio, h.horaFin, h.aula || '', h.updatedAt || ''];
        })
      },
      estudiantes: {
        header: ['ID', 'GrupoID', 'Numero', 'Nombre', 'ActualizadoEn'],
        rows: estudiantes.map(function (s) {
          return [s.id, s.groupId, s.numero || '', s.nombre || '', s.updatedAt || ''];
        })
      },
      eliminados: {
        header: ['ID', 'Tabla', 'Fecha'],
        rows: tombs.map(function (t) { return [t.id, t.tabla, t.at]; })
      }
    };

    var json = await _fetchJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(JSON.stringify(payload))
    });
    if (!json || !json.ok) return { ok: false, error: (json && json.error) || 'desconocido' };
    await DB.clearDirty();
    return { ok: true, gruposCount: grupos.length, clasesCount: clases.length, horarioCount: horario.length, estudiantesCount: estudiantes.length };
  }

  /** Una pasada de sincronización: traer → fusionar → subir */
  async function _syncOnce(url, force) {
    var remote = await _fetchRemote(url);
    if (!remote.ok) return { ok: false, error: remote.error };

    var dirty = await DB.isDirty();

    if (!dirty && !force) {
      if (remote.empty) return { ok: true, empty: true, gruposCount: 0, clasesCount: 0, horarioCount: 0, estudiantesCount: 0 };
      await DB.importAll(remote.data);
      await DB.setTombstones(_mergeTombstones(await DB.getTombstones(), remote.tombstones));
      await DB.clearDirty();
      return Object.assign({ ok: true }, _counts(remote.data));
    }

    // Hay cambios locales sin subir (o sincronización forzada): fusionar con lo remoto.
    var local  = await DB.exportAll();
    var tombs  = _mergeTombstones(await DB.getTombstones(), remote.tombstones);
    var merged = {};
    TABLES.forEach(function (t) {
      merged[t] = _applyTombstones(_mergeById(local[t], remote.empty ? [] : remote.data[t]), tombs);
    });
    _dropOrphans(merged);

    await DB.setTombstones(tombs);
    await DB.importAll(merged); // guarda copia previa y revierte si falla
    return _push(url);
  }

  return {
    /**
     * Sincronización completa (traer → fusionar → subir). Serializada: si se pide
     * mientras otra está en curso, corre una vez más al terminar la actual.
     * opts.force: fusiona y sube aunque no haya cambios locales pendientes.
     * Devuelve {ok:true,...conteos} o {ok:false,error}.
     */
    /** Sincroniza con la nube (Firestore) si hay sesión; si no, con Google Sheets (modo antiguo). */
    sync(url, opts) {
      if (window.CloudSync && CloudSync.active()) return CloudSync.sync();
      return this.syncSheets(url, opts);
    },

    /** Sincronización con Google Sheets (respaldo / modo antiguo). */
    syncSheets(url, opts) {
      if (!url) return Promise.resolve({ ok: false, error: 'Falta la URL del Apps Script.' });
      var force = !!(opts && opts.force);
      if (_syncInFlight) { _syncAgain = true; return _syncInFlight; }
      _syncInFlight = (async function () {
        try {
          var r = await _syncOnce(url, force);
          while (_syncAgain && r.ok) { _syncAgain = false; r = await _syncOnce(url, false); }
          return r;
        } catch (err) {
          console.warn('[SheetsSync] sync falló:', err);
          return { ok: false, error: err.message || String(err) };
        } finally {
          _syncInFlight = null;
          _syncAgain = false;
        }
      })();
      return _syncInFlight;
    },

    /** "Sincronizar ahora" = sincronización completa forzada */
    push(url) { return this.sync(url, { force: true }); },

    /** Descarga las pestañas de la hoja y REEMPLAZA los datos locales (uso manual: "Cargar desde Sheets") */
    async pullAndReplace(url) {
      if (_pullInFlight) return _pullInFlight;
      _pullInFlight = (async function () {
        try {
          var r = await _fetchRemote(url);
          if (!r.ok) return { ok: false, error: r.error };
          if (r.empty) return { ok: true, empty: true, gruposCount: 0, clasesCount: 0, horarioCount: 0, estudiantesCount: 0 };

          await DB.importAll(r.data); // deja una copia previa en cfg 'preImportBackup'
          await DB.setTombstones(r.tombstones);
          await DB.clearDirty();
          return Object.assign({ ok: true }, _counts(r.data));
        } finally {
          _pullInFlight = null;
        }
      })();
      return _pullInFlight;
    },

    /** Sincronización automática (apertura de la app, cada 5 min). null si falla o no hay URL. */
    async autoSync(url) {
      var r = await this.sync(url);
      return r && r.ok ? r : null;
    },

    /** Sincroniza en segundo plano justo después de guardar algo. */
    pushInBackground() {
      DB.getCfg('sheetsUrl').then(function (url) {
        url = url || Utils.DEFAULT_SHEETS_URL;
        if (!url) return;
        SheetsSyncService.sync(url, { force: true }).then(function (r) {
          if (r.ok) console.log('[SheetsSync] Cambios sincronizados en segundo plano.');
          else console.warn('[SheetsSync] No se pudo sincronizar en segundo plano:', r.error);
        });
      });
    }
  };

  /* ── Reconstrucción con IDs estables (formato nuevo) ── */
  function _reconstructStable(gRows, cRows, hRows, eRows) {
    var now = new Date().toISOString();
    var grupos = [];
    var validIds = {};
    gRows.forEach(function (r) {
      var id     = (r[0] || '').toString().trim();
      var nombre = (r[1] || '').toString().trim();
      if (!id || !nombre) return;
      var up = _stamp(r[6]);
      grupos.push({
        id: id, nombre: nombre,
        asignatura: (r[2] || '').toString().trim(),
        grado:      (r[3] || '').toString().trim(),
        color:      (r[4] || '').toString().trim() || '#2D6A4F',
        icono:      (r[5] || '').toString().trim(),
        createdAt:  up || now,
        updatedAt:  up
      });
      validIds[id] = true;
    });

    var clases = [];
    cRows.forEach(function (r) {
      var id      = (r[0] || '').toString().trim();
      var grupoId = (r[1] || '').toString().trim();
      if (!id || !validIds[grupoId]) return;
      var up = _stamp(r[15]);
      clases.push({
        id: id, groupId: grupoId,
        fecha:         toISODate(r[2]),
        periodo:       (r[3] || '').toString(),
        tema:          (r[4] || '').toString(),
        desarrollo:    (r[5] || '').toString(),
        tarea:         (r[6] || '').toString(),
        fechaTarea:    toISODate(r[7]),
        tareaRevisada: _isSi(r[8]) ? 1 : 0,
        observaciones: (r[9] || '').toString(),
        cancelada:     _isSi(r[10]) ? 1 : 0,
        motivo:        (r[11] || '').toString(),
        destacado:     _isSi(r[12]) ? 1 : 0,
        asistencia:      (r[13] || '').toString(),
        asistenciaLista: _parseList(r[14]),
        createdAt: up || now, updatedAt: up
      });
    });

    var horario = [];
    hRows.forEach(function (r) {
      var id      = (r[0] || '').toString().trim();
      var grupoId = (r[1] || '').toString().trim();
      var dia     = +r[2];
      if (!id || !validIds[grupoId] || isNaN(dia)) return;
      horario.push({
        id: id, groupId: grupoId, dia: dia,
        horaInicio: _cleanTimeValue(r[3]),
        horaFin:    _cleanTimeValue(r[4]),
        aula:       (r[5] || '').toString(),
        updatedAt:  _stamp(r[6])
      });
    });

    var estudiantes = [];
    eRows.forEach(function (r) {
      var id      = (r[0] || '').toString().trim();
      var grupoId = (r[1] || '').toString().trim();
      var nombre  = (r[3] || '').toString().trim();
      if (!id || !validIds[grupoId] || !nombre) return;
      var up = _stamp(r[4]);
      estudiantes.push({
        id: id, groupId: grupoId,
        numero: +r[2] || 0, nombre: nombre,
        createdAt: up || now, updatedAt: up
      });
    });

    return { grupos: grupos, clases: clases, horario: horario, estudiantes: estudiantes };
  }

  /* ── Reconstrucción legada por coincidencia de nombre (hojas viejas sin columna ID) ── */
  function _reconstructLegacyByName(gRows, cRows, hRows, eRows) {
    var grupos = [];
    var gMap = {};
    function keyOf(n, a, gr) { return n + '|' + a + '|' + gr; }
    function ensureGroup(nombre, asignatura, grado, color, icono) {
      var key = keyOf(nombre, asignatura, grado);
      if (!gMap[key]) {
        var g = { id: Utils.id(), nombre: nombre, asignatura: asignatura, grado: grado, color: color || '#2D6A4F', icono: icono || '', createdAt: new Date().toISOString() };
        gMap[key] = g;
        grupos.push(g);
      }
      return gMap[key];
    }

    gRows.forEach(function (r) {
      var nombre = (r[0] || '').toString().trim();
      if (!nombre) return;
      ensureGroup(nombre, (r[1] || '').toString().trim(), (r[2] || '').toString().trim(), (r[3] || '').toString().trim());
    });

    var clases = [];
    cRows.forEach(function (r) {
      var nombre = (r[0] || '').toString().trim();
      if (!nombre) return;
      var g = ensureGroup(nombre, (r[1] || '').toString().trim(), (r[2] || '').toString().trim());
      clases.push({
        id: Utils.id(), groupId: g.id,
        fecha: toISODate(r[3]), periodo: (r[4] || '').toString(), tema: (r[5] || '').toString(),
        desarrollo: (r[6] || '').toString(), tarea: (r[7] || '').toString(), fechaTarea: toISODate(r[8]),
        tareaRevisada: _isSi(r[9]) ? 1 : 0, observaciones: (r[10] || '').toString(),
        cancelada: _isSi(r[11]) ? 1 : 0, motivo: (r[12] || '').toString(), destacado: 0,
        asistencia: '', asistenciaLista: [],
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      });
    });

    var horario = [];
    hRows.forEach(function (r) {
      var nombre = (r[0] || '').toString().trim();
      if (!nombre) return;
      var g = ensureGroup(nombre, (r[1] || '').toString().trim(), (r[2] || '').toString().trim());
      var dia = +r[3];
      if (isNaN(dia)) return;
      horario.push({ id: Utils.id(), groupId: g.id, dia: dia, horaInicio: _cleanTimeValue(r[4]), horaFin: _cleanTimeValue(r[5]), aula: (r[6] || '').toString() });
    });

    var estudiantes = [];
    eRows.forEach(function (r) {
      var nombre = (r[0] || '').toString().trim();
      if (!nombre) return;
      var g = ensureGroup(nombre, (r[1] || '').toString().trim(), (r[2] || '').toString().trim());
      var estNombre = (r[4] || '').toString().trim();
      if (!estNombre) return;
      estudiantes.push({ id: Utils.id(), groupId: g.id, numero: +r[3] || 0, nombre: estNombre, createdAt: new Date().toISOString() });
    });

    return { grupos: grupos, clases: clases, horario: horario, estudiantes: estudiantes };
  }
})();
