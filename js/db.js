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

  /* ─── DDL: Esquema de base de datos ─────────────────────────── */
  var SCHEMA = [
    /* Grupos / cursos */
    `CREATE TABLE IF NOT EXISTS grupos (
      id          TEXT PRIMARY KEY,
      nombre      TEXT NOT NULL,
      asignatura  TEXT DEFAULT '',
      grado       TEXT DEFAULT '',
      color       TEXT DEFAULT '#2D6A4F',
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
      destacado     INTEGER DEFAULT 0,
      createdAt     TEXT NOT NULL,
      updatedAt     TEXT NOT NULL,
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
      try { localStorage.setItem(this._key(table), JSON.stringify(arr)); }
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
        return record;
      }
      return LS.upsert(table, record);
    },

    /** Elimina un registro por id. */
    async remove(table, id) {
      if (isNative) {
        await Native.run('DELETE FROM ' + table + ' WHERE id = ?', [id]);
        return;
      }
      return LS.remove(table, id);
    },

    /** Elimina todos los registros de una tabla. */
    async clearTable(table) {
      if (isNative) {
        await Native.exec('DELETE FROM ' + table);
        return;
      }
      return LS.clearTable(table);
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

    /* ── Exportar todos los datos (para respaldo) ── */
    async exportAll() {
      var [grupos, clases, horario] = await Promise.all([
        this.getAll('grupos'),
        this.getAll('clases', 'fecha DESC'),
        this.getAll('horario')
      ]);
      return { grupos, clases, horario };
    },

    /* ── Importar respaldo completo ── */
    async importAll(payload) {
      await Promise.all([
        this.clearTable('grupos'),
        this.clearTable('clases'),
        this.clearTable('horario')
      ]);
      var self = this;
      await Promise.all([
        ...(payload.grupos  || []).map(function (r) { return self.upsert('grupos', r); }),
        ...(payload.clases  || []).map(function (r) { return self.upsert('clases', r); }),
        ...(payload.horario || []).map(function (r) { return self.upsert('horario', r); })
      ]);
    }
  };
})();
