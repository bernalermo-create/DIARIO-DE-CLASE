/* ═══════════════════════════════════════════════════════════════
   notifications.service.js — Notificaciones locales
   Usa @capacitor/local-notifications en Android nativo.
   En navegador solo usa los recordatorios en pantalla.
═══════════════════════════════════════════════════════════════ */

var NotificationsService = (function () {
  'use strict';

  var _granted = false;

  return {
    /** Solicita permiso y verifica disponibilidad */
    async init() {
      if (!Utils.isNative()) return;
      try {
        var { LocalNotifications } = window.Capacitor.Plugins;
        var perm = await LocalNotifications.requestPermissions();
        _granted = perm.display === 'granted';
      } catch (e) {
        console.warn('[Notifications] No disponible:', e);
      }
    },

    /**
     * Programa una notificación para el día de entrega de una tarea.
     * @param {object} clase - registro de clase con tarea y fechaTarea
     * @param {string} groupName
     */
    async scheduleTaskReminder(clase, groupName) {
      if (!Utils.isNative() || !_granted || !clase.tarea || !clase.fechaTarea) return;
      try {
        var { LocalNotifications } = window.Capacitor.Plugins;
        // Programar para las 7 AM del día de entrega
        var parts   = clase.fechaTarea.split('-');
        var at      = new Date(+parts[0], +parts[1]-1, +parts[2], 7, 0, 0);
        if (at < new Date()) return; // ya pasó

        await LocalNotifications.schedule({
          notifications: [{
            id:       Math.abs(clase.id.hashCode ? clase.id.hashCode() : (Date.now() % 2147483647)),
            title:    '📝 Tarea pendiente — ' + groupName,
            body:     clase.tarea,
            schedule: { at: at },
            channelId:'tareas'
          }]
        });
      } catch (e) {
        console.warn('[Notifications] schedule error:', e);
      }
    },

    /** Cancela todas las notificaciones programadas */
    async cancelAll() {
      if (!Utils.isNative()) return;
      try {
        var { LocalNotifications } = window.Capacitor.Plugins;
        var pending = await LocalNotifications.getPending();
        if (pending.notifications && pending.notifications.length) {
          await LocalNotifications.cancel({ notifications: pending.notifications });
        }
      } catch (e) {}
    },

    /**
     * Reprograma los recordatorios de todas las tareas pendientes.
     * Llamar al abrir la app y al guardar una clase con tarea.
     */
    async syncTaskReminders() {
      if (!Utils.isNative()) return;
      await this.cancelAll();
      var pending = await ClassesService.getPendingTasks();
      var grupos  = await GroupsService.getAll();
      var gMap = {};
      grupos.forEach(function (g) { gMap[g.id] = g; });

      for (var c of pending) {
        var g = gMap[c.groupId];
        if (g) await this.scheduleTaskReminder(c, g.nombre);
      }
    }
  };
})();
