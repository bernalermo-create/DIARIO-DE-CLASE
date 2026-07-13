/* ═══════════════════════════════════════════════════════════════
   backup.service.js — Exportar e importar respaldo JSON
   En Android nativo usa @capacitor/filesystem + @capacitor/share.
   En navegador usa descarga directa.
═══════════════════════════════════════════════════════════════ */

var BackupService = (function () {
  'use strict';

  var BACKUP_VERSION = 2;

  return {
    /**
     * Exporta todos los datos como JSON y descarga / comparte el archivo.
     */
    async exportJSON() {
      var data = await DB.exportAll();
      var payload = JSON.stringify({
        version:    BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        appId:      'com.diarioclase.profesional',
        grupos:     data.grupos,
        clases:     data.clases,
        horario:    data.horario
      }, null, 2);

      var filename = 'diario-clase-' + Utils.today() + '.json';

      if (Utils.isNative()) {
        try {
          var { Filesystem, Directory } = window.Capacitor.Plugins;
          await Filesystem.writeFile({
            path:      filename,
            data:      btoa(unescape(encodeURIComponent(payload))),
            directory: Directory.Documents,
            encoding:  'base64'
          });
          // Compartir el archivo
          var { Share } = window.Capacitor.Plugins;
          if (Share) {
            var fileResult = await Filesystem.getUri({
              path: filename, directory: Directory.Documents
            });
            await Share.share({
              title:       'Respaldo Diario de Clase',
              text:        'Archivo de respaldo generado el ' + Utils.today(),
              url:         fileResult.uri,
              dialogTitle: 'Guardar o compartir respaldo'
            });
          }
          return { ok: true, filename: filename };
        } catch (e) {
          console.error('[Backup] Error nativo:', e);
          // Fallback a descarga en WebView
          Utils.downloadBrowser(filename, payload, 'application/json');
          return { ok: true, filename: filename };
        }
      } else {
        Utils.downloadBrowser(filename, payload, 'application/json');
        return { ok: true, filename: filename };
      }
    },

    /**
     * Importa un archivo JSON de respaldo.
     * @param {File|string} source - objeto File (input) o string JSON
     */
    async importJSON(source) {
      try {
        var text;
        if (typeof source === 'string') {
          text = source;
        } else {
          text = await new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function () { resolve(reader.result); };
            reader.onerror = function () { reject(new Error('No se pudo leer el archivo')); };
            reader.readAsText(source);
          });
        }

        var payload = JSON.parse(text);

        // Validar formato mínimo
        if (!payload.grupos && !payload.clases) {
          return { ok: false, msg: 'Archivo de respaldo no reconocido.' };
        }

        // Migrar versiones anteriores si es necesario
        if (payload.version === 1 || !payload.version) {
          // v1 usaba "classes" en vez de "clases"
          if (payload.classes && !payload.clases) payload.clases = payload.classes;
          if (payload.groups  && !payload.grupos) payload.grupos = payload.groups;
          if (payload.schedule && !payload.horario) payload.horario = payload.schedule;
        }

        await DB.importAll({
          grupos:  payload.grupos  || [],
          clases:  payload.clases  || [],
          horario: payload.horario || []
        });

        return {
          ok: true,
          counts: {
            grupos:  (payload.grupos  || []).length,
            clases:  (payload.clases  || []).length,
            horario: (payload.horario || []).length
          }
        };
      } catch (e) {
        return { ok: false, msg: 'Error al importar: ' + (e.message || String(e)) };
      }
    },

    /** Calcula el tamaño aproximado del almacenamiento usado */
    storageInfo() {
      var total = 0;
      try {
        for (var k in localStorage) {
          if (Object.prototype.hasOwnProperty.call(localStorage, k)) {
            total += (localStorage.getItem(k) || '').length;
          }
        }
      } catch (e) {}
      var limit = 5 * 1024 * 1024;
      return {
        usedBytes: total,
        limitBytes: limit,
        pct: Math.round(total / limit * 100),
        usedLabel: Utils.bytes(total)
      };
    }
  };
})();
