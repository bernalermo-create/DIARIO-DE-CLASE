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
    /** Sube grupos + clases locales a las pestañas "Grupos" y "Clases" de la hoja */
    async push(url) {
      var clases = await ClassesService.getAll();
      var grupos = await GroupsService.getAll();
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
        header: ['Grupo', 'Asignatura', 'Grado', 'Fecha', 'Periodo', 'Tema', 'Desarrollo', 'Tarea', 'Fecha entrega', 'Revisada', 'Observaciones'],
        rows: clases.map(function (c) {
          var g = gMap[c.groupId] || {};
          return [g.nombre || '', g.asignatura || '', g.grado || '', c.fecha, c.periodo, c.tema,
                  c.desarrollo, c.tarea, c.fechaTarea,
                  +c.tareaRevisada ? 'Sí' : 'No', c.observaciones];
        })
      };

      var res  = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(JSON.stringify({ grupos: gruposPayload, clases: clasesPayload }))
      });
      var json = await res.json();
      if (!json || !json.ok) return { ok: false, error: (json && json.error) || 'desconocido' };
      return { ok: true, gruposCount: grupos.length, clasesCount: clases.length };
    },

    /** Descarga las pestañas "Grupos"/"Clases" y reemplaza los datos locales */
    async pullAndReplace(url) {
      var res  = await fetch(url, { method: 'GET' });
      var json = await res.json();
      if (!json || !json.ok) return { ok: false, error: (json && json.error) || 'desconocido' };

      var gRows = (json.grupos && json.grupos.rows) || [];
      var cRows = (json.clases && json.clases.rows) || [];
      if (!gRows.length && !cRows.length) return { ok: true, empty: true, gruposCount: 0, clasesCount: 0 };

      var gruposNuevos = [];
      var gMap = {};
      gRows.forEach(function (r) {
        var nombre = (r[0] || '').toString().trim();
        if (!nombre) return;
        var asignatura = (r[1] || '').toString().trim();
        var grado      = (r[2] || '').toString().trim();
        var color      = (r[3] || '').toString().trim() || '#2D6A4F';
        var key = nombre + '|' + asignatura + '|' + grado;
        var g = { id: Utils.id(), nombre: nombre, asignatura: asignatura, grado: grado, color: color, createdAt: new Date().toISOString() };
        gMap[key] = g;
        gruposNuevos.push(g);
      });

      var clasesNuevas = [];
      cRows.forEach(function (r) {
        var nombre     = (r[0] || '').toString().trim();
        var asignatura = (r[1] || '').toString().trim();
        var grado      = (r[2] || '').toString().trim();
        if (!nombre) return;
        var key = nombre + '|' + asignatura + '|' + grado;
        if (!gMap[key]) {
          var g = { id: Utils.id(), nombre: nombre, asignatura: asignatura, grado: grado, color: '#2D6A4F', createdAt: new Date().toISOString() };
          gMap[key] = g;
          gruposNuevos.push(g);
        }
        clasesNuevas.push({
          id:            Utils.id(),
          groupId:       gMap[key].id,
          fecha:         toISODate(r[3]),
          periodo:       (r[4] || '').toString(),
          tema:          (r[5] || '').toString(),
          desarrollo:    (r[6] || '').toString(),
          tarea:         (r[7] || '').toString(),
          fechaTarea:    toISODate(r[8]),
          tareaRevisada: (r[9] || '').toString().trim().toLowerCase() === 'sí' || (r[9] || '').toString().trim().toLowerCase() === 'si' ? 1 : 0,
          observaciones: (r[10] || '').toString(),
          asistencia:    '',
          destacado:     0,
          createdAt:     new Date().toISOString(),
          updatedAt:     new Date().toISOString()
        });
      });

      await DB.importAll({ grupos: gruposNuevos, clases: clasesNuevas, horario: [] });
      return { ok: true, gruposCount: gruposNuevos.length, clasesCount: clasesNuevas.length };
    }
  };
})();
