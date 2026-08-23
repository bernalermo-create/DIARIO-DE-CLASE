# Diario de Clase

App web para que un docente del Colegio Miguel de Cervantes Saavedra I.E.D. (Bogotá)
lleve su diario de clase: grupos, registro de clases, tareas, asistencia (parcial),
horario semanal o por ciclo rotativo, y sincronización con Google Sheets.

Vanilla HTML/CSS/JS, sin frameworks ni build step. Ver `../AI_CONTEXT.md` para el
detalle completo de arquitectura y `../AGENTS.md` antes de modificar cualquier cosa
(explica cuál carpeta del proyecto es la vigente).

## Ejecutar

No requiere instalación:

```bash
# doble clic en index.html, o:
npx serve .
```

## Sincronización con Google Sheets

La app viene pre-configurada para sincronizar con una hoja de Google ya vinculada
(ver Configuración → Google Sheets dentro de la app). El backend es
`../sync-diario-clase.gs`, que debe estar pegado y desplegado como Web App en
[script.google.com](https://script.google.com).

## Estructura

```
index.html
css/styles.css
js/
  app.js         Router y arranque
  db.js          Persistencia (SQLite nativo / localStorage)
  ui.js          Toast, Modal, Clock
  utils.js       Helpers y constantes
  services/      Lógica de negocio (grupos, clases, estudiantes, horario, ...)
  views/         Pantallas (home, grupos, grupo-detalle, clase-form, horario, config)
```

Ver `../AI_CONTEXT.md` punto 6 para la función de cada archivo.

## Estado del proyecto

Ver `../PROJECT_STATUS.md`.
