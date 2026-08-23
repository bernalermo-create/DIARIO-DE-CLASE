/* ═══════════════════════════════════════════════════════════════
   students.service.js — Listado de estudiantes por grupo
   (para tomar asistencia). Soporta importación desde Excel/CSV.
═══════════════════════════════════════════════════════════════ */

var StudentsService = (function () {
  'use strict';

  return {
    /** Estudiantes de un grupo, ordenados por número de lista o nombre */
    async getByGroup(groupId) {
      var rows = await DB.getWhere('estudiantes', { groupId: groupId });
      return rows.sort(function (a, b) {
        if (a.numero && b.numero && a.numero !== b.numero) return a.numero - b.numero;
        return (a.nombre || '').localeCompare((b.nombre || ''), 'es');
      });
    },

    async add(groupId, nombre) {
      nombre = (nombre || '').trim();
      if (!nombre) return { ok: false, msg: 'El nombre es obligatorio.' };
      var existing = await this.getByGroup(groupId);
      var record = {
        id: Utils.id(), groupId: groupId, nombre: nombre,
        numero: existing.length + 1, createdAt: new Date().toISOString()
      };
      await DB.upsert('estudiantes', record);
      return { ok: true, record: record };
    },

    async update(id, nombre) {
      var s = await DB.getById('estudiantes', id);
      if (!s) return { ok: false, msg: 'No encontrado.' };
      s.nombre = (nombre || '').trim() || s.nombre;
      await DB.upsert('estudiantes', s);
      return { ok: true, record: s };
    },

    async remove(id) {
      await DB.remove('estudiantes', id);
    },

    async removeAllByGroup(groupId) {
      var rows = await this.getByGroup(groupId);
      for (var i = 0; i < rows.length; i++) await DB.remove('estudiantes', rows[i].id);
    },

    /**
     * Convierte texto pegado (uno o varios nombres por línea, o separados
     * por comas/tabs en una sola línea) en un array limpio de nombres.
     */
    parseNamesFromPastedText(text) {
      if (!text) return [];
      var lines = text.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
      // Si solo hay una línea con varios nombres separados por coma o tab, se abre en varios
      if (lines.length === 1 && /[,\t;]/.test(lines[0])) {
        lines = lines[0].split(/[,\t;]/).map(function (s) { return s.trim(); }).filter(Boolean);
      }
      // Quitar numeración inicial tipo "1. Nombre" o "1) Nombre"
      return lines.map(function (l) { return l.replace(/^\d+[\.\)\-]\s*/, '').trim(); }).filter(Boolean);
    },

    /**
     * Importa una lista de nombres (ya extraídos/editados por el usuario).
     * options.replace = true → reemplaza la lista actual; si no, agrega al final.
     */
    async importNames(groupId, names, options) {
      options = options || {};
      if (options.replace) await this.removeAllByGroup(groupId);
      var existingCount = options.replace ? 0 : (await this.getByGroup(groupId)).length;
      var created = [];
      for (var i = 0; i < names.length; i++) {
        var n = (names[i] || '').toString().trim();
        if (!n) continue;
        var record = {
          id: Utils.id(), groupId: groupId, nombre: n,
          numero: existingCount + created.length + 1,
          createdAt: new Date().toISOString()
        };
        await DB.upsert('estudiantes', record);
        created.push(record);
      }
      return created;
    },

    /**
     * Lee un archivo Excel/CSV (usando SheetJS, ya cargado globalmente como XLSX)
     * y devuelve un array de strings con la mejor columna de nombres detectada.
     */
    async parseNamesFromFile(file) {
      if (typeof XLSX === 'undefined') {
        throw new Error('No se pudo cargar el lector de Excel. Verifica tu conexión a internet e intenta de nuevo.');
      }
      var buffer = await file.arrayBuffer();
      var wb = XLSX.read(buffer, { type: 'array' });
      var firstSheetName = wb.SheetNames[0];
      var sheet = wb.Sheets[firstSheetName];
      var rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });

      // Detectar la columna con más texto tipo "nombre" (no numérica)
      var maxCols = 0;
      rows.forEach(function (r) { if (r.length > maxCols) maxCols = r.length; });
      var scores = [];
      for (var c = 0; c < maxCols; c++) {
        var score = 0;
        rows.forEach(function (r) {
          var v = (r[c] || '').toString().trim();
          if (v && isNaN(v) && v.length > 2) score++;
        });
        scores.push(score);
      }
      var bestCol = 0, bestScore = -1;
      scores.forEach(function (s, idx) { if (s > bestScore) { bestScore = s; bestCol = idx; } });

      var names = rows
        .map(function (r) { return (r[bestCol] || '').toString().trim(); })
        .filter(function (v) { return v && isNaN(v); });

      return names;
    }
  };
})();
