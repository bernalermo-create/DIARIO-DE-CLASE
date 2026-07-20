/* ═══════════════════════════════════════════════════════════════
   ui.js — Componentes de interfaz: Toast, Modal, Clock
═══════════════════════════════════════════════════════════════ */

/* ── TOAST ─────────────────────────────────────────────────── */
var Toast = (function () {
  'use strict';
  var COLORS = { success:'#2D6A4F', error:'#B3261E', warning:'#C9A227', info:'#2A6F97' };

  function show(msg, type, duration) {
    type     = type     || 'info';
    duration = duration === undefined ? 3200 : duration;
    var container = document.getElementById('toastContainer');
    if (!container) return;
    var el = document.createElement('div');
    el.className = 'toast';
    el.style.borderLeftColor = COLORS[type] || COLORS.info;
    el.textContent = msg;
    container.appendChild(el);
    if (duration > 0) {
      setTimeout(function () {
        el.style.opacity = '0';
        el.style.transform = 'translateY(8px)';
        setTimeout(function () { el.remove(); }, 300);
      }, duration);
    }
    el.addEventListener('click', function () { el.remove(); });
    return el;
  }

  return {
    show:    show,
    success: function (m, d) { return show(m, 'success', d); },
    error:   function (m, d) { return show(m, 'error',   d); },
    warning: function (m, d) { return show(m, 'warning', d); },
    info:    function (m, d) { return show(m, 'info',    d); }
  };
})();

/* ── MODAL ──────────────────────────────────────────────────── */
var Modal = (function () {
  'use strict';
  var activeEl = null;

  function close() {
    if (activeEl) { activeEl.remove(); activeEl = null; }
    document.removeEventListener('keydown', escHandler);
  }

  function escHandler(e) { if (e.key === 'Escape') close(); }

  function open(opts) {
    close();
    var actions = opts.actions || [];
    var ov = document.createElement('div');
    ov.className = 'modal-overlay';

    var box = document.createElement('div');
    box.className = 'modal-box';
    if (opts.title) {
      var t = document.createElement('div');
      t.className = 'modal-title';
      t.textContent = opts.title;
      box.appendChild(t);
    }
    if (typeof opts.content === 'string') {
      var c = document.createElement('div');
      c.innerHTML = opts.content;
      box.appendChild(c);
    } else if (opts.content instanceof HTMLElement) {
      box.appendChild(opts.content);
    }
    if (actions.length) {
      var footer = document.createElement('div');
      footer.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;margin-top:20px;flex-wrap:wrap;';
      actions.forEach(function (a) {
        var btn = document.createElement('button');
        btn.className = 'btn btn-' + (a.variant || 'secondary');
        btn.textContent = a.label;
        btn.onclick = function () {
          if (a.onClick) a.onClick();
          if (a.closeOnClick !== false) close();
        };
        footer.appendChild(btn);
      });
      box.appendChild(footer);
    }
    ov.appendChild(box);
    document.body.appendChild(ov);
    activeEl = ov;

    if (opts.closeOnBackdrop !== false) {
      ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    }
    document.addEventListener('keydown', escHandler);
    setTimeout(function () {
      var first = box.querySelector('input, textarea, button');
      if (first) first.focus();
    }, 150);
    return { el: ov, close: close };
  }

  function confirm(opts) {
    return new Promise(function (resolve) {
      open({
        title:  opts.title || '¿Confirmar?',
        content: '<p class="text-muted" style="font-size:14px;line-height:1.5">' + Utils.esc(opts.message) + '</p>',
        closeOnBackdrop: false,
        actions: [
          { label: 'Cancelar', variant: 'ghost',   closeOnClick: true, onClick: function () { resolve(false); } },
          { label: opts.confirmLabel || 'Confirmar',
            variant: opts.danger ? 'danger' : 'primary',
            closeOnClick: true,
            onClick: function () { resolve(true); }
          }
        ]
      });
    });
  }

  return { open: open, close: close, confirm: confirm };
})();

/* ── CLOCK ──────────────────────────────────────────────────── */
var Clock = (function () {
  'use strict';
  var _interval = null;

  function tick() {
    var el = document.getElementById('liveClock');
    if (!el) return;
    var now  = new Date();
    var h = now.getHours(), m = now.getMinutes(), s = now.getSeconds();
    var ampm = h < 12 ? 'AM' : 'PM';
    h = h % 12 || 12;
    el.textContent = h + ':' + (m<10?'0'+m:m) + ':' + (s<10?'0'+s:s) + ' ' + ampm;
  }

  return {
    start: function () {
      tick();
      clearInterval(_interval);
      _interval = setInterval(tick, 1000);
    },
    stop: function () { clearInterval(_interval); }
  };
})();
