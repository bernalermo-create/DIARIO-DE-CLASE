/* ═══════════════════════════════════════════════════════════════
   horario.view.js — Horario visual (semanal o por ciclo rotativo)
   con hora activa, y configuración de modo de horario
═══════════════════════════════════════════════════════════════ */

var HorarioView = (function () {
  'use strict';

  var _refreshInterval = null;

  return {
    async render(container) {
      clearInterval(_refreshInterval);
      var grupos = await GroupsService.getAll();

      if (!grupos.length) {
        container.innerHTML =
          '<div class="page-header"><h1 class="page-title">Horario</h1></div>' +
          '<div class="empty-state card"><div class="empty-icon">📅</div>' +
          '<p class="empty-title">Sin grupos creados</p>' +
          '<p class="empty-desc">Crea grupos primero para armar tu horario.</p>' +
          '<button class="btn btn-primary mt-3" id="btnGoGS">Crear grupo</button></div>';
        document.getElementById('btnGoGS').onclick = function () { Router.go('grupos'); };
        return;
      }

      var gMap = {};
      grupos.forEach(function (g) { gMap[g.id] = g; });

      async function draw() {
        var mode      = await ScheduleService.getMode();
        var dayLabels = await ScheduleService.getDayLabels();
        var activeIdx = await ScheduleService.getActiveDayIndex();
        var selectorDay = mode === 'ciclo' ? await ScheduleService.getCycleCurrentDay() : activeIdx;
        var allBlocks = await ScheduleService.getAll();
        var nowMins   = new Date().getHours() * 60 + new Date().getMinutes();
        var autoMode  = await ScheduleService.getAutoMode();

        container.innerHTML =
          '<div class="page-header">' +
            '<div><h1 class="page-title">Horario</h1>' +
            '<p class="page-subtitle">' + (mode === 'ciclo' ? 'Horario por ciclo rotativo (' + dayLabels.length + ' días)' : 'Horario semanal') + ' · Desliza → para ver todos los días</p></div>' +
            '<button class="btn btn-secondary" id="btnHConfig">⚙ Configurar</button>' +
          '</div>' +
          (mode === 'ciclo' ?
            '<div class="card" style="padding:10px 14px;margin-bottom:12px">' +
              '<div class="flex justify-between items-center" style="flex-wrap:wrap;gap:8px">' +
                '<div>' +
                  '<label class="field-label" style="margin:0 0 6px">Hoy es:</label>' +
                  '<select class="select" id="hCycleToday" style="max-width:220px">' +
                    dayLabels.map(function (label, idx) {
                      return '<option value="' + idx + '"' + (idx === selectorDay ? ' selected' : '') + '>' + Utils.esc(label) + '</option>';
                    }).join('') +
                  '</select>' +
                  (activeIdx < 0 ? '<p class="text-xs text-muted" style="margin:4px 0 0">Sin clases hoy (fin de semana)</p>' : '') +
                '</div>' +
                '<p class="text-xs text-muted" style="margin:0">' + (autoMode ? '🔄 Avance automático (Lun–Vie)' : '✋ Ajuste manual') + '</p>' +
              '</div>' +
            '</div>' : '') +
          '<div class="schedule-scroll">' +
            '<div class="schedule-grid">' +
              dayLabels.map(function (dia, idx) {
                var blocks = allBlocks
                  .filter(function (b) { return +b.dia === idx; })
                  .sort(function (a, b) { return a.horaInicio < b.horaInicio ? -1 : 1; });
                var isToday = idx === activeIdx;

                return '<div class="schedule-col">' +
                  '<div class="schedule-day-hdr" style="' + (isToday ? 'background:var(--accent);' : '') + '">' + Utils.esc(dia) + '</div>' +
                  blocks.map(function (b) {
                    var g     = gMap[b.groupId];
                    var start = Utils.timeToMins(b.horaInicio);
                    var end   = Utils.timeToMins(b.horaFin);
                    var isNow = isToday && start >= 0 && end > start && nowMins >= start && nowMins < end;
                    return '<div class="schedule-block' + (isNow ? ' now-active' : '') + '" style="border-left:3px solid ' + (g ? g.color : '#ccc') + '">' +
                      (b.horaInicio ? '<div class="time-pill">⏰ ' + Utils.timeLabel(b.horaInicio) + (b.horaFin ? ' – ' + Utils.timeLabel(b.horaFin) : '') + '</div>' : '') +
                      '<p class="font-bold" style="font-size:13px;margin:0">' + (g ? Utils.esc(g.nombre) : '?') + '</p>' +
                      (g && g.asignatura ? '<p class="text-xs text-muted" style="margin:1px 0 0">' + Utils.esc(g.asignatura) + '</p>' : '') +
                      (b.aula ? '<p class="text-xs text-muted" style="margin:1px 0 0">🚪 ' + Utils.esc(b.aula) + '</p>' : '') +
                      (isNow ? '<p class="text-xs" style="color:var(--primary);font-weight:700;margin-top:4px">▶ Ahora</p>' : '') +
                      '<button class="btn btn-xs btn-ghost" style="margin-top:6px;width:100%;color:var(--danger)" data-del-block="' + b.id + '">✕ Quitar</button>' +
                    '</div>';
                  }).join('') +
                  '<button class="btn btn-xs btn-secondary" style="margin-top:6px;width:100%" data-add-dia="' + idx + '">+ Agregar</button>' +
                '</div>';
              }).join('') +
            '</div>' +
          '</div>';

        /* Eventos */
        container.querySelectorAll('[data-del-block]').forEach(function (btn) {
          btn.onclick = async function () {
            await ScheduleService.remove(btn.dataset.delBlock);
            Toast.success('Bloque eliminado.');
            SheetsSyncService.pushInBackground();
            draw();
          };
        });

        container.querySelectorAll('[data-add-dia]').forEach(function (btn) {
          btn.onclick = function () {
            _openAddModal(+btn.dataset.addDia, dayLabels, grupos, draw);
          };
        });

        var cycleSel = document.getElementById('hCycleToday');
        if (cycleSel) {
          cycleSel.onchange = async function () {
            await ScheduleService.setCycleCurrentDay(+cycleSel.value);
            draw();
          };
        }

        document.getElementById('btnHConfig').onclick = function () {
          _openConfigModal(draw);
        };
      }

      await draw();

      /* Actualizar highlight cada minuto */
      _refreshInterval = setInterval(function () {
        if (Router.currentView === 'horario') draw();
        else clearInterval(_refreshInterval);
      }, 60000);
    }
  };

  function _openConfigModal(onSave) {
    var formEl = document.createElement('div');
    ScheduleService.getMode().then(async function (mode) {
      var cycleLen  = await ScheduleService.getCycleLength();
      var autoMode  = await ScheduleService.getAutoMode();
      formEl.innerHTML =
        '<div class="field">' +
          '<label class="field-label">Tipo de horario</label>' +
          '<select class="select" id="cfgMode">' +
            '<option value="semana"' + (mode === 'semana' ? ' selected' : '') + '>Días de la semana (Lunes a Sábado)</option>' +
            '<option value="ciclo"' + (mode === 'ciclo' ? ' selected' : '') + '>Ciclo rotativo (Día 1, Día 2…)</option>' +
          '</select>' +
          '<p class="field-hint">Usa "Ciclo rotativo" si tu institución maneja Día 1, Día 2… en vez de días fijos de la semana.</p>' +
        '</div>' +
        '<div id="cfgCycleOpts" style="' + (mode === 'ciclo' ? '' : 'display:none') + '">' +
          '<div class="field mt-3">' +
            '<label class="field-label">Cantidad de días en el ciclo</label>' +
            '<input class="input" type="number" min="2" max="20" id="cfgCycleLen" value="' + cycleLen + '">' +
          '</div>' +
          '<div class="field mt-3">' +
            '<label style="display:flex;align-items:center;gap:8px;font-size:14px;cursor:pointer">' +
              '<input type="checkbox" id="cfgAutoMode"' + (autoMode ? ' checked' : '') + '>' +
              'Avanzar automáticamente el día (Lunes a Viernes)' +
            '</label>' +
            '<p class="field-hint">Con esto activo, el día del ciclo sube solo cada día hábil y vuelve a Día 1 al terminar el ciclo. Aun así podrás corregirlo manualmente cualquier día (ej. por un festivo) desde "Hoy es:" en la pantalla de Horario, y el avance automático seguirá desde ese ajuste.</p>' +
          '</div>' +
        '</div>' +
        '<p class="text-sm" style="color:var(--danger);margin-top:10px">⚠ Cambiar el tipo de horario no borra los bloques existentes, pero sus días pueden quedar desalineados si cambias entre modos.</p>';

      var modeSel = document.getElementById('cfgMode');
      modeSel.addEventListener('change', function () {
        document.getElementById('cfgCycleOpts').style.display = modeSel.value === 'ciclo' ? '' : 'none';
      });
    });

    Modal.open({
      title: 'Configurar horario',
      content: formEl,
      actions: [
        { label: 'Cancelar', variant: 'ghost' },
        {
          label: 'Guardar', variant: 'primary', closeOnClick: false,
          onClick: async function () {
            var mode = document.getElementById('cfgMode').value;
            await ScheduleService.setMode(mode);
            if (mode === 'ciclo') {
              await ScheduleService.setCycleLength(document.getElementById('cfgCycleLen').value);
              await ScheduleService.setAutoMode(document.getElementById('cfgAutoMode').checked);
            }
            Modal.close();
            Toast.success('Configuración de horario guardada.');
            if (onSave) onSave();
          }
        }
      ]
    });
  }

  function _openAddModal(dia, dayLabels, grupos, onSave) {
    var formEl = document.createElement('div');
    formEl.innerHTML =
      '<div class="field">' +
        '<label class="field-label">Grupo <span class="field-req">*</span></label>' +
        '<select class="select" id="mbGroup">' +
          '<option value="">Seleccionar…</option>' +
          grupos.map(function (g) {
            return '<option value="' + g.id + '">' + Utils.esc(g.nombre + (g.asignatura ? ' — ' + g.asignatura : '')) + '</option>';
          }).join('') +
        '</select>' +
      '</div>' +
      '<div class="form-row mt-3">' +
        '<div class="field"><label class="field-label">⏰ Hora inicio</label><input class="input" type="time" id="mbHI"></div>' +
        '<div class="field"><label class="field-label">Duración</label>' +
          '<select class="select" id="mbDur">' +
            Utils.DURATION_PRESETS.map(function (m) { return '<option value="' + m + '">' + m + ' min</option>'; }).join('') +
            '<option value="custom">Personalizado</option>' +
          '</select>' +
        '</div>' +
      '</div>' +
      '<div class="field mt-3">' +
        '<label class="field-label">⏰ Hora fin</label><input class="input" type="time" id="mbHF">' +
      '</div>' +
      '<div class="field mt-3">' +
        '<label class="field-label">🚪 Aula / Salón</label>' +
        '<input class="input" type="text" id="mbAula" inputmode="text" autocomplete="off" placeholder="Ej: 301, Lab Física">' +
      '</div>';

    var hiEl  = formEl.querySelector('#mbHI');
    var hfEl  = formEl.querySelector('#mbHF');
    var durEl = formEl.querySelector('#mbDur');
    function recalc() {
      if (durEl.value !== 'custom' && hiEl.value) hfEl.value = Utils.addMinutes(hiEl.value, +durEl.value);
    }
    hiEl.addEventListener('input', recalc);
    durEl.addEventListener('change', recalc);
    hfEl.addEventListener('input', function () { durEl.value = 'custom'; });

    Modal.open({
      title: 'Agregar a ' + dayLabels[dia],
      content: formEl,
      actions: [
        { label: 'Cancelar', variant: 'ghost' },
        {
          label: 'Agregar', variant: 'primary', closeOnClick: false,
          onClick: async function () {
            var res = await ScheduleService.save({
              dia:        dia,
              groupId:    document.getElementById('mbGroup').value,
              horaInicio: document.getElementById('mbHI').value,
              horaFin:    document.getElementById('mbHF').value,
              aula:       document.getElementById('mbAula').value.trim()
            });
            if (!res.ok) { Toast.error(res.msg); return; }
            Modal.close();
            Toast.success('Bloque agregado.');
            SheetsSyncService.pushInBackground();
            if (onSave) onSave();
          }
        }
      ]
    });
  }
})();
