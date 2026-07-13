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
    /** Sube grupos + clases + horario locales a las pestañas de la hoja */
    async push(url) {
      var clases  = await ClassesService.getAll();
      var grupos  = await GroupsService.getAll();
      var horario = await ScheduleService.getAll();
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

      var res  = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(JSON.stringify({ grupos: gruposPayload, clases: clasesPayload, horario: horarioPayload }))
      });
      var json = await res.json();
      if (!json || !json.ok) return { ok: false, error: (json && json.error) || 'desconocido' };
      return { ok: true, gruposCount: grupos.length, clasesCount: clases.length, horarioCount: horario.length };
    },

    /** Descarga las pestañas de la hoja y reemplaza los datos locales */
    async pullAndReplace(url) {
      var res  = await fetch(url, { method: 'GET' });
      var json = await res.json();
      if (!json || !json.ok) return { ok: false, error: (json && json.error) || 'desconocido' };

      var gRows = (json.grupos && json.grupos.rows) || [];
      var cRows = (json.clases && json.clases.rows) || [];
      var hRows = (json.horario && json.horario.rows) || [];
      if (!gRows.length && !cRows.length && !hRows.length) return { ok: true, empty: true, gruposCount: 0, clasesCount: 0, horarioCount: 0 };

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
          horaInicio: (r[4] || '').toString(),
          horaFin:    (r[5] || '').toString(),
          aula:       (r[6] || '').toString()
        });
      });

      await DB.importAll({ grupos: gruposNuevos, clases: clasesNuevas, horario: horarioNuevo });
      return { ok: true, gruposCount: gruposNuevos.length, clasesCount: clasesNuevas.length, horarioCount: horarioNuevo.length };
    }
  };

  function _isSi(v) {
    var s = (v || '').toString().trim().toLowerCase();
    return s === 'sí' || s === 'si';
  }
})();
