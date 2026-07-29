/* ═══════════════════════════════════════════════════════════════
   sheets-sync.service.js — Lógica compartida de sincronización
   con Google Sheets (subir / bajar), usada por Configuración y
   por la carga automática al iniciar la app.

   IMPORTANTE — arquitectura de IDs estables:
   Cada grupo/clase/horario/estudiante viaja con su ID real (columna
   "ID" en la hoja). Al bajar (pull), esos MISMOS IDs se reutilizan
   en vez de generar unos nuevos al azar. Esto es crítico: si los IDs
   cambiaran en cada sincronización, cualquier pantalla abierta en ese
   momento (registrando una clase, editando un horario) quedaría
   apuntando a un grupo que ya no existe, y ese cambio se perdería en
   la siguiente sincronización — que es exactamente lo que causaba
   que el horario o las clases "se borraran" solos.

   Se mantiene un formato "legado" (por nombre, sin columna ID) por
   compatibilidad con hojas viejas: si detecta que la hoja no tiene
   columna ID, reconstruye por nombre como antes (comportamiento
   anterior), y a partir de la primera subida ya queda con IDs
   estables para siempre.
═══════════════════════════════════════════════════════════════ */

var SheetsSyncService = (function () {
  'use strict';

  var _pushInFlight = null; // evita disparar dos "push" al mismo tiempo (causa de corrupción)
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

  /**
   * Limpia un valor de hora que pudo haberse corrompido por la auto-conversión
   * de fecha/hora de Google Sheets (ej: "1899-12-30T11:16:16.000Z" → "06:20").
   */
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

  return {
    /** Sube grupos + clases + horario + estudiantes, cada uno con su ID real */
    async push(url) {
      // Si ya hay un push en curso, esperar a que termine y devolver ese resultado
      // (evita dos escrituras concurrentes que puedan corromper la hoja).
      if (_pushInFlight) return _pushInFlight;

      var self = this;
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

    /** Descarga las pestañas de la hoja y reemplaza los datos locales, preservando IDs */
    async pullAndReplace(url) {
      if (_pullInFlight) return _pullInFlight;

      _pullInFlight = (async function () {
        try {
          var res  = await fetch(url, { method: 'GET' });
          var json = await res.json();
          if (!json || !json.ok) return { ok: false, error: (json && json.error) || 'desconocido' };

          var gData = json.grupos      || { header: [], rows: [] };
          var cData = json.clases      || { header: [], rows: [] };
          var hData = json.horario     || { header: [], rows: [] };
          var eData = json.estudiantes || { header: [], rows: [] };

          if (!gData.rows.length && !cData.rows.length && !hData.rows.length && !eData.rows.length) {
            return { ok: true, empty: true, gruposCount: 0, clasesCount: 0, horarioCount: 0, estudiantesCount: 0 };
          }

          var isNewFormat = (gData.header[0] || '').toString().trim().toUpperCase() === 'ID';

          var gruposNuevos, clasesNuevas, horarioNuevo, estudiantesNuevo;

          if (isNewFormat) {
            var r = _reconstructStable(gData.rows, cData.rows, hData.rows, eData.rows);
            gruposNuevos = r.grupos; clasesNuevas = r.clases; horarioNuevo = r.horario; estudiantesNuevo = r.estudiantes;
          } else {
            var r2 = _reconstructLegacyByName(gData.rows, cData.rows, hData.rows, eData.rows);
            gruposNuevos = r2.grupos; clasesNuevas = r2.clases; horarioNuevo = r2.horario; estudiantesNuevo = r2.estudiantes;
          }

          await DB.importAll({ grupos: gruposNuevos, clases: clasesNuevas, horario: horarioNuevo, estudiantes: estudiantesNuevo });
          await DB.clearDirty();
          return { ok: true, gruposCount: gruposNuevos.length, clasesCount: clasesNuevas.length, horarioCount: horarioNuevo.length, estudiantesCount: estudiantesNuevo.length };
        } finally {
          _pullInFlight = null;
        }
      })();

      return _pullInFlight;
    },

    /**
     * Sincronización automática segura para ejecutar en cada apertura de la app:
     * - Si hay cambios locales sin subir, los sube primero (para no perderlos).
     * - Si esa subida falla (ej: sin internet), NO baja nada, para no arriesgar
     *   sobrescribir cambios locales pendientes con una versión vieja de Sheets.
     * - Si no hay cambios pendientes, simplemente baja lo último de Sheets.
     */
    async autoSync(url) {
      if (!url) return null;
      try {
        var dirty = await DB.isDirty();
        if (dirty) {
          var pushRes = await this.push(url);
          if (!pushRes.ok) return null;
        }
        return await this.pullAndReplace(url);
      } catch (err) {
        console.warn('[SheetsSync] autoSync falló:', err);
        return null;
      }
    },

    /**
     * Sube los cambios a Sheets EN SEGUNDO PLANO, sin bloquear ni esperar.
     * Se llama justo después de guardar algo (clase, horario, grupo, etc.)
     * para que el cambio no dependa de reabrir la app más tarde.
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
      if (!id || !validIds[grupoId]) return; // huérfano real (grupo eliminado): se omite
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
    var gMap = {}; // key nombre|asignatura|grado -> grupo nuevo
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
