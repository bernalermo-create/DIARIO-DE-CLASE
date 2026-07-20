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
      if (params && params.quickAttendance) {
        setTimeout(function () { _openQuickAttendanceModal(); }, 50);
      }

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
          '<div class="page-header" style="flex-direction:column;align-items:stretch">' +
            '<div>' +
              '<div class="flex items-center gap-2">' +
                '<div class="group-dot" style="background:' + g.color + ';width:12px;height:12px"></div>' +
                '<h1 class="page-title">' + Utils.esc(g.nombre) + '</h1>' +
              '</div>' +
              (g.asignatura ? '<p class="page-subtitle">' + Utils.esc(g.asignatura) + '</p>' : '') +
            '</div>' +
            '<div class="flex gap-2" style="flex-wrap:wrap">' +
              '<button class="btn btn-primary" id="btnAttendanceG" style="flex:1;min-width:150px">✅ Tomar asistencia</button>' +
              '<button class="btn btn-primary" id="btnNuevaClaseG" style="flex:1;min-width:150px">+ Registrar clase</button>' +
            '</div>' +
            '<div class="flex gap-2" style="flex-wrap:wrap">' +
              '<button class="btn btn-secondary btn-sm" id="btnStudentsG">👥 Estudiantes</button>' +
              '<button class="btn btn-secondary btn-sm" id="btnReportG">📊 Informe</button>' +
              '<button class="btn btn-secondary btn-sm" id="btnExportG">↗ CSV</button>' +
              '<button class="btn btn-secondary btn-sm" id="btnNoClaseG">❌ No hubo clase</button>' +
              '<button class="btn btn-secondary btn-sm" id="btnEditG">✏️ Editar</button>' +
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
        document.getElementById('btnAttendanceG').onclick = function () {
          _openQuickAttendanceModal();
        };
        document.getElementById('btnReportG').onclick = function () {
          _openAttendanceReportModal();
        };
        document.getElementById('btnNoClaseG').onclick = function () {
          Router.go('nueva-clase', { groupId: gid, precancelada: true });
        };
        document.getElementById('btnStudentsG').onclick = function () {
          _openStudentsModal();
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
            (ClassesService.attendanceSummary(c) ? '<p class="text-xs text-muted" style="margin-top:2px">👥 ' + ClassesService.attendanceSummary(c) + '</p>' : '') +
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
              SheetsSyncService.pushInBackground();
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
              SheetsSyncService.pushInBackground();
            }
          };
        });
      }
      async function _autoSyncStudentsToSheets() {
        try {
          var url = await DB.getCfg('sheetsUrl');
          if (!url) return;
          Toast.info('Subiendo a Google Sheets…');
          var r = await SheetsSyncService.push(url);
          if (r.ok) Toast.success('✓ Sincronizado con Sheets.');
          else Toast.warning('No se pudo sincronizar automáticamente: ' + r.error);
        } catch (err) {
          console.warn('[Estudiantes] Auto-sync falló:', err);
        }
      }

      async function _openQuickAttendanceModal() {
        var students = await StudentsService.getByGroup(gid);
        if (!students.length) {
          Toast.warning('Este grupo no tiene estudiantes. Ve a "👥 Estudiantes" para agregar o importar la lista primero.');
          return;
        }

        var formEl = document.createElement('div');
        var fecha = Utils.today();
        var state = {}; // estudianteId -> boolean presente

        function loadStateForFecha() {
          var existing = allClases.find(function (c) { return c.fecha === fecha && !+c.cancelada; });
          var savedMap = {};
          if (existing && Array.isArray(existing.asistenciaLista)) {
            existing.asistenciaLista.forEach(function (a) { savedMap[a.estudianteId] = a.presente; });
          }
          state = {};
          students.forEach(function (s) { state[s.id] = savedMap.hasOwnProperty(s.id) ? !!savedMap[s.id] : true; });
          return existing;
        }

        function renderRows() {
          var present = Object.values(state).filter(Boolean).length;
          formEl.querySelector('#attSummary').textContent = present + ' de ' + students.length + ' presentes — toca un nombre para cambiarlo';
          formEl.querySelector('#attRows').innerHTML = students.map(function (s) {
            var p = state[s.id];
            return '<div class="att-row" data-sid="' + s.id + '" style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;margin-bottom:8px;border-radius:var(--r-sm);cursor:pointer;user-select:none;font-size:15px;font-weight:600;border:2px solid;' +
              (p ? 'background:var(--primary-s);color:var(--primary);border-color:var(--primary)' : 'background:var(--danger-s);color:var(--danger);border-color:var(--danger)') + '">' +
              '<span>' + (s.numero ? s.numero + '. ' : '') + Utils.esc(s.nombre) + '</span>' +
              '<span style="font-size:20px">' + (p ? '✓' : '✗') + '</span>' +
            '</div>';
          }).join('');
          formEl.querySelectorAll('.att-row').forEach(function (row) {
            row.onclick = function () {
              var sid = row.dataset.sid;
              state[sid] = !state[sid];
              renderRows();
            };
          });
        }

        var existingRecord = loadStateForFecha();
        formEl.innerHTML =
          '<div class="field">' +
            '<label class="field-label">Fecha</label>' +
            '<input class="input" type="date" id="attFecha" value="' + fecha + '">' +
          '</div>' +
          '<div class="flex gap-2 mt-2" style="flex-wrap:wrap">' +
            '<button type="button" class="btn btn-xs btn-secondary" id="attAllPresent">✓ Todos presentes</button>' +
            '<button type="button" class="btn btn-xs btn-secondary" id="attAllAbsent">✗ Todos ausentes</button>' +
          '</div>' +
          '<p class="text-xs text-muted mt-2" id="attSummary"></p>' +
          '<div id="attRows" style="max-height:340px;overflow-y:auto;margin-top:8px"></div>';

        Modal.open({
          title: '✅ Asistencia — ' + g.nombre,
          content: formEl,
          actions: [
            { label: 'Cancelar', variant: 'ghost' },
            {
              label: '💾 Guardar', variant: 'primary', closeOnClick: false,
              onClick: async function () {
                var asistenciaLista = students.map(function (s) {
                  return { estudianteId: s.id, nombre: s.nombre, presente: !!state[s.id] };
                });
                var present = asistenciaLista.filter(function (a) { return a.presente; }).length;
                var absentNames = asistenciaLista.filter(function (a) { return !a.presente; }).map(function (a) { return a.nombre; });
                var asistenciaTexto = present + '/' + students.length + ' presentes' + (absentNames.length ? ' — ausentes: ' + absentNames.join(', ') : '');

                var payload = existingRecord ? Object.assign({}, existingRecord) : { groupId: gid, fecha: fecha, tema: '', desarrollo: '', tarea: '', periodo: '', observaciones: '' };
                payload.asistenciaLista = asistenciaLista;
                payload.asistencia = asistenciaTexto;

                var res = await ClassesService.save(payload);
                if (!res.ok) { Toast.error(res.msg); return; }
                Modal.close();
                Toast.success('✓ Asistencia guardada (' + present + '/' + students.length + ' presentes).');
                SheetsSyncService.pushInBackground();
                allClases = await ClassesService.getByGroup(gid);
                lastReal = allClases.find(function (c) { return !+c.cancelada; }) || null;
                _draw();
              }
            }
          ]
        });
        renderRows();

        formEl.querySelector('#attFecha').addEventListener('change', function (e) {
          fecha = e.target.value || Utils.today();
          existingRecord = loadStateForFecha();
          renderRows();
        });
        formEl.querySelector('#attAllPresent').onclick = function () {
          students.forEach(function (s) { state[s.id] = true; }); renderRows();
        };
        formEl.querySelector('#attAllAbsent').onclick = function () {
          students.forEach(function (s) { state[s.id] = false; }); renderRows();
        };
      }

      async function _openAttendanceReportModal() {
        var report = await ClassesService.attendanceReport(gid);
        var formEl = document.createElement('div');

        if (!report.totalSesiones) {
          formEl.innerHTML = '<p class="text-sm text-muted">Todavía no hay asistencia registrada en este grupo. Usa "✅ Tomar asistencia" primero.</p>';
        } else {
          formEl.innerHTML =
            '<p class="text-sm text-muted" style="margin:0 0 12px">Basado en ' + report.totalSesiones + ' ' + Utils.plural(report.totalSesiones, 'clase') + ' con asistencia registrada. Ordenado por más faltas primero.</p>' +
            '<div style="max-height:360px;overflow-y:auto">' +
              report.rows.map(function (r) {
                var warn = r.pct < 75;
                return '<div class="flex justify-between items-center" style="padding:10px 4px;border-bottom:1px solid var(--border)">' +
                  '<div>' +
                    '<p style="font-size:14px;font-weight:600;margin:0">' + Utils.esc(r.nombre) + '</p>' +
                    '<p class="text-xs text-muted" style="margin:2px 0 0">' + r.presentes + ' presentes · ' + r.ausentes + ' faltas de ' + r.total + '</p>' +
                  '</div>' +
                  '<span style="font-size:15px;font-weight:800;color:' + (warn ? 'var(--danger)' : 'var(--primary)') + '">' + r.pct + '%</span>' +
                '</div>';
              }).join('') +
            '</div>';
        }

        Modal.open({
          title: '📊 Informe de asistencia — ' + g.nombre,
          content: formEl,
          actions: report.totalSesiones ? [
            { label: 'Cerrar', variant: 'ghost' },
            { label: '⬇ Exportar CSV', variant: 'primary', onClick: function () { ExportService.exportAttendanceReport(gid); } }
          ] : [{ label: 'Cerrar', variant: 'ghost' }]
        });
      }

      async function _openStudentsModal() {
        var formEl = document.createElement('div');
        var students = await StudentsService.getByGroup(gid);
        var importPreview = null; // { names: [...] }
        var pasteMode = false;

        function renderBody() {
          if (pasteMode) {
            formEl.innerHTML =
              '<p class="text-sm text-muted" style="margin:0 0 8px">Pega el listado de estudiantes (uno por línea, o separados por comas). Puedes copiarlo directo de Excel, Word o cualquier lugar.</p>' +
              '<textarea class="textarea" id="stPasteText" rows="10" style="font-size:13px" placeholder="Ana Torres&#10;Juan Pérez&#10;María Gómez…"></textarea>' +
              '<div class="flex gap-2 mt-3">' +
                '<button class="btn btn-secondary" id="stCancelPaste">← Cancelar</button>' +
                '<button class="btn btn-primary" id="stContinuePaste">Continuar →</button>' +
              '</div>';
            formEl.querySelector('#stCancelPaste').onclick = function () { pasteMode = false; renderBody(); };
            formEl.querySelector('#stContinuePaste').onclick = function () {
              var raw = formEl.querySelector('#stPasteText').value;
              var names = StudentsService.parseNamesFromPastedText(raw);
              if (!names.length) { Toast.warning('No se detectó ningún nombre.'); return; }
              pasteMode = false;
              importPreview = { names: names };
              renderBody();
            };
            return;
          }

          if (importPreview) {
            formEl.innerHTML =
              '<p class="text-sm text-muted" style="margin:0 0 8px">Se detectaron ' + importPreview.names.length + ' nombres. Revisa y edita la lista (uno por línea) antes de confirmar.</p>' +
              '<textarea class="textarea" id="stImportText" rows="10" style="font-size:13px">' + Utils.esc(importPreview.names.join('\n')) + '</textarea>' +
              '<div class="field mt-3">' +
                '<label style="display:flex;align-items:center;gap:8px;font-size:14px;cursor:pointer">' +
                  '<input type="checkbox" id="stReplace"' + (students.length === 0 ? ' checked' : '') + '>' +
                  'Reemplazar la lista actual (' + students.length + ' estudiantes)' +
                '</label>' +
                '<p class="field-hint">Si no marcas esto, los nombres se agregan al final de la lista existente.</p>' +
              '</div>' +
              '<div class="flex gap-2 mt-3">' +
                '<button class="btn btn-secondary" id="stCancelImport">← Cancelar</button>' +
                '<button class="btn btn-primary" id="stConfirmImport">✓ Confirmar importación</button>' +
              '</div>';

            formEl.querySelector('#stCancelImport').onclick = function () { importPreview = null; renderBody(); };
            formEl.querySelector('#stConfirmImport').onclick = async function () {
              var names = formEl.querySelector('#stImportText').value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
              if (!names.length) { Toast.warning('No hay nombres para importar.'); return; }
              var replace = formEl.querySelector('#stReplace').checked;
              var created = await StudentsService.importNames(gid, names, { replace: replace });
              Toast.success('✓ ' + created.length + ' estudiantes importados.');
              importPreview = null;
              students = await StudentsService.getByGroup(gid);
              renderBody();
              _autoSyncStudentsToSheets();
            };
            return;
          }

          formEl.innerHTML =
            '<p class="text-sm text-muted" style="margin:0 0 10px">' + students.length + ' ' + Utils.plural(students.length, 'estudiante') + ' en este grupo</p>' +
            '<div id="stList" style="max-height:260px;overflow-y:auto;margin-bottom:12px">' +
              (students.length ? students.map(function (s) {
                return '<div class="flex justify-between items-center" style="padding:6px 0;border-bottom:1px solid var(--border)">' +
                  '<span style="font-size:14px">' + (s.numero ? s.numero + '. ' : '') + Utils.esc(s.nombre) + '</span>' +
                  '<button class="icon-btn" data-del-student="' + s.id + '" style="font-size:15px;color:var(--danger)">🗑️</button>' +
                '</div>';
              }).join('') : '<p class="text-sm text-muted">Sin estudiantes todavía.</p>') +
            '</div>' +
            '<div class="flex gap-2">' +
              '<input class="input" type="text" id="stNewName" inputmode="text" autocomplete="off" placeholder="Nombre del estudiante…" style="flex:1">' +
              '<button class="btn btn-secondary" id="stAddOne">+ Agregar</button>' +
            '</div>' +
            '<div class="flex gap-2 mt-3" style="flex-wrap:wrap">' +
              '<input type="file" id="stFileInput" accept=".xlsx,.xls,.csv" style="display:none">' +
              '<button class="btn btn-secondary" id="stImportBtn">📥 Importar Excel/CSV</button>' +
              '<button class="btn btn-secondary" id="stPasteBtn">📋 Pegar lista</button>' +
              (students.length ? '<button class="btn btn-ghost" id="stClearAll" style="color:var(--danger)">🗑️ Vaciar lista</button>' : '') +
            '</div>';

          formEl.querySelectorAll('[data-del-student]').forEach(function (btn) {
            btn.onclick = async function () {
              await StudentsService.remove(btn.dataset.delStudent);
              students = await StudentsService.getByGroup(gid);
              renderBody();
              _autoSyncStudentsToSheets();
            };
          });

          var newNameEl = formEl.querySelector('#stNewName');
          async function addOne() {
            var name = newNameEl.value.trim();
            if (!name) return;
            var res = await StudentsService.add(gid, name);
            if (res.ok) { students = await StudentsService.getByGroup(gid); renderBody(); _autoSyncStudentsToSheets(); }
            else { Toast.error(res.msg || 'No se pudo agregar.'); }
          }
          formEl.querySelector('#stAddOne').onclick = addOne;
          newNameEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addOne(); } });
          newNameEl.focus();

          var fileInputEl = formEl.querySelector('#stFileInput');
          formEl.querySelector('#stImportBtn').onclick = function () { fileInputEl.click(); };
          formEl.querySelector('#stPasteBtn').onclick = function () { pasteMode = true; renderBody(); };
          fileInputEl.onchange = async function () {
            var file = fileInputEl.files[0];
            if (!file) return;
            try {
              Toast.info('Leyendo archivo…');
              var names = await StudentsService.parseNamesFromFile(file);
              if (!names.length) { Toast.warning('No se detectaron nombres en el archivo.'); return; }
              importPreview = { names: names };
              renderBody();
            } catch (err) {
              Toast.error(err.message || 'No se pudo leer el archivo.');
            }
          };

          if (students.length) {
            formEl.querySelector('#stClearAll').onclick = async function () {
              var ok = await Modal.confirm({
                title: 'Vaciar lista de estudiantes',
                message: '¿Eliminar los ' + students.length + ' estudiantes de este grupo? No afecta las clases ya registradas.',
                confirmLabel: 'Vaciar lista', danger: true
              });
              if (!ok) return;
              await StudentsService.removeAllByGroup(gid);
              students = [];
              renderBody();
              _autoSyncStudentsToSheets();
            };
          }
        }

        Modal.open({
          title: '👥 Estudiantes — ' + g.nombre,
          content: formEl,
          actions: [{ label: 'Cerrar', variant: 'ghost' }]
        });
        renderBody();
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
                SheetsSyncService.pushInBackground();
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
