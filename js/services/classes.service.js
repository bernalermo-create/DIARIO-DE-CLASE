/* ═══════════════════════════════════════════════════════════════
   classes.service.js — Registros de clase
═══════════════════════════════════════════════════════════════ */

var ClassesService = (function () {
  'use strict';

  /** Campos obligatorios mínimos */
  var REQUIRED = ['groupId', 'fecha'];

  function validate(data) {
    if (!data.groupId)  return { ok: false, msg: 'Selecciona un grupo.' };
    if (!data.fecha)    return { ok: false, msg: 'La fecha es obligatoria.' };
    if (data.cancelada) {
      if (!data.motivo || !data.motivo.trim())
        return { ok: false, msg: 'Selecciona el motivo por el que no hubo clase.' };
      return { ok: true };
    }
    var hasAttendance = Array.isArray(data.asistenciaLista) && data.asistenciaLista.length > 0;
    if (!data.tema && !data.desarrollo && !hasAttendance)
      return { ok: false, msg: 'Escribe al menos el tema o el desarrollo de la clase.' };
    return { ok: true };
  }

  return {
    /** Todas las clases, más recientes primero */
    async getAll() {
      return DB.getAll('clases', 'fecha DESC');
    },

    /** Clases de un grupo específico */
    async getByGroup(groupId) {
      return DB.getWhere('clases', { groupId: groupId }, 'fecha DESC');
    },

    /** Una clase por id */
    async getById(id) {
      return DB.getById('clases', id);
    },

    /**
     * Guarda (crea o actualiza) un registro de clase.
     */
    async save(data) {
      var v = validate(data);
      if (!v.ok) return v;

      var now     = new Date().toISOString();
      var isNew   = !data.id;
      var existing = data.id ? await DB.getById('clases', data.id) : null;

      var record = {
        id:            data.id        || Utils.id(),
        groupId:       data.groupId,
        fecha:         data.fecha,
        periodo:       (data.periodo       || '').trim(),
        tema:          (data.tema          || '').trim(),
        desarrollo:    (data.desarrollo    || '').trim(),
        tarea:         (data.tarea         || '').trim(),
        fechaTarea:    data.fechaTarea     || '',
        tareaRevisada: data.tareaRevisada  ? 1 : 0,
        observaciones: (data.observaciones || '').trim(),
        asistencia:    (data.asistencia    || '').trim(),
        asistenciaLista: Array.isArray(data.asistenciaLista) ? data.asistenciaLista : [],
        destacado:     data.destacado      ? 1 : 0,
        cancelada:     data.cancelada      ? 1 : 0,
        motivo:        (data.motivo        || '').trim(),
        createdAt:     existing ? existing.createdAt : now,
        updatedAt:     now
      };

      await DB.upsert('clases', record);
      return { ok: true, record: record, isNew: isNew };
    },

    /**
     * Informe de asistencia acumulado de un grupo: por cada estudiante que
     * aparece en al menos un registro de asistencia, cuenta presentes/ausentes.
     * Ordenado por más ausencias primero.
     */
    async attendanceReport(groupId) {
      var clases = await this.getByGroup(groupId);
      var withAtt = clases.filter(function (c) { return Array.isArray(c.asistenciaLista) && c.asistenciaLista.length; });

      var tally = {}; // estudianteId -> { nombre, presentes, ausentes }
      withAtt.forEach(function (c) {
        c.asistenciaLista.forEach(function (a) {
          if (!tally[a.estudianteId]) tally[a.estudianteId] = { nombre: a.nombre, presentes: 0, ausentes: 0 };
          if (a.presente) tally[a.estudianteId].presentes++;
          else tally[a.estudianteId].ausentes++;
        });
      });

      var rows = Object.keys(tally).map(function (id) {
        var t = tally[id];
        var total = t.presentes + t.ausentes;
        return {
          estudianteId: id, nombre: t.nombre,
          presentes: t.presentes, ausentes: t.ausentes, total: total,
          pct: total ? Math.round((t.presentes / total) * 100) : 0
        };
      });
      rows.sort(function (a, b) { return b.ausentes - a.ausentes || a.nombre.localeCompare(b.nombre, 'es'); });

      return { totalSesiones: withAtt.length, rows: rows };
    },

    /** Resumen legible de asistencia a partir de asistenciaLista: "26/28 presentes" */
    attendanceSummary(record) {
      var lista = record && record.asistenciaLista;
      if (!Array.isArray(lista) || !lista.length) return '';
      var presentes = lista.filter(function (a) { return a.presente; }).length;
      return presentes + '/' + lista.length + ' presentes';
    },

    /** Última clase REAL (no cancelada) de un grupo, más reciente primero */
    async getLastRealClass(groupId) {
      var rows = await this.getByGroup(groupId);
      return rows.find(function (c) { return !c.cancelada; }) || null;
    },

    /** Copia solo la tarea (tema/desarrollo/tarea) de un registro existente hacia una nueva fecha/grupo */
    async copyTaskToDate(sourceRecord, targetGroupId, newFecha) {
      var now = new Date().toISOString();
      var copy = {
        id:            Utils.id(),
        groupId:       targetGroupId || sourceRecord.groupId,
        fecha:         newFecha || Utils.today(),
        periodo:       sourceRecord.periodo || '',
        tema:          sourceRecord.tema || '',
        desarrollo:    sourceRecord.desarrollo || '',
        tarea:         sourceRecord.tarea || '',
        fechaTarea:    sourceRecord.fechaTarea || '',
        tareaRevisada: 0,
        observaciones: sourceRecord.observaciones || '',
        asistencia:    '',
        destacado:     0,
        cancelada:     0,
        motivo:        '',
        createdAt:     now,
        updatedAt:     now
      };
      await DB.upsert('clases', copy);
      return copy;
    },

    /** Duplica un registro de clase hacia otros grupos (ej: mismo grado) */
    async duplicateToGroups(sourceRecord, targetGroupIds) {
      var now = new Date().toISOString();
      var created = [];
      for (var i = 0; i < targetGroupIds.length; i++) {
        var copy = {
          id:            Utils.id(),
          groupId:       targetGroupIds[i],
          fecha:         sourceRecord.fecha,
          periodo:       sourceRecord.periodo || '',
          tema:          sourceRecord.tema || '',
          desarrollo:    sourceRecord.desarrollo || '',
          tarea:         sourceRecord.tarea || '',
          fechaTarea:    sourceRecord.fechaTarea || '',
          tareaRevisada: 0,
          observaciones: sourceRecord.observaciones || '',
          asistencia:    '',
          destacado:     0,
          createdAt:     now,
          updatedAt:     now
        };
        await DB.upsert('clases', copy);
        created.push(copy);
      }
      return created;
    },

    /** Elimina una clase */
    async remove(id) {
      await DB.remove('clases', id);
      return true;
    },

    /** Duplica una clase con la fecha de hoy */
    async duplicate(id) {
      var original = await DB.getById('clases', id);
      if (!original) return { ok: false, msg: 'No encontrado.' };
      var now = new Date().toISOString();
      var copy = Object.assign({}, original, {
        id:            Utils.id(),
        fecha:         Utils.today(),
        tareaRevisada: 0,
        destacado:     0,
        createdAt:     now,
        updatedAt:     now
      });
      await DB.upsert('clases', copy);
      return { ok: true, record: copy };
    },

    /** Marca/desmarca la tarea como revisada */
    async toggleTareaRevisada(id) {
      var rec = await DB.getById('clases', id);
      if (!rec) return null;
      rec.tareaRevisada = rec.tareaRevisada ? 0 : 1;
      rec.updatedAt     = new Date().toISOString();
      await DB.upsert('clases', rec);
      return rec;
    },

    /** Marca/desmarca como destacada */
    async toggleDestacado(id) {
      var rec = await DB.getById('clases', id);
      if (!rec) return null;
      rec.destacado = rec.destacado ? 0 : 1;
      rec.updatedAt = new Date().toISOString();
      await DB.upsert('clases', rec);
      return rec;
    },

    /**
     * Devuelve tareas con fecha <= hoy, no revisadas.
     */
    async getPendingTasks() {
      var today = Utils.today();
      var all   = await DB.getAll('clases', 'fechaTarea ASC');
      return all.filter(function (c) {
        return c.tarea && c.fechaTarea && c.fechaTarea <= today && !+c.tareaRevisada;
      });
    },

    /**
     * Búsqueda textual dentro de un grupo (o en todas las clases si groupId=null).
     */
    async search(query, groupId) {
      var rows = groupId
        ? await DB.getWhere('clases', { groupId: groupId }, 'fecha DESC')
        : await DB.getAll('clases', 'fecha DESC');
      if (!query) return rows;
      var q = query.toLowerCase();
      return rows.filter(function (c) {
        return [c.tema, c.desarrollo, c.tarea, c.observaciones]
          .join(' ').toLowerCase().indexOf(q) > -1;
      });
    },

    /**
     * Filtra clases por criterios: { groupId, fechaDesde, fechaHasta, soloTareas, soloDestacadas }
     */
    async filter(criteria) {
      var rows = await DB.getAll('clases', 'fecha DESC');

      if (criteria.groupId) {
        rows = rows.filter(function (c) { return c.groupId === criteria.groupId; });
      }
      if (criteria.fechaDesde) {
        rows = rows.filter(function (c) { return c.fecha >= criteria.fechaDesde; });
      }
      if (criteria.fechaHasta) {
        rows = rows.filter(function (c) { return c.fecha <= criteria.fechaHasta; });
      }
      if (criteria.soloTareas) {
        rows = rows.filter(function (c) { return !!c.tarea; });
      }
      if (criteria.soloDestacadas) {
        rows = rows.filter(function (c) { return !!+c.destacado; });
      }
      if (criteria.soloPendientes) {
        var today = Utils.today();
        rows = rows.filter(function (c) {
          return c.tarea && c.fechaTarea && c.fechaTarea <= today && !+c.tareaRevisada;
        });
      }
      return rows;
    },

    /** Estadísticas generales */
    async getStats() {
      var all = await DB.getAll('clases', 'fecha DESC');
      var grupos = {};
      all.forEach(function (c) { grupos[c.groupId] = (grupos[c.groupId] || 0) + 1; });
      var today   = Utils.today();
      var pending = all.filter(function (c) {
        return c.tarea && c.fechaTarea && c.fechaTarea <= today && !+c.tareaRevisada;
      });
      return {
        total:    all.length,
        pending:  pending.length,
        porGrupo: grupos,
        recientes: all.slice(0, 5)
      };
    }
  };
})();
