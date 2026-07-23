/* ═══════════════════════════════════════════════════════════════
   schedule.service.js — Horario semanal o por ciclo rotativo
   (con avance automático y ajuste manual del día activo)
═══════════════════════════════════════════════════════════════ */

var ScheduleService = (function () {
  'use strict';

  /** Cuenta días hábiles (Lun–Vie) estrictamente entre dos fechas ISO (sin contar fromISO) */
  function _countSchoolDays(fromISO, toISO) {
    var from = new Date(fromISO + 'T00:00:00');
    var to   = new Date(toISO + 'T00:00:00');
    if (isNaN(from) || isNaN(to) || to <= from) return 0;
    var count = 0;
    var d = new Date(from);
    while (d < to) {
      d.setDate(d.getDate() + 1);
      var wd = d.getDay(); // 0=Dom, 6=Sáb
      if (wd !== 0 && wd !== 6) count++;
    }
    return count;
  }

  return {
    async getAll() {
      return DB.getAll('horario', 'dia ASC');
    },

    async getByDay(dia) {
      var rows = await DB.getWhere('horario', { dia: dia });
      return rows.sort(function (a, b) {
        return a.horaInicio < b.horaInicio ? -1 : 1;
      });
    },

    async getByGroup(groupId) {
      return DB.getWhere('horario', { groupId: groupId });
    },

    async save(data) {
      if (data.dia === undefined || data.dia === null)
        return { ok: false, msg: 'El día es obligatorio.' };
      if (!data.groupId)
        return { ok: false, msg: 'Selecciona un grupo.' };

      var record = {
        id:         data.id || Utils.id(),
        dia:        +data.dia,
        horaInicio: data.horaInicio || '',
        horaFin:    data.horaFin    || '',
        groupId:    data.groupId,
        aula:       (data.aula || '').trim()
      };
      await DB.upsert('horario', record);
      return { ok: true, record: record };
    },

    async remove(id) {
      await DB.remove('horario', id);
      return true;
    },

    /* ── Modo de horario: 'semana' (Lun–Sáb) o 'ciclo' (Día 1, Día 2…) ── */

    async getMode() {
      return (await DB.getCfg('scheduleMode')) || 'semana';
    },

    async setMode(mode) {
      await DB.setCfg('scheduleMode', mode === 'ciclo' ? 'ciclo' : 'semana');
    },

    /** Número de días que tiene el ciclo rotativo (por defecto 5: Día 1–Día 5) */
    async getCycleLength() {
      var n = await DB.getCfg('cycleDays');
      n = +n;
      return n && n > 1 && n <= 20 ? n : 5;
    },

    async setCycleLength(n) {
      n = +n;
      await DB.setCfg('cycleDays', n && n > 1 && n <= 20 ? n : 5);
    },

    /** ¿El día del ciclo avanza solo automáticamente (Lun–Vie)? Por defecto: sí */
    async getAutoMode() {
      var v = await DB.getCfg('cycleAutoMode');
      return (v === null || v === undefined) ? true : !!v;
    },

    async setAutoMode(v) {
      await DB.setCfg('cycleAutoMode', !!v);
    },

    /** Punto de referencia para calcular el avance automático: { date, day } */
    async getCycleAnchor() {
      var a = await DB.getCfg('cycleAnchor');
      if (a && a.date && typeof a.day === 'number') return a;
      var def = { date: Utils.today(), day: 0 };
      await DB.setCfg('cycleAnchor', def);
      return def;
    },

    async setCycleAnchor(date, day) {
      await DB.setCfg('cycleAnchor', { date: date, day: +day || 0 });
    },

    /** Calcula el día de ciclo correspondiente a hoy según el ancla y días hábiles transcurridos */
    async _computeAutoCycleDay() {
      var len    = await this.getCycleLength();
      var anchor = await this.getCycleAnchor();
      var elapsed = _countSchoolDays(anchor.date, Utils.today());
      return ((anchor.day + elapsed) % len + len) % len;
    },

    /** Día de ciclo activo. Automático (calculado) o manual (fijado por el docente) según el modo. */
    async getCycleCurrentDay() {
      var auto = await this.getAutoMode();
      if (auto) return this._computeAutoCycleDay();
      var len = await this.getCycleLength();
      var n = +(await DB.getCfg('cycleCurrentDay'));
      return (n >= 0 && n < len) ? n : 0;
    },

    /**
     * Fija manualmente el día de ciclo activo "hoy".
     * Si el modo automático está activo, este ajuste se convierte en el nuevo punto
     * de referencia (ancla), de modo que el avance automático continúa desde aquí.
     */
    async setCycleCurrentDay(idx) {
      idx = +idx || 0;
      await DB.setCfg('cycleCurrentDay', idx);
      var auto = await this.getAutoMode();
      if (auto) await this.setCycleAnchor(Utils.today(), idx);
    },

    /** Etiquetas de columnas del horario según el modo activo */
    async getDayLabels() {
      var mode = await this.getMode();
      if (mode === 'ciclo') {
        var len = await this.getCycleLength();
        var labels = [];
        for (var i = 0; i < len; i++) labels.push(Utils.cycleDayLabel(i));
        return labels;
      }
      return Utils.DAYS_L;
    },

    /** Índice del día "activo" hoy (para resaltar en el horario). -1 = sin clases hoy. */
    async getActiveDayIndex() {
      var mode = await this.getMode();
      if (mode === 'ciclo') {
        var auto = await this.getAutoMode();
        if (auto) {
          var wd = new Date().getDay();
          if (wd === 0 || wd === 6) return -1; // fin de semana: sin ciclo activo
        }
        return this.getCycleCurrentDay();
      }
      var wd2 = new Date().getDay(); // 0=Dom, 1=Lun…6=Sáb
      return wd2 === 0 ? -1 : wd2 - 1;
    },

    /** Bloques del día activo (semana actual o día de ciclo actual) */
    async getTodayBlocks() {
      var idx = await this.getActiveDayIndex();
      if (idx < 0) return [];
      return this.getByDay(idx);
    },

    /** Bloque activo en este momento */
    getCurrentBlock(blocks) {
      var now = new Date();
      var cur = now.getHours() * 60 + now.getMinutes();
      return blocks.find(function (b) {
        var s = Utils.timeToMins(b.horaInicio);
        var e = Utils.timeToMins(b.horaFin);
        return s >= 0 && e > s && cur >= s && cur < e;
      }) || null;
    }
  };
})();
