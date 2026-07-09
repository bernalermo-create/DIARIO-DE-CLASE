/* ═══════════════════════════════════════════════════════════════
   export.service.js — Exportar datos a CSV / texto
═══════════════════════════════════════════════════════════════ */

var ExportService = (function () {
  'use strict';

  function escapeCSV(val) {
    if (val == null) return '';
    var s = String(val).replace(/"/g, '""');
    return /[,"\n\r]/.test(s) ? '"' + s + '"' : s;
  }

  function rowToCSV(arr) {
    return arr.map(escapeCSV).join(',');
  }

  async function shareOrDownload(filename, content, mime) {
    if (Utils.isNative()) {
      try {
        var { Filesystem, Share, Directory } = window.Capacitor.Plugins;
        await Filesystem.writeFile({
          path:      filename,
          data:      btoa(unescape(encodeURIComponent(content))),
          directory: Directory.Documents,
          encoding:  'base64'
        });
        var uri = (await Filesystem.getUri({ path: filename, directory: Directory.Documents })).uri;
        await Share.share({ title: filename, url: uri, dialogTitle: 'Guardar o compartir' });
      } catch (e) {
        Utils.downloadBrowser(filename, content, mime);
      }
    } else {
      Utils.downloadBrowser(filename, content, mime);
    }
  }

  return {
    /** Exporta todas las clases de un grupo (o todas) a CSV */
    async exportCSV(groupId) {
      var grupos = await GroupsService.getAll();
      var clases = groupId
        ? await ClassesService.getByGroup(groupId)
        : await ClassesService.getAll();

      var gMap = {};
      grupos.forEach(function (g) { gMap[g.id] = g; });

      var header = ['Grupo','Asignatura','Fecha','Periodo','Tema','Desarrollo',
                    'Tarea','Fecha entrega','Revisada','Observaciones','Asistencia','Destacada'];
      var rows = clases.map(function (c) {
        var g = gMap[c.groupId] || {};
        return rowToCSV([
          g.nombre || '', g.asignatura || '', c.fecha, c.periodo,
          c.tema, c.desarrollo, c.tarea, c.fechaTarea,
          +c.tareaRevisada ? 'Sí' : 'No',
          c.observaciones, c.asistencia,
          +c.destacado ? 'Sí' : 'No'
        ]);
      });

      var csv = '\uFEFF' + [rowToCSV(header), ...rows].join('\r\n'); // BOM para Excel
      var filename = 'clases-' + Utils.today() + '.csv';
      await shareOrDownload(filename, csv, 'text/csv;charset=utf-8');
      return { ok: true, count: clases.length };
    },

    /** Exporta el resumen de un grupo como texto (para compartir por WhatsApp, email, etc.) */
    async exportGroupSummary(groupId) {
      var g = await GroupsService.getById(groupId);
      if (!g) return { ok: false };
      var clases = await ClassesService.getByGroup(groupId);
      var pending = clases.filter(function (c) {
        return c.tarea && c.fechaTarea && c.fechaTarea <= Utils.today() && !+c.tareaRevisada;
      });

      var lines = [
        '📓 DIARIO DE CLASE — ' + g.nombre + (g.asignatura ? ' | ' + g.asignatura : ''),
        'Generado: ' + Utils.dateLong(Utils.today()),
        '─────────────────────',
        'Total de clases: ' + clases.length,
        'Tareas pendientes: ' + pending.length,
        ''
      ];

      clases.slice(0, 10).forEach(function (c) {
        lines.push('📅 ' + Utils.dateShort(c.fecha));
        if (c.tema)     lines.push('  Tema: ' + c.tema);
        if (c.tarea)    lines.push('  📝 Tarea: ' + c.tarea + (c.fechaTarea ? ' (entrega: ' + Utils.dateShort(c.fechaTarea) + ')' : ''));
        lines.push('');
      });

      var text = lines.join('\n');

      if (Utils.isNative()) {
        try {
          var { Share } = window.Capacitor.Plugins;
          await Share.share({ title: 'Resumen ' + g.nombre, text: text, dialogTitle: 'Compartir resumen' });
        } catch (e) { Utils.downloadBrowser('resumen-' + g.nombre + '.txt', text, 'text/plain'); }
      } else {
        Utils.downloadBrowser('resumen-' + g.nombre + '.txt', text, 'text/plain');
      }
      return { ok: true };
    },

    /** Imprime la clase actual (abre ventana de impresión en navegador) */
    printClass(record, groupName) {
      var win = window.open('', '_blank');
      if (!win) { Toast.warning('Permite las ventanas emergentes para imprimir.'); return; }
      win.document.write(
        '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + Utils.esc(record.tema || 'Clase') + '</title>' +
        '<style>body{font-family:sans-serif;padding:24px;max-width:700px;margin:0 auto;color:#1A2338}' +
        'h2{font-size:20px;margin-bottom:4px}h3{font-size:14px;border-bottom:2px solid #2D6A4F;padding-bottom:6px;margin:18px 0 8px;color:#2D6A4F}' +
        'p{font-size:13px;margin:3px 0}b{font-weight:700;min-width:140px;display:inline-block}</style></head><body>' +
        '<h2>' + Utils.esc(record.tema || 'Sin tema') + '</h2>' +
        '<p><b>Grupo:</b> ' + Utils.esc(groupName || '') + '</p>' +
        '<p><b>Fecha:</b> ' + Utils.dateLong(record.fecha) + '</p>' +
        '<p><b>Periodo:</b> ' + Utils.esc(record.periodo) + '</p>' +
        '<h3>Desarrollo</h3>' +
        '<p>' + Utils.esc(record.desarrollo) + '</p>' +
        (record.tarea ? '<h3>Tarea</h3><p>' + Utils.esc(record.tarea) + '</p>' +
          (record.fechaTarea ? '<p><b>Entrega:</b> ' + Utils.dateShort(record.fechaTarea) + '</p>' : '') : '') +
        (record.observaciones ? '<h3>Observaciones</h3><p>' + Utils.esc(record.observaciones) + '</p>' : '') +
        (record.asistencia ? '<h3>Asistencia</h3><p>' + Utils.esc(record.asistencia) + '</p>' : '') +
        '</body></html>'
      );
      win.document.close();
      setTimeout(function () { win.print(); }, 400);
    }
  };
})();
