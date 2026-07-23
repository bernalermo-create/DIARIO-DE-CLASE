/* ═══════════════════════════════════════════════════════════════
   home.view.js — Pantalla de inicio / Dashboard
   Versión enfocada: solo lo esencial del día a día — clases de hoy,
   tareas/recordatorios pendientes, y un vistazo a la semana para
   programarse. La lista de grupos vive en "Mis grupos".
═══════════════════════════════════════════════════════════════ */

var HomeView = (function () {
  'use strict';

  return {
    async render(container) {
      container.innerHTML = '<div class="splash-screen"><div class="splash-spinner"></div></div>';

      // Cargar todos los datos en paralelo
      var [grupos, todayBlocks, allBlocks, mode, dayLabels, activeDayIdx] = await Promise.all([
        GroupsService.getAll(),
        ScheduleService.getTodayBlocks(),
        ScheduleService.getAll(),
        ScheduleService.getMode(),
        ScheduleService.getDayLabels(),
        ScheduleService.getActiveDayIndex()
      ]);
      var pendientes = await ClassesService.getPendingTasks();

      // Sin grupos todavía: mostrar solo el estado vacío
      if (!grupos.length) {
        container.innerHTML =
          '<div class="empty-state card"><div class="empty-icon">🏫</div>' +
          '<p class="empty-title">¡Bienvenido a Diario de Clase!</p>' +
          '<p class="empty-desc">Crea tu primer grupo para comenzar a registrar clases.</p>' +
          '<button class="btn btn-primary mt-3" id="btnNuevoGrupoHome">Crear grupo</button></div>';
        document.getElementById('btnNuevoGrupoHome').onclick = function () { Router.go('grupos'); };
        _placeFab();
        return;
      }

      // Bloque activo ahora mismo
      var activeBlock = ScheduleService.getCurrentBlock(todayBlocks);

      // Mapa de grupos para referencias rápidas
      var gMap = {};
      grupos.forEach(function (g) { gMap[g.id] = g; });

      // Tareas de la semana (próximos 7 días, incluyendo hoy)
      var weekTasks = await _getWeekTasks(gMap);

      container.innerHTML =
        /* ── Alerta de pendientes ── */
        (pendientes.length ?
          '<div class="alert-pending" id="alertPend">' +
            '<span style="font-size:24px">🔔</span>' +
            '<div style="flex:1;min-width:0">' +
              '<p class="font-bold" style="margin:0">' + pendientes.length + ' ' + Utils.plural(pendientes.length, 'tarea', 'tareas') + ' pendiente' + (pendientes.length > 1 ? 's' : '') + '</p>' +
              '<p class="text-sm text-muted" style="margin:2px 0 0">Toca para ver los detalles</p>' +
            '</div><span>›</span></div>' : '') +

        /* ── Clases de hoy ── */
        '<div class="card" style="margin-bottom:14px">' +
          '<div class="card-header"><span class="section-title">📅 Hoy en tu horario</span></div>' +
          (todayBlocks.length ?
            todayBlocks.map(function (b) {
              var g   = gMap[b.groupId];
              var now = b === activeBlock;
              return '<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">' +
                '<div class="group-dot" style="background:' + (g ? g.color : '#ccc') + ';width:12px;height:12px"></div>' +
                '<div style="flex:1;min-width:0">' +
                  '<p class="font-bold truncate" style="font-size:14px">' + (g ? Utils.esc(g.nombre) : '—') + (g && g.asignatura ? ' · ' + Utils.esc(g.asignatura) : '') + '</p>' +
                  (b.horaInicio ? '<p class="text-sm text-muted">⏰ ' + Utils.timeLabel(b.horaInicio) + (b.horaFin ? ' – ' + Utils.timeLabel(b.horaFin) : '') + (b.aula ? ' · 🚪 ' + Utils.esc(b.aula) : '') + '</p>' : '') +
                '</div>' +
                (now ? '<span class="tag" style="background:var(--primary);color:#fff">▶ Ahora</span>' : '') +
                (g ? '<button class="btn btn-sm btn-secondary" data-reg-gid="' + b.groupId + '">Registrar</button>' : '') +
              '</div>';
            }).join('') :
            '<p class="text-sm text-muted" style="padding:6px 0">No tienes clases programadas hoy.</p>') +
        '</div>' +

        /* ── Esta semana ── */
        '<div class="card mt-3">' +
          '<div class="card-header"><span class="section-title">🗓️ Esta semana</span></div>' +
          '<p class="text-xs text-muted" style="margin:-4px 0 10px">' + (mode === 'ciclo' ? 'Ciclo rotativo' : 'Semana actual') + ' · toca un día para ver el detalle en Horario</p>' +
          '<div class="week-glance">' +
            dayLabels.map(function (label, idx) {
              var blocks = allBlocks.filter(function (b) { return +b.dia === idx; })
                .sort(function (a, b) { return a.horaInicio < b.horaInicio ? -1 : 1; });
              var isToday = idx === activeDayIdx;
              return '<div class="week-day' + (isToday ? ' today' : '') + '" data-week-day="' + idx + '">' +
                '<p class="week-day-label">' + Utils.esc(label.replace('Día ', 'D')) + '</p>' +
                (blocks.length
                  ? blocks.map(function (b) {
                      var g = gMap[b.groupId];
                      return '<p class="week-day-item" title="' + (g ? Utils.esc(g.nombre) : '') + '">' + (g ? Utils.esc(g.nombre) : '?') + '</p>';
                    }).join('')
                  : '<p class="week-day-empty">—</p>') +
              '</div>';
            }).join('') +
          '</div>' +
          (weekTasks.length ?
            '<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border)">' +
              '<p class="text-xs font-bold text-muted" style="margin:0 0 8px;text-transform:uppercase;letter-spacing:.02em">📝 Tareas de la semana</p>' +
              weekTasks.map(function (t) {
                return '<div class="flex justify-between items-center" style="padding:6px 0">' +
                  '<div style="min-width:0">' +
                    '<p class="text-sm truncate" style="margin:0;font-weight:600">' + Utils.esc(Utils.cut(t.tarea, 50)) + '</p>' +
                    '<p class="text-xs text-muted" style="margin:1px 0 0">' + Utils.esc(t.groupName) + '</p>' +
                  '</div>' +
                  '<span class="text-xs" style="white-space:nowrap;margin-left:8px;color:' + (t.isOverdue ? 'var(--danger)' : 'var(--ink-m)') + '">' + Utils.dateShort(t.fechaTarea) + '</span>' +
                '</div>';
              }).join('') +
            '</div>' : '') +
          '<button class="btn btn-secondary btn-sm btn-block mt-3" id="btnGoHorario">Ver horario completo →</button>' +
        '</div>';

      _placeFab();

      /* ── Eventos ── */
      var alertEl = document.getElementById('alertPend');
      if (alertEl) alertEl.onclick = function () { HomeView._showReminders(pendientes, gMap); };

      document.getElementById('btnGoHorario').onclick = function () { Router.go('horario'); };

      container.querySelectorAll('[data-reg-gid]').forEach(function (btn) {
        btn.onclick = function (e) {
          e.stopPropagation();
          Router.go('nueva-clase', { groupId: btn.dataset.regGid });
        };
      });

      container.querySelectorAll('[data-week-day]').forEach(function (el) {
        el.onclick = function () { Router.go('horario'); };
      });
    },

    /* FAB flotante para registrar clase rápido */
    _placeFabInternal() {},

    /* Modal de recordatorios */
    _showReminders(pendientes, gMap) {
      if (!pendientes.length) return;
      var contentEl = document.createElement('div');
      contentEl.innerHTML =
        '<div style="display:flex;flex-direction:column;gap:10px;max-height:55vh;overflow-y:auto;-webkit-overflow-scrolling:touch">' +
          pendientes.map(function (c) {
            var g = gMap[c.groupId] || {};
            return '<div style="padding:12px 14px;background:var(--bg);border-radius:10px;border-left:3px solid var(--accent)">' +
              '<p class="font-bold" style="font-size:14px;margin:0">' + Utils.esc(g.nombre || '—') + (g.asignatura ? ' (' + Utils.esc(g.asignatura) + ')' : '') + '</p>' +
              '<p class="text-sm" style="margin:3px 0 0">📝 ' + Utils.esc(Utils.cut(c.tarea, 80)) + '</p>' +
              '<p class="text-sm text-muted" style="margin:2px 0 0">Entrega: ' + Utils.dateShort(c.fechaTarea) + '</p>' +
              '<button class="btn btn-sm mt-2" style="background:var(--primary-s);color:var(--primary)" data-mark-id="' + c.id + '">✓ Marcar revisada</button>' +
            '</div>';
          }).join('') +
        '</div>';

      var modal = Modal.open({ title: '🔔 Tareas pendientes', content: contentEl });

      contentEl.querySelectorAll('[data-mark-id]').forEach(function (btn) {
        btn.onclick = async function () {
          await ClassesService.toggleTareaRevisada(btn.dataset.markId);
          btn.closest('[style*="border-left"]').style.opacity = '.4';
          btn.textContent = '✓ Revisada';
          btn.disabled = true;
          Toast.success('Marcada como revisada.');
          SheetsSyncService.pushInBackground();
        };
      });
    }
  };

  /* Tareas con fecha de entrega dentro de los próximos 7 días (incluye hoy) */
  async function _getWeekTasks(gMap) {
    var todos = await ClassesService.getAll();
    var today = Utils.today();
    var limit = Utils.addDaysISO ? Utils.addDaysISO(today, 7) : _plusDays(today, 7);
    return todos
      .filter(function (c) { return c.tarea && c.fechaTarea && !+c.tareaRevisada && c.fechaTarea <= limit; })
      .map(function (c) {
        var g = gMap[c.groupId];
        return {
          tarea: c.tarea,
          fechaTarea: c.fechaTarea,
          groupName: g ? g.nombre : '—',
          isOverdue: c.fechaTarea < today
        };
      })
      .sort(function (a, b) { return a.fechaTarea < b.fechaTarea ? -1 : 1; })
      .slice(0, 8);
  }

  function _plusDays(iso, days) {
    var d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function _placeFab() {
    var fab = document.getElementById('globalFab');
    if (!fab) {
      fab = document.createElement('button');
      fab.id = 'globalFab';
      fab.className = 'fab';
      fab.innerHTML = '+';
      fab.title = 'Registrar clase';
      document.body.appendChild(fab);
    }
    fab.onclick = function () { Router.go('nueva-clase'); };
    fab.style.display = '';
  }
})();
