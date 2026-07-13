/* ═══════════════════════════════════════════════════════════════
   grupo-detalle.view.js — Clases de un grupo con búsqueda y filtros
═══════════════════════════════════════════════════════════════ */

var GrupoDetalleView = (function () {
  'use strict';

  return {
    async render(container, params) {
      var gid = params && params.groupId;
      if (!gid) { Router.go('grupos'); return; }

      var g = await GroupsService.getById(gid);
      if (!g) { Toast.error('Grupo no encontrado.'); Router.go('grupos'); return; }

      var allClases = await ClassesService.getByGroup(gid);
      var query     = '';
      var activeFilter = 'todas';
      var lastReal  = allClases.find(function (c) { return !+c.cancelada; }) || null;

      // Actualizar título del topbar
      Router.setTitle(g.nombre);

      _draw();

      function filteredClases() {
        var rows = allClases;
        if (query) {
          var q = query.toLowerCase();
          rows = rows.filter(function (c) {
            return [c.tema, c.desarrollo, c.tarea, c.observaciones].join(' ').toLowerCase().indexOf(q) > -1;
          });
        }
        var today = Utils.today();
        switch (activeFilter) {
          case 'tareas':
            rows = rows.filter(function (c) { return !!c.tarea; }); break;
          case 'pendientes':
            rows = rows.filter(function (c) { return c.tarea && c.fechaTarea && c.fechaTarea <= today && !+c.tareaRevisada; }); break;
          case 'destacadas':
            rows = rows.filter(function (c) { return !!+c.destacado; }); break;
        }
        return rows;
      }

      function _draw() {
        var items = filteredClases();
        container.innerHTML =
          /* Page header */
          '<div class="page-header">' +
            '<div>' +
              '<div class="flex items-center gap-2">' +
                '<div class="group-dot" style="background:' + g.color + ';width:12px;height:12px"></div>' +
                '<h1 class="page-title">' + Utils.esc(g.nombre) + '</h1>' +
              '</div>' +
              (g.asignatura ? '<p class="page-subtitle">' + Utils.esc(g.asignatura) + '</p>' : '') +
            '</div>' +
            '<div class="flex gap-2">' +
              '<button class="btn btn-secondary btn-sm" id="btnEditG">✏️</button>' +
              '<button class="btn btn-secondary btn-sm" id="btnExportG">↗ CSV</button>' +
              '<button class="btn btn-secondary" id="btnNoClaseG">❌ No hubo clase</button>' +
              '<button class="btn btn-primary" id="btnNuevaClaseG">+ Registrar</button>' +
            '</div>' +
          '</div>' +

          (lastReal ?
            '<div class="card" style="padding:8px 14px;margin-bottom:12px;border-left:3px solid ' + g.color + '">' +
              '<p class="text-xs text-muted" style="margin:0">📌 Última clase real: <strong>' + Utils.dateShort(lastReal.fecha) + '</strong>' +
              (lastReal.tema ? ' — ' + Utils.esc(Utils.cut(lastReal.tema, 60)) : '') + '</p>' +
            '</div>' :
            allClases.length ? '<div class="card" style="padding:8px 14px;margin-bottom:12px;border-left:3px solid var(--danger)"><p class="text-xs" style="margin:0;color:var(--danger)">⚠ Sin clases reales registradas todavía (solo hay ausencias).</p></div>' : '') +

          /* Buscador */
          '<div class="search-wrap">' +
            '<span class="search-icon">🔍</span>' +
            '<input class="search-input" type="search" id="grupoSearch" placeholder="Buscar en este grupo…" value="' + Utils.esc(query) + '" inputmode="search">' +
          '</div>' +

          /* Filtros */
          '<div class="filter-bar">' +
            ['todas','tareas','pendientes','destacadas'].map(function (f) {
              var labels = { todas:'Todas', tareas:'Con tarea', pendientes:'⚠️ Pendientes', destacadas:'⭐ Destacadas' };
              return '<button class="filter-chip' + (activeFilter === f ? ' active' : '') + '" data-filter="' + f + '">' + labels[f] + '</button>';
            }).join('') +
          '</div>' +

          /* Lista */
          '<div class="class-list" id="grupoClassList">' +
            (items.length === 0 ?
              '<div class="empty-state"><div class="empty-icon">📋</div>' +
              '<p class="empty-title">Sin resultados</p>' +
              '<p class="empty-desc">' + (query || activeFilter !== 'todas' ? 'Prueba con otro filtro.' : 'Registra la primera clase de este grupo.') + '</p></div>' :
              items.map(_classRowHtml).join('')) +
          '</div>';

        /* Eventos de la vista */
        document.getElementById('btnNuevaClaseG').onclick = function () {
          Router.go('nueva-clase', { groupId: gid });
        };
        document.getElementById('btnNoClaseG').onclick = function () {
          Router.go('nueva-clase', { groupId: gid, precancelada: true });
        };
        document.getElementById('btnEditG').onclick = async function () {
          var fresh = await GroupsService.getById(gid);
          GruposView.openModal(fresh, async function (updated) {
            g = updated || (await GroupsService.getById(gid));
            allClases = await ClassesService.getByGroup(gid);
            _draw();
          });
        };
        document.getElementById('btnExportG').onclick = async function () {
          var res = await ExportService.exportCSV(gid);
          if (res.ok) Toast.success('CSV exportado (' + res.count + ' clases).');
          else Toast.error('Error al exportar.');
        };

        var searchEl = document.getElementById('grupoSearch');
        searchEl.oninput = Utils.debounce(function (e) {
          query = e.target.value.trim();
          _draw();
        }, 280);
        searchEl.focus = function () {}; // evitar autofoco molesto en Android

        container.querySelectorAll('.filter-chip').forEach(function (btn) {
          btn.onclick = function () { activeFilter = btn.dataset.filter; _draw(); };
        });

        _bindRowActions();
      }

      function _classRowHtml(c) {
        if (+c.cancelada) {
          return '<div class="class-row" data-cid="' + c.id + '" style="opacity:0.7;background:var(--bg)">' +
            '<div class="class-date-badge" style="background:var(--danger);opacity:0.15">' +
              '<span class="date-day">' + c.fecha.slice(8) + '</span>' +
              '<span class="date-mon">' + Utils.monthShort(c.fecha) + '</span>' +
            '</div>' +
            '<div class="class-row-body">' +
              '<p class="class-row-title" style="color:var(--danger)">❌ No hubo clase</p>' +
              '<p class="class-row-sub">Motivo: ' + Utils.esc(c.motivo || 'Sin especificar') + '</p>' +
            '</div>' +
            '<div class="class-row-actions">' +
              '<button class="icon-btn" data-act="edit" data-id="' + c.id + '" style="font-size:16px" title="Editar">✏️</button>' +
              '<button class="icon-btn" data-act="del" data-id="' + c.id + '" style="font-size:16px;color:var(--danger)" title="Eliminar">🗑️</button>' +
            '</div>' +
          '</div>';
        }
        return '<div class="class-row' + (+c.destacado ? ' destacado' : '') + '" data-cid="' + c.id + '">' +
          '<div class="class-date-badge">' +
            '<span class="date-day">' + c.fecha.slice(8) + '</span>' +
            '<span class="date-mon">' + Utils.monthShort(c.fecha) + '</span>' +
          '</div>' +
          '<div class="class-row-body">' +
            (c.tema ? '<p class="class-row-title">' + Utils.esc(Utils.cut(c.tema, 65)) + '</p>' : '') +
            (c.desarrollo ? '<p class="class-row-sub">' + Utils.esc(Utils.cut(c.desarrollo, 100)) + '</p>' : '') +
            (c.tarea ? '<p class="class-row-tarea">📝 ' + Utils.esc(Utils.cut(c.tarea, 60)) +
              (c.fechaTarea ? ' · ' + Utils.dateShort(c.fechaTarea) : '') +
              (+c.tareaRevisada ? ' <span style="color:var(--primary)">✓</span>' : '') + '</p>' : '') +
          '</div>' +
          '<div class="class-row-actions">' +
            '<button class="icon-btn" data-act="star" data-id="' + c.id + '" style="font-size:16px" title="Destacar">' + (+c.destacado ? '⭐' : '☆') + '</button>' +
            '<button class="icon-btn" data-act="edit" data-id="' + c.id + '" style="font-size:16px" title="Editar">✏️</button>' +
            '<button class="icon-btn" data-act="copytask" data-id="' + c.id + '" style="font-size:16px" title="Copiar tarea">📋</button>' +
            '<button class="icon-btn" data-act="del" data-id="' + c.id + '" style="font-size:16px;color:var(--danger)" title="Eliminar">🗑️</button>' +
          '</div>' +
        '</div>';
      }

      function _bindRowActions() {
        container.querySelectorAll('[data-act]').forEach(function (btn) {
          btn.onclick = async function (e) {
            e.stopPropagation();
            var id  = btn.dataset.id;
            var act = btn.dataset.act;

            if (act === 'edit') {
              Router.go('nueva-clase', { groupId: gid, classId: id });
            }
            if (act === 'star') {
              await ClassesService.toggleDestacado(id);
              allClases = await ClassesService.getByGroup(gid);
              _draw();
            }
            if (act === 'copytask') {
              var source = allClases.find(function (c) { return c.id === id; });
              if (source) await _openCopyTaskModal(source);
            }
            if (act === 'del') {
              var ok = await Modal.confirm({
                title: 'Eliminar registro',
                message: '¿Eliminar este registro de clase? No se puede deshacer.',
                confirmLabel: 'Eliminar',
                danger: true
              });
              if (!ok) return;
              await ClassesService.remove(id);
              allClases = await ClassesService.getByGroup(gid);
              _draw();
              Toast.success('Registro eliminado.');
            }
          };
        });
      }
      async function _openCopyTaskModal(source) {
        var allGrupos = await GroupsService.getAll();
        var formEl = document.createElement('div');
        formEl.innerHTML =
          '<p class="text-sm text-muted" style="margin:0 0 10px">Copiando tema/tarea de la clase del ' + Utils.dateShort(source.fecha) + (source.tema ? ' — ' + Utils.esc(Utils.cut(source.tema, 60)) : '') + '</p>' +
          '<div class="field">' +
            '<label class="field-label">Grupo destino</label>' +
            '<select class="select" id="ctGroup">' +
              allGrupos.map(function (x) {
                return '<option value="' + x.id + '"' + (x.id === gid ? ' selected' : '') + '>' + Utils.esc(x.nombre + (x.asignatura ? ' — ' + x.asignatura : '')) + '</option>';
              }).join('') +
            '</select>' +
          '</div>' +
          '<div class="field mt-3">' +
            '<label class="field-label">Fecha destino</label>' +
            '<input class="input" type="date" id="ctFecha" value="' + Utils.today() + '">' +
          '</div>';

        Modal.open({
          title: '📋 Copiar tarea',
          content: formEl,
          actions: [
            { label: 'Cancelar', variant: 'ghost' },
            {
              label: 'Copiar', variant: 'primary', closeOnClick: false,
              onClick: async function () {
                var targetGroup = document.getElementById('ctGroup').value;
                var targetFecha = document.getElementById('ctFecha').value;
                await ClassesService.copyTaskToDate(source, targetGroup, targetFecha);
                Modal.close();
                Toast.success('Tarea copiada.');
                allClases = await ClassesService.getByGroup(gid);
                lastReal = allClases.find(function (c) { return !+c.cancelada; }) || null;
                _draw();
              }
            }
          ]
        });
      }
    }
  };
})();
