/* ═══════════════════════════════════════════════════════════════
   home.view.js — Pantalla de inicio / Dashboard
═══════════════════════════════════════════════════════════════ */

var HomeView = (function () {
  'use strict';

  return {
    async render(container) {
      container.innerHTML = '<div class="splash-screen"><div class="splash-spinner"></div></div>';

      // Cargar todos los datos en paralelo
      var [grupos, stats, todayBlocks] = await Promise.all([
        GroupsService.getAll(),
        ClassesService.getStats(),
        ScheduleService.getTodayBlocks()
      ]);

      // Enriquecer grupos con contadores
      var gruposRich = await GroupsService.enrichGroups(grupos);
      var pendientes = await ClassesService.getPendingTasks();

      // Bloque activo ahora mismo
      var activeBlock = ScheduleService.getCurrentBlock(todayBlocks);

      // Mapa de grupos para referencias rápidas
      var gMap = {};
      grupos.forEach(function (g) { gMap[g.id] = g; });

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
        (todayBlocks.length ?
          '<div class="card" style="margin-bottom:14px">' +
            '<div class="card-header"><span class="section-title">📅 Hoy en tu horario</span></div>' +
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
            }).join('') +
          '</div>' : '') +

        /* ── Grid de grupos ── */
        '<div class="page-header"><h2 class="page-title">Mis grupos</h2></div>' +
        (gruposRich.length === 0 ?
          '<div class="empty-state card">' +
            '<div class="empty-icon">🏫</div>' +
            '<p class="empty-title">Aún no tienes grupos</p>' +
            '<p class="empty-desc">Crea tu primer grupo para comenzar a registrar clases.</p>' +
            '<button class="btn btn-primary mt-3" id="btnNuevoGrupoHome">Crear grupo</button>' +
          '</div>' :
          '<div class="groups-grid">' +
            gruposRich.map(function (g) {
              return '<div class="group-card" data-go-grupo="' + g.id + '" style="border-top:3px solid ' + g.color + '">' +
                '<div class="flex justify-between items-center" style="margin-bottom:10px">' +
                  '<div style="min-width:0">' +
                    '<p class="font-bold truncate" style="font-size:16px">' + Utils.esc(g.nombre) + '</p>' +
                    (g.asignatura ? '<p class="text-sm text-muted">' + Utils.esc(g.asignatura) + '</p>' : '') +
                  '</div>' +
                  (g.tareasPendientes > 0 ? '<span class="badge-alert">' + g.tareasPendientes + '</span>' : '') +
                '</div>' +
                '<p class="text-sm text-muted">' + g.totalClases + ' ' + Utils.plural(g.totalClases, 'clase') + '</p>' +
                (g.lastClase ? '<p class="text-sm" style="margin-top:2px">Última: ' + Utils.dateShort(g.lastClase.fecha) + '</p>' : '') +
                '<button class="btn btn-primary btn-block mt-3" data-go-grupo="' + g.id + '">Ver →</button>' +
              '</div>';
            }).join('') +
          '</div>') +

        /* ── Últimas clases ── */
        (stats.recientes.length ?
          '<div class="card mt-4">' +
            '<div class="card-header"><span class="section-title">Últimos registros</span></div>' +
            stats.recientes.map(function (c) {
              var g = gMap[c.groupId];
              return '<div class="flex items-center gap-3" style="padding:10px 0;border-bottom:1px solid var(--border)">' +
                '<div class="group-dot" style="background:' + (g ? g.color : '#ccc') + ';width:10px;height:10px;flex-shrink:0"></div>' +
                '<div style="flex:1;min-width:0">' +
                  '<p class="truncate font-bold" style="font-size:14px">' + Utils.esc(c.tema || c.desarrollo || 'Sin tema') + '</p>' +
                  '<p class="text-sm text-muted">' + (g ? Utils.esc(g.nombre) : '—') + ' · ' + Utils.dateShort(c.fecha) + '</p>' +
                '</div>' +
                (c.tarea && !+c.tareaRevisada ? '<span class="badge-task">📝 Tarea</span>' : '') +
              '</div>';
            }).join('') +
          '</div>' : '');

      /* ── FAB ── */
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

      /* ── Eventos ── */
      var alertEl = document.getElementById('alertPend');
      if (alertEl) alertEl.onclick = function () { HomeView._showReminders(pendientes, gMap); };

      var btnNG = document.getElementById('btnNuevoGrupoHome');
      if (btnNG) btnNG.onclick = function () { Router.go('grupos'); };

      container.querySelectorAll('[data-go-grupo]').forEach(function (el) {
        el.onclick = function (e) {
          e.stopPropagation();
          Router.go('grupo', { groupId: el.dataset.goGrupo });
        };
      });

      container.querySelectorAll('[data-reg-gid]').forEach(function (btn) {
        btn.onclick = function (e) {
          e.stopPropagation();
          Router.go('nueva-clase', { groupId: btn.dataset.regGid });
        };
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
        };
      });
    }
  };
})();
