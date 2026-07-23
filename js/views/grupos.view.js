/* ═══════════════════════════════════════════════════════════════
   grupos.view.js — Lista de grupos con crear / editar / eliminar
   + horario embebido (días/horas) al crear o editar un grupo
═══════════════════════════════════════════════════════════════ */

var GruposView = (function () {
  'use strict';

  return {
    async render(container) {
      var grupos = await GroupsService.enrichGroups(await GroupsService.getAll());
      _draw(container, grupos);
    },

    /* ── Modal crear / editar grupo (incluye horario) ── */
    async openModal(existing, onSave) {
      var g = existing || { nombre: '', asignatura: '', grado: '', color: '#2D6A4F' };
      var selectedColor = g.color;

      var dayLabels   = await ScheduleService.getDayLabels();
      var blocks      = existing ? (await ScheduleService.getByGroup(existing.id)).map(function (b) { return Object.assign({}, b); }) : [];
      var removedIds  = [];

      // Colores en uso para sugerir el siguiente
      var allGroups = await GroupsService.getAll();
      var usedColors = allGroups.map(function (x) { return x.color; }).filter(function (c) { return c !== g.color; });
      if (!existing) selectedColor = Utils.nextColor(usedColors);

      var formEl = document.createElement('div');
      formEl.innerHTML =
        '<div class="field">' +
          '<label class="field-label">Nombre del grupo <span class="field-req">*</span></label>' +
          '<input class="input" type="text" id="mgNombre" inputmode="text" autocomplete="off" placeholder="Ej: 901, 10B, Matemáticas" value="' + Utils.esc(g.nombre) + '">' +
        '</div>' +
        '<div class="form-row mt-3">' +
          '<div class="field">' +
            '<label class="field-label">Asignatura</label>' +
            '<input class="input" type="text" id="mgAsig" inputmode="text" autocomplete="off" placeholder="Ej: Matemáticas, Español" value="' + Utils.esc(g.asignatura) + '">' +
          '</div>' +
          '<div class="field">' +
            '<label class="field-label">Grado</label>' +
            '<input class="input" type="text" id="mgGrado" inputmode="text" autocomplete="off" placeholder="Ej: 9°, Noveno" value="' + Utils.esc(g.grado || '') + '">' +
            '<p class="field-hint">Grupos con el mismo grado se podrán usar para duplicar tareas entre secciones.</p>' +
          '</div>' +
        '</div>' +
        '<div class="field mt-3">' +
          '<label class="field-label">Color identificador</label>' +
          '<div class="color-picker">' +
            Utils.GROUP_COLORS.map(function (c) {
              return '<div class="color-swatch' + (selectedColor === c ? ' selected' : '') + '" data-color="' + c + '" style="background:' + c + '"></div>';
            }).join('') +
          '</div>' +
        '</div>' +
        '<div class="field mt-3">' +
          '<label class="field-label">Horario de clases</label>' +
          '<p class="field-hint">Define de una vez qué días y horas tiene clase este grupo.</p>' +
          '<div id="mgBlocksList"></div>' +
          '<button type="button" class="btn btn-xs btn-secondary mt-2" id="mgAddBlock">+ Agregar día/hora</button>' +
        '</div>';

      formEl.querySelectorAll('.color-swatch').forEach(function (sw) {
        sw.addEventListener('click', function () {
          formEl.querySelectorAll('.color-swatch').forEach(function (s) { s.classList.remove('selected'); });
          sw.classList.add('selected');
          selectedColor = sw.dataset.color;
        });
      });

      var blocksListEl = formEl.querySelector('#mgBlocksList');

      function dayOptionsHtml(selectedDia) {
        return dayLabels.map(function (label, idx) {
          return '<option value="' + idx + '"' + (+selectedDia === idx ? ' selected' : '') + '>' + Utils.esc(label) + '</option>';
        }).join('');
      }

      function durationOptionsHtml() {
        return Utils.DURATION_PRESETS.map(function (m) {
          return '<option value="' + m + '">' + m + ' min</option>';
        }).join('') + '<option value="custom">Personalizado</option>';
      }

      function renderBlockRow(block) {
        var row = document.createElement('div');
        row.className = 'card';
        row.style.cssText = 'padding:10px;margin-top:8px;background:var(--bg)';
        row.innerHTML =
          '<div class="form-row">' +
            '<div class="field"><label class="field-label" style="font-size:11px">Día</label>' +
              '<select class="select mgbDia">' + dayOptionsHtml(block.dia) + '</select></div>' +
            '<div class="field"><label class="field-label" style="font-size:11px">⏰ Inicio</label>' +
              '<input class="input mgbInicio" type="time" value="' + Utils.esc(block.horaInicio || '') + '"></div>' +
            '<div class="field"><label class="field-label" style="font-size:11px">Duración</label>' +
              '<select class="select mgbDur">' + durationOptionsHtml() + '</select></div>' +
          '</div>' +
          '<div class="form-row mt-2">' +
            '<div class="field"><label class="field-label" style="font-size:11px">⏰ Fin</label>' +
              '<input class="input mgbFin" type="time" value="' + Utils.esc(block.horaFin || '') + '"></div>' +
            '<div class="field"><label class="field-label" style="font-size:11px">🚪 Aula</label>' +
              '<input class="input mgbAula" type="text" inputmode="text" autocomplete="off" placeholder="Ej: 301" value="' + Utils.esc(block.aula || '') + '"></div>' +
          '</div>' +
          '<button type="button" class="btn btn-xs btn-ghost mt-2" style="color:var(--danger)" data-remove-block>✕ Quitar este bloque</button>';

        var inicioEl = row.querySelector('.mgbInicio');
        var finEl    = row.querySelector('.mgbFin');
        var durEl    = row.querySelector('.mgbDur');

        // Preseleccionar duración si coincide con la diferencia actual, si no "custom"
        if (block.horaInicio && block.horaFin) {
          var diff = Utils.timeToMins(block.horaFin) - Utils.timeToMins(block.horaInicio);
          var match = Utils.DURATION_PRESETS.indexOf(diff) > -1 ? String(diff) : 'custom';
          durEl.value = match;
        }

        function recalcFin() {
          var dur = durEl.value;
          if (dur !== 'custom' && inicioEl.value) {
            finEl.value = Utils.addMinutes(inicioEl.value, +dur);
          }
        }
        inicioEl.addEventListener('input', recalcFin);
        durEl.addEventListener('change', recalcFin);
        finEl.addEventListener('input', function () { durEl.value = 'custom'; });

        row.querySelector('[data-remove-block]').addEventListener('click', function () {
          if (block.id) removedIds.push(block.id);
          row.remove();
        });

        row._getData = function () {
          return {
            id:         block.id,
            dia:        +row.querySelector('.mgbDia').value,
            horaInicio: inicioEl.value,
            horaFin:    finEl.value,
            aula:       row.querySelector('.mgbAula').value.trim()
          };
        };

        blocksListEl.appendChild(row);
      }

      blocks.forEach(renderBlockRow);

      formEl.querySelector('#mgAddBlock').addEventListener('click', function () {
        renderBlockRow({ dia: 0, horaInicio: '', horaFin: '', aula: '' });
      });

      Modal.open({
        title: existing ? 'Editar grupo' : 'Nuevo grupo',
        content: formEl,
        actions: [
          { label: 'Cancelar', variant: 'ghost' },
          {
            label: 'Guardar', variant: 'primary', closeOnClick: false,
            onClick: async function () {
              var res = await GroupsService.save({
                id:         g.id,
                createdAt:  g.createdAt,
                nombre:     document.getElementById('mgNombre').value.trim(),
                asignatura: document.getElementById('mgAsig').value.trim(),
                grado:      document.getElementById('mgGrado').value.trim(),
                color:      selectedColor
              });
              if (!res.ok) { Toast.error(res.msg); return; }

              // Sincronizar bloques de horario
              for (var i = 0; i < removedIds.length; i++) {
                await ScheduleService.remove(removedIds[i]);
              }
              var rows = Array.from(blocksListEl.children);
              for (var j = 0; j < rows.length; j++) {
                var data = rows[j]._getData();
                if (!data.horaInicio) continue; // ignorar bloques vacíos
                await ScheduleService.save({
                  id:         data.id,
                  groupId:    res.record.id,
                  dia:        data.dia,
                  horaInicio: data.horaInicio,
                  horaFin:    data.horaFin,
                  aula:       data.aula
                });
              }

              Modal.close();
              Toast.success(existing ? 'Grupo actualizado.' : 'Grupo creado.');
              SheetsSyncService.pushInBackground();
              if (onSave) onSave(res.record);
            }
          }
        ]
      });
    }
  };

  function _draw(container, grupos) {
    container.innerHTML =
      '<div class="page-header">' +
        '<div><h1 class="page-title">Mis grupos</h1>' +
        '<p class="page-subtitle">' + grupos.length + ' ' + Utils.plural(grupos.length, 'grupo') + '</p></div>' +
        '<button class="btn btn-primary" id="btnNuevoGrupo">+ Nuevo</button>' +
      '</div>' +
      (grupos.length === 0 ?
        '<div class="empty-state card"><div class="empty-icon">🏫</div>' +
        '<p class="empty-title">Sin grupos todavía</p>' +
        '<p class="empty-desc">Crea un grupo para cada curso que atiendas.</p></div>' :
        '<div class="groups-grid">' +
          grupos.map(function (g) {
            return '<div class="group-card" style="border-top:3px solid ' + g.color + '">' +
              '<div class="flex justify-between items-center" style="margin-bottom:10px">' +
                '<div style="min-width:0">' +
                  '<p class="font-bold truncate" style="font-size:16px">' + Utils.esc(g.nombre) + '</p>' +
                  (g.asignatura ? '<p class="text-sm text-muted truncate">' + Utils.esc(g.asignatura) + (g.grado ? ' · ' + Utils.esc(g.grado) : '') + '</p>' :
                   g.grado ? '<p class="text-sm text-muted truncate">' + Utils.esc(g.grado) + '</p>' : '') +
                '</div>' +
                '<div class="flex gap-2">' +
                  '<button class="icon-btn" data-edit-gid="' + g.id + '" title="Editar" style="font-size:16px">✏️</button>' +
                  '<button class="icon-btn" data-del-gid="' + g.id + '" title="Eliminar" style="font-size:16px">🗑️</button>' +
                '</div>' +
              '</div>' +
              '<p class="text-sm text-muted">' + g.totalClases + ' ' + Utils.plural(g.totalClases, 'clase') + '</p>' +
              (g.tareasPendientes > 0 ?
                '<p class="text-sm" style="color:var(--danger);margin-top:2px">📝 ' + g.tareasPendientes + ' tarea' + (g.tareasPendientes > 1 ? 's' : '') + ' pendiente' + (g.tareasPendientes > 1 ? 's' : '') + '</p>' : '') +
              '<button class="btn btn-primary btn-block mt-3" data-ver-gid="' + g.id + '">Ver grupo →</button>' +
            '</div>';
          }).join('') +
        '</div>');

    /* Eventos */
    document.getElementById('btnNuevoGrupo').onclick = function () {
      GruposView.openModal(null, async function () {
        var gs = await GroupsService.enrichGroups(await GroupsService.getAll());
        _draw(container, gs);
      });
    };

    container.querySelectorAll('[data-edit-gid]').forEach(function (btn) {
      btn.onclick = async function (e) {
        e.stopPropagation();
        var g = await GroupsService.getById(btn.dataset.editGid);
        GruposView.openModal(g, async function () {
          var gs = await GroupsService.enrichGroups(await GroupsService.getAll());
          _draw(container, gs);
        });
      };
    });

    container.querySelectorAll('[data-del-gid]').forEach(function (btn) {
      btn.onclick = async function (e) {
        e.stopPropagation();
        var ok = await Modal.confirm({
          title: 'Eliminar grupo',
          message: '¿Eliminar este grupo y TODAS sus clases registradas? Esta acción no se puede deshacer.',
          confirmLabel: 'Eliminar todo',
          danger: true
        });
        if (!ok) return;
        await GroupsService.remove(btn.dataset.delGid);
        Toast.success('Grupo eliminado.');
        SheetsSyncService.pushInBackground();
        var gs = await GroupsService.enrichGroups(await GroupsService.getAll());
        _draw(container, gs);
      };
    });

    container.querySelectorAll('[data-ver-gid]').forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        Router.go('grupo', { groupId: btn.dataset.verGid });
      };
    });
  }
})();
