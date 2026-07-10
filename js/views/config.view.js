/* ═══════════════════════════════════════════════════════════════
   config.view.js — Configuración: respaldo, exportar, PIN, Sheets
═══════════════════════════════════════════════════════════════ */

var ConfigView = (function () {
  'use strict';

  return {
    async render(container) {
      var info    = BackupService.storageInfo();
      var sheetsUrl = (await DB.getCfg('sheetsUrl')) || Utils.DEFAULT_SHEETS_URL;
      var pinEnabled = !!(await DB.getCfg('pinEnabled'));

      container.innerHTML =
        '<div class="page-header">' +
          '<div><h1 class="page-title">Configuración</h1>' +
          '<p class="page-subtitle">Respaldo, seguridad y sincronización</p></div>' +
        '</div>' +

        /* ── Almacenamiento ── */
        '<div class="card">' +
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

        /* ── Google Sheets ── */
        '<div class="card mt-3">' +
          '<h3 class="section-title">📊 Google Sheets</h3>' +
          '<p class="text-sm text-muted" style="margin-bottom:6px">' +
            'Sincroniza tus clases con tu hoja de Google.' +
            ' <a href="https://docs.google.com/spreadsheets/d/1uBan7gznXd54U_PEK_J4SSHYhThLlAQb9ZAoLz-o4xc/edit" target="_blank" rel="noopener" style="color:var(--primary);font-weight:700">Abrir hoja ↗</a>' +
          '</p>' +
          '<div class="field mt-3">' +
            '<label class="field-label">URL de la Web App (Apps Script)</label>' +
            '<input class="input" type="url" id="sheetsUrl" inputmode="url" placeholder="https://script.google.com/macros/s/…/exec" value="' + Utils.esc(sheetsUrl) + '">' +
          '</div>' +
          '<div class="flex gap-2 mt-3" style="flex-wrap:wrap">' +
            '<button class="btn btn-secondary" id="btnSaveUrl">Guardar URL</button>' +
            '<button class="btn btn-primary" id="btnSync">↑ Sincronizar ahora</button>' +
            '<button class="btn btn-secondary" id="btnPull">↓ Cargar desde Sheets</button>' +
          '</div>' +
          '<p class="text-sm text-muted" style="margin-top:8px">↑ Sube tus datos locales a la hoja. ↓ Trae lo que hay en la hoja y lo reemplaza en este dispositivo (útil al abrir la app en un navegador nuevo).</p>' +
          '<details style="margin-top:14px">' +
            '<summary class="text-sm" style="cursor:pointer;font-weight:700;color:var(--ink-m)">Ver código Apps Script ▾</summary>' +
            '<div style="position:relative;margin-top:8px">' +
              '<button id="btnCopyScript" class="btn btn-secondary btn-xs" style="position:absolute;top:6px;right:6px;z-index:1">Copiar</button>' +
              '<pre id="scriptCode" style="font-size:11px;background:var(--bg);border:1px solid var(--border);padding:36px 12px 12px;border-radius:var(--r-sm);overflow:auto;line-height:1.6;margin:0;-webkit-overflow-scrolling:touch">' +
'var SPREADSHEET_ID = "1uBan7gznXd54U_PEK_J4SSHYhThLlAQb9ZAoLz-o4xc";\n' +
'function _writeSheet(ss,name,header,rows){\n' +
'  var sh = ss.getSheetByName(name);\n' +
'  if (!sh) sh = ss.insertSheet(name);\n' +
'  sh.clearContents();\n' +
'  if (header&&header.length) sh.appendRow(header);\n' +
'  (rows||[]).forEach(function(r){ sh.appendRow(r); });\n' +
'}\n' +
'function _readSheet(ss,name){\n' +
'  var sh = ss.getSheetByName(name);\n' +
'  if (!sh) return {header:[],rows:[]};\n' +
'  var values = sh.getDataRange().getValues();\n' +
'  return {header: values.length?values[0]:[], rows: values.length>1?values.slice(1):[]};\n' +
'}\n' +
'function doPost(e) {\n' +
'  try {\n' +
'    var raw = (e.parameter&&e.parameter.data)\n' +
'      ? e.parameter.data\n' +
'      : (e.postData&&e.postData.contents)\n' +
'        ? e.postData.contents : "{}";\n' +
'    var d = JSON.parse(raw);\n' +
'    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);\n' +
'    if (d.grupos) _writeSheet(ss,"Grupos",d.grupos.header,d.grupos.rows);\n' +
'    if (d.clases) _writeSheet(ss,"Clases",d.clases.header,d.clases.rows);\n' +
'    return ContentService\n' +
'      .createTextOutput(JSON.stringify({ok:true}))\n' +
'      .setMimeType(ContentService.MimeType.JSON);\n' +
'  } catch(err) {\n' +
'    return ContentService\n' +
'      .createTextOutput(JSON.stringify({ok:false,error:err.message}))\n' +
'      .setMimeType(ContentService.MimeType.JSON);\n' +
'  }\n' +
'}\n' +
'function doGet() {\n' +
'  try {\n' +
'    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);\n' +
'    return ContentService\n' +
'      .createTextOutput(JSON.stringify({ok:true,grupos:_readSheet(ss,"Grupos"),clases:_readSheet(ss,"Clases")}))\n' +
'      .setMimeType(ContentService.MimeType.JSON);\n' +
'  } catch(err) {\n' +
'    return ContentService\n' +
'      .createTextOutput(JSON.stringify({ok:false,error:err.message}))\n' +
'      .setMimeType(ContentService.MimeType.JSON);\n' +
'  }\n' +
'}' +
              '</pre>' +
            '</div>' +
          '</details>' +
        '</div>' +

        /* ── Seguridad ── */
        '<div class="card mt-3">' +
          '<h3 class="section-title">🔒 Seguridad</h3>' +
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
          Router.go('home');
        } else {
          Toast.error(res.msg);
        }
        e.target.value = '';
      };

      // Guardar URL Sheets
      document.getElementById('btnSaveUrl').onclick = async function () {
        var url = document.getElementById('sheetsUrl').value.trim();
        await DB.setCfg('sheetsUrl', url);
        Toast.success('URL guardada.');
      };

      // Sincronizar con Sheets
      document.getElementById('btnSync').onclick = async function () {
        var url = (await DB.getCfg('sheetsUrl')) || document.getElementById('sheetsUrl').value.trim();
        if (!url) { Toast.warning('Guarda primero la URL del Apps Script.'); return; }
        Toast.info('Enviando a Google Sheets…');
        try {
          var r = await SheetsSyncService.push(url);
          if (r.ok) {
            Toast.success('✓ Enviado: ' + r.gruposCount + ' grupos, ' + r.clasesCount + ' clases. Verifica tu hoja (pestañas "Grupos" y "Clases").');
          } else {
            Toast.error(r.error === 'No hay grupos para sincronizar.' ? r.error : 'El servidor respondió con error: ' + r.error);
          }
        } catch (err) {
          Toast.error('Error de conexión. Verifica la URL.'); console.error(err);
        }
      };

      // Cargar (descargar) desde Sheets
      document.getElementById('btnPull').onclick = async function () {
        var url = (await DB.getCfg('sheetsUrl')) || document.getElementById('sheetsUrl').value.trim();
        if (!url) { Toast.warning('Guarda primero la URL del Apps Script.'); return; }

        var ok = await Modal.confirm({
          title: 'Cargar desde Sheets',
          message: 'Esto reemplazará TODOS los grupos y clases guardados en este dispositivo con lo que haya en la hoja de cálculo. ¿Continuar?',
          confirmLabel: 'Cargar y reemplazar',
          danger: true
        });
        if (!ok) return;

        Toast.info('Descargando desde Google Sheets…');
        try {
          var r = await SheetsSyncService.pullAndReplace(url);
          if (!r.ok) { Toast.error('El servidor respondió con error: ' + r.error); return; }
          if (r.empty) { Toast.warning('La hoja está vacía.'); return; }
          Toast.success('✓ Cargado: ' + r.gruposCount + ' grupos, ' + r.clasesCount + ' clases.');
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
        await DB.setCfg('pinHash', btoa(pin));
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
          DB.clearTable('horario')
        ]);
        Toast.success('Todos los datos eliminados.');
        Router.go('home');
      };
    }
  };
})();
