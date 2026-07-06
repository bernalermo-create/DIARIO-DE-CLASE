/* =========================================================================
   DIARIO DE CLASE PROFESIONAL v5
   – Compatible con file:// (PC) y servidores (GitHub Pages, móvil)
   – Sin imports ES6, sin módulos, sin dependencias externas
   – Un único IIFE para no contaminar el namespace global
   ========================================================================= */
(function () {
  'use strict';

  /* ════════════════════════════════════════════════════════════════════════
     CONSTANTES
  ════════════════════════════════════════════════════════════════════════ */
  var SHEETS_ID  = '1uiEYSditO8GpfefvZ4SlbtS7bL86qsJ9lo_ygTUKRP8';
  var SHEETS_URL = 'https://docs.google.com/spreadsheets/d/' + SHEETS_ID + '/edit';
  var K_GROUPS   = 'dcp_groups';
  var K_CLASSES  = 'dcp_classes';
  var K_SCHEDULE = 'dcp_schedule';
  var K_CFG      = 'dcp_config';

  var MONTHS_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  var DAYS_LONG    = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  var GROUP_COLORS = ['#2D6A4F','#1B6CA8','#7B2D8B','#B85C00','#145A32','#1A5276','#6C3483','#784212','#1F618D','#117A65'];

  /* ════════════════════════════════════════════════════════════════════════
     ALMACENAMIENTO SÍNCRONO
  ════════════════════════════════════════════════════════════════════════ */
  var DB = {
    _get: function (k) {
      try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch (e) { return []; }
    },
    _set: function (k, v) {
      try { localStorage.setItem(k, JSON.stringify(v)); }
      catch (e) { Toast.error('Error: almacenamiento lleno'); }
    },
    getCfg: function () {
      try { return JSON.parse(localStorage.getItem(K_CFG) || '{}'); } catch (e) { return {}; }
    },
    setCfg: function (o) {
      try { localStorage.setItem(K_CFG, JSON.stringify(o)); } catch (e) {}
    },
    getAll:  function (k) { return this._get(k); },
    getById: function (k, id) { return this._get(k).find(function (r) { return r.id === id; }) || null; },
    upsert: function (k, rec) {
      var arr = this._get(k);
      var i = arr.findIndex(function (r) { return r.id === rec.id; });
      if (i >= 0) arr[i] = rec; else arr.push(rec);
      this._set(k, arr);
      return rec;
    },
    remove: function (k, id) { this._set(k, this._get(k).filter(function (r) { return r.id !== id; })); },
    usage: function () {
      var b = 0;
      try { for (var k in localStorage) if (Object.prototype.hasOwnProperty.call(localStorage, k)) b += (localStorage.getItem(k) || '').length; } catch (e) {}
      return { bytes: b, pct: Math.round(b / (5 * 1024 * 1024) * 100) };
    }
  };

  /* ════════════════════════════════════════════════════════════════════════
     UTILIDADES
  ════════════════════════════════════════════════════════════════════════ */
  var U = {
    id: function () {
      try { return crypto.randomUUID(); }
      catch (e) { return 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9); }
    },
    today: function () {
      var d = new Date();
      return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    },
    dateLabel: function (iso) {
      if (!iso) return '';
      var p = iso.split('-');
      try { return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
      catch (e) { return iso; }
    },
    dateShort: function (iso) {
      if (!iso) return '';
      var p = iso.split('-');
      return p[2] + '/' + p[1] + '/' + p[0];
    },
    monthShort: function (iso) {
      if (!iso) return '';
      return MONTHS_SHORT[+iso.slice(5, 7) - 1] || '';
    },
    esc: function (v) {
      var d = document.createElement('div');
      d.textContent = (v == null ? '' : String(v));
      return d.innerHTML;
    },
    cut: function (s, n) { s = s || ''; n = n || 60; return s.length > n ? s.slice(0, n).trim() + '…' : s; },
    debounce: function (fn, ms) {
      var t;
      return function () { var a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms || 300); };
    },
    download: function (name, content) {
      var b = new Blob([content], { type: 'application/json' });
      var url = URL.createObjectURL(b);
      var a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    },
    /* Convierte "HH:MM" a minutos desde medianoche */
    timeToMins: function (t) {
      if (!t) return -1;
      var p = t.split(':');
      return +p[0] * 60 + +p[1];
    },
    /* Formatea "HH:MM" a "8:30 AM" */
    timeLabel: function (t) {
      if (!t) return '';
      var p = t.split(':'), h = +p[0], m = +p[1];
      var ampm = h < 12 ? 'AM' : 'PM';
      h = h % 12 || 12;
      return h + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;
    },
    nextColor: function () {
      var used = DB.getAll(K_GROUPS).map(function (g) { return g.color; });
      return GROUP_COLORS.find(function (c) { return used.indexOf(c) < 0; }) || GROUP_COLORS[0];
    }
  };

  /* ════════════════════════════════════════════════════════════════════════
     TOAST
  ════════════════════════════════════════════════════════════════════════ */
  var Toast = {
    _colors: { success: '#2D6A4F', error: '#B3261E', warning: '#C9A227', info: '#2A6F97' },
    show: function (msg, type) {
      type = type || 'info';
      var el = document.createElement('div');
      el.className = 'toast';
      el.style.borderLeftColor = this._colors[type] || this._colors.info;
      el.textContent = msg;
      var tc = document.getElementById('toastContainer');
      if (!tc) {
        tc = document.createElement('div');
        tc.id = 'toastContainer';
        tc.style.cssText = 'position:fixed;bottom:20px;right:14px;z-index:9999;display:flex;flex-direction:column;gap:8px;max-width:300px;width:calc(100vw - 28px);';
        document.body.appendChild(tc);
      }
      tc.appendChild(el);
      setTimeout(function () {
        el.style.opacity = '0'; el.style.transform = 'translateX(16px)';
        setTimeout(function () { el.remove(); }, 320);
      }, 3200);
    },
    success: function (m) { this.show(m, 'success'); },
    error:   function (m) { this.show(m, 'error'); },
    warning: function (m) { this.show(m, 'warning'); },
    info:    function (m) { this.show(m, 'info'); }
  };

  /* ════════════════════════════════════════════════════════════════════════
     CONFIRMACIÓN
  ════════════════════════════════════════════════════════════════════════ */
  function showConfirm(msg, onYes, labelYes, isDanger) {
    var ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.innerHTML =
      '<div class="modal-box" style="max-width:380px">' +
        '<p style="margin:0 0 22px;font-size:15px;line-height:1.5">' + U.esc(msg) + '</p>' +
        '<div style="display:flex;justify-content:flex-end;gap:10px">' +
          '<button class="btn btn-ghost" id="cfNo">Cancelar</button>' +
          '<button class="btn ' + (isDanger !== false ? 'btn-danger' : 'btn-primary') + '" id="cfSi">' + U.esc(labelYes || 'Confirmar') + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);
    ov.querySelector('#cfNo').onclick = function () { ov.remove(); };
    ov.querySelector('#cfSi').onclick = function () { ov.remove(); onYes(); };
    ov.onclick = function (e) { if (e.target === ov) ov.remove(); };
  }

  /* ════════════════════════════════════════════════════════════════════════
     MODELOS
  ════════════════════════════════════════════════════════════════════════ */
  function newGroup(d) {
    d = d || {};
    return {
      id:         d.id || U.id(),
      nombre:     d.nombre || '',
      asignatura: d.asignatura || '',
      color:      d.color || U.nextColor(),
      createdAt:  d.createdAt || new Date().toISOString()
    };
  }

  function newClass(d) {
    d = d || {};
    return {
      id:             d.id || U.id(),
      groupId:        d.groupId || '',
      fecha:          d.fecha || U.today(),
      periodo:        d.periodo || '',
      tema:           d.tema || '',
      desarrollo:     d.desarrollo || '',
      tarea:          d.tarea || '',
      fechaTarea:     d.fechaTarea || '',
      tareaRevisada:  d.tareaRevisada || false,
      createdAt:      d.createdAt || new Date().toISOString(),
      updatedAt:      new Date().toISOString()
    };
  }

  function newBlock(d) {
    d = d || {};
    return {
      id:         d.id || U.id(),
      dia:        d.dia !== undefined ? d.dia : 0,  // 0=Lun…5=Sáb
      horaInicio: d.horaInicio || '',
      horaFin:    d.horaFin || '',
      groupId:    d.groupId || '',
      aula:       d.aula || ''
    };
  }

  /* ════════════════════════════════════════════════════════════════════════
     SERVICIOS
  ════════════════════════════════════════════════════════════════════════ */
  var Groups = {
    getAll:  function () { return DB.getAll(K_GROUPS); },
    getById: function (id) { return DB.getById(K_GROUPS, id); },
    save: function (d) {
      if (!d.nombre || !d.nombre.trim()) return { ok: false, msg: 'El nombre del grupo es obligatorio.' };
      return { ok: true, record: DB.upsert(K_GROUPS, newGroup(d)) };
    },
    remove: function (id) {
      DB.remove(K_GROUPS, id);
      DB._set(K_CLASSES,  DB.getAll(K_CLASSES).filter(function (c) { return c.groupId !== id; }));
      DB._set(K_SCHEDULE, DB.getAll(K_SCHEDULE).filter(function (b) { return b.groupId !== id; }));
    }
  };

  var Classes = {
    getAll:     function () { return DB.getAll(K_CLASSES).sort(function (a, b) { return a.fecha < b.fecha ? 1 : -1; }); },
    getByGroup: function (gid) { return this.getAll().filter(function (c) { return c.groupId === gid; }); },
    getById:    function (id) { return DB.getById(K_CLASSES, id); },
    save: function (d) {
      if (!d.groupId)            return { ok: false, msg: 'Selecciona un grupo.' };
      if (!d.fecha)              return { ok: false, msg: 'La fecha es obligatoria.' };
      if (!d.tema.trim() && !d.desarrollo.trim()) return { ok: false, msg: 'Escribe al menos el tema o el desarrollo.' };
      var ex = d.id ? DB.getById(K_CLASSES, d.id) : null;
      var rec = newClass(d);
      if (ex) rec.createdAt = ex.createdAt;
      return { ok: true, record: DB.upsert(K_CLASSES, rec) };
    },
    remove:          function (id) { DB.remove(K_CLASSES, id); },
    duplicate: function (id) {
      var o = DB.getById(K_CLASSES, id);
      if (!o) return null;
      return DB.upsert(K_CLASSES, newClass(Object.assign({}, o, { id: U.id(), fecha: U.today(), tareaRevisada: false })));
    },
    getPendingTasks: function () {
      var today = U.today();
      return this.getAll().filter(function (c) {
        return c.tarea && c.fechaTarea && c.fechaTarea <= today && !c.tareaRevisada;
      });
    },
    markReviewed: function (id) {
      var rec = DB.getById(K_CLASSES, id);
      if (!rec) return;
      rec.tareaRevisada = true; rec.updatedAt = new Date().toISOString();
      DB.upsert(K_CLASSES, rec);
    }
  };

  var Schedule = {
    getAll:    function () { return DB.getAll(K_SCHEDULE); },
    getByDay:  function (dia) {
      return this.getAll()
        .filter(function (b) { return b.dia === dia; })
        .sort(function (a, b) { return a.horaInicio < b.horaInicio ? -1 : 1; });
    },
    save: function (d) {
      if (d.dia === undefined || d.dia === null || !d.groupId) return { ok: false, msg: 'Completa día y grupo.' };
      return { ok: true, record: DB.upsert(K_SCHEDULE, newBlock(d)) };
    },
    remove: function (id) { DB.remove(K_SCHEDULE, id); }
  };

  /* ════════════════════════════════════════════════════════════════════════
     RELOJ EN TIEMPO REAL
  ════════════════════════════════════════════════════════════════════════ */
  var clockInterval = null;
  function startClock() {
    function tick() {
      var el = document.getElementById('liveClock');
      if (!el) return;
      var now = new Date();
      var h = now.getHours(), m = now.getMinutes(), s = now.getSeconds();
      var ampm = h < 12 ? 'AM' : 'PM';
      h = h % 12 || 12;
      el.textContent = h + ':' + (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s) + ' ' + ampm;
    }
    tick();
    clearInterval(clockInterval);
    clockInterval = setInterval(tick, 1000);
  }

  /* ════════════════════════════════════════════════════════════════════════
     NAVEGACIÓN
  ════════════════════════════════════════════════════════════════════════ */
  var App = {
    view: 'home',
    param: null,

    go: function (view, param) {
      this.view  = view;
      this.param = param || null;
      closeSidebar();
      this._render();
      this._updateNav();
      // Volver al tope en móvil
      window.scrollTo(0, 0);
    },

    _render: function () {
      var el = document.getElementById('appContent');
      if (!el) return;
      el.innerHTML = '';
      try {
        switch (this.view) {
          case 'home':       Views.home(el);                 break;
          case 'grupos':     Views.grupos(el);               break;
          case 'grupo':      Views.grupo(el, this.param);    break;
          case 'horario':    Views.horario(el);              break;
          case 'nueva-clase':Views.formClase(el, this.param);break;
          case 'config':     Views.config(el);               break;
          default:           Views.home(el);
        }
      } catch (err) {
        el.innerHTML =
          '<div class="card" style="border-left:3px solid var(--danger);padding:20px">' +
          '<p style="font-weight:700;color:var(--danger)">Error al cargar la vista</p>' +
          '<pre style="font-size:11px;margin-top:10px;white-space:pre-wrap;overflow:auto">' + U.esc(err.stack || err.message || String(err)) + '</pre></div>';
        console.error('[DiarioClase]', err);
      }
    },

    _updateNav: function () {
      var cur = this.view;
      document.querySelectorAll('.nav-item').forEach(function (el) {
        var v = el.dataset.view;
        el.classList.toggle('active', v === cur || (cur === 'grupo' && v === 'grupos'));
      });
    }
  };

  /* ════════════════════════════════════════════════════════════════════════
     SIDEBAR — apertura / cierre con soporte táctil
  ════════════════════════════════════════════════════════════════════════ */
  function openSidebar() {
    document.getElementById('appShell').classList.add('mobile-open');
  }
  function closeSidebar() {
    document.getElementById('appShell').classList.remove('mobile-open');
  }

  function initSidebarTouch() {
    var backdrop = document.getElementById('sidebarBackdrop');
    if (!backdrop) return;

    // Click normal
    backdrop.addEventListener('click', closeSidebar);
    // Touch en iOS Safari — necesita handler explícito
    backdrop.addEventListener('touchend', function (e) {
      e.preventDefault();
      closeSidebar();
    }, { passive: false });
  }

  /* ════════════════════════════════════════════════════════════════════════
     RECORDATORIOS AL CARGAR
  ════════════════════════════════════════════════════════════════════════ */
  function showReminders() {
    var pending = Classes.getPendingTasks();
    if (!pending.length) return;

    function gname(id) {
      var g = Groups.getById(id);
      return g ? g.nombre + (g.asignatura ? ' (' + g.asignatura + ')' : '') : 'Grupo desconocido';
    }

    var ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.innerHTML =
      '<div class="modal-box" style="max-width:460px">' +
        '<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">' +
          '<span style="font-size:28px">🔔</span>' +
          '<div><h3 style="margin:0;font-size:17px">Tareas pendientes</h3>' +
          '<p class="text-sm text-muted" style="margin-top:2px">Estos grupos tienen actividades por revisar</p></div>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:8px;max-height:55vh;overflow-y:auto;-webkit-overflow-scrolling:touch">' +
          pending.map(function (c) {
            return '<div style="padding:11px 14px;background:var(--bg);border-radius:10px;border-left:3px solid var(--accent)">' +
              '<p style="font-weight:700;margin:0;font-size:14px">' + U.esc(gname(c.groupId)) + '</p>' +
              '<p class="text-sm" style="margin:3px 0 0">📝 ' + U.esc(U.cut(c.tarea, 80)) + '</p>' +
              '<p class="text-sm text-muted" style="margin:2px 0 0">Entrega: ' + U.dateShort(c.fechaTarea) + '</p>' +
              '<button class="btn btn-sm" style="margin-top:7px;background:var(--primary-s);color:var(--primary)" data-mark="' + c.id + '">✓ Marcar revisada</button>' +
            '</div>';
          }).join('') +
        '</div>' +
        '<button class="btn btn-primary" style="width:100%;margin-top:16px" id="closeRemBtn">Entendido</button>' +
      '</div>';

    document.body.appendChild(ov);
    document.getElementById('closeRemBtn').onclick = function () { ov.remove(); };
    ov.querySelectorAll('[data-mark]').forEach(function (btn) {
      btn.onclick = function () {
        Classes.markReviewed(btn.dataset.mark);
        btn.closest('[style*="border-left"]').style.opacity = '.4';
        btn.textContent = '✓ Revisada'; btn.disabled = true;
        Toast.success('Marcada como revisada.');
      };
    });
  }

  /* ════════════════════════════════════════════════════════════════════════
     VISTAS
  ════════════════════════════════════════════════════════════════════════ */
  var Views = {

    /* ── INICIO ────────────────────────────────────────────────── */
    home: function (el) {
      var grupos   = Groups.getAll();
      var clases   = Classes.getAll();
      var pending  = Classes.getPendingTasks();
      var today    = U.today();
      var dayJS    = new Date().getDay(); // 0=dom,1=lun…6=sáb
      var schedDay = dayJS === 0 ? -1 : dayJS - 1;
      var todayBlocks = schedDay >= 0 ? Schedule.getByDay(schedDay) : [];

      el.innerHTML =
        '<div class="page-header">' +
          '<div><h1 class="page-title">Inicio</h1>' +
          '<p class="page-subtitle">' + U.dateLabel(today) + '</p></div>' +
          '<button class="btn btn-primary" id="btnNuevaHome">+ Registrar clase</button>' +
        '</div>' +

        // Alerta pendientes
        (pending.length ?
          '<div class="alert-card" id="alertPend">' +
            '<span style="font-size:24px">🔔</span>' +
            '<div style="flex:1;min-width:0">' +
              '<p style="font-weight:700;margin:0">' + pending.length + ' tarea' + (pending.length > 1 ? 's' : '') + ' pendiente' + (pending.length > 1 ? 's' : '') + ' de revisión</p>' +
              '<p class="text-sm text-muted" style="margin:2px 0 0">Toca para ver los detalles</p>' +
            '</div>' +
            '<span style="font-size:18px">→</span>' +
          '</div>' : '') +

        // Clases de hoy según horario
        (todayBlocks.length ?
          '<div class="card" style="margin-bottom:16px">' +
            '<h3 class="section-title">📅 Tus clases de hoy</h3>' +
            todayBlocks.map(function (b) {
              var g = Groups.getById(b.groupId);
              return '<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">' +
                '<div class="group-dot" style="background:' + (g ? g.color : '#ccc') + '"></div>' +
                '<div style="flex:1;min-width:0">' +
                  '<p style="font-weight:700;margin:0">' + (g ? U.esc(g.nombre) : 'Grupo eliminado') + (g && g.asignatura ? ' — ' + U.esc(g.asignatura) : '') + '</p>' +
                  (b.horaInicio ? '<p class="text-sm text-muted" style="margin:2px 0 0">⏰ ' + U.timeLabel(b.horaInicio) + (b.horaFin ? ' – ' + U.timeLabel(b.horaFin) : '') + (b.aula ? ' · 🚪 ' + U.esc(b.aula) : '') + '</p>' : '') +
                '</div>' +
                (g ? '<button class="btn btn-sm btn-secondary" data-reg="' + b.groupId + '">Registrar</button>' : '') +
              '</div>';
            }).join('') +
          '</div>' : '') +

        // Grid de grupos
        '<h3 class="section-title">Mis grupos</h3>' +
        (grupos.length === 0 ?
          '<div class="empty-state card">' +
            '<p style="font-size:36px;margin-bottom:8px">🏫</p>' +
            '<p class="empty-state-title">Aún no tienes grupos</p>' +
            '<p class="text-sm text-muted">Crea tu primer grupo para empezar.</p>' +
            '<button class="btn btn-primary" style="margin-top:14px" id="btnCGHome">Crear grupo</button>' +
          '</div>' :
          '<div class="groups-grid">' +
            grupos.map(function (g) {
              var clsG  = Classes.getByGroup(g.id);
              var last  = clsG[0];
              var pend  = pending.filter(function (c) { return c.groupId === g.id; }).length;
              return '<div class="group-card" data-gid="' + g.id + '" style="border-top:3px solid ' + g.color + '">' +
                '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">' +
                  '<div style="min-width:0">' +
                    '<h3 style="margin:0;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + U.esc(g.nombre) + '</h3>' +
                    (g.asignatura ? '<p class="text-sm text-muted" style="margin:2px 0 0">' + U.esc(g.asignatura) + '</p>' : '') +
                  '</div>' +
                  (pend ? '<span class="badge-alert">' + pend + '</span>' : '') +
                '</div>' +
                '<p class="text-sm text-muted" style="margin-top:10px">' + clsG.length + ' clase' + (clsG.length !== 1 ? 's' : '') + '</p>' +
                (last ? '<p class="text-sm" style="margin-top:2px">Última: ' + U.dateShort(last.fecha) + '</p>' : '') +
                '<button class="btn btn-primary" style="width:100%;margin-top:12px" data-ver="' + g.id + '">Ver grupo →</button>' +
              '</div>';
            }).join('') +
          '</div>') +

        // Últimas clases
        (clases.length ?
          '<div class="card mt-4">' +
            '<h3 class="section-title">Últimos registros</h3>' +
            clases.slice(0, 5).map(function (c) {
              var g = Groups.getById(c.groupId);
              return '<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">' +
                '<div class="group-dot" style="background:' + (g ? g.color : '#ccc') + '"></div>' +
                '<div style="flex:1;min-width:0">' +
                  '<p style="font-weight:600;margin:0;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + U.esc(c.tema || c.desarrollo || 'Sin tema') + '</p>' +
                  '<p class="text-sm text-muted" style="margin:2px 0 0">' + (g ? U.esc(g.nombre) : '—') + ' · ' + U.dateShort(c.fecha) + '</p>' +
                '</div>' +
                (c.tarea && !c.tareaRevisada ? '<span class="badge-task">📝 Tarea</span>' : '') +
              '</div>';
            }).join('') +
          '</div>' : '');

      // Eventos
      var bN = document.getElementById('btnNuevaHome');
      if (bN) bN.onclick = function () { App.go('nueva-clase'); };

      var bCG = document.getElementById('btnCGHome');
      if (bCG) bCG.onclick = function () { App.go('grupos'); };

      var alertEl = document.getElementById('alertPend');
      if (alertEl) alertEl.onclick = function () { showReminders(); };

      el.querySelectorAll('[data-ver]').forEach(function (btn) {
        btn.onclick = function (e) { e.stopPropagation(); App.go('grupo', btn.dataset.ver); };
      });
      el.querySelectorAll('[data-reg]').forEach(function (btn) {
        btn.onclick = function (e) { e.stopPropagation(); App.go('nueva-clase', { groupId: btn.dataset.reg }); };
      });
      el.querySelectorAll('.group-card').forEach(function (card) {
        card.onclick = function (e) {
          if (!e.target.closest('button')) App.go('grupo', card.dataset.gid);
        };
      });
    },

    /* ── GRUPOS ────────────────────────────────────────────────── */
    grupos: function (el) {
      var grupos = Groups.getAll();

      function draw() {
        var lst = document.getElementById('gruposLst');
        if (!lst) return;
        if (!grupos.length) {
          lst.innerHTML = '<div class="empty-state card"><p style="font-size:36px;margin-bottom:8px">🏫</p>' +
            '<p class="empty-state-title">Sin grupos todavía</p>' +
            '<p class="text-sm text-muted">Crea un grupo para empezar a registrar clases.</p></div>';
          return;
        }
        lst.innerHTML = '<div class="groups-grid">' +
          grupos.map(function (g) {
            var n = Classes.getByGroup(g.id).length;
            return '<div class="group-card" style="border-top:3px solid ' + g.color + '">' +
              '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px">' +
                '<div style="min-width:0">' +
                  '<h3 style="margin:0;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + U.esc(g.nombre) + '</h3>' +
                  (g.asignatura ? '<p class="text-sm text-muted" style="margin:2px 0 0">' + U.esc(g.asignatura) + '</p>' : '') +
                '</div>' +
                '<div style="display:flex;gap:4px;flex-shrink:0">' +
                  '<button class="btn btn-ghost btn-sm" data-edit="' + g.id + '" title="Editar">✏️</button>' +
                  '<button class="btn btn-ghost btn-sm" data-del="' + g.id + '" title="Eliminar">🗑️</button>' +
                '</div>' +
              '</div>' +
              '<p class="text-sm text-muted" style="margin-top:10px">' + n + ' clase' + (n !== 1 ? 's' : '') + ' registrada' + (n !== 1 ? 's' : '') + '</p>' +
              '<button class="btn btn-primary" style="width:100%;margin-top:10px" data-ver="' + g.id + '">Ver →</button>' +
            '</div>';
          }).join('') + '</div>';

        lst.querySelectorAll('[data-edit]').forEach(function (btn) {
          btn.onclick = function (e) {
            e.stopPropagation();
            Views._modalGrupo(Groups.getById(btn.dataset.edit), function () { grupos = Groups.getAll(); draw(); });
          };
        });
        lst.querySelectorAll('[data-del]').forEach(function (btn) {
          btn.onclick = function (e) {
            e.stopPropagation();
            showConfirm('¿Eliminar el grupo y TODAS sus clases? Esta acción no se puede deshacer.', function () {
              Groups.remove(btn.dataset.del); grupos = Groups.getAll(); draw();
              Toast.success('Grupo eliminado.');
            }, 'Eliminar todo');
          };
        });
        lst.querySelectorAll('[data-ver]').forEach(function (btn) {
          btn.onclick = function (e) { e.stopPropagation(); App.go('grupo', btn.dataset.ver); };
        });
      }

      el.innerHTML =
        '<div class="page-header">' +
          '<div><h1 class="page-title">Mis grupos</h1>' +
          '<p class="page-subtitle">Gestiona tus cursos y asignaturas</p></div>' +
          '<button class="btn btn-primary" id="btnNuevoGrupo">+ Nuevo grupo</button>' +
        '</div>' +
        '<div id="gruposLst"></div>';

      draw();
      document.getElementById('btnNuevoGrupo').onclick = function () {
        Views._modalGrupo(null, function () { grupos = Groups.getAll(); draw(); });
      };
    },

    /* ── MODAL GRUPO ───────────────────────────────────────────── */
    _modalGrupo: function (existing, onSave) {
      var g = existing || { nombre: '', asignatura: '', color: U.nextColor() };
      var selectedColor = g.color;
      var ov = document.createElement('div');
      ov.className = 'modal-overlay';
      ov.innerHTML =
        '<div class="modal-box" style="max-width:400px">' +
          '<h3 style="margin:0 0 18px;font-size:18px">' + (existing ? 'Editar grupo' : 'Nuevo grupo') + '</h3>' +
          '<div class="field">' +
            '<label class="field-label">Nombre del grupo <span style="color:var(--danger)">*</span></label>' +
            '<input class="input" type="text" id="mgNombre" inputmode="text" placeholder="Ej: 901, 10B" value="' + U.esc(g.nombre) + '" autocomplete="off">' +
          '</div>' +
          '<div class="field mt-4">' +
            '<label class="field-label">Asignatura</label>' +
            '<input class="input" type="text" id="mgAsig" inputmode="text" placeholder="Ej: Matemáticas" value="' + U.esc(g.asignatura) + '" autocomplete="off">' +
          '</div>' +
          '<div class="field mt-4">' +
            '<label class="field-label">Color identificador</label>' +
            '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px" id="colorPicker">' +
              GROUP_COLORS.map(function (c) {
                return '<button type="button" class="color-swatch' + (g.color === c ? ' selected' : '') + '" data-color="' + c + '" aria-label="' + c + '">' +
                  '<div class="swatch-inner" style="background:' + c + '"></div></button>';
              }).join('') +
            '</div>' +
          '</div>' +
          '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:22px">' +
            '<button class="btn btn-ghost" id="mgCancel">Cancelar</button>' +
            '<button class="btn btn-primary" id="mgSave">Guardar</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(ov);

      ov.querySelectorAll('.color-swatch').forEach(function (sw) {
        sw.onclick = function () {
          ov.querySelectorAll('.color-swatch').forEach(function (s) { s.classList.remove('selected'); });
          sw.classList.add('selected');
          selectedColor = sw.dataset.color;
        };
      });
      ov.querySelector('#mgCancel').onclick = function () { ov.remove(); };
      ov.querySelector('#mgSave').onclick = function () {
        var res = Groups.save({
          id: g.id, createdAt: g.createdAt,
          nombre: document.getElementById('mgNombre').value.trim(),
          asignatura: document.getElementById('mgAsig').value.trim(),
          color: selectedColor
        });
        if (!res.ok) { Toast.error(res.msg); return; }
        ov.remove();
        Toast.success(existing ? 'Grupo actualizado.' : 'Grupo creado.');
        if (onSave) onSave(res.record);
      };
      ov.onclick = function (e) { if (e.target === ov) ov.remove(); };
      setTimeout(function () { var i = document.getElementById('mgNombre'); if (i) i.focus(); }, 150);
    },

    /* ── VISTA DE UN GRUPO ─────────────────────────────────────── */
    grupo: function (el, gid) {
      var g = Groups.getById(gid);
      if (!g) { el.innerHTML = '<p>Grupo no encontrado.</p>'; return; }
      var clases = Classes.getByGroup(gid);
      var query = '';

      function draw() {
        var lst = document.getElementById('grupoList');
        if (!lst) return;
        var items = !query ? clases : clases.filter(function (c) {
          return [c.tema, c.desarrollo, c.tarea].join(' ').toLowerCase().indexOf(query.toLowerCase()) > -1;
        });
        if (!items.length) {
          lst.innerHTML = '<div class="empty-state"><p style="font-size:28px">📋</p>' +
            '<p class="empty-state-title">Sin registros' + (query ? ' para "' + U.esc(query) + '"' : '') + '</p>' +
            (query ? '' : '<p class="text-sm text-muted">Registra la primera clase de este grupo.</p>') +
            '</div>';
          return;
        }
        lst.innerHTML = items.map(function (c) {
          return '<div class="class-row" data-cid="' + c.id + '">' +
            '<div class="class-row-date">' +
              '<span class="date-day">' + c.fecha.slice(8) + '</span>' +
              '<span class="date-month">' + U.monthShort(c.fecha) + '</span>' +
            '</div>' +
            '<div>' +
              (c.tema ? '<p class="class-row-tema">' + U.esc(U.cut(c.tema, 70)) + '</p>' : '') +
              (c.desarrollo ? '<p class="text-sm text-muted">' + U.esc(U.cut(c.desarrollo, 100)) + '</p>' : '') +
              (c.tarea ?
                '<p class="text-sm" style="margin-top:4px;color:var(--accent)">📝 ' + U.esc(U.cut(c.tarea, 60)) +
                (c.fechaTarea ? ' · ' + U.dateShort(c.fechaTarea) : '') +
                (c.tareaRevisada ? ' <span style="color:var(--primary)">✓</span>' : '') + '</p>' : '') +
              (c.periodo ? '<p class="text-sm text-muted" style="margin-top:2px">Periodo: ' + U.esc(c.periodo) + '</p>' : '') +
            '</div>' +
            '<div class="class-row-actions">' +
              '<button class="btn btn-ghost btn-sm" data-act="edit" data-id="' + c.id + '" title="Editar">✏️</button>' +
              '<button class="btn btn-ghost btn-sm" data-act="dup" data-id="' + c.id + '" title="Duplicar">📋</button>' +
              '<button class="btn btn-ghost btn-sm" data-act="del" data-id="' + c.id + '" title="Eliminar">🗑️</button>' +
            '</div>' +
          '</div>';
        }).join('');

        lst.querySelectorAll('[data-act]').forEach(function (btn) {
          btn.onclick = function (e) {
            e.stopPropagation();
            var id = btn.dataset.id, act = btn.dataset.act;
            if (act === 'edit') App.go('nueva-clase', { groupId: gid, classId: id });
            if (act === 'dup') {
              Classes.duplicate(id);
              clases = Classes.getByGroup(gid);
              draw();
              Toast.success('Registro duplicado con la fecha de hoy.');
            }
            if (act === 'del') {
              showConfirm('¿Eliminar este registro de clase?', function () {
                Classes.remove(id); clases = Classes.getByGroup(gid); draw();
                Toast.success('Registro eliminado.');
              }, 'Eliminar');
            }
          };
        });
      }

      el.innerHTML =
        '<div class="page-header">' +
          '<div style="display:flex;align-items:center;gap:10px">' +
            '<div class="group-dot" style="width:14px;height:14px;background:' + g.color + '"></div>' +
            '<div>' +
              '<h1 class="page-title">' + U.esc(g.nombre) + '</h1>' +
              (g.asignatura ? '<p class="page-subtitle">' + U.esc(g.asignatura) + '</p>' : '') +
            '</div>' +
          '</div>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
            '<button class="btn btn-secondary btn-sm" id="btnEditG">✏️ Editar</button>' +
            '<button class="btn btn-primary" id="btnRegClase">+ Registrar clase</button>' +
          '</div>' +
        '</div>' +
        '<div style="margin-bottom:14px">' +
          '<input class="search-input" type="search" id="grupoSearch" placeholder="Buscar en este grupo…">' +
        '</div>' +
        '<div id="grupoList"></div>';

      draw();
      document.getElementById('btnRegClase').onclick = function () { App.go('nueva-clase', { groupId: gid }); };
      document.getElementById('btnEditG').onclick = function () {
        Views._modalGrupo(g, function () { g = Groups.getById(gid); App.go('grupo', gid); });
      };
      document.getElementById('grupoSearch').oninput = U.debounce(function (e) { query = e.target.value.trim(); draw(); }, 250);
    },

    /* ── FORMULARIO CLASE ──────────────────────────────────────── */
    formClase: function (el, param) {
      param = param || {};
      var editId     = param.classId || null;
      var preGroupId = param.groupId || null;
      var grupos     = Groups.getAll();
      var existing   = editId ? Classes.getById(editId) : null;
      var data = existing || { groupId: preGroupId || '', fecha: U.today(), periodo: '', tema: '', desarrollo: '', tarea: '', fechaTarea: '' };

      if (!grupos.length) {
        el.innerHTML = '<div class="empty-state card"><p style="font-size:36px;margin-bottom:8px">🏫</p>' +
          '<p class="empty-state-title">Primero crea un grupo</p>' +
          '<p class="text-sm text-muted">Necesitas al menos un grupo para registrar una clase.</p>' +
          '<button class="btn btn-primary" style="margin-top:14px" id="btnGoGrupos">Crear grupo</button></div>';
        document.getElementById('btnGoGrupos').onclick = function () { App.go('grupos'); };
        return;
      }

      el.innerHTML =
        '<div class="page-header">' +
          '<div><h1 class="page-title">' + (editId ? 'Editar registro' : 'Registrar clase') + '</h1></div>' +
          '<div style="display:flex;gap:8px">' +
            '<button class="btn btn-secondary" id="fcCancel">Cancelar</button>' +
            '<button class="btn btn-primary" id="fcSave">💾 Guardar</button>' +
          '</div>' +
        '</div>' +
        '<div class="form-card">' +

          '<div class="form-row">' +
            '<div class="field">' +
              '<label class="field-label">Grupo / Curso <span style="color:var(--danger)">*</span></label>' +
              '<select class="select" id="fcGroup">' +
                '<option value="">Seleccionar…</option>' +
                grupos.map(function (g) {
                  return '<option value="' + g.id + '"' + (data.groupId === g.id ? ' selected' : '') + '>' +
                    U.esc(g.nombre + (g.asignatura ? ' — ' + g.asignatura : '')) + '</option>';
                }).join('') +
              '</select>' +
            '</div>' +
            '<div class="field">' +
              '<label class="field-label">Fecha <span style="color:var(--danger)">*</span></label>' +
              '<input class="input" type="date" id="fcFecha" value="' + U.esc(data.fecha) + '">' +
            '</div>' +
            '<div class="field">' +
              '<label class="field-label">Periodo académico</label>' +
              '<input class="input" type="text" id="fcPeriodo" inputmode="text" placeholder="Ej: P1, 2025-1" value="' + U.esc(data.periodo || '') + '" autocomplete="off">' +
            '</div>' +
          '</div>' +

          '<div class="field mt-4">' +
            '<label class="field-label">Tema de la clase</label>' +
            '<input class="input" type="text" id="fcTema" inputmode="text" placeholder="Ej: Ecuaciones de primer grado" value="' + U.esc(data.tema || '') + '" autocomplete="off">' +
          '</div>' +

          '<div class="field mt-4">' +
            '<label class="field-label">Desarrollo de la clase <span style="color:var(--danger)">*</span></label>' +
            '<textarea class="textarea" id="fcDesarrollo" rows="5" placeholder="¿Qué se hizo en clase? Describe brevemente…">' + U.esc(data.desarrollo || '') + '</textarea>' +
          '</div>' +

          '<div class="field mt-4">' +
            '<label class="field-label">Tarea asignada</label>' +
            '<textarea class="textarea" id="fcTarea" rows="3" placeholder="Describe la tarea o actividad para casa…">' + U.esc(data.tarea || '') + '</textarea>' +
          '</div>' +

          '<div class="field mt-4" id="fcFTWrap">' +
            '<label class="field-label">Fecha límite de entrega</label>' +
            '<input class="input" type="date" id="fcFechaTarea" value="' + U.esc(data.fechaTarea || '') + '">' +
          '</div>' +

        '</div>';

      // Mostrar campo fecha tarea solo si hay tarea
      function syncFechaTarea() {
        var t = document.getElementById('fcTarea');
        var w = document.getElementById('fcFTWrap');
        if (t && w) w.style.display = t.value.trim() ? '' : 'none';
      }
      var fcT = document.getElementById('fcTarea');
      if (fcT) { fcT.addEventListener('input', syncFechaTarea); syncFechaTarea(); }

      document.getElementById('fcCancel').onclick = function () {
        App.go(preGroupId ? 'grupo' : 'home', preGroupId || null);
      };

      document.getElementById('fcSave').onclick = function () {
        var d = {
          id:           editId || undefined,
          groupId:      document.getElementById('fcGroup').value,
          fecha:        document.getElementById('fcFecha').value,
          periodo:      document.getElementById('fcPeriodo').value.trim(),
          tema:         document.getElementById('fcTema').value.trim(),
          desarrollo:   document.getElementById('fcDesarrollo').value.trim(),
          tarea:        document.getElementById('fcTarea').value.trim(),
          fechaTarea:   document.getElementById('fcFechaTarea').value,
          tareaRevisada: existing ? existing.tareaRevisada : false,
          createdAt:    existing ? existing.createdAt : undefined
        };
        var res = Classes.save(d);
        if (!res.ok) { Toast.error(res.msg); return; }
        Toast.success(editId ? 'Registro actualizado.' : '¡Clase registrada!');
        App.go(d.groupId ? 'grupo' : 'home', d.groupId || null);
      };
    },

    /* ── HORARIO SEMANAL CON RELOJ ─────────────────────────────── */
    horario: function (el) {
      var grupos = Groups.getAll();

      // Minutos actuales para destacar el bloque activo
      function nowMins() {
        var n = new Date(); return n.getHours() * 60 + n.getMinutes();
      }

      function draw() {
        var tbl = document.getElementById('schedTable');
        if (!tbl) return;
        var nm = nowMins();
        tbl.innerHTML =
          '<div class="schedule-wrapper">' +
            '<div class="schedule-grid">' +
              DAYS_LONG.map(function (dia, idx) {
                var blocks = Schedule.getByDay(idx);
                return '<div class="schedule-col">' +
                  '<div class="schedule-day-header">' + dia + '</div>' +
                  blocks.map(function (b) {
                    var g = Groups.getById(b.groupId);
                    // ¿Es el bloque activo ahora?
                    var start = U.timeToMins(b.horaInicio);
                    var end   = U.timeToMins(b.horaFin);
                    var isNow = start >= 0 && end > start && nm >= start && nm < end;
                    return '<div class="schedule-block' + (isNow ? ' now' : '') + '">' +
                      (b.horaInicio ?
                        '<div class="time-badge">⏰ ' + U.timeLabel(b.horaInicio) + (b.horaFin ? ' – ' + U.timeLabel(b.horaFin) : '') + '</div>' : '') +
                      '<p style="font-weight:800;font-size:13px;margin:0">' + (g ? U.esc(g.nombre) : '?') + '</p>' +
                      (g && g.asignatura ? '<p style="font-size:11px;color:var(--ink-m);margin:1px 0 0">' + U.esc(g.asignatura) + '</p>' : '') +
                      (b.aula ? '<p style="font-size:11px;color:var(--ink-f);margin:2px 0 0">🚪 ' + U.esc(b.aula) + '</p>' : '') +
                      (isNow ? '<p style="font-size:11px;color:var(--primary);font-weight:700;margin-top:4px">▶ Ahora</p>' : '') +
                      '<button class="btn btn-ghost btn-sm" style="width:100%;margin-top:5px;font-size:11px" data-del="' + b.id + '">✕ Quitar</button>' +
                    '</div>';
                  }).join('') +
                  '<button class="btn btn-secondary btn-sm" style="width:100%;margin-top:6px" data-add="' + idx + '">+ Agregar</button>' +
                '</div>';
              }).join('') +
            '</div>' +
          '</div>';

        tbl.querySelectorAll('[data-del]').forEach(function (btn) {
          btn.onclick = function () { Schedule.remove(btn.dataset.del); draw(); };
        });
        tbl.querySelectorAll('[data-add]').forEach(function (btn) {
          btn.onclick = function () { Views._modalBloque(+btn.dataset.add, grupos, draw); };
        });
      }

      el.innerHTML =
        '<div class="page-header">' +
          '<div>' +
            '<h1 class="page-title">Horario semanal</h1>' +
            '<p class="page-subtitle">El bloque activo se muestra resaltado en tiempo real</p>' +
          '</div>' +
        '</div>' +
        '<p class="text-sm text-muted" style="margin-bottom:16px">Desliza horizontalmente para ver todos los días → </p>' +
        (grupos.length === 0 ?
          '<div class="empty-state card">' +
            '<p class="empty-state-title">Crea grupos primero</p>' +
            '<p class="text-sm text-muted">Necesitas grupos para armar tu horario.</p>' +
            '<button class="btn btn-primary" style="margin-top:14px" id="btnGoGS">Crear grupo</button>' +
          '</div>' :
          '<div id="schedTable"></div>');

      var bGS = document.getElementById('btnGoGS');
      if (bGS) bGS.onclick = function () { App.go('grupos'); };
      if (grupos.length) {
        draw();
        // Actualizar destacado cada minuto
        setInterval(function () {
          if (App.view === 'horario') draw();
        }, 60000);
      }
    },

    /* ── MODAL AGREGAR BLOQUE DE HORARIO ───────────────────────── */
    _modalBloque: function (dia, grupos, onSave) {
      var ov = document.createElement('div');
      ov.className = 'modal-overlay';
      ov.innerHTML =
        '<div class="modal-box" style="max-width:360px">' +
          '<h3 style="margin:0 0 16px;font-size:17px">Agregar clase — ' + U.esc(DAYS_LONG[dia]) + '</h3>' +
          '<div class="field">' +
            '<label class="field-label">Grupo <span style="color:var(--danger)">*</span></label>' +
            '<select class="select" id="mbGroup">' +
              '<option value="">Seleccionar…</option>' +
              grupos.map(function (g) {
                return '<option value="' + g.id + '">' + U.esc(g.nombre + (g.asignatura ? ' — ' + g.asignatura : '')) + '</option>';
              }).join('') +
            '</select>' +
          '</div>' +
          '<div class="form-row mt-4">' +
            '<div class="field">' +
              '<label class="field-label">⏰ Hora inicio</label>' +
              '<input class="input" type="time" id="mbHI">' +
            '</div>' +
            '<div class="field">' +
              '<label class="field-label">⏰ Hora fin</label>' +
              '<input class="input" type="time" id="mbHF">' +
            '</div>' +
          '</div>' +
          '<div class="field mt-4">' +
            '<label class="field-label">🚪 Aula / Salón</label>' +
            '<input class="input" type="text" id="mbAula" inputmode="text" placeholder="Ej: 301, Lab Física" autocomplete="off">' +
          '</div>' +
          '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px">' +
            '<button class="btn btn-ghost" id="mbCancel">Cancelar</button>' +
            '<button class="btn btn-primary" id="mbSave">Agregar</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(ov);
      ov.querySelector('#mbCancel').onclick = function () { ov.remove(); };
      ov.querySelector('#mbSave').onclick = function () {
        var res = Schedule.save({
          dia:        dia,
          groupId:    document.getElementById('mbGroup').value,
          horaInicio: document.getElementById('mbHI').value,
          horaFin:    document.getElementById('mbHF').value,
          aula:       document.getElementById('mbAula').value.trim()
        });
        if (!res.ok) { Toast.error(res.msg); return; }
        ov.remove(); if (onSave) onSave();
        Toast.success('Bloque de horario agregado.');
      };
      ov.onclick = function (e) { if (e.target === ov) ov.remove(); };
    },

    /* ── CONFIGURACIÓN ─────────────────────────────────────────── */
    config: function (el) {
      var info = DB.usage();
      var savedUrl = '';
      try { savedUrl = localStorage.getItem('dcp_sheets_url') || ''; } catch (e) {}

      el.innerHTML =
        '<div class="page-header">' +
          '<div><h1 class="page-title">Configuración</h1>' +
          '<p class="page-subtitle">Respaldo y sincronización</p></div>' +
        '</div>' +

        '<div class="card">' +
          '<h3 class="section-title">💾 Almacenamiento</h3>' +
          '<p class="text-sm text-muted">Usado: ' + (info.bytes / 1024).toFixed(1) + ' KB de ~5 MB (' + info.pct + '%)</p>' +
          '<div style="background:var(--border);border-radius:var(--r-full);height:8px;margin-top:9px;overflow:hidden">' +
            '<div style="width:' + Math.min(info.pct, 100) + '%;background:var(--primary);height:100%;transition:width .4s"></div>' +
          '</div>' +
        '</div>' +

        '<div class="card mt-4">' +
          '<h3 class="section-title">📦 Respaldo de datos</h3>' +
          '<p class="text-sm text-muted" style="margin-bottom:14px">Exporta grupos, clases y horario a un archivo JSON para hacer copias de seguridad.</p>' +
          '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
            '<button class="btn btn-primary" id="btnExport">↓ Exportar</button>' +
            '<label class="btn btn-secondary" style="cursor:pointer">↑ Importar <input type="file" id="btnImport" accept=".json" style="display:none"></label>' +
          '</div>' +
        '</div>' +

        '<div class="card mt-4">' +
          '<h3 class="section-title">📊 Google Sheets</h3>' +
          '<p class="text-sm text-muted" style="margin-bottom:6px">' +
            'Tu hoja: <a href="' + SHEETS_URL + '" target="_blank" rel="noopener" style="color:var(--primary);font-weight:700">Abrir Google Sheets ↗</a>' +
          '</p>' +
          '<p class="text-sm text-muted" style="margin-bottom:14px">Publica el Apps Script en tu hoja y pega la URL para sincronizar.</p>' +
          '<div class="field" style="max-width:520px">' +
            '<label class="field-label">URL de la Web App</label>' +
            '<input class="input" type="url" id="sheetsUrl" inputmode="url" placeholder="https://script.google.com/macros/s/…/exec" value="' + U.esc(savedUrl) + '">' +
          '</div>' +
          '<div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap">' +
            '<button class="btn btn-secondary" id="btnSaveUrl">Guardar URL</button>' +
            '<button class="btn btn-primary" id="btnSync">↑ Sincronizar</button>' +
          '</div>' +
          '<details style="margin-top:16px">' +
            '<summary class="text-sm" style="cursor:pointer;font-weight:700;color:var(--ink-m)">Ver código de Apps Script ▾</summary>' +
            '<div style="position:relative;margin-top:8px">' +
              '<button id="btnCopyScript" class="btn btn-secondary btn-sm" style="position:absolute;top:6px;right:6px;z-index:1">Copiar</button>' +
              '<pre id="scriptCode" style="font-size:11px;background:var(--surface);border:1px solid var(--border);padding:12px;padding-top:36px;border-radius:var(--r-sm);overflow:auto;line-height:1.6;margin:0;-webkit-overflow-scrolling:touch">' +
'function doPost(e) {\n' +
'  try {\n' +
'    var raw = (e.postData&&e.postData.contents) ? e.postData.contents\n' +
'              : (e.parameter&&e.parameter.data) ? e.parameter.data : "{}";\n' +
'    var d = JSON.parse(raw);\n' +
'    var sheet = SpreadsheetApp.openById("' + SHEETS_ID + '").getSheets()[0];\n' +
'    if (d.clear) sheet.clearContents();\n' +
'    if (d.header) sheet.appendRow(d.header);\n' +
'    (d.rows||[]).forEach(function(r){ sheet.appendRow(r); });\n' +
'    return ContentService\n' +
'      .createTextOutput(JSON.stringify({ok:true}))\n' +
'      .setMimeType(ContentService.MimeType.JSON);\n' +
'  } catch(err) {\n' +
'    return ContentService\n' +
'      .createTextOutput(JSON.stringify({ok:false,error:err.message}))\n' +
'      .setMimeType(ContentService.MimeType.JSON);\n' +
'  }\n' +
'}\n' +
'function doGet() {\n' +
'  return ContentService\n' +
'    .createTextOutput(JSON.stringify({ok:true,msg:"script activo"}))\n' +
'    .setMimeType(ContentService.MimeType.JSON);\n' +
'}' +
              '</pre>' +
            '</div>' +
          '</details>' +
        '</div>';

      // Exportar
      document.getElementById('btnExport').onclick = function () {
        U.download('diario-clase-' + U.today() + '.json', JSON.stringify({
          exportedAt: new Date().toISOString(), version: 5,
          groups:   DB.getAll(K_GROUPS),
          classes:  DB.getAll(K_CLASSES),
          schedule: DB.getAll(K_SCHEDULE)
        }, null, 2));
        Toast.success('Respaldo exportado.');
      };

      // Importar
      document.getElementById('btnImport').onchange = function (ev) {
        var file = ev.target.files[0]; if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          try {
            var p = JSON.parse(reader.result);
            if (!p.classes && !p.groups) throw new Error('Formato no reconocido');
            showConfirm('¿Importar el respaldo? Se reemplazarán todos los datos actuales.', function () {
              if (p.groups)   DB._set(K_GROUPS,   p.groups);
              if (p.classes)  DB._set(K_CLASSES,  p.classes);
              if (p.schedule) DB._set(K_SCHEDULE, p.schedule);
              Toast.success('Datos importados.');
              App.go('home');
            }, 'Importar y reemplazar', false);
          } catch (e) { Toast.error('No se pudo importar: ' + e.message); }
        };
        reader.readAsText(file);
        ev.target.value = '';
      };

      // Guardar URL Sheets
      document.getElementById('btnSaveUrl').onclick = function () {
        try { localStorage.setItem('dcp_sheets_url', document.getElementById('sheetsUrl').value.trim()); } catch (e) {}
        Toast.success('URL guardada.');
      };

      // Copiar script
      document.getElementById('btnCopyScript').onclick = function () {
        var code = document.getElementById('scriptCode').textContent;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(code).then(function () { Toast.success('Código copiado.'); }).catch(copy2);
        } else { copy2(); }
        function copy2() {
          var ta = document.createElement('textarea');
          ta.value = code; ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
          document.body.appendChild(ta); ta.select();
          try { document.execCommand('copy'); Toast.success('Código copiado.'); }
          catch (e2) { Toast.warning('Selecciónalo manualmente.'); }
          ta.remove();
        }
      };

      // Sincronizar
      document.getElementById('btnSync').onclick = function () {
        var url = '';
        try { url = localStorage.getItem('dcp_sheets_url') || ''; } catch (e) {}
        if (!url) { Toast.warning('Guarda primero la URL del Apps Script.'); return; }
        var clases  = DB.getAll(K_CLASSES);
        var grupos  = DB.getAll(K_GROUPS);
        if (!clases.length) { Toast.warning('No hay clases para sincronizar.'); return; }
        var header = ['Grupo','Asignatura','Fecha','Periodo','Tema','Desarrollo','Tarea','Fecha entrega','Revisada'];
        var rows = clases.map(function (c) {
          var g = grupos.find(function (x) { return x.id === c.groupId; }) || {};
          return [g.nombre||'', g.asignatura||'', c.fecha, c.periodo||'', c.tema, c.desarrollo, c.tarea, c.fechaTarea, c.tareaRevisada?'Sí':'No'];
        });
        Toast.info('Enviando a Google Sheets…');
        fetch(url, {
          method: 'POST', mode: 'no-cors',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'data=' + encodeURIComponent(JSON.stringify({ clear: true, header: header, rows: rows }))
        })
        .then(function () { Toast.success('✓ Datos enviados. Verifica en tu hoja.'); })
        .catch(function (err) { Toast.error('Error de conexión. Verifica la URL.'); console.error(err); });
      };
    }
  };

  /* ════════════════════════════════════════════════════════════════════════
     LAYOUT — SIDEBAR Y TOPBAR
  ════════════════════════════════════════════════════════════════════════ */
  var NAV_ITEMS = [
    { view: 'home',     label: 'Inicio',       emoji: '🏠' },
    { view: 'grupos',   label: 'Mis grupos',   emoji: '🏫' },
    { view: 'horario',  label: 'Horario',      emoji: '📅' },
    { view: 'config',   label: 'Configuración',emoji: '⚙️' }
  ];

  function buildLayout() {
    var sidebar = document.getElementById('sidebar');
    var topbar  = document.getElementById('topbar');
    if (!sidebar || !topbar) return;

    /* ── Sidebar ── */
    sidebar.innerHTML =
      '<div class="sidebar-brand">' +
        '<div class="sidebar-brand-mark">D</div>' +
        '<span class="sidebar-brand-text">Diario de Clase</span>' +
      '</div>' +
      '<nav class="sidebar-nav">' +
        NAV_ITEMS.map(function (n) {
          return '<a href="#" class="nav-item" data-view="' + n.view + '">' +
            '<span class="nav-emoji">' + n.emoji + '</span>' +
            '<span class="nav-item-label">' + n.label + '</span></a>';
        }).join('') +
      '</nav>' +
      '<div class="sidebar-footer">' +
        '<button class="sidebar-toggle" id="collapseBtn" title="Colapsar menú">◀</button>' +
      '</div>';

    sidebar.querySelectorAll('.nav-item').forEach(function (link) {
      link.onclick = function (e) { e.preventDefault(); App.go(link.dataset.view); };
    });

    document.getElementById('collapseBtn').onclick = function () {
      var shell = document.getElementById('appShell');
      var c = shell.classList.toggle('sidebar-collapsed');
      var cfg = DB.getCfg(); cfg.collapsed = c; DB.setCfg(cfg);
      document.getElementById('collapseBtn').textContent = c ? '▶' : '◀';
    };

    /* ── Topbar ── */
    var cfg    = DB.getCfg();
    var isDark = cfg.theme === 'dark';
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');

    topbar.innerHTML =
      '<div class="topbar-left">' +
        '<button class="icon-btn" id="mobileMenuBtn" aria-label="Menú" style="display:none">☰</button>' +
        '<div class="topbar-search">' +
          '<span class="topbar-search-icon">🔍</span>' +
          '<input type="search" id="globalSearch" placeholder="Buscar clases…" inputmode="search">' +
        '</div>' +
      '</div>' +
      '<div class="topbar-right">' +
        '<div id="liveClock" title="Hora actual">--:--:-- --</div>' +
        '<a href="' + SHEETS_URL + '" target="_blank" rel="noopener" class="icon-btn" title="Abrir Google Sheets">📊</a>' +
        '<button class="icon-btn" id="themeBtn" title="Cambiar tema">' + (isDark ? '☀️' : '🌙') + '</button>' +
        '<button class="btn btn-primary btn-sm" id="topbarNewBtn">+ Clase</button>' +
      '</div>';

    // Reloj
    startClock();

    // Tema
    document.getElementById('themeBtn').onclick = function () {
      var c2 = DB.getCfg();
      var next = c2.theme === 'dark' ? 'light' : 'dark';
      c2.theme = next; DB.setCfg(c2);
      document.documentElement.setAttribute('data-theme', next);
      document.getElementById('themeBtn').textContent = next === 'dark' ? '☀️' : '🌙';
    };

    // Nueva clase
    document.getElementById('topbarNewBtn').onclick = function () { App.go('nueva-clase'); };

    // Búsqueda global
    document.getElementById('globalSearch').oninput = U.debounce(function (e) {
      var q = e.target.value.trim();
      if (!q) return;
      var found = Classes.getAll().find(function (c) {
        return [c.tema, c.desarrollo, c.tarea].join(' ').toLowerCase().indexOf(q.toLowerCase()) > -1;
      });
      if (found) App.go('grupo', found.groupId);
      else Toast.info('Sin resultados para "' + q + '".');
    }, 450);

    // Botón menú móvil
    var mq = window.matchMedia('(max-width:768px)');
    function syncMobileBtn() {
      var btn = document.getElementById('mobileMenuBtn');
      if (btn) btn.style.display = mq.matches ? 'grid' : 'none';
    }
    try { mq.addEventListener('change', syncMobileBtn); }
    catch (e) { try { mq.addListener(syncMobileBtn); } catch (e2) {} }
    syncMobileBtn();

    document.getElementById('mobileMenuBtn').onclick = function () { openSidebar(); };

    // Backdrop táctil
    initSidebarTouch();

    // Restaurar estado colapsado
    if (cfg.collapsed) {
      document.getElementById('appShell').classList.add('sidebar-collapsed');
      var cb = document.getElementById('collapseBtn');
      if (cb) cb.textContent = '▶';
    }
  }

  /* ════════════════════════════════════════════════════════════════════════
     ARRANQUE
  ════════════════════════════════════════════════════════════════════════ */
  function init() {
    try {
      buildLayout();
      App.go('home');
      // Recordatorios 700ms después (UI ya pintado)
      setTimeout(showReminders, 700);
    } catch (err) {
      document.body.innerHTML =
        '<div style="font-family:sans-serif;padding:32px;color:#B3261E;max-width:600px;margin:0 auto">' +
        '<h2 style="margin-bottom:10px">Error al iniciar la aplicación</h2>' +
        '<pre style="font-size:12px;white-space:pre-wrap;background:#fbe9e7;padding:16px;border-radius:8px">' +
        (err.stack || err.message || String(err)) + '</pre>' +
        '<p style="margin-top:12px;font-size:13px;color:#555">Abre la consola del navegador (F12) para más detalles.</p></div>';
      console.error('[DiarioClase] init error:', err);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
