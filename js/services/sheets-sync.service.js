/* ═══════════════════════════════════════════════════════════════
   sheets-sync.service.js — Lógica compartida de sincronización
   con Google Sheets (subir / bajar), usada por Configuración y
   por la carga automática al iniciar la app.

   ARQUITECTURA — IDs estables + fusión (no solo "reemplazar todo"):

   1) Cada grupo/clase/horario/estudiante viaja con su ID real (columna
      "ID" en la hoja). Al bajar, esos MISMOS IDs se reutilizan en vez
      de generar unos nuevos al azar — así una pantalla abierta en otro
      dispositivo no queda apuntando a un grupo que "ya no existe".

   2) Cuando hay cambios locales sin subir Y llega el momento de
      sincronizar, la app ya NO sube su versión local a ciegas
      (eso podía borrar cosas que otro dispositivo acababa de agregar,
      ej. "copiar tarea" hecho en el PC que nunca llegaba al celular).
      En vez de eso: primero trae lo último de Sheets, lo FUSIONA con
      lo local (por ID, sin duplicar), y sube el resultado ya fusionado.
      Así ningún cambio de ningún dispositivo se pierde por una
      sincronización que llega en mal momento.

   Se mantiene un formato "legado" (por nombre, sin columna ID) por
   compatibilidad con hojas viejas.
═══════════════════════════════════════════════════════════════ */

var SheetsSyncService = (function () {
  'use strict';

  var _pushInFlight = null;
  var _pullInFlight = null;

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

  function _isSi(v) {
    var s = (v || '').toString().trim().toLowerCase();
    return s === 'sí' || s === 'si';
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

  /** Combina dos listas por "id", sin duplicar. Ante un mismo ID en ambas,
   *  gana el más reciente (por updatedAt si existe), o el local por defecto. */
  function _mergeById(localArr, remoteArr) {
    var map = {};
    (remoteArr || []).forEach(function (r) { if (r && r.id) map[r.id] = r; });
    (localArr || []).forEach(function (l) {
      if (!l || !l.id) return;
      var r = map[l.id];
      if (!r) { map[l.id] = l; return; }
      if (l.updatedAt && r.updatedAt) map[l.id] = (l.updatedAt >= r.updatedAt) ? l : r;
      else map[l.id] = l;
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }

  /** Trae y reconstruye (sin aplicar a la BD local) lo que hay en Sheets ahora mismo */
  async function _fetchRemote(url) {
    var res  = await fetch(url, { method: 'GET' });
    var json = await res.json();
    if (!json || !json.ok) return { ok: false, error: (json && json.error) || 'desconocido' };

    var gData = json.grupos      || { header: [], rows: [] };
    var cData = json.clases      || { header: [], rows: [] };
    var hData = json.horario     || { header: [], rows: [] };
    var eData = json.estudiantes || { header: [], rows: [] };

    if (!gData.rows.length && !cData.rows.length && !hData.rows.length && !eData.rows.length) {
      return { ok: true, empty: true, data: { grupos: [], clases: [], horario: [], estudiantes: [] } };
    }

    var isNewFormat = (gData.header[0] || '').toString().trim().toUpperCase() === 'ID';
    var data = isNewFormat
      ? _reconstructStable(gData.rows, cData.rows, hData.rows, eData.rows)
      : _reconstructLegacyByName(gData.rows, cData.rows, hData.rows, eData.rows);

    return { ok: true, empty: false, data: data };
  }

  return {
    /** Sube grupos + clases + horario + estudiantes, cada uno con su ID real */
    async push(url) {
      if (_pushInFlight) return _pushInFlight;
      _pushInFlight = (async function () {
        try {
          var clases      = await ClassesService.getAll();
          var grupos      = await GroupsService.getAll();
          var horario     = await ScheduleService.getAll();
          var estudiantes = await DB.getAll('estudiantes');
          if (!grupos.length) return { ok: false, error: 'No hay grupos para sincronizar.' };

          var gruposPayload = {
            header: ['ID', 'Nombre', 'Asignatura', 'Grado', 'Color', 'Icono'],
            rows: grupos.map(function (g) {
              return [g.id, g.nombre || '', g.asignatura || '', g.grado || '', g.color || '', g.icono || ''];
            })
          };
          var clasesPayload = {
            header: ['ID', 'GrupoID', 'Fecha', 'Periodo', 'Tema', 'Desarrollo', 'Tarea', 'FechaEntrega', 'Revisada', 'Observaciones', 'Cancelada', 'Motivo', 'Destacada'],
            rows: clases.map(function (c) {
              return [c.id, c.groupId, c.fecha, c.periodo, c.tema, c.desarrollo, c.tarea, c.fechaTarea,
                      +c.tareaRevisada ? 'Sí' : 'No', c.observaciones,
                      +c.cancelada ? 'Sí' : 'No', c.motivo || '', +c.destacado ? 'Sí' : 'No'];
            })
          };
          var horarioPayload = {
            header: ['ID', 'GrupoID', 'Dia', 'HoraInicio', 'HoraFin', 'Aula'],
            rows: horario.map(function (h) {
              return [h.id, h.groupId, h.dia, h.horaInicio, h.horaFin, h.aula || ''];
            })
          };
          var estudiantesPayload = {
            header: ['ID', 'GrupoID', 'Numero', 'Nombre'],
            rows: estudiantes.map(function (s) {
              return [s.id, s.groupId, s.numero || '', s.nombre || ''];
            })
          };

          var res  = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'data=' + encodeURIComponent(JSON.stringify({
              grupos: gruposPayload, clases: clasesPayload, horario: horarioPayload, estudiantes: estudiantesPayload
            }))
          });
          var json = await res.json();
          if (!json || !json.ok) return { ok: false, error: (json && json.error) || 'desconocido' };
          await DB.clearDirty();
          return { ok: true, gruposCount: grupos.length, clasesCount: clases.length, horarioCount: horario.length, estudiantesCount: estudiantes.length };
        } finally {
          _pushInFlight = null;
        }
      })();
      return _pushInFlight;
    },

    /** Descarga las pestañas de la hoja y REEMPLAZA los datos locales (uso manual: "Cargar desde Sheets") */
    async pullAndReplace(url) {
      if (_pullInFlight) return _pullInFlight;
      _pullInFlight = (async function () {
        try {
          var r = await _fetchRemote(url);
          if (!r.ok) return { ok: false, error: r.error };
          if (r.empty) return { ok: true, empty: true, gruposCount: 0, clasesCount: 0, horarioCount: 0, estudiantesCount: 0 };

          await DB.importAll(r.data);
          await DB.clearDirty();
          return {
            ok: true,
            gruposCount: r.data.grupos.length, clasesCount: r.data.clases.length,
            horarioCount: r.data.horario.length, estudiantesCount: r.data.estudiantes.length
          };
        } finally {
          _pullInFlight = null;
        }
      })();
      return _pullInFlight;
    },

    /**
     * Sincronización automática para ejecutar en cada apertura de la app:
     * - Si NO hay cambios locales pendientes: simplemente baja lo último de Sheets.
     * - Si SÍ hay cambios locales pendientes: trae lo de Sheets, lo FUSIONA con
     *   lo local (sin perder nada de ningún lado) y sube el resultado fusionado.
     *   Esto evita que un cambio hecho en otro dispositivo (ej: una tarea
     *   copiada) se pierda si este dispositivo sincroniza justo después.
     */
    async autoSync(url) {
      if (!url) return null;
      try {
        var remote = await _fetchRemote(url);
        if (!remote.ok) return null;

        var dirty = await DB.isDirty();

        if (!dirty) {
          if (remote.empty) return { ok: true, empty: true, gruposCount: 0, clasesCount: 0, horarioCount: 0, estudiantesCount: 0 };
          await DB.importAll(remote.data);
          await DB.clearDirty();
          return {
            ok: true,
            gruposCount: remote.data.grupos.length, clasesCount: remote.data.clases.length,
            horarioCount: remote.data.horario.length, estudiantesCount: remote.data.estudiantes.length
          };
        }

        // Hay cambios locales sin subir: fusionar con lo remoto antes de nada.
        var local = await DB.exportAll();
        var merged = {
          grupos:      _mergeById(local.grupos,      remote.empty ? [] : remote.data.grupos),
          clases:      _mergeById(local.clases,      remote.empty ? [] : remote.data.clases),
          horario:     _mergeById(local.horario,     remote.empty ? [] : remote.data.horario),
          estudiantes: _mergeById(local.estudiantes, remote.empty ? [] : remote.data.estudiantes)
        };
        await DB.importAll(merged);

        var pushRes = await this.push(url);
        if (!pushRes.ok) return null; // el resultado fusionado queda aplicado localmente aunque no se haya podido subir
        return pushRes;
      } catch (err) {
        console.warn('[SheetsSync] autoSync falló:', err);
        return null;
      }
    },

    /**
     * Sube los cambios a Sheets EN SEGUNDO PLANO, sin bloquear ni esperar.
     * Se llama justo después de guardar algo (clase, horario, grupo, etc.).
     */
    pushInBackground() {
      DB.getCfg('sheetsUrl').then(function (url) {
        url = url || Utils.DEFAULT_SHEETS_URL;
        if (!url) return;
        SheetsSyncService.push(url).then(function (r) {
          if (r.ok) console.log('[SheetsSync] Cambios subidos en segundo plano.');
          else console.warn('[SheetsSync] No se pudo subir en segundo plano:', r.error);
        }).catch(function (err) {
          console.warn('[SheetsSync] Error subiendo en segundo plano:', err);
        });
      });
    }
  };

  /* ── Reconstrucción con IDs estables (formato nuevo) ── */
  function _reconstructStable(gRows, cRows, hRows, eRows) {
    var grupos = [];
    var validIds = {};
    gRows.forEach(function (r) {
      var id     = (r[0] || '').toString().trim();
      var nombre = (r[1] || '').toString().trim();
      if (!id || !nombre) return;
      grupos.push({
        id: id, nombre: nombre,
        asignatura: (r[2] || '').toString().trim(),
        grado:      (r[3] || '').toString().trim(),
        color:      (r[4] || '').toString().trim() || '#2D6A4F',
        icono:      (r[5] || '').toString().trim(),
        createdAt:  new Date().toISOString()
      });
      validIds[id] = true;
    });

    var clases = [];
    cRows.forEach(function (r) {
      var id      = (r[0] || '').toString().trim();
      var grupoId = (r[1] || '').toString().trim();
      if (!id || !validIds[grupoId]) return;
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
        asistencia: '', asistenciaLista: [],
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
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
        aula:       (r[5] || '').toString()
      });
    });

    var estudiantes = [];
    eRows.forEach(function (r) {
      var id      = (r[0] || '').toString().trim();
      var grupoId = (r[1] || '').toString().trim();
      var nombre  = (r[3] || '').toString().trim();
      if (!id || !validIds[grupoId] || !nombre) return;
      estudiantes.push({
        id: id, groupId: grupoId,
        numero: +r[2] || 0, nombre: nombre,
        createdAt: new Date().toISOString()
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
