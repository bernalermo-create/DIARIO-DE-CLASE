/* ═══════════════════════════════════════════════════════════════
   app.js — Router y arranque principal
   Orquesta la navegación entre vistas y la inicialización.
═══════════════════════════════════════════════════════════════ */

/* ── ROUTER ─────────────────────────────────────────────────── */
var Router = (function () {
  'use strict';

  var _current    = 'home';
  var _params     = null;
  var _history    = [];
  var _container  = null;
  var _fab        = null;

  var VIEWS = {
    'home':       HomeView,
    'grupos':     GruposView,
    'grupo':      GrupoDetalleView,
    'nueva-clase':ClaseFormView,
    'horario':    HorarioView,
    'config':     ConfigView
  };

  var NAV_ITEMS = [
    { id: 'home',     label: 'Inicio',        emoji: '🏠' },
    { id: 'grupos',   label: 'Mis grupos',    emoji: '🏫' },
    { id: 'horario',  label: 'Horario',       emoji: '📅' },
    { id: 'config',   label: 'Configuración', emoji: '⚙️' }
  ];

  function _updateNav(viewId) {
    document.querySelectorAll('.nav-item').forEach(function (el) {
      var v = el.dataset.view;
      el.classList.toggle('active',
        v === viewId || (viewId === 'grupo' && v === 'grupos') ||
        (viewId === 'nueva-clase' && v === 'grupos'));
    });
  }

  function _updateTopbar(viewId, params) {
    var titleEl = document.getElementById('topbarTitle');
    if (!titleEl) return;
    var titles = {
      'home':       'Inicio',
      'grupos':     'Mis grupos',
      'horario':    'Horario',
      'config':     'Configuración',
      'nueva-clase':'Registrar clase',
      'grupo':      'Grupo'
    };
    titleEl.textContent = titles[viewId] || '';
    var backBtn = document.getElementById('topbarBack');
    if (backBtn) backBtn.style.display = _history.length > 0 ? '' : 'none';
  }

  function _hideFab() {
    var fab = document.getElementById('globalFab');
    if (fab) fab.style.display = 'none';
  }

  return {
    get currentView() { return _current; },

    async go(viewId, params) {
      if (!VIEWS[viewId]) { console.warn('[Router] Vista desconocida:', viewId); return; }

      // Guardar historial para el botón Atrás
      if (_current !== viewId) _history.push({ view: _current, params: _params });
      _current = viewId;
      _params  = params || null;

      _container = document.getElementById('appContent');
      if (!_container) return;

      // Cerrar sidebar en móvil
      document.getElementById('appShell').classList.remove('mobile-open');
      // Scroll al tope
      _container.scrollTop = 0;

      _hideFab();
      _updateNav(viewId);
      _updateTopbar(viewId, params);

      try {
        await VIEWS[viewId].render(_container, params);
      } catch (err) {
        _container.innerHTML =
          '<div class="card" style="border-left:3px solid var(--danger);padding:20px;margin-top:16px">' +
          '<p class="font-bold" style="color:var(--danger)">Error al cargar la vista</p>' +
          '<pre style="font-size:11px;margin-top:8px;white-space:pre-wrap;overflow:auto">' +
          Utils.esc(err.stack || err.message || String(err)) + '</pre></div>';
        console.error('[Router]', err);
      }
    },

    back() {
      var prev = _history.pop();
      if (prev) this.go(prev.view, prev.params);
      else this.go('home');
    },

    setTitle(title) {
      var el = document.getElementById('topbarTitle');
      if (el) el.textContent = title;
    },

    buildSidebar() {
      var el = document.getElementById('sidebar');
      if (!el) return;
      el.innerHTML =
        '<div class="sidebar-brand">' +
          '<div class="sidebar-brand-mark">D</div>' +
          '<span class="sidebar-brand-text">Diario de Clase</span>' +
        '</div>' +
        '<nav class="sidebar-nav">' +
          NAV_ITEMS.map(function (n) {
            return '<a href="#" class="nav-item" data-view="' + n.id + '">' +
              '<span class="nav-emoji">' + n.emoji + '</span>' +
              '<span class="nav-item-label">' + n.label + '</span>' +
            '</a>';
          }).join('') +
        '</nav>' +
        '<div class="sidebar-footer">' +
          '<button class="sidebar-toggle" id="collapseBtn" title="Colapsar menú">◀</button>' +
        '</div>';

      el.querySelectorAll('.nav-item').forEach(function (link) {
        link.addEventListener('click', function (e) {
          e.preventDefault();
          Router.go(link.dataset.view);
        });
      });

      document.getElementById('collapseBtn').onclick = async function () {
        var shell = document.getElementById('appShell');
        var c = shell.classList.toggle('sidebar-collapsed');
        await DB.setCfg('sidebarCollapsed', c);
        document.getElementById('collapseBtn').textContent = c ? '▶' : '◀';
      };
    },

    buildTopbar() {
      var el = document.getElementById('topbar');
      if (!el) return;
      el.innerHTML =
        '<div class="topbar-left">' +
          '<button class="icon-btn" id="mobileMenuBtn" style="display:none" aria-label="Menú">☰</button>' +
          '<button class="icon-btn" id="topbarBack" style="display:none" aria-label="Volver">‹</button>' +
          '<span id="topbarTitle" class="topbar-title">Inicio</span>' +
        '</div>' +
        '<div class="topbar-right">' +
          '<div id="liveClock" class="live-clock">--:--:-- --</div>' +
          '<button class="icon-btn" id="themeBtn" title="Cambiar tema">🌙</button>' +
          '<button class="btn btn-primary btn-sm" id="topbarNewBtn">+ Clase</button>' +
        '</div>';

      document.getElementById('topbarBack').onclick = function () { Router.back(); };
      document.getElementById('topbarNewBtn').onclick = function () { Router.go('nueva-clase'); };

      // Tema
      document.getElementById('themeBtn').onclick = async function () {
        var cur  = document.body.getAttribute('data-theme');
        var next = cur === 'dark' ? 'light' : 'dark';
        document.body.setAttribute('data-theme', next);
        document.getElementById('themeBtn').textContent = next === 'dark' ? '☀️' : '🌙';
        await DB.setCfg('theme', next);
      };

      // Botón menú móvil
      var mq = window.matchMedia('(max-width: 768px)');
      function syncBtn() {
        var btn = document.getElementById('mobileMenuBtn');
        if (btn) btn.style.display = mq.matches ? 'grid' : 'none';
      }
      try { mq.addEventListener('change', syncBtn); }
      catch (e) { try { mq.addListener(syncBtn); } catch (e2) {} }
      syncBtn();

      document.getElementById('mobileMenuBtn').onclick = function () {
        document.getElementById('appShell').classList.toggle('mobile-open');
      };

      // Backdrop táctil (cierra sidebar en móvil)
      var backdrop = document.getElementById('sidebarBackdrop');
      if (backdrop) {
        backdrop.addEventListener('click', function () {
          document.getElementById('appShell').classList.remove('mobile-open');
        });
        backdrop.addEventListener('touchend', function (e) {
          e.preventDefault();
          document.getElementById('appShell').classList.remove('mobile-open');
        }, { passive: false });
      }
    }
  };
})();

/* ── PIN LOCK ────────────────────────────────────────────────── */
async function checkPin() {
  var pinEnabled = await DB.getCfg('pinEnabled');
  if (!pinEnabled) return true;
  var stored = await DB.getCfg('pinHash');
  if (!stored) return true;

  return new Promise(function (resolve) {
    var attempts = 0;

    var overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:99999;background:var(--bg);' +
      'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;padding:32px;';
    overlay.innerHTML =
      '<div class="sidebar-brand-mark" style="width:60px;height:60px;border-radius:16px;font-size:28px">D</div>' +
      '<h2 style="font-size:20px;font-weight:800">Diario de Clase</h2>' +
      '<p class="text-muted" style="font-size:14px;text-align:center">Ingresa tu PIN para continuar</p>' +
      '<input id="pinEntry" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" ' +
        'style="width:140px;text-align:center;letter-spacing:.4em;font-size:28px;padding:12px;' +
        'border:2px solid var(--border);border-radius:12px;background:var(--surface);outline:none" ' +
        'placeholder="••••">' +
      '<p id="pinError" style="color:var(--danger);font-size:13px;min-height:18px"></p>';

    document.body.appendChild(overlay);
    var input = document.getElementById('pinEntry');
    input.focus();

    input.addEventListener('input', function () {
      if (input.value.length !== 4) return;
      if (btoa(input.value) === stored) {
        overlay.remove();
        resolve(true);
      } else {
        attempts++;
        document.getElementById('pinError').textContent =
          'PIN incorrecto.' + (attempts >= 3 ? ' ' + (5 - attempts) + ' intentos restantes.' : '');
        input.value = '';
        input.classList.add('error');
        setTimeout(function () { input.classList.remove('error'); }, 600);
        if (attempts >= 5) {
          overlay.innerHTML = '<p style="color:var(--danger);text-align:center;padding:32px">Demasiados intentos.<br>Reinicia la app.</p>';
        }
      }
    });
  });
}

/* ── INIT PRINCIPAL ──────────────────────────────────────────── */
async function initApp() {
  try {
    // 1. Inicializar base de datos
    await DB.init();

    // 2. Restaurar preferencias
    var theme     = (await DB.getCfg('theme'))           || 'light';
    var collapsed = (await DB.getCfg('sidebarCollapsed')) || false;

    document.body.setAttribute('data-theme', theme);
    var shell = document.getElementById('appShell');
    if (collapsed) {
      shell.classList.add('sidebar-collapsed');
    }

    // 3. Construir layout
    Router.buildSidebar();
    Router.buildTopbar();

    // 4. Actualizar ícono de tema
    var themeBtn = document.getElementById('themeBtn');
    if (themeBtn) themeBtn.textContent = theme === 'dark' ? '☀️' : '🌙';

    // 5. Restaurar estado colapsado del botón
    if (collapsed) {
      var cb = document.getElementById('collapseBtn');
      if (cb) cb.textContent = '▶';
    }

    // 6. Verificar PIN
    var ok = await checkPin();
    if (!ok) return;

    // 7. Inicializar notificaciones
    await NotificationsService.init();

    // 8. Iniciar reloj
    Clock.start();

    // 9. Navegar a inicio
    await Router.go('home');

    // 10. Ocultar splash
    var splash = document.getElementById('splashScreen');
    if (splash) splash.remove();

    // 11. Programar recordatorios de tareas
    setTimeout(function () {
      NotificationsService.syncTaskReminders();
    }, 1500);

    console.log('[App] Iniciada correctamente.');

  } catch (err) {
    // Mostrar error visible en pantalla
    document.body.innerHTML =
      '<div style="font-family:sans-serif;padding:32px;color:#B3261E;max-width:600px;margin:0 auto">' +
      '<h2 style="margin-bottom:10px">Error al iniciar la aplicación</h2>' +
      '<pre style="font-size:12px;white-space:pre-wrap;background:#fbe9e7;padding:16px;border-radius:8px;overflow:auto">' +
      (err.stack || err.message || String(err)) + '</pre>' +
      '<p style="margin-top:14px;font-size:13px;color:#555">' +
      'En Android Studio abre Logcat y filtra por "DiarioClase" para más detalles.</p></div>';
    console.error('[App] Error en init:', err);
  }
}

// Arrancar cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
