/* ═══════════════════════════════════════════════════════════════
   home.view.js — Pantalla de inicio / Dashboard
   Versión optimizada para uso rápido en celular:
   - Clase en curso muy destacada con botón grande
   - Botones "Registrar" más grandes y fáciles de tocar
   - Menos pasos para anotar la clase
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

      // Sin grupos todavía
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

      // Mapa de grupos
      var gMap = {};
      grupos.forEach(function (g) { gMap[g.id] = g; });

      // Tareas de la semana
      var weekTasks = await _getWeekTasks(gMap);

      // ── Construcción del HTML ──
      var html = '';

      // 1. Alerta de tareas pendientes
      if (pendientes.length) {
        html +=
          '<div class="alert-pending" id="alertPend">' +
            '<span style="font-size:24px">🔔</span>' +
            '<div style="flex:1;min-width:0">' +
              '<p class="font-bold" style="margin:0">' + pendientes.length + ' ' +
              Utils.plural(pendientes.length, 'tarea', 'tareas') + ' pendiente' +
              (pendientes.length > 1 ? 's' : '') + '</p>' +
              '<p class="text-sm text-muted" style="margin:2px 0 0">Toca para ver los detalles</p>' +
            '</div><span>›</span></div>';
      }

      // 2. CLASE EN CURSO (muy destacada)
      if (activeBlock) {
        var gNow = gMap[activeBlock.groupId];
        if (gNow) {
          html +=
            '<div class="card" style="margin-bottom:14px;border:2px solid var(--primary);background:var(--primary-s)">' +
              '<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">' +
                '<span style="font-size:28px">' + (gNow.icono || '📘') + '</span>' +
                '<div style="flex:1;min-width:0">' +
                  '<p class="text-xs font-bold" style="margin:0;color:var(--primary);text-transform:uppercase;letter-spacing:.03em">▶ Ahora en clase</p>' +
                  '<p class="font-bold" style="margin:2px 0 0;font-size:17px">' +
                    Utils.esc(gNow.nombre) +
                    (gNow.asignatura ? ' · ' + Utils.esc(gNow.asignatura) : '') +
                  '</p>' +
                  (activeBlock.horaInicio ?
                    '<p class="text-sm text-muted" style="margin:2px 0 0">⏰ ' +
                      Utils.timeLabel(activeBlock.horaInicio) +
                      (activeBlock.horaFin ? ' – ' + Utils.timeLabel(activeBlock.horaFin) : '') +
                      (activeBlock.aula ? ' · 🚪 ' + Utils.esc(activeBlock.aula) : '') +
                    '</p>' : '') +
                '</div>' +
              '</div>' +
              '<button class="btn btn-primary btn-block" style="min-height:52px;font-size:16px" data-reg-gid="' + activeBlock.groupId + '">' +
                '📝 Registrar esta clase' +
              '</button>' +
            '</div>';
        }
      }

      // 3. Resto de clases de hoy
      html +=
        '<div class="card" style="margin-bottom:14px">' +
          '<div class="card-header"><span class="section-title">📅 Hoy en tu horario</span></div>';

      if (todayBlocks.length) {
        var hasOtherClasses = false;
        html += todayBlocks.map(function (b) {
          var g   = gMap[b.groupId];
          var now = b === activeBlock;

          // Si es la clase actual ya la mostramos arriba, la saltamos
          if (now) return '';

          hasOtherClasses = true;
          return '<div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--border)">' +
            '<span style="font-size:22px;flex-shrink:0">' + (g ? (g.icono || '📘') : '❔') + '</span>' +
            '<div style="flex:1;min-width:0">' +
              '<p class="font-bold truncate" style="font-size:15px;margin:0">' +
                (g ? Utils.esc(g.nombre) : '—') +
                (g && g.asignatura ? ' · ' + Utils.esc(g.asignatura) : '') +
              '</p>' +
              (b.horaInicio ?
                '<p class="text-sm text-muted" style="margin:2px 0 0">⏰ ' +
                  Utils.timeLabel(b.horaInicio) +
                  (b.horaFin ? ' – ' + Utils.timeLabel(b.horaFin) : '') +
                  (b.aula ? ' · 🚪 ' + Utils.esc(b.aula) : '') +
                '</p>' : '') +
            '</div>' +
            (g ?
              '<button class="btn btn-primary btn-sm" style="min-height:42px;padding:0 14px;font-size:14px" data-reg-gid="' + b.groupId + '">' +
                'Registrar' +
              '</button>' : '') +
          '</div>';
        }).join('');

        if (!hasOtherClasses && activeBlock) {
          html += '<p class="text-sm text-muted" style="padding:8px 0">Solo tienes la clase que está en curso.</p>';
        }
      } else {
        html += '<p class="text-sm text-muted" style="padding:8px 0">No tienes clases programadas hoy.</p>';
      }

      html += '</div>';

      // 4. Esta semana
      html +=
        '<div class="card mt-3">' +
          '<div class="card-header"><span class="section-title">🗓️ Esta semana</span></div>' +
          '<p class="text-xs text-muted" style="margin:-4px 0 10px">' +
            (mode === 'ciclo' ? 'Ciclo rotativo' : 'Semana actual') +
            ' · toca un día para ver el detalle en Horario</p>' +
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
                      return '<p class="week-day-item" title="' + (g ? Utils.esc(g.nombre) : '') + '">' +
                        (g ? (g.icono || '📘') + ' ' + Utils.esc(g.nombre) : '?') + '</p>';
                    }).join('')
                  : '<p class="week-day-empty">—</p>') +
              '</div>';
            }).join('') +
          '</div>';

      // Tareas de la semana
      if (weekTasks.length) {
        html +=
          '<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border)">' +
            '<p class="text-xs font-bold text-muted" style="margin:0 0 8px;text-transform:uppercase;letter-spacing:.02em">📝 Tareas de la semana</p>' +
            weekTasks.map(function (t) {
              return '<div class="flex justify-between items-center" style="padding:6px 0">' +
                '<div style="min-width:0">' +
                  '<p class="text-sm truncate" style="margin:0;font-weight:600">' + Utils.esc(Utils.cut(t.tarea, 50)) + '</p>' +
                  '<p class="text-xs text-muted" style="margin:1px 0 0">' + Utils.esc(t.groupName) + '</p>' +
                '</div>' +
                '<span class="text-xs" style="white-space:nowrap;margin-left:8px;color:' +
                  (t.isOverdue ? 'var(--danger)' : 'var(--ink-m)') + '">' +
                  Utils.dateShort(t.fechaTarea) +
                '</span>' +
              '</div>';
            }).join('') +
          '</div>';
      }

      html +=
        '<button class="btn btn-secondary btn-sm btn-block mt-3" id="btnGoHorario">Ver horario completo →</button>' +
        '</div>';

      container.innerHTML = html;
      _placeFab();

      // ── Eventos ──
      var alertEl = document.getElementById('alertPend');
      if (alertEl) {
        alertEl.onclick = function () { HomeView._showReminders(pendientes, gMap); };
      }

      var btnHorario = document.getElementById('btnGoHorario');
      if (btnHorario) {
        btnHorario.onclick = function () { Router.go('horario'); };
      }

      // Todos los botones de Registrar
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

    /* Modal de recordatorios */
    _showReminders(pendientes, gMap) {
      if (!pendientes.length) return;
      var contentEl = document.createElement('div');
      contentEl.innerHTML =
        '<div style="display:flex;flex-direction:column;gap:10px;max-height:55vh;overflow-y:auto;-webkit-overflow-scrolling:touch">' +
          pendientes.map(function (c) {
            var g = gMap[c.groupId] || {};
            return '<div style="padding:12px 14px;background:var(--bg);border-radius:10px;border-left:3px solid var(--accent)">' +
              '<p class="font-bold" style="font-size:14px;margin:0">' + Utils.esc(g.nombre || '—') +
                (g.asignatura ? ' (' + Utils.esc(g.asignatura) + ')' : '') + '</p>' +
              '<p class="text-sm" style="margin:3px 0 0">📝 ' + Utils.esc(Utils.cut(c.tarea, 80)) + '</p>' +
              '<p class="text-sm text-muted" style="margin:2px 0 0">Entrega: ' + Utils.dateShort(c.fechaTarea) + '</p>' +
              '<button class="btn btn-sm mt-2" style="background:var(--primary-s);color:var(--primary)" data-mark-id="' + c.id + '">✓ Marcar revisada</button>' +
            '</div>';
          }).join('') +
        '</div>';

      Modal.open({ title: '🔔 Tareas pendientes', content: contentEl });

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

  // ── Helpers ──
  async function _getWeekTasks(gMap) {
    var todos = await ClassesService.getAll();
    var today = Utils.today();
    var limit = Utils.addDaysISO ? Utils.addDaysISO(today, 7) : _plusDays(today, 7);
    return todos
      .filter(function (c) {
        return c.tarea && c.fechaTarea && !+c.tareaRevisada && c.fechaTarea <= limit;
      })
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
