/* ═══════════════════════════════════════════════════════════════
   db.js — Capa de persistencia
   • En Android (nativo): usa @capacitor-community/sqlite
   • En navegador / pruebas: usa localStorage como fallback
   Expone una API unificada: DB.getAll, DB.getById, DB.upsert, DB.remove
═══════════════════════════════════════════════════════════════ */

var DB = (function () {
  'use strict';

  var DB_NAME    = 'diario_clase';
  var DB_VERSION = 1;
  var isNative   = false;
  var _ready     = false;
  var _suppressDirty = false; // true mientras se importa un pull/backup, para no auto-marcarse "sucio"

  /* ─── DDL: Esquema de base de datos ─────────────────────────── */
  var SCHEMA = [
    /* Grupos / cursos */
    `CREATE TABLE IF NOT EXISTS grupos (
      id          TEXT PRIMARY KEY,
      nombre      TEXT NOT NULL,
      asignatura  TEXT DEFAULT '',
      grado       TEXT DEFAULT '',
      color       TEXT DEFAULT '#2D6A4F',
      icono       TEXT DEFAULT '📘',
      createdAt   TEXT NOT NULL
    )`,
    /* Registros de clase */
    `CREATE TABLE IF NOT EXISTS clases (
      id            TEXT PRIMARY KEY,
      groupId       TEXT NOT NULL,
      fecha         TEXT NOT NULL,
      periodo       TEXT DEFAULT '',
      tema          TEXT DEFAULT '',
      desarrollo    TEXT DEFAULT '',
      tarea         TEXT DEFAULT '',
      fechaTarea    TEXT DEFAULT '',
      tareaRevisada INTEGER DEFAULT 0,
      observaciones TEXT DEFAULT '',
      asistencia    TEXT DEFAULT '',
      asistenciaLista TEXT DEFAULT '[]',
      destacado     INTEGER DEFAULT 0,
      cancelada     INTEGER DEFAULT 0,
      motivo        TEXT DEFAULT '',
      createdAt     TEXT NOT NULL,
      updatedAt     TEXT NOT NULL,
      FOREIGN KEY (groupId) REFERENCES grupos(id)
    )`,
    /* Estudiantes por grupo */
    `CREATE TABLE IF NOT EXISTS estudiantes (
      id        TEXT PRIMARY KEY,
      groupId   TEXT NOT NULL,
      nombre    TEXT NOT NULL,
      numero    INTEGER DEFAULT 0,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (groupId) REFERENCES grupos(id)
    )`,
    /* Horario semanal */
    `CREATE TABLE IF NOT EXISTS horario (
      id          TEXT PRIMARY KEY,
      dia         INTEGER NOT NULL,
      horaInicio  TEXT DEFAULT '',
      horaFin     TEXT DEFAULT '',
      groupId     TEXT NOT NULL,
      aula        TEXT DEFAULT ''
    )`,
    /* Configuración clave-valor */
    `CREATE TABLE IF NOT EXISTS config (
      clave TEXT PRIMARY KEY,
      valor TEXT NOT NULL
    )`
  ];

  /* ─── SQLite nativo (Capacitor) ──────────────────────────────── */
  var Native = {
    plugin: null,

    get cap() {
      if (!this.plugin) {
        this.plugin = window.Capacitor &&
                      window.Capacitor.Plugins &&
                      window.Capacitor.Plugins.CapacitorSQLite;
      }
      return this.plugin;
    },

    async open() {
      await this.cap.createConnection({
        database: DB_NAME, encrypted: false,
        mode: 'no-encryption', version: DB_VERSION, readonly: false
      });
      await this.cap.open({ database: DB_NAME, readonly: false });
    },

    async exec(sql) {
      return this.cap.execute({ database: DB_NAME, statements: sql, transaction: false });
    },

    async run(sql, values) {
      return this.cap.run({
        database: DB_NAME, statement: sql,
        values: values || [], transaction: false
      });
    },

    async query(sql, values) {
      var res = await this.cap.query({
        database: DB_NAME, statement: sql, values: values || []
      });
      return res.values || [];
    }
  };

  /* ─── Fallback localStorage (navegador / desarrollo) ────────── */
  var LS = {
    _key: function (table) { return 'dcp_' + table; },

    _read: function (table) {
      try { return JSON.parse(localStorage.getItem(this._key(table)) || '[]'); }
      catch (e) { return []; }
    },

    _write: function (table, arr) {
      try {
        localStorage.setItem(this._key(table), JSON.stringify(arr));
        if (!_suppressDirty) this.setCfg('dirtySince', this.getCfg('dirtySince') || new Date().toISOString());
      }
      catch (e) { console.error('[DB-LS] write error:', e); }
    },

    async getAll(table) { return this._read(table); },

    async getById(table, id) {
      return this._read(table).find(function (r) { return r.id === id; }) || null;
    },

    async upsert(table, record) {
      var arr = this._read(table);
      var i   = arr.findIndex(function (r) { return r.id === record.id; });
      if (i >= 0) arr[i] = record; else arr.push(record);
      this._write(table, arr);
      return record;
    },

    async remove(table, id) {
      var arr = this._read(table).filter(function (r) { return r.id !== id; });
      this._write(table, arr);
    },

    async clearTable(table) { this._write(table, []); },

    async rawQuery(sql) {
      // El fallback no ejecuta SQL real; solo usado en inicialización
      return [];
    },

    getCfg: function (key) {
      try { return JSON.parse(localStorage.getItem('dcp_cfg_' + key)); } catch (e) { return null; }
    },
    setCfg: function (key, value) {
      try { localStorage.setItem('dcp_cfg_' + key, JSON.stringify(value)); } catch (e) {}
    }
  };

  /* ─── Mapeo tabla → columnas (para el fallback LS filtros) ─── */
  function buildSelectFromLS(table, conditions) {
    var rows = LS._read(table);
    if (!conditions) return rows;
    return rows.filter(function (row) {
      return Object.keys(conditions).every(function (k) {
        return row[k] == conditions[k];
      });
    });
  }

  var SYNCED_TABLES = ['grupos', 'clases', 'horario', 'estudiantes'];
  var TOMBSTONE_TTL_MS = 90 * 24 * 3600 * 1000;

  /** Marca "hay cambios sin subir" también en modo nativo (el fallback LS ya lo hace en _write). */
  async function markDirtyNative() {
    if (!isNative || _suppressDirty) return;
    var rows = await Native.query('SELECT valor FROM config WHERE clave = ?', ['dirtySince']);
    if (rows[0] && JSON.parse(rows[0].valor)) return;
    await Native.run('INSERT OR REPLACE INTO config (clave, valor) VALUES (?,?)',
      ['dirtySince', JSON.stringify(new Date().toISOString())]);
  }

  /* ─── API pública ────────────────────────────────────────────── */
  return {
    ready: false,

    /** Inicializa la BD. Llamar antes de cualquier operación. */
    async init() {
      isNative = !!(window.Capacitor &&
                    window.Capacitor.isNativePlatform &&
                    window.Capacitor.isNativePlatform() &&
                    window.Capacitor.Plugins &&
                    window.Capacitor.Plugins.CapacitorSQLite);

      if (isNative) {
        try {
          await Native.open();
          // Crear tablas
          for (var sql of SCHEMA) {
            await Native.exec(sql);
          }
          console.log('[DB] SQLite nativo inicializado.');
        } catch (e) {
          console.warn('[DB] SQLite falló, usando localStorage:', e);
          isNative = false;
        }
      } else {
        console.log('[DB] Usando localStorage (modo navegador).');
      }

      this.ready = true;
      return this;
    },

    /** Devuelve todos los registros de una tabla. */
    async getAll(table, orderBy) {
      if (isNative) {
        var order = orderBy ? ' ORDER BY ' + orderBy : '';
        return Native.query('SELECT * FROM ' + table + order);
      }
      var rows = LS._read(table);
      if (orderBy) {
        var col = orderBy.split(' ')[0];
        var dir = orderBy.includes('DESC') ? -1 : 1;
        rows = rows.slice().sort(function (a, b) {
          return a[col] < b[col] ? -dir : dir;
        });
      }
      return rows;
    },

    /** Devuelve un registro por id. */
    async getById(table, id) {
      if (isNative) {
        var rows = await Native.query('SELECT * FROM ' + table + ' WHERE id = ?', [id]);
        return rows[0] || null;
      }
      return LS.getById(table, id);
    },

    /** Devuelve registros que cumplan condiciones simples {col: valor}. */
    async getWhere(table, conditions, orderBy) {
      if (isNative) {
        var keys = Object.keys(conditions);
        var where = keys.map(function (k) { return k + ' = ?'; }).join(' AND ');
        var vals  = keys.map(function (k) { return conditions[k]; });
        var order = orderBy ? ' ORDER BY ' + orderBy : '';
        return Native.query('SELECT * FROM ' + table + ' WHERE ' + where + order, vals);
      }
      var rows = buildSelectFromLS(table, conditions);
      if (orderBy) {
        var col = orderBy.split(' ')[0];
        var dir = orderBy.includes('DESC') ? -1 : 1;
        rows = rows.slice().sort(function (a, b) {
          return a[col] < b[col] ? -dir : dir;
        });
      }
      return rows;
    },

    /** Inserta o actualiza (upsert por id). */
    async upsert(table, record) {
      if (isNative) {
        var cols   = Object.keys(record);
        var places = cols.map(function () { return '?'; }).join(',');
        var vals   = cols.map(function (c) { return record[c]; });
        var sql = 'INSERT OR REPLACE INTO ' + table + ' (' + cols.join(',') + ') VALUES (' + places + ')';
        await Native.run(sql, vals);
        await markDirtyNative();
        return record;
      }
      return LS.upsert(table, record);
    },

    /** Elimina un registro por id. */
    async remove(table, id) {
      await this.addTombstones(table, [id]);
      if (isNative) {
        await Native.run('DELETE FROM ' + table + ' WHERE id = ?', [id]);
        await markDirtyNative();
        return;
      }
      return LS.remove(table, id);
    },

    /** Elimina todos los registros de una tabla. */
    async clearTable(table) {
      if (!_suppressDirty && SYNCED_TABLES.indexOf(table) >= 0) {
        var ids = (await this.getAll(table)).map(function (r) { return r.id; });
        await this.addTombstones(table, ids);
      }
      if (isNative) {
        await Native.exec('DELETE FROM ' + table);
        await markDirtyNative();
        return;
      }
      return LS.clearTable(table);
    },

    /* ── Registro de borrados (para que la sincronización no "resucite" lo eliminado) ── */
    async getTombstones() {
      var now = Date.now();
      return ((await this.getCfg('tombstones')) || []).filter(function (t) {
        return t && t.id && (now - new Date(t.at).getTime()) < TOMBSTONE_TTL_MS;
      });
    },

    async setTombstones(list) {
      await this.setCfg('tombstones', list);
    },

    async addTombstones(table, ids) {
      if (_suppressDirty || SYNCED_TABLES.indexOf(table) < 0 || !ids.length) return;
      var list = await this.getTombstones();
      var at = new Date().toISOString();
      ids.forEach(function (id) { list.push({ id: id, tabla: table, at: at }); });
      await this.setTombstones(list);
    },

    /** Ejecuta una consulta SQL personalizada (solo para operaciones avanzadas). */
    async rawQuery(sql, params) {
      if (isNative) return Native.query(sql, params || []);
      return [];
    },

    /* ── Config key-value ── */
    async getCfg(key) {
      if (isNative) {
        var rows = await Native.query('SELECT valor FROM config WHERE clave = ?', [key]);
        return rows[0] ? JSON.parse(rows[0].valor) : null;
      }
      return LS.getCfg(key);
    },

    async setCfg(key, value) {
      if (isNative) {
        await Native.run(
          'INSERT OR REPLACE INTO config (clave, valor) VALUES (?,?)',
          [key, JSON.stringify(value)]
        );
        return;
      }
      LS.setCfg(key, value);
    },

    /** ¿Hay cambios locales que todavía no se han subido a Sheets? */
    async isDirty() {
      return !!(await this.getCfg('dirtySince'));
    },

    /** Marca los datos locales como "ya sincronizados" (sin cambios pendientes) */
    async clearDirty() {
      await this.setCfg('dirtySince', null);
    },

    /* ── Exportar todos los datos (para respaldo) ── */
    async exportAll() {
      var [grupos, clases, horario, estudiantes] = await Promise.all([
        this.getAll('grupos'),
        this.getAll('clases', 'fecha DESC'),
        this.getAll('horario'),
        this.getAll('estudiantes')
      ]);
      return { grupos, clases, horario, estudiantes };
    },

    /* ── Importar respaldo completo (solo toca las tablas presentes en el payload) ──
       Antes de reemplazar guarda una copia de lo actual (cfg 'preImportBackup') y,
       si algo falla a la mitad, restaura esa copia.
       opts.recordDeletions: lo que existía y ya no viene en el payload se registra
       como borrado (para importaciones manuales de respaldo). */
    async importAll(payload, opts) {
      opts = opts || {};
      var self     = this;
      var tables   = SYNCED_TABLES.filter(function (t) { return payload.hasOwnProperty(t); });
      var snapshot = await this.exportAll();

      if (opts.recordDeletions) {
        for (var t of tables) {
          var keep = {};
          (payload[t] || []).forEach(function (r) { keep[r.id] = true; });
          await this.addTombstones(t, snapshot[t].filter(function (r) { return !keep[r.id]; }).map(function (r) { return r.id; }));
        }
      }

      async function replace(data) {
        for (var tb of tables) {
          var rows = data[tb] || [];
          if (isNative) {
            await self.clearTable(tb);
            for (var r of rows) await self.upsert(tb, r);
          } else {
            LS._write(tb, rows.slice()); // una sola escritura por tabla
          }
        }
      }

      var wasSuppressed = _suppressDirty;
      _suppressDirty = true;
      try {
        try { await replace(payload); }
        catch (e) {
          try { await replace(snapshot); } catch (e2) { console.error('[DB] No se pudo restaurar tras fallo de importación:', e2); }
          throw e;
        }
      } finally {
        _suppressDirty = wasSuppressed;
      }

      if (SYNCED_TABLES.some(function (t) { return snapshot[t].length; })) {
        await this.setCfg('preImportBackup', { at: new Date().toISOString(), data: snapshot });
      }
    }
  };
})();
