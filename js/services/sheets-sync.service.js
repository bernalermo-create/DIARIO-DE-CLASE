/* ═══════════════════════════════════════════════════════════════
   sheets-sync.service.js — Lógica compartida de sincronización
   con Google Sheets (subir / bajar), usada por Configuración y
   por la carga automática al iniciar la app.
═══════════════════════════════════════════════════════════════ */

var SheetsSyncService = (function () {
  'use strict';

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

  return {
    /** Sube grupos + clases + horario + estudiantes locales a las pestañas de la hoja */
    async push(url) {
      var clases      = await ClassesService.getAll();
      var grupos      = await GroupsService.getAll();
      var horario     = await ScheduleService.getAll();
      var estudiantes = await DB.getAll('estudiantes');
      if (!grupos.length) return { ok: false, error: 'No hay grupos para sincronizar.' };

      var gMap = {};
      grupos.forEach(function (g) { gMap[g.id] = g; });

      var gruposPayload = {
        header: ['Nombre', 'Asignatura', 'Grado', 'Color'],
        rows: grupos.map(function (g) {
          return [g.nombre || '', g.asignatura || '', g.grado || '', g.color || ''];
        })
      };
      var clasesPayload = {
        header: ['Grupo', 'Asignatura', 'Grado', 'Fecha', 'Periodo', 'Tema', 'Desarrollo', 'Tarea', 'Fecha entrega', 'Revisada', 'Observaciones', 'Cancelada', 'Motivo'],
        rows: clases.map(function (c) {
          var g = gMap[c.groupId] || {};
          return [g.nombre || '', g.asignatura || '', g.grado || '', c.fecha, c.periodo, c.tema,
                  c.desarrollo, c.tarea, c.fechaTarea,
                  +c.tareaRevisada ? 'Sí' : 'No', c.observaciones,
                  +c.cancelada ? 'Sí' : 'No', c.motivo || ''];
        })
      };
      var horarioPayload = {
        header: ['Grupo', 'Asignatura', 'Grado', 'Dia', 'HoraInicio', 'HoraFin', 'Aula'],
        rows: horario.map(function (h) {
          var g = gMap[h.groupId] || {};
          return [g.nombre || '', g.asignatura || '', g.grado || '', h.dia, h.horaInicio, h.horaFin, h.aula || ''];
        })
      };
      var estudiantesPayload = {
        header: ['Grupo', 'Asignatura', 'Grado', 'Numero', 'Nombre'],
        rows: estudiantes.map(function (s) {
          var g = gMap[s.groupId] || {};
          return [g.nombre || '', g.asignatura || '', g.grado || '', s.numero || '', s.nombre || ''];
        })
      };

      var res  = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(JSON.stringify({ grupos: gruposPayload, clases: clasesPayload, horario: horarioPayload, estudiantes: estudiantesPayload }))
      });
      var json = await res.json();
      if (!json || !json.ok) return { ok: false, error: (json && json.error) || 'desconocido' };
      await DB.clearDirty();
      return { ok: true, gruposCount: grupos.length, clasesCount: clases.length, horarioCount: horario.length, estudiantesCount: estudiantes.length };
    },

    /** Descarga las pestañas de la hoja y reemplaza los datos locales */
    async pullAndReplace(url) {
      var res  = await fetch(url, { method: 'GET' });
      var json = await res.json();
      if (!json || !json.ok) return { ok: false, error: (json && json.error) || 'desconocido' };

      var gRows = (json.grupos && json.grupos.rows) || [];
      var cRows = (json.clases && json.clases.rows) || [];
      var hRows = (json.horario && json.horario.rows) || [];
      var eRows = (json.estudiantes && json.estudiantes.rows) || [];
      if (!gRows.length && !cRows.length && !hRows.length && !eRows.length) return { ok: true, empty: true, gruposCount: 0, clasesCount: 0, horarioCount: 0, estudiantesCount: 0 };

      var gruposNuevos = [];
      var gMap = {};
      function keyOf(nombre, asignatura, grado) { return nombre + '|' + asignatura + '|' + grado; }
      function ensureGroup(nombre, asignatura, grado, color) {
        var key = keyOf(nombre, asignatura, grado);
        if (!gMap[key]) {
          var g = { id: Utils.id(), nombre: nombre, asignatura: asignatura, grado: grado, color: color || '#2D6A4F', createdAt: new Date().toISOString() };
          gMap[key] = g;
          gruposNuevos.push(g);
        }
        return gMap[key];
      }

      gRows.forEach(function (r) {
        var nombre = (r[0] || '').toString().trim();
        if (!nombre) return;
        ensureGroup(nombre, (r[1] || '').toString().trim(), (r[2] || '').toString().trim(), (r[3] || '').toString().trim());
      });

      var clasesNuevas = [];
      cRows.forEach(function (r) {
        var nombre = (r[0] || '').toString().trim();
        if (!nombre) return;
        var g = ensureGroup(nombre, (r[1] || '').toString().trim(), (r[2] || '').toString().trim());
        clasesNuevas.push({
          id:            Utils.id(),
          groupId:       g.id,
          fecha:         toISODate(r[3]),
          periodo:       (r[4] || '').toString(),
          tema:          (r[5] || '').toString(),
          desarrollo:    (r[6] || '').toString(),
          tarea:         (r[7] || '').toString(),
          fechaTarea:    toISODate(r[8]),
          tareaRevisada: _isSi(r[9]) ? 1 : 0,
          observaciones: (r[10] || '').toString(),
          cancelada:     _isSi(r[11]) ? 1 : 0,
          motivo:        (r[12] || '').toString(),
          asistencia:    '',
          destacado:     0,
          createdAt:     new Date().toISOString(),
          updatedAt:     new Date().toISOString()
        });
      });

      var horarioNuevo = [];
      hRows.forEach(function (r) {
        var nombre = (r[0] || '').toString().trim();
        if (!nombre) return;
        var g = ensureGroup(nombre, (r[1] || '').toString().trim(), (r[2] || '').toString().trim());
        var dia = +r[3];
        if (isNaN(dia)) return;
        horarioNuevo.push({
          id:         Utils.id(),
          groupId:    g.id,
          dia:        dia,
          horaInicio: _cleanTimeValue(r[4]),
          horaFin:    _cleanTimeValue(r[5]),
          aula:       (r[6] || '').toString()
        });
      });

      var estudiantesNuevo = [];
      eRows.forEach(function (r) {
        var nombre = (r[0] || '').toString().trim();
        if (!nombre) return;
        var g = ensureGroup(nombre, (r[1] || '').toString().trim(), (r[2] || '').toString().trim());
        var estNombre = (r[4] || '').toString().trim();
        if (!estNombre) return;
        estudiantesNuevo.push({
          id:        Utils.id(),
          groupId:   g.id,
          nombre:    estNombre,
          numero:    +r[3] || 0,
          createdAt: new Date().toISOString()
        });
      });

      await DB.importAll({ grupos: gruposNuevos, clases: clasesNuevas, horario: horarioNuevo, estudiantes: estudiantesNuevo });
      await DB.clearDirty();
      return { ok: true, gruposCount: gruposNuevos.length, clasesCount: clasesNuevas.length, horarioCount: horarioNuevo.length, estudiantesCount: estudiantesNuevo.length };
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
     * Se llama justo después de guardar algo (clase, asistencia, grupo, etc.)
     * para que el cambio no dependa de reabrir la app más tarde.
     * Si falla (ej: sin internet), no pasa nada: el dato queda "dirty" y se
     * sube en el próximo intento automático (al abrir la app o cada 5 min).
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

  function _isSi(v) {
    var s = (v || '').toString().trim().toLowerCase();
    return s === 'sí' || s === 'si';
  }

  /**
   * Limpia un valor de hora que pudo haberse corrompido por la auto-conversión
   * de fecha/hora de Google Sheets (ej: "1899-12-30T11:16:16.000Z" → "06:20").
   * Si ya viene limpio como "HH:MM", lo deja igual.
   */
  function _cleanTimeValue(v) {
    if (!v) return '';
    var s = v.toString().trim();
    if (/^\d{1,2}:\d{2}$/.test(s)) return s; // ya viene limpio
    var m = s.match(/^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2}):(\d{2})/);
    if (m) {
      // Sheets guarda la hora en UTC; se corrige el desfase de Bogotá (UTC-5)
      // y se redondea a los 10 minutos más cercanos (granularidad típica de
      // los horarios de clase, y la que introduce el propio desfase de Sheets).
      var totalMin = (+m[1] * 60 + +m[2]) - 300;
      totalMin = ((totalMin % 1440) + 1440) % 1440;
      totalMin = Math.round(totalMin / 10) * 10;
      var h = Math.floor(totalMin / 60), mm = totalMin % 60;
      return (h < 10 ? '0' : '') + h + ':' + (mm < 10 ? '0' : '') + mm;
    }
    return s;
  }
})();
