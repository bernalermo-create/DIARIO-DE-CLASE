/* ═══════════════════════════════════════════════════════════════
   clase-form.view.js — Formulario de registro / edición de clase
═══════════════════════════════════════════════════════════════ */

var ClaseFormView = (function () {
  'use strict';

  return {
    async render(container, params) {
      params = params || {};
      var editId     = params.classId || null;
      var preGroupId = params.groupId || null;
      var grupos     = await GroupsService.getAll();
      var existing   = editId ? await ClassesService.getById(editId) : null;
      var copySource = (!existing && params.copyFrom) ? await ClassesService.getById(params.copyFrom) : null;

      var d = existing || {
        groupId: preGroupId || (copySource ? copySource.groupId : ''),
        fecha: Utils.today(),
        periodo: copySource ? (copySource.periodo || '') : '',
        tema: copySource ? (copySource.tema || '') : '',
        desarrollo: copySource ? (copySource.desarrollo || '') : '',
        tarea: copySource ? (copySource.tarea || '') : '',
        fechaTarea: '', tareaRevisada: 0,
        observaciones: '', asistencia: '', destacado: 0,
        cancelada: params.precancelada ? 1 : 0, motivo: ''
      };

      if (!grupos.length) {
        container.innerHTML =
          '<div class="empty-state card"><div class="empty-icon">🏫</div>' +
          '<p class="empty-title">Primero crea un grupo</p>' +
          '<p class="empty-desc">Necesitas al menos un grupo para registrar una clase.</p>' +
          '<button class="btn btn-primary mt-3" id="btnGoGrupos">Crear grupo</button></div>';
        document.getElementById('btnGoGrupos').onclick = function () { Router.go('grupos'); };
        return;
      }

      Router.setTitle(editId ? 'Editar clase' : (copySource ? 'Copiar tarea' : 'Nueva clase'));

      container.innerHTML =
        '<div class="page-header">' +
          '<h1 class="page-title">' + (editId ? 'Editar clase' : (copySource ? '📋 Copiar tarea' : 'Registrar clase')) + '</h1>' +
          '<div class="flex gap-2">' +
            '<button class="btn btn-secondary" id="fcCancel">Cancelar</button>' +
            '<button class="btn btn-primary" id="fcSave">💾 Guardar</button>' +
          '</div>' +
        '</div>' +
        (copySource ? '<div class="card" style="padding:10px 14px;margin-bottom:12px;border-left:3px solid var(--accent)"><p class="text-sm" style="margin:0">Copiando tema/tarea de la clase del ' + Utils.esc(copySource.fecha) + '. Ajusta la fecha, el grupo y lo que necesites antes de guardar.</p></div>' : '') +
        '<div class="card">' +

          '<!-- Identificación -->' +
          '<p class="form-section-title">Identificación</p>' +
          '<div class="form-row">' +
            '<div class="field">' +
              '<label class="field-label">Grupo <span class="field-req">*</span></label>' +
              '<select class="select" id="fcGroup">' +
                '<option value="">Seleccionar grupo…</option>' +
                grupos.map(function (g) {
                  return '<option value="' + g.id + '"' + (d.groupId === g.id ? ' selected' : '') + '>' +
                    Utils.esc(g.nombre + (g.asignatura ? ' — ' + g.asignatura : '')) + '</option>';
                }).join('') +
              '</select>' +
            '</div>' +
            '<div class="field">' +
              '<label class="field-label">Fecha <span class="field-req">*</span></label>' +
              '<input class="input" type="date" id="fcFecha" value="' + Utils.esc(d.fecha) + '">' +
            '</div>' +
            '<div class="field">' +
              '<label class="field-label">Periodo <span class="text-xs text-muted">(automático)</span></label>' +
              '<input class="input" type="text" id="fcPeriodo" inputmode="text" autocomplete="off" placeholder="Se detecta según la fecha" value="' + Utils.esc(d.periodo) + '">' +
            '</div>' +
          '</div>' +

          '<div class="field mt-3" id="fcSiblingsWrap" style="display:none">' +
            '<label class="field-label">Duplicar esta clase/tarea a otros grupos del mismo grado</label>' +
            '<div id="fcSiblingsList" class="flex gap-2" style="flex-wrap:wrap"></div>' +
          '</div>' +

          '<div class="card" style="padding:12px 14px;margin-top:14px;background:var(--bg)">' +
            '<label style="display:flex;align-items:center;gap:8px;font-size:14px;cursor:pointer;font-weight:600">' +
              '<input type="checkbox" id="fcCancelada"' + (+d.cancelada ? ' checked' : '') + '>' +
              '❌ No hubo clase este día' +
            '</label>' +
            '<div id="fcMotivoWrap" style="display:' + (+d.cancelada ? '' : 'none') + ';margin-top:10px">' +
              '<label class="field-label">Motivo <span class="field-req">*</span></label>' +
              '<select class="select" id="fcMotivo">' +
                '<option value="">Seleccionar…</option>' +
                ['Día festivo / feriado', 'Reunión de docentes', 'Actividad institucional', 'Paro / huelga', 'Incapacidad médica', 'Suspensión de clases', 'Permiso / diligencia personal', 'Otro'].map(function (m) {
                  return '<option value="' + Utils.esc(m) + '"' + (d.motivo === m ? ' selected' : '') + '>' + Utils.esc(m) + '</option>';
                }).join('') +
              '</select>' +
            '</div>' +
          '</div>' +

          '<div id="fcContentSection" style="display:' + (+d.cancelada ? 'none' : '') + '">' +
          '<!-- Contenido -->' +
          '<p class="form-section-title">Contenido de la clase</p>' +
          '<div class="field">' +
            '<label class="field-label">Tema de la clase</label>' +
            '<input class="input" type="text" id="fcTema" inputmode="text" autocomplete="off" placeholder="Ej: Ecuaciones de primer grado" value="' + Utils.esc(d.tema) + '">' +
          '</div>' +
          '<div class="field">' +
            '<label class="field-label">Desarrollo de la clase <span class="field-req">*</span></label>' +
            '<p class="field-hint">¿Qué se hizo durante la clase?</p>' +
            '<textarea class="textarea" id="fcDesarrollo" rows="5" placeholder="Describe brevemente las actividades realizadas…">' + Utils.esc(d.desarrollo) + '</textarea>' +
          '</div>' +
          '<div class="field">' +
            '<label class="field-label">Observaciones</label>' +
            '<textarea class="textarea" id="fcObs" rows="3" placeholder="Notas adicionales, aspectos a mejorar…">' + Utils.esc(d.observaciones) + '</textarea>' +
          '</div>' +
          '<div class="field" id="fcAttendanceWrap" style="display:none">' +
            '<label class="field-label">Asistencia</label>' +
            '<div class="flex gap-2 mb-2" style="flex-wrap:wrap">' +
              '<button type="button" class="btn btn-xs btn-secondary" id="fcAttAllPresent">✓ Todos presentes</button>' +
              '<button type="button" class="btn btn-xs btn-secondary" id="fcAttAllAbsent">✗ Todos ausentes</button>' +
            '</div>' +
            '<div id="fcAttendanceList" style="max-height:260px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--r-sm);padding:6px"></div>' +
            '<p class="text-xs text-muted mt-2" id="fcAttSummary"></p>' +
          '</div>' +
          '<div class="field">' +
            '<label class="field-label">Asistencia <span class="text-xs text-muted">(nota libre / resumen)</span></label>' +
            '<input class="input" type="text" id="fcAsistencia" inputmode="text" autocomplete="off" placeholder="Ej: 28/30, ausentes: Juan, María" value="' + Utils.esc(d.asistencia) + '">' +
          '</div>' +

          '<!-- Tarea -->' +
          '<p class="form-section-title">Tarea asignada</p>' +
          '<div class="field">' +
            '<label class="field-label">Descripción de la tarea</label>' +
            '<textarea class="textarea" id="fcTarea" rows="3" placeholder="Describe la tarea o actividad para casa…">' + Utils.esc(d.tarea) + '</textarea>' +
          '</div>' +
          '<div class="field" id="fcFechaEntregaWrap" style="' + (d.tarea ? '' : 'display:none') + '">' +
            '<label class="field-label">Fecha de entrega</label>' +
            '<input class="input" type="date" id="fcFechaTarea" value="' + Utils.esc(d.fechaTarea) + '">' +
          '</div>' +
          (existing ?
            '<div class="flex items-center gap-3 mt-3">' +
              '<label style="display:flex;align-items:center;gap:8px;font-size:14px;cursor:pointer">' +
                '<input type="checkbox" id="fcRevisada"' + (+d.tareaRevisada ? ' checked' : '') + '>' +
                'Tarea revisada ✓' +
              '</label>' +
            '</div>' : '') +

          '</div><!-- /fcContentSection -->' +

          '<!-- Opciones extra -->' +
          '<div class="flex items-center gap-3 mt-3">' +
            '<label style="display:flex;align-items:center;gap:8px;font-size:14px;cursor:pointer">' +
              '<input type="checkbox" id="fcDestacado"' + (+d.destacado ? ' checked' : '') + '>' +
              'Marcar como destacada ⭐' +
            '</label>' +
          '</div>' +

        '</div>'; // end .card

      /* ── Periodo automático según la fecha ── */
      var fechaEl   = document.getElementById('fcFecha');
      var periodoEl = document.getElementById('fcPeriodo');
      var periodoIsAuto = !d.periodo; // solo autocompleta si no venía ya un periodo escrito (clase nueva o sin periodo aún)
      async function autoFillPeriodo() {
        if (!periodoIsAuto) return;
        var p = await PeriodsService.getPeriodForDate(fechaEl.value);
        periodoEl.value = p || '';
      }
      periodoEl.addEventListener('input', function () { periodoIsAuto = false; });
      fechaEl.addEventListener('change', autoFillPeriodo);
      autoFillPeriodo();

      /* ── Mostrar/ocultar campo fecha de entrega ── */
      var tareaEl = document.getElementById('fcTarea');
      var wrapEl  = document.getElementById('fcFechaEntregaWrap');
      tareaEl.addEventListener('input', function () {
        wrapEl.style.display = tareaEl.value.trim() ? '' : 'none';
      });

      /* ── No hubo clase (cancelada) ── */
      var canceladaEl   = document.getElementById('fcCancelada');
      var motivoWrapEl  = document.getElementById('fcMotivoWrap');
      var contentSecEl  = document.getElementById('fcContentSection');
      canceladaEl.addEventListener('change', function () {
        motivoWrapEl.style.display  = canceladaEl.checked ? '' : 'none';
        contentSecEl.style.display  = canceladaEl.checked ? 'none' : '';
        refreshSiblings();
        refreshAttendance();
      });

      /* ── Asistencia (lista de estudiantes del grupo) ── */
      var attWrapEl    = document.getElementById('fcAttendanceWrap');
      var attListEl    = document.getElementById('fcAttendanceList');
      var attSummaryEl = document.getElementById('fcAttSummary');
      var fcAsistenciaEl = document.getElementById('fcAsistencia');
      var savedAttendance = Array.isArray(d.asistenciaLista) ? d.asistenciaLista : [];

      function updateAttSummaryAndText() {
        var boxes = Array.from(attListEl.querySelectorAll('.fcAttChk'));
        if (!boxes.length) { attSummaryEl.textContent = ''; return; }
        var present = boxes.filter(function (b) { return b.checked; }).length;
        attSummaryEl.textContent = present + ' de ' + boxes.length + ' presentes';
        var absentNames = boxes.filter(function (b) { return !b.checked; }).map(function (b) { return b.dataset.name; });
        fcAsistenciaEl.value = present + '/' + boxes.length + ' presentes' + (absentNames.length ? ' — ausentes: ' + absentNames.join(', ') : '');
      }

      async function refreshAttendance() {
        var gidSel = groupSelEl.value;
        if (!gidSel || canceladaEl.checked) { attWrapEl.style.display = 'none'; return; }
        var students = await StudentsService.getByGroup(gidSel);
        if (!students.length) {
          attWrapEl.style.display = '';
          attListEl.innerHTML = '<p class="text-sm text-muted" style="padding:6px">Este grupo no tiene estudiantes registrados. Ve a "👥 Estudiantes" en el grupo para agregar o importar la lista.</p>';
          attSummaryEl.textContent = '';
          return;
        }
        attWrapEl.style.display = '';
        var savedMap = {};
        savedAttendance.forEach(function (a) { savedMap[a.estudianteId] = a.presente; });
        attListEl.innerHTML = students.map(function (s) {
          var checked = savedMap.hasOwnProperty(s.id) ? savedMap[s.id] : true;
          return '<label style="display:flex;align-items:center;gap:8px;padding:5px 4px;font-size:13px;cursor:pointer;border-bottom:1px solid var(--border)">' +
            '<input type="checkbox" class="fcAttChk" data-sid="' + s.id + '" data-name="' + Utils.esc(s.nombre) + '"' + (checked ? ' checked' : '') + '>' +
            (s.numero ? s.numero + '. ' : '') + Utils.esc(s.nombre) +
          '</label>';
        }).join('');
        attListEl.querySelectorAll('.fcAttChk').forEach(function (chk) {
          chk.addEventListener('change', updateAttSummaryAndText);
        });
        updateAttSummaryAndText();
      }
      document.getElementById('fcAttAllPresent').onclick = function () {
        attListEl.querySelectorAll('.fcAttChk').forEach(function (c) { c.checked = true; });
        updateAttSummaryAndText();
      };
      document.getElementById('fcAttAllAbsent').onclick = function () {
        attListEl.querySelectorAll('.fcAttChk').forEach(function (c) { c.checked = false; });
        updateAttSummaryAndText();
      };

      /* ── Grupos hermanos del mismo grado (duplicar) ── */
      var groupSelEl     = document.getElementById('fcGroup');
      var siblingsWrapEl = document.getElementById('fcSiblingsWrap');
      var siblingsListEl = document.getElementById('fcSiblingsList');

      async function refreshSiblings() {
        var gid = groupSelEl.value;
        siblingsListEl.innerHTML = '';
        if (!gid || canceladaEl.checked) { siblingsWrapEl.style.display = 'none'; return; }
        var siblings = await GroupsService.getSiblingsByGrade(gid);
        if (!siblings.length) { siblingsWrapEl.style.display = 'none'; return; }
        siblingsWrapEl.style.display = '';
        siblingsListEl.innerHTML = siblings.map(function (s) {
          return '<label style="display:flex;align-items:center;gap:6px;font-size:13px;border:1px solid var(--border);padding:6px 10px;border-radius:var(--r-sm);cursor:pointer">' +
            '<input type="checkbox" class="fcSiblingChk" value="' + s.id + '"> ' +
            Utils.esc(s.nombre + (s.asignatura ? ' — ' + s.asignatura : '')) +
          '</label>';
        }).join('');
      }
      groupSelEl.addEventListener('change', refreshSiblings);
      groupSelEl.addEventListener('change', refreshAttendance);
      refreshSiblings();
      refreshAttendance();

      /* ── Cancelar ── */
      document.getElementById('fcCancel').onclick = function () {
        if (preGroupId) Router.go('grupo', { groupId: preGroupId });
        else Router.go('home');
      };

      /* ── Guardar ── */
      document.getElementById('fcSave').onclick = async function () {
        var saveData = {
          id:            editId || undefined,
          groupId:       document.getElementById('fcGroup').value,
          fecha:         document.getElementById('fcFecha').value,
          periodo:       document.getElementById('fcPeriodo').value,
          tema:          document.getElementById('fcTema').value,
          desarrollo:    document.getElementById('fcDesarrollo').value,
          observaciones: document.getElementById('fcObs').value,
          asistencia:    document.getElementById('fcAsistencia').value,
          tarea:         document.getElementById('fcTarea').value,
          fechaTarea:    document.getElementById('fcFechaTarea') ? document.getElementById('fcFechaTarea').value : '',
          tareaRevisada: document.getElementById('fcRevisada') ? (document.getElementById('fcRevisada').checked ? 1 : 0) : 0,
          destacado:     document.getElementById('fcDestacado').checked ? 1 : 0,
          cancelada:     canceladaEl.checked ? 1 : 0,
          motivo:        document.getElementById('fcMotivo') ? document.getElementById('fcMotivo').value : '',
          asistenciaLista: Array.from(attListEl.querySelectorAll('.fcAttChk')).map(function (chk) {
            return { estudianteId: chk.dataset.sid, nombre: chk.dataset.name, presente: chk.checked };
          }),
          createdAt:     existing ? existing.createdAt : undefined
        };

        var res = await ClassesService.save(saveData);
        if (!res.ok) { Toast.error(res.msg); return; }

        // Duplicar a grupos del mismo grado marcados por el usuario
        var checkedSiblings = Array.from(document.querySelectorAll('.fcSiblingChk:checked')).map(function (c) { return c.value; });
        var dupCount = 0;
        if (checkedSiblings.length) {
          var created = await ClassesService.duplicateToGroups(res.record, checkedSiblings);
          dupCount = created.length;
        }

        // Programar notificación si hay tarea con fecha
        if (res.record.tarea && res.record.fechaTarea) {
          var grp = await GroupsService.getById(res.record.groupId);
          if (grp) await NotificationsService.scheduleTaskReminder(res.record, grp.nombre);
        }

        Toast.success((editId ? 'Clase actualizada.' : (saveData.cancelada ? 'Ausencia de clase registrada.' : '¡Clase registrada!')) + (dupCount ? ' Duplicada a ' + dupCount + ' ' + Utils.plural(dupCount, 'grupo') + '.' : ''));
        SheetsSyncService.pushInBackground();
        if (saveData.groupId) Router.go('grupo', { groupId: saveData.groupId });
        else Router.go('home');
      };
    }
  };
})();
