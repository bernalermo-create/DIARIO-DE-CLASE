/* ═══════════════════════════════════════════════════════════════
   clase-form.view.js — Formulario de registro / edición de clase
   Versión compacta: lo esencial siempre visible, lo secundario
   colapsado bajo "Más opciones" — pensado para uso rápido en celular.
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
        observaciones: '', destacado: 0,
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
          '<button class="btn btn-secondary btn-sm" id="fcCancel">Cancelar</button>' +
        '</div>' +
        (copySource ? '<div class="card" style="padding:10px 14px;margin-bottom:12px;border-left:3px solid var(--accent)"><p class="text-sm" style="margin:0">Copiando tema/tarea de la clase del ' + Utils.esc(copySource.fecha) + '. Ajusta la fecha, el grupo y lo que necesites antes de guardar.</p></div>' : '') +

        '<div class="card">' +

          /* Grupo + Fecha */
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
          '</div>' +
          '<p class="text-xs text-muted" id="fcPeriodoLabel" style="margin:6px 2px 0"></p>' +
          '<input type="hidden" id="fcPeriodo" value="' + Utils.esc(d.periodo) + '">' +

          '<div class="field mt-3" id="fcSiblingsWrap" style="display:none">' +
            '<label class="field-label">Duplicar a otros grupos del mismo grado</label>' +
            '<div id="fcSiblingsList" class="flex gap-2" style="flex-wrap:wrap"></div>' +
          '</div>' +

          /* No hubo clase */
          '<label class="mt-3" style="display:flex;align-items:center;gap:8px;font-size:14px;cursor:pointer;font-weight:600;padding:10px 12px;background:var(--bg);border-radius:var(--r-sm)">' +
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

          '<div id="fcContentSection" style="display:' + (+d.cancelada ? 'none' : '') + '">' +

            '<div class="field mt-3">' +
              '<label class="field-label">Tema de la clase</label>' +
              '<input class="input" type="text" id="fcTema" inputmode="text" autocomplete="off" placeholder="Ej: Ecuaciones de primer grado" value="' + Utils.esc(d.tema) + '">' +
            '</div>' +
            '<div class="field">' +
              '<label class="field-label">Desarrollo <span class="field-req">*</span></label>' +
              '<textarea class="textarea" id="fcDesarrollo" rows="4" placeholder="¿Qué se hizo durante la clase?">' + Utils.esc(d.desarrollo) + '</textarea>' +
            '</div>' +
            '<div class="field">' +
              '<label class="field-label">Tarea (opcional)</label>' +
              '<textarea class="textarea" id="fcTarea" rows="2" placeholder="Describe la tarea o actividad para casa…">' + Utils.esc(d.tarea) + '</textarea>' +
            '</div>' +
            '<div class="field" id="fcFechaEntregaWrap" style="' + (d.tarea ? '' : 'display:none') + '">' +
              '<label class="field-label">Fecha de entrega</label>' +
              '<input class="input" type="date" id="fcFechaTarea" value="' + Utils.esc(d.fechaTarea) + '">' +
            '</div>' +
            (existing ?
              '<label style="display:flex;align-items:center;gap:8px;font-size:14px;cursor:pointer">' +
                '<input type="checkbox" id="fcRevisada"' + (+d.tareaRevisada ? ' checked' : '') + '>' +
                'Tarea revisada ✓' +
              '</label>' : '') +

            /* Más opciones (colapsable) */
            '<button type="button" class="btn btn-sm btn-ghost mt-2" id="fcToggleMore" style="padding-left:0">▾ Más opciones</button>' +
            '<div id="fcMoreWrap" style="display:none">' +
              '<div class="field">' +
                '<label class="field-label">Observaciones</label>' +
                '<textarea class="textarea" id="fcObs" rows="2" placeholder="Notas adicionales, aspectos a mejorar…">' + Utils.esc(d.observaciones) + '</textarea>' +
              '</div>' +
              '<label style="display:flex;align-items:center;gap:8px;font-size:14px;cursor:pointer">' +
                '<input type="checkbox" id="fcDestacado"' + (+d.destacado ? ' checked' : '') + '>' +
                'Marcar como destacada ⭐' +
              '</label>' +
            '</div>' +

          '</div><!-- /fcContentSection -->' +

        '</div>' +

        '<button class="btn btn-primary btn-block mt-3" id="fcSave" style="min-height:52px;font-size:16px">💾 Guardar</button>';

      /* ── Periodo automático según la fecha ── */
      var fechaEl        = document.getElementById('fcFecha');
      var periodoEl      = document.getElementById('fcPeriodo');
      var periodoLabelEl = document.getElementById('fcPeriodoLabel');
      var periodoIsAuto  = !d.periodo;
      async function autoFillPeriodo() {
        if (periodoIsAuto) {
          var p = await PeriodsService.getPeriodForDate(fechaEl.value);
          periodoEl.value = p || '';
        }
        periodoLabelEl.textContent = periodoEl.value ? '📅 Periodo: ' + periodoEl.value : '📅 Periodo: sin definir para esta fecha';
      }
      fechaEl.addEventListener('change', autoFillPeriodo);
      autoFillPeriodo();

      /* ── Más opciones ── */
      var moreBtn  = document.getElementById('fcToggleMore');
      var moreWrap = document.getElementById('fcMoreWrap');
      if (moreBtn) {
        moreBtn.onclick = function () {
          var open = moreWrap.style.display !== 'none';
          moreWrap.style.display = open ? 'none' : '';
          moreBtn.textContent = open ? '▾ Más opciones' : '▴ Menos opciones';
        };
      }

      /* ── Mostrar/ocultar campo fecha de entrega ── */
      var tareaEl = document.getElementById('fcTarea');
      var wrapEl  = document.getElementById('fcFechaEntregaWrap');
      if (tareaEl) {
        tareaEl.addEventListener('input', function () {
          wrapEl.style.display = tareaEl.value.trim() ? '' : 'none';
        });
      }

      /* ── No hubo clase (cancelada) ── */
      var canceladaEl   = document.getElementById('fcCancelada');
      var motivoWrapEl  = document.getElementById('fcMotivoWrap');
      var contentSecEl  = document.getElementById('fcContentSection');
      canceladaEl.addEventListener('change', function () {
        motivoWrapEl.style.display  = canceladaEl.checked ? '' : 'none';
        contentSecEl.style.display  = canceladaEl.checked ? 'none' : '';
        refreshSiblings();
      });

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
      refreshSiblings();

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
          tema:          document.getElementById('fcTema') ? document.getElementById('fcTema').value : '',
          desarrollo:    document.getElementById('fcDesarrollo') ? document.getElementById('fcDesarrollo').value : '',
          observaciones: document.getElementById('fcObs') ? document.getElementById('fcObs').value : '',
          tarea:         document.getElementById('fcTarea') ? document.getElementById('fcTarea').value : '',
          fechaTarea:    document.getElementById('fcFechaTarea') ? document.getElementById('fcFechaTarea').value : '',
          tareaRevisada: document.getElementById('fcRevisada') ? (document.getElementById('fcRevisada').checked ? 1 : 0) : 0,
          destacado:     document.getElementById('fcDestacado') ? (document.getElementById('fcDestacado').checked ? 1 : 0) : 0,
          cancelada:     canceladaEl.checked ? 1 : 0,
          motivo:        document.getElementById('fcMotivo') ? document.getElementById('fcMotivo').value : '',
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
