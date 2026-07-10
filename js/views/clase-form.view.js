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
      var d = existing || {
        groupId: preGroupId || '',
        fecha: Utils.today(),
        periodo: '', tema: '', desarrollo: '',
        tarea: '', fechaTarea: '', tareaRevisada: 0,
        observaciones: '', asistencia: '', destacado: 0
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

      Router.setTitle(editId ? 'Editar clase' : 'Nueva clase');

      container.innerHTML =
        '<div class="page-header">' +
          '<h1 class="page-title">' + (editId ? 'Editar clase' : 'Registrar clase') + '</h1>' +
          '<div class="flex gap-2">' +
            '<button class="btn btn-secondary" id="fcCancel">Cancelar</button>' +
            '<button class="btn btn-primary" id="fcSave">💾 Guardar</button>' +
          '</div>' +
        '</div>' +
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
              '<label class="field-label">Periodo</label>' +
              '<input class="input" type="text" id="fcPeriodo" inputmode="text" autocomplete="off" placeholder="Ej: P1, 2025-1" value="' + Utils.esc(d.periodo) + '">' +
            '</div>' +
          '</div>' +

          '<div class="field mt-3" id="fcSiblingsWrap" style="display:none">' +
            '<label class="field-label">Duplicar esta clase/tarea a otros grupos del mismo grado</label>' +
            '<div id="fcSiblingsList" class="flex gap-2" style="flex-wrap:wrap"></div>' +
          '</div>' +

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
          '<div class="field">' +
            '<label class="field-label">Asistencia</label>' +
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

          '<!-- Opciones extra -->' +
          '<div class="flex items-center gap-3 mt-3">' +
            '<label style="display:flex;align-items:center;gap:8px;font-size:14px;cursor:pointer">' +
              '<input type="checkbox" id="fcDestacado"' + (+d.destacado ? ' checked' : '') + '>' +
              'Marcar como destacada ⭐' +
            '</label>' +
          '</div>' +

        '</div>'; // end .card

      /* ── Mostrar/ocultar campo fecha de entrega ── */
      var tareaEl = document.getElementById('fcTarea');
      var wrapEl  = document.getElementById('fcFechaEntregaWrap');
      tareaEl.addEventListener('input', function () {
        wrapEl.style.display = tareaEl.value.trim() ? '' : 'none';
      });

      /* ── Grupos hermanos del mismo grado (duplicar) ── */
      var groupSelEl     = document.getElementById('fcGroup');
      var siblingsWrapEl = document.getElementById('fcSiblingsWrap');
      var siblingsListEl = document.getElementById('fcSiblingsList');

      async function refreshSiblings() {
        var gid = groupSelEl.value;
        siblingsListEl.innerHTML = '';
        if (!gid) { siblingsWrapEl.style.display = 'none'; return; }
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
          tema:          document.getElementById('fcTema').value,
          desarrollo:    document.getElementById('fcDesarrollo').value,
          observaciones: document.getElementById('fcObs').value,
          asistencia:    document.getElementById('fcAsistencia').value,
          tarea:         document.getElementById('fcTarea').value,
          fechaTarea:    document.getElementById('fcFechaTarea') ? document.getElementById('fcFechaTarea').value : '',
          tareaRevisada: document.getElementById('fcRevisada') ? (document.getElementById('fcRevisada').checked ? 1 : 0) : 0,
          destacado:     document.getElementById('fcDestacado').checked ? 1 : 0,
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

        Toast.success((editId ? 'Clase actualizada.' : '¡Clase registrada!') + (dupCount ? ' Duplicada a ' + dupCount + ' ' + Utils.plural(dupCount, 'grupo') + '.' : ''));
        if (saveData.groupId) Router.go('grupo', { groupId: saveData.groupId });
        else Router.go('home');
      };
    }
  };
})();
