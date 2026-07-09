/* ═══════════════════════════════════════════════════════════════
   groups.service.js — Gestión de grupos / cursos
═══════════════════════════════════════════════════════════════ */

var GroupsService = (function () {
  'use strict';

  return {
    /** Devuelve todos los grupos ordenados por nombre */
    async getAll() {
      return DB.getAll('grupos', 'nombre ASC');
    },

    /** Devuelve un grupo por id */
    async getById(id) {
      return DB.getById('grupos', id);
    },

    /** Otros grupos que comparten el mismo grado (para duplicar tareas) */
    async getSiblingsByGrade(groupId) {
      var g = await DB.getById('grupos', groupId);
      if (!g || !g.grado) return [];
      var all = await DB.getAll('grupos', 'nombre ASC');
      return all.filter(function (x) { return x.id !== groupId && x.grado === g.grado; });
    },

    /**
     * Crea o actualiza un grupo.
     * @returns {{ ok: boolean, record?: object, msg?: string }}
     */
    async save(data) {
      if (!data.nombre || !data.nombre.trim()) {
        return { ok: false, msg: 'El nombre del grupo es obligatorio.' };
      }
      var record = {
        id:         data.id        || Utils.id(),
        nombre:     data.nombre.trim(),
        asignatura: (data.asignatura || '').trim(),
        grado:      (data.grado      || '').trim(),
        color:      data.color     || '#2D6A4F',
        createdAt:  data.createdAt || new Date().toISOString()
      };
      await DB.upsert('grupos', record);
      return { ok: true, record: record };
    },

    /**
     * Elimina un grupo y todas sus clases y bloques de horario asociados.
     */
    async remove(id) {
      // Eliminar clases del grupo
      var clases = await DB.getWhere('clases', { groupId: id });
      for (var c of clases) await DB.remove('clases', c.id);
      // Eliminar bloques de horario del grupo
      var bloques = await DB.getWhere('horario', { groupId: id });
      for (var b of bloques) await DB.remove('horario', b.id);
      // Eliminar el grupo
      await DB.remove('grupos', id);
      return true;
    },

    /** Devuelve el número de clases registradas para un grupo */
    async countClasses(groupId) {
      var rows = await DB.getWhere('clases', { groupId: groupId });
      return rows.length;
    },

    /** Devuelve el número de tareas pendientes de un grupo */
    async countPendingTasks(groupId) {
      var today = Utils.today();
      var rows  = await DB.getWhere('clases', { groupId: groupId });
      return rows.filter(function (c) {
        return c.tarea && c.fechaTarea && c.fechaTarea <= today && !c.tareaRevisada;
      }).length;
    },

    /** Devuelve la última clase registrada de un grupo */
    async getLastClass(groupId) {
      var rows = await DB.getWhere('clases', { groupId: groupId }, 'fecha DESC');
      return rows[0] || null;
    },

    /** Enriquece un array de grupos con contadores y última clase */
    async enrichGroups(grupos) {
      return Promise.all(grupos.map(async function (g) {
        var [totalClases, tareasP, lastClase] = await Promise.all([
          GroupsService.countClasses(g.id),
          GroupsService.countPendingTasks(g.id),
          GroupsService.getLastClass(g.id)
        ]);
        return Object.assign({}, g, {
          totalClases:   totalClases,
          tareasPendientes: tareasP,
          lastClase:     lastClase
        });
      }));
    }
  };
})();
