/* ═══════════════════════════════════════════════════════════════
   utils.js — Funciones puras reutilizables
═══════════════════════════════════════════════════════════════ */

var Utils = (function () {
  'use strict';

  var MONTHS_S = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  var MONTHS_L = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  var DAYS_L   = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  var GROUP_COLORS = [
    '#2D6A4F','#1B6CA8','#7B2D8B','#B85C00','#145A32','#1A5276','#6C3483','#784212','#1F618D','#117A65',
    '#943126','#B7950B','#4A235A','#0E6655','#154360','#7D6608','#922B21','#1E8449','#6E2C00','#21618C',
    '#5B2C6F','#0B5345','#873600','#2E4053','#A93226','#186A3B','#1F618D','#78281F'
  ];
  var DURATION_PRESETS = [45, 50, 55, 60, 90, 120];

  return {
    DAYS_L: DAYS_L,
    GROUP_COLORS: GROUP_COLORS,
    DURATION_PRESETS: DURATION_PRESETS,

    /** UUID v4 */
    id: function () {
      try { return crypto.randomUUID(); }
      catch (e) { return 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2,9); }
    },

    /** Fecha de hoy en formato YYYY-MM-DD (sin desfase de zona horaria) */
    today: function () {
      var d = new Date();
      return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    },

    /** ISO → "martes 3 de junio de 2025" */
    dateLong: function (iso) {
      if (!iso) return '';
      var p = iso.split('-');
      try {
        return new Date(+p[0], +p[1]-1, +p[2])
          .toLocaleDateString('es-CO', {weekday:'long', day:'numeric', month:'long', year:'numeric'});
      } catch (e) { return iso; }
    },

    /** ISO → "03/06/2025" */
    dateShort: function (iso) {
      if (!iso) return '';
      var p = iso.split('-');
      return p[2] + '/' + p[1] + '/' + p[0];
    },

    /** ISO → "Jun" */
    monthShort: function (iso) {
      if (!iso) return '';
      return MONTHS_S[+iso.slice(5,7) - 1] || '';
    },

    /** "HH:MM" → "8:30 AM" */
    timeLabel: function (t) {
      if (!t) return '';
      var p = t.split(':'), h = +p[0], m = +p[1];
      var ampm = h < 12 ? 'AM' : 'PM';
      h = h % 12 || 12;
      return h + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;
    },

    /** "HH:MM" → minutos desde medianoche */
    timeToMins: function (t) {
      if (!t) return -1;
      var p = t.split(':');
      return +p[0] * 60 + +p[1];
    },

    /** "HH:MM" + minutos → nueva "HH:MM" (se ajusta dentro de 00:00–23:59) */
    addMinutes: function (t, mins) {
      if (!t) return '';
      var p = t.split(':');
      var total = (+p[0] * 60 + +p[1] + (+mins || 0));
      total = ((total % 1440) + 1440) % 1440;
      var h = Math.floor(total / 60), m = total % 60;
      return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
    },

    /** Etiqueta para un día de ciclo rotativo: 0 → "Día 1" */
    cycleDayLabel: function (idx) {
      return 'Día ' + (idx + 1);
    },

    /** Truncar texto con elipsis */
    cut: function (s, n) {
      s = s || ''; n = n || 60;
      return s.length > n ? s.slice(0, n).trim() + '…' : s;
    },

    /** Escapar HTML para inserción segura en el DOM */
    esc: function (v) {
      var d = document.createElement('div');
      d.textContent = (v == null ? '' : String(v));
      return d.innerHTML;
    },

    /** Debounce */
    debounce: function (fn, ms) {
      var t;
      return function () {
        var a = arguments, c = this;
        clearTimeout(t);
        t = setTimeout(function () { fn.apply(c, a); }, ms || 300);
      };
    },

    /** Descargar archivo en el navegador */
    downloadBrowser: function (name, content, mime) {
      var b = new Blob([content], { type: mime || 'application/json' });
      var url = URL.createObjectURL(b);
      var a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    },

    /** Formatear bytes a texto legible */
    bytes: function (b) {
      if (!b) return '0 B';
      var u = ['B','KB','MB','GB'];
      var e = Math.min(Math.floor(Math.log(b)/Math.log(1024)), 3);
      return (b/Math.pow(1024,e)).toFixed(e?1:0) + ' ' + u[e];
    },

    /** Color siguiente disponible para grupos */
    nextColor: function (usedColors) {
      return GROUP_COLORS.find(function (c) { return usedColors.indexOf(c) < 0; }) || GROUP_COLORS[0];
    },

    /** ¿La app corre en Android nativo? */
    isNative: function () {
      return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    },

    /** Pluralizar en español */
    plural: function (n, singular, plural) {
      return n === 1 ? singular : (plural || singular + 's');
    }
  };
})();
