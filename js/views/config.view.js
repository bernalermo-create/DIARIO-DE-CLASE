/* ═══════════════════════════════════════════════════════════════
   config.view.js — Configuración: respaldo, exportar, PIN, Sheets
═══════════════════════════════════════════════════════════════ */

var ConfigView = (function () {
  'use strict';

  return {
    async render(container) {
      var info    = BackupService.storageInfo();
      var sheetsUrl = (await DB.getCfg('sheetsUrl')) || Utils.DEFAULT_SHEETS_URL;
      var sheetsToken = (await DB.getCfg('sheetsToken')) || '';
      var cloudUser = (window.CloudSync && CloudSync.active()) ? CloudSync.user() : null;
      var pinEnabled = !!(await DB.getCfg('pinEnabled'));
      var currentAccent = (await DB.getCfg('colorAccent')) || 'indigo';

      container.innerHTML =
        '<div class="page-header">' +
          '<div><h1 class="page-title">Configuración</h1>' +
          '<p class="page-subtitle">Respaldo, seguridad y sincronización</p></div>' +
        '</div>' +

        /* ── Almacenamiento ── */
        '<div class="card">' +
          '<h3 class="section-title">🎨 Color de la app</h3>' +
          '<p class="text-sm text-muted" style="margin-bottom:12px">Elige el color de los botones y acentos. El modo claro/oscuro se cambia con el ícono 🌙/☀️ arriba.</p>' +
          '<div class="flex gap-2" style="flex-wrap:wrap" id="accentPicker">' +
            [
              { id: 'indigo', label: 'Índigo', color: '#5B4FE8' },
              { id: 'blue',   label: 'Azul',   color: '#1D6FE0' },
              { id: 'green',  label: 'Verde',  color: '#16A34A' },
              { id: 'rose',   label: 'Rosa',   color: '#DB2777' },
              { id: 'orange', label: 'Naranja',color: '#EA580C' }
            ].map(function (t) {
              var sel = t.id === currentAccent;
              return '<button type="button" class="accent-swatch" data-accent-id="' + t.id + '" title="' + t.label + '" ' +
                'style="width:44px;height:44px;border-radius:50%;background:' + t.color + ';border:3px solid ' + (sel ? 'var(--ink)' : 'transparent') + ';cursor:pointer;display:grid;place-items:center;color:#fff;font-size:16px">' +
                (sel ? '✓' : '') +
              '</button>';
            }).join('') +
          '</div>' +
        '</div>' +

        /* ── Almacenamiento ── */
        '<div class="card mt-3">' +
          '<h3 class="section-title">💾 Almacenamiento local</h3>' +
          '<p class="text-sm text-muted">Usado: ' + info.usedLabel + ' de ~5 MB (' + info.pct + '%)</p>' +
          '<div style="background:var(--border);border-radius:var(--r-full);height:8px;margin-top:10px;overflow:hidden">' +
            '<div style="width:' + Math.min(info.pct, 100) + '%;background:var(--primary);height:100%;transition:width .4s"></div>' +
          '</div>' +
        '</div>' +

        /* ── Respaldo ── */
        '<div class="card mt-3">' +
          '<h3 class="section-title">📦 Respaldo de datos</h3>' +
          '<p class="text-sm text-muted" style="margin-bottom:14px">Exporta grupos, clases y horario. Guarda el archivo en un lugar seguro.</p>' +
          '<div class="flex gap-2" style="flex-wrap:wrap">' +
            '<button class="btn btn-primary" id="btnExportJSON">↓ Exportar JSON</button>' +
            '<button class="btn btn-secondary" id="btnExportCSV">↓ Exportar CSV</button>' +
            '<label class="btn btn-secondary" style="cursor:pointer">↑ Importar respaldo<input type="file" id="importFile" accept=".json" style="display:none"></label>' +
          '</div>' +
        '</div>' +

        /* ── Cuenta y nube ── */
        '<div class="card mt-3">' +
          '<h3 class="section-title">☁️ Cuenta y nube</h3>' +
          (cloudUser
            ? '<p class="text-sm" style="margin-bottom:10px">Sesión iniciada como <b>' + Utils.esc(cloudUser.email || '') + '</b>. Tus datos se sincronizan solos entre dispositivos.</p>' +
              '<div class="flex gap-2" style="flex-wrap:wrap">' +
                '<button class="btn btn-primary" id="btnCloudSync">↻ Sincronizar ahora</button>' +
                '<button class="btn btn-secondary" id="btnCloudOut">Cerrar sesión</button>' +
              '</div>'
            : '<p class="text-sm text-muted" style="margin-bottom:10px">No has iniciado sesión: los datos solo están en este dispositivo.</p>' +
              '<button class="btn btn-primary" id="btnCloudIn">Entrar con Google</button>') +
        '</div>' +

        /* ── Google Sheets ── */
        '<div class="card mt-3">' +
          '<h3 class="section-title">📊 Google Sheets (respaldo antiguo)</h3>' +
          '<p class="text-sm text-muted" style="margin-bottom:6px">' +
            'Sincroniza tus clases con tu hoja de Google.' +
            ' <a href="https://docs.google.com/spreadsheets/d/1lvo6zGy3m3Y-Ab_lrJIgSZ7BPDjUk6j52QENH4WiEFE/edit" target="_blank" rel="noopener" style="color:var(--primary);font-weight:700">Abrir hoja ↗</a>' +
          '</p>' +
          '<div class="field mt-3">' +
            '<label class="field-label">URL de la Web App (Apps Script)</label>' +
            '<input class="input" type="url" id="sheetsUrl" inputmode="url" placeholder="https://script.google.com/macros/s/…/exec" value="' + Utils.esc(sheetsUrl) + '">' +
          '</div>' +
          '<div class="field mt-3">' +
            '<label class="field-label">Token de acceso (recomendado)</label>' +
            '<input class="input" type="password" id="sheetsToken" autocomplete="off" placeholder="Igual al TOKEN del Apps Script" value="' + Utils.esc(sheetsToken) + '">' +
            '<p class="field-hint">Protege los datos de tus estudiantes: sin este token, cualquiera con la URL puede leer o borrar la hoja. Defínelo como propiedad TOKEN en Apps Script y escríbelo igual aquí.</p>' +
          '</div>' +
          '<div class="flex gap-2 mt-3" style="flex-wrap:wrap">' +
            '<button class="btn btn-secondary" id="btnSaveUrl">Guardar URL y token</button>' +
            '<button class="btn btn-primary" id="btnSync">↑ Enviar a Sheets</button>' +
            '<button class="btn btn-secondary" id="btnPull">↓ Cargar desde Sheets</button>' +
          '</div>' +
          '<p class="text-sm text-muted" style="margin-top:8px">↑ Sincroniza: trae lo de la hoja, lo fusiona con lo de este dispositivo y sube el resultado. ↓ Trae lo que hay en la hoja y lo reemplaza en este dispositivo (útil al abrir la app en un navegador nuevo).</p>' +
          '<details style="margin-top:14px">' +
            '<summary class="text-sm" style="cursor:pointer;font-weight:700;color:var(--ink-m)">Ver código Apps Script ▾</summary>' +
            '<div style="position:relative;margin-top:8px">' +
              '<button id="btnCopyScript" class="btn btn-secondary btn-xs" style="position:absolute;top:6px;right:6px;z-index:1">Copiar</button>' +
              '<pre id="scriptCode" style="font-size:11px;background:var(--bg);border:1px solid var(--border);padding:36px 12px 12px;border-radius:var(--r-sm);overflow:auto;line-height:1.6;margin:0;-webkit-overflow-scrolling:touch">' +
'var SPREADSHEET_ID = "1lvo6zGy3m3Y-Ab_lrJIgSZ7BPDjUk6j52QENH4WiEFE";\n' +
'\n' +
'function _json(obj) {\n' +
'  return ContentService.createTextOutput(JSON.stringify(obj))\n' +
'    .setMimeType(ContentService.MimeType.JSON);\n' +
'}\n' +
'\n' +
'function _tokenOk(given) {\n' +
'  var t = PropertiesService.getScriptProperties().getProperty(\'TOKEN\');\n' +
'  return !t || given === t; // sin TOKEN configurado: compatible con versiones anteriores\n' +
'}\n' +
'\n' +
'function _writeSheet(ss, name, header, rows) {\n' +
'  var sh = ss.getSheetByName(name);\n' +
'  if (!sh) sh = ss.insertSheet(name);\n' +
'  var width = header.length;\n' +
'  var data = [header].concat((rows || []).map(function (r) {\n' +
'    var out = [];\n' +
'    for (var i = 0; i < width; i++) out.push(r[i] === undefined || r[i] === null ? \'\' : String(r[i]));\n' +
'    return out;\n' +
'  }));\n' +
'  sh.clearContents();\n' +
'  var range = sh.getRange(1, 1, data.length, width);\n' +
'  range.setNumberFormat(\'@\'); // todo texto: nada se interpreta como fórmula/fecha/número\n' +
'  range.setValues(data);\n' +
'}\n' +
'\n' +
'function _readSheet(ss, name) {\n' +
'  var sh = ss.getSheetByName(name);\n' +
'  if (!sh) return { header: [], rows: [] };\n' +
'  var values = sh.getDataRange().getValues(); // compatible con hojas viejas donde Sheets convirtió fechas\n' +
'  return {\n' +
'    header: values.length ? values[0] : [],\n' +
'    rows:   values.length > 1 ? values.slice(1) : []\n' +
'  };\n' +
'}\n' +
'\n' +
'function doPost(e) {\n' +
'  var lock = LockService.getScriptLock();\n' +
'  if (!lock.tryLock(20000)) {\n' +
'    return _json({ ok: false, error: \'La hoja está ocupada por otra sincronización, intenta de nuevo en un momento.\' });\n' +
'  }\n' +
'  try {\n' +
'    var raw = (e.parameter && e.parameter.data)\n' +
'      ? e.parameter.data\n' +
'      : (e.postData && e.postData.contents) ? e.postData.contents : "{}";\n' +
'    var d = JSON.parse(raw);\n' +
'    if (!_tokenOk(d.token)) return _json({ ok: false, error: \'Token inválido.\' });\n' +
'\n' +
'    // Protección contra escrituras truncadas/vacías que borrarían la hoja.\n' +
'    if (!d.grupos || !d.grupos.header) return _json({ ok: false, error: \'Payload incompleto (falta Grupos).\' });\n' +
'    if (!d.grupos.rows.length && !d.allowEmpty) return _json({ ok: false, error: \'Se rechazó escribir una hoja de Grupos vacía.\' });\n' +
'\n' +
'    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);\n' +
'    _writeSheet(ss, \'Grupos\',      d.grupos.header,      d.grupos.rows);\n' +
'    if (d.clases)      _writeSheet(ss, \'Clases\',      d.clases.header,      d.clases.rows);\n' +
'    if (d.horario)     _writeSheet(ss, \'Horario\',     d.horario.header,     d.horario.rows);\n' +
'    if (d.estudiantes) _writeSheet(ss, \'Estudiantes\', d.estudiantes.header, d.estudiantes.rows);\n' +
'    if (d.eliminados)  _writeSheet(ss, \'Eliminados\',  d.eliminados.header,  d.eliminados.rows);\n' +
'    SpreadsheetApp.flush();\n' +
'\n' +
'    return _json({ ok: true });\n' +
'  } catch (err) {\n' +
'    return _json({ ok: false, error: err.message });\n' +
'  } finally {\n' +
'    lock.releaseLock();\n' +
'  }\n' +
'}\n' +
'\n' +
'function doGet(e) {\n' +
'  var lock = LockService.getScriptLock();\n' +
'  if (!lock.tryLock(15000)) {\n' +
'    return _json({ ok: false, error: \'La hoja está ocupada, intenta de nuevo en un momento.\' });\n' +
'  }\n' +
'  try {\n' +
'    if (!_tokenOk(e && e.parameter && e.parameter.token)) return _json({ ok: false, error: \'Token inválido.\' });\n' +
'    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);\n' +
'    return _json({\n' +
'      ok: true,\n' +
'      grupos:      _readSheet(ss, \'Grupos\'),\n' +
'      clases:      _readSheet(ss, \'Clases\'),\n' +
'      horario:     _readSheet(ss, \'Horario\'),\n' +
'      estudiantes: _readSheet(ss, \'Estudiantes\'),\n' +
'      eliminados:  _readSheet(ss, \'Eliminados\')\n' +
'    });\n' +
'  } catch (err) {\n' +
'    return _json({ ok: false, error: err.message });\n' +
'  } finally {\n' +
'    lock.releaseLock();\n' +
'  }\n' +
'}' +
              '</pre>' +
            '</div>' +
          '</details>' +
        '</div>' +

        /* ── Periodos académicos ── */
        '<div class="card mt-3">' +
          '<h3 class="section-title">📅 Periodos académicos</h3>' +
          '<p class="text-sm text-muted" style="margin-bottom:10px">Define las fechas de cada periodo una vez, y el sistema asigna automáticamente el periodo al registrar una clase, sin tener que escribirlo cada vez.</p>' +
          '<div id="periodsList"></div>' +
          '<div class="flex gap-2 mt-3" style="flex-wrap:wrap">' +
            '<button class="btn btn-secondary btn-sm" id="btnAddPeriod">+ Agregar periodo</button>' +
            '<button class="btn btn-primary btn-sm" id="btnSavePeriods">💾 Guardar periodos</button>' +
          '</div>' +
        '</div>' +

        /* ── Seguridad ── */
        '<div class="card mt-3">' +
          '<h3 class="section-title">🔒 Seguridad</h3>' +
          '<p class="text-xs text-warning" style="margin-bottom:8px;font-size:11px">⚠️ PIN: barrera de UI (guardado con SHA-256). Con 4 dígitos no es seguridad criptográfica real: quien tenga acceso al dispositivo puede quitarlo.</p>' +
          '<div class="flex items-center justify-between">' +
            '<div>' +
              '<p class="font-bold" style="font-size:14px">PIN de acceso</p>' +
              '<p class="text-sm text-muted">Protege la app con un código de 4 dígitos</p>' +
            '</div>' +
            '<label class="toggle-switch">' +
              '<input type="checkbox" id="pinToggle"' + (pinEnabled ? ' checked' : '') + '>' +
              '<span class="toggle-slider"></span>' +
            '</label>' +
          '</div>' +
          '<div id="pinSection" style="' + (pinEnabled ? '' : 'display:none') + ';margin-top:14px">' +
            '<div class="field">' +
              '<label class="field-label">Nuevo PIN (4 dígitos)</label>' +
              '<input class="input" type="password" id="pinInput" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" placeholder="••••" style="letter-spacing:.3em;font-size:20px;text-align:center">' +
            '</div>' +
            '<button class="btn btn-primary mt-3" id="btnSavePin">Guardar PIN</button>' +
          '</div>' +
        '</div>' +

        /* ── Tema ── */
        '<div class="card mt-3">' +
          '<h3 class="section-title">🎨 Apariencia</h3>' +
          '<div class="flex gap-2">' +
            '<button class="btn btn-secondary btn-sm' + (document.body.getAttribute('data-theme') !== 'dark' ? ' active" style="border-color:var(--primary)' : '') + '" id="btnLightTheme">☀️ Claro</button>' +
            '<button class="btn btn-secondary btn-sm' + (document.body.getAttribute('data-theme') === 'dark' ? ' active" style="border-color:var(--primary)' : '') + '" id="btnDarkTheme">🌙 Oscuro</button>' +
          '</div>' +
        '</div>' +

        /* ── Peligro ── */
        '<div class="card mt-3" style="border-color:var(--danger-s)">' +
          '<h3 class="section-title" style="color:var(--danger)">⚠️ Zona de peligro</h3>' +
          '<p class="text-sm text-muted" style="margin-bottom:12px">Estas acciones son irreversibles.</p>' +
          '<button class="btn btn-danger btn-sm" id="btnBorrarTodo">🗑️ Borrar todos los datos</button>' +
        '</div>';

      /* ── Estilos toggle switch ── */
      if (!document.getElementById('toggleStyle')) {
        var st = document.createElement('style');
        st.id = 'toggleStyle';
        st.textContent =
          '.toggle-switch{position:relative;display:inline-block;width:48px;height:26px}' +
          '.toggle-switch input{opacity:0;width:0;height:0}' +
          '.toggle-slider{position:absolute;cursor:pointer;inset:0;background:var(--border);border-radius:26px;transition:.3s}' +
          '.toggle-slider::before{content:"";position:absolute;height:20px;width:20px;left:3px;bottom:3px;background:white;border-radius:50%;transition:.3s}' +
          '.toggle-switch input:checked+.toggle-slider{background:var(--primary)}' +
          '.toggle-switch input:checked+.toggle-slider::before{transform:translateX(22px)}';
        document.head.appendChild(st);
      }

      /* ── Handlers ── */

      // Exportar JSON
      document.getElementById('btnExportJSON').onclick = async function () {
        var res = await BackupService.exportJSON();
        if (res.ok) Toast.success('Respaldo exportado: ' + res.filename);
        else Toast.error('Error al exportar.');
      };

      // Exportar CSV
      document.getElementById('btnExportCSV').onclick = async function () {
        var res = await ExportService.exportCSV(null);
        if (res.ok) Toast.success('CSV exportado (' + res.count + ' clases).');
        else Toast.error('Error al exportar CSV.');
      };

      // Importar respaldo
      document.getElementById('importFile').onchange = async function (e) {
        var file = e.target.files[0];
        if (!file) return;
        var ok = await Modal.confirm({
          title: 'Importar respaldo',
          message: '¿Importar este archivo? Se reemplazarán TODOS los datos actuales.',
          confirmLabel: 'Importar y reemplazar',
          danger: true
        });
        if (!ok) { e.target.value = ''; return; }
        var res = await BackupService.importJSON(file);
        if (res.ok) {
          Toast.success('Importado: ' + res.counts.grupos + ' grupos, ' + res.counts.clases + ' clases.');
          SheetsSyncService.pushInBackground();
          Router.go('home');
        } else {
          Toast.error(res.msg);
        }
        e.target.value = '';
      };

      // Selector de color de acento
      document.querySelectorAll('.accent-swatch').forEach(function (sw) {
        sw.onclick = async function () {
          var id = sw.dataset.accentId;
          document.body.setAttribute('data-accent', id);
          await DB.setCfg('colorAccent', id);
          document.querySelectorAll('.accent-swatch').forEach(function (s) {
            s.style.border = '3px solid transparent';
            s.textContent = '';
          });
          sw.style.border = '3px solid var(--ink)';
          sw.textContent = '✓';
          Toast.success('Color actualizado.');
        };
      });

      // Guardar URL Sheets
      document.getElementById('btnSaveUrl').onclick = async function () {
        var url = document.getElementById('sheetsUrl').value.trim();
        await DB.setCfg('sheetsUrl', url);
        await DB.setCfg('sheetsToken', document.getElementById('sheetsToken').value.trim());
        Toast.success('URL y token guardados.');
      };

      /* ── Periodos académicos ── */
      var periodsListEl = document.getElementById('periodsList');
      var periodsData = (await PeriodsService.getAll()).slice();

      function renderPeriodsList() {
        periodsListEl.innerHTML = periodsData.map(function (p, i) {
          return '<div class="flex gap-2 mt-2" style="align-items:flex-end;flex-wrap:wrap">' +
            '<div class="field" style="flex:1;min-width:140px"><label class="field-label" style="font-size:11px">Nombre</label>' +
              '<input class="input periodNombre" data-i="' + i + '" type="text" value="' + Utils.esc(p.nombre) + '"></div>' +
            '<div class="field"><label class="field-label" style="font-size:11px">Inicio</label>' +
              '<input class="input periodInicio" data-i="' + i + '" type="date" value="' + p.inicio + '"></div>' +
            '<div class="field"><label class="field-label" style="font-size:11px">Fin</label>' +
              '<input class="input periodFin" data-i="' + i + '" type="date" value="' + p.fin + '"></div>' +
            '<button type="button" class="btn btn-xs btn-ghost" style="color:var(--danger)" data-del-period="' + i + '">✕</button>' +
          '</div>';
        }).join('');

        periodsListEl.querySelectorAll('.periodNombre').forEach(function (el) {
          el.addEventListener('input', function () { periodsData[+el.dataset.i].nombre = el.value; });
        });
        periodsListEl.querySelectorAll('.periodInicio').forEach(function (el) {
          el.addEventListener('input', function () { periodsData[+el.dataset.i].inicio = el.value; });
        });
        periodsListEl.querySelectorAll('.periodFin').forEach(function (el) {
          el.addEventListener('input', function () { periodsData[+el.dataset.i].fin = el.value; });
        });
        periodsListEl.querySelectorAll('[data-del-period]').forEach(function (btn) {
          btn.onclick = function () { periodsData.splice(+btn.dataset.delPeriod, 1); renderPeriodsList(); };
        });
      }
      renderPeriodsList();

      document.getElementById('btnAddPeriod').onclick = function () {
        periodsData.push({ nombre: 'Nuevo periodo', inicio: Utils.today(), fin: Utils.today() });
        renderPeriodsList();
      };
      document.getElementById('btnSavePeriods').onclick = async function () {
        var saved = await PeriodsService.save(periodsData);
        periodsData = saved.slice();
        renderPeriodsList();
        Toast.success('✓ Periodos guardados.');
      };

      // Sincronizar con Sheets
      document.getElementById('btnSync').onclick = async function () {
        var url = (await DB.getCfg('sheetsUrl')) || document.getElementById('sheetsUrl').value.trim();
        if (!url) { Toast.warning('Guarda primero la URL del Apps Script.'); return; }
        Toast.info('Sincronizando con Google Sheets…');
        try {
          var r = await SheetsSyncService.syncSheets(url, { force: true });
          if (r.ok) {
            Toast.success('✓ Sincronizado: ' + r.gruposCount + ' grupos, ' + r.clasesCount + ' clases, ' + r.horarioCount + ' horarios, ' + r.estudiantesCount + ' estudiantes. Verifica tu hoja.');
          } else {
            Toast.error(r.error === 'No hay grupos para sincronizar.' ? r.error : 'No se pudo sincronizar: ' + r.error);
          }
        } catch (err) {
          Toast.error('Error de conexión. Verifica la URL.'); console.error(err);
        }
      };

      // Nube
      var btnCloudSync = document.getElementById('btnCloudSync');
      if (btnCloudSync) btnCloudSync.onclick = async function () {
        Toast.info('Sincronizando…');
        var r = await CloudSync.sync();
        if (r.ok) Toast.success('✓ Sincronizado: ' + r.gruposCount + ' grupos, ' + r.clasesCount + ' clases (' + r.subidos + ' subidos, ' + r.descargados + ' descargados).');
        else Toast.error('No se pudo sincronizar: ' + r.error);
      };
      var btnCloudOut = document.getElementById('btnCloudOut');
      if (btnCloudOut) btnCloudOut.onclick = async function () {
        var ok = await Modal.confirm({ title: 'Cerrar sesión', message: 'Los datos de este dispositivo se conservan, pero dejará de sincronizarse hasta que vuelvas a entrar.', confirmLabel: 'Cerrar sesión' });
        if (!ok) return;
        await CloudSync.signOut();
        location.reload();
      };
      var btnCloudIn = document.getElementById('btnCloudIn');
      if (btnCloudIn) btnCloudIn.onclick = function () { location.reload(); };

      // Cargar (descargar) desde Sheets
      document.getElementById('btnPull').onclick = async function () {
        var url = (await DB.getCfg('sheetsUrl')) || document.getElementById('sheetsUrl').value.trim();
        if (!url) { Toast.warning('Guarda primero la URL del Apps Script.'); return; }

        var ok = await Modal.confirm({
          title: 'Cargar desde Sheets',
          message: 'Esto reemplazará TODOS los grupos y clases guardados en este dispositivo con lo que haya en la hoja de cálculo (se guarda una copia previa por seguridad). ¿Continuar?',
          confirmLabel: 'Cargar y reemplazar',
          danger: true
        });
        if (!ok) return;

        Toast.info('Descargando desde Google Sheets…');
        try {
          var r = await SheetsSyncService.pullAndReplace(url);
          if (!r.ok) { Toast.error('El servidor respondió con error: ' + r.error); return; }
          if (r.empty) { Toast.warning('La hoja está vacía.'); return; }
          Toast.success('✓ Cargado: ' + r.gruposCount + ' grupos, ' + r.clasesCount + ' clases, ' + r.estudiantesCount + ' estudiantes.');
          Router.go('home');
        } catch (err) {
          Toast.error('Error de conexión. Verifica la URL.');
          console.error(err);
        }
      };

      // Copiar script
      document.getElementById('btnCopyScript').onclick = function () {
        var code = document.getElementById('scriptCode').textContent;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(code)
            .then(function () { Toast.success('Código copiado.'); })
            .catch(fallback);
        } else { fallback(); }
        function fallback() {
          var ta = document.createElement('textarea');
          ta.value = code; ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
          document.body.appendChild(ta); ta.select();
          try { document.execCommand('copy'); Toast.success('Código copiado.'); }
          catch (e) { Toast.warning('Selecciónalo manualmente.'); }
          ta.remove();
        }
      };

      // PIN
      document.getElementById('pinToggle').onchange = function (e) {
        document.getElementById('pinSection').style.display = e.target.checked ? '' : 'none';
        if (!e.target.checked) DB.setCfg('pinEnabled', false);
      };
      document.getElementById('btnSavePin').onclick = async function () {
        var pin = document.getElementById('pinInput').value;
        if (!/^\d{4}$/.test(pin)) { Toast.error('El PIN debe ser de exactamente 4 dígitos.'); return; }
        await DB.setCfg('pinHash', await Utils.hashPin(pin));
        await DB.setCfg('pinEnabled', true);
        Toast.success('PIN guardado. Se pedirá al abrir la app.');
      };

      // Tema
      document.getElementById('btnLightTheme').onclick = async function () {
        document.body.setAttribute('data-theme', 'light');
        await DB.setCfg('theme', 'light');
        ConfigView.render(container);
      };
      document.getElementById('btnDarkTheme').onclick = async function () {
        document.body.setAttribute('data-theme', 'dark');
        await DB.setCfg('theme', 'dark');
        ConfigView.render(container);
      };

      // Borrar todo
      document.getElementById('btnBorrarTodo').onclick = async function () {
        var ok = await Modal.confirm({
          title: '⚠️ Borrar todo',
          message: '¿Eliminar TODOS los grupos, clases y el horario? Esta acción NO se puede deshacer.',
          confirmLabel: 'Borrar todo',
          danger: true
        });
        if (!ok) return;
        await Promise.all([
          DB.clearTable('grupos'),
          DB.clearTable('clases'),
          DB.clearTable('horario'),
          DB.clearTable('estudiantes')
        ]);
        Toast.success('Todos los datos eliminados.');
        SheetsSyncService.pushInBackground();
        Router.go('home');
      };
    }
  };
})();
