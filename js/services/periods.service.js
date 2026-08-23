/* ═══════════════════════════════════════════════════════════════
   periods.service.js — Periodos académicos (fechas de inicio/fin)
   Permite determinar automáticamente a qué periodo pertenece una
   fecha, en vez de escribirlo a mano en cada clase.
═══════════════════════════════════════════════════════════════ */

var PeriodsService = (function () {
  'use strict';

  /* Extraído del cronograma académico 2026 (Colegio Miguel de
     Cervantes Saavedra I.E.D.). Editable desde Configuración. */
  var DEFAULT_PERIODS = [
    { nombre: 'Primer periodo',  inicio: '2026-01-26', fin: '2026-03-27' },
    { nombre: 'Segundo periodo', inicio: '2026-04-06', fin: '2026-06-03' },
    { nombre: 'Tercer periodo',  inicio: '2026-06-04', fin: '2026-08-28' },
    { nombre: 'Cuarto periodo',  inicio: '2026-08-31', fin: '2026-11-04' }
  ];

  return {
    async getAll() {
      var p = await DB.getCfg('academicPeriods');
      return (Array.isArray(p) && p.length) ? p : DEFAULT_PERIODS;
    },

    async save(periods) {
      var clean = (periods || [])
        .map(function (p) { return { nombre: (p.nombre || '').trim(), inicio: p.inicio || '', fin: p.fin || '' }; })
        .filter(function (p) { return p.nombre && p.inicio && p.fin; });
      await DB.setCfg('academicPeriods', clean);
      return clean;
    },

    /** Devuelve el nombre del periodo al que pertenece una fecha, o '' si no coincide con ninguno */
    async getPeriodForDate(fecha) {
      if (!fecha) return '';
      var periods = await this.getAll();
      var match = periods.find(function (p) { return fecha >= p.inicio && fecha <= p.fin; });
      return match ? match.nombre : '';
    },

    /** Periodo activo hoy (o null si hoy no cae en ninguno) */
    async getCurrentPeriod() {
      var periods = await this.getAll();
      var today = Utils.today();
      return periods.find(function (p) { return today >= p.inicio && today <= p.fin; }) || null;
    }
  };
})();
