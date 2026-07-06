# 📓 Diario de Clase Profesional

Aplicación web para docentes: registra clases, gestiona grupos, visualiza tu horario y sincroniza con Google Sheets.

## ✨ Funcionalidades

| Función | Descripción |
|---|---|
| **Grupos / Cursos** | Crea y colorea grupos (901, 10B, Matemáticas 11…) |
| **Registrar clase** | Grupo, fecha, tema, desarrollo y tarea en segundos |
| **🔔 Recordatorios** | Al abrir la app alerta los grupos con tareas vencidas por revisar |
| **📅 Horario semanal** | Vista por días con hora inicio/fin; resalta el bloque activo en tiempo real |
| **⏰ Reloj en vivo** | Muestra la hora actual en la barra superior (se actualiza cada segundo) |
| **Favoritos / Duplicar** | Duplica un registro con la fecha de hoy en un clic |
| **Búsqueda** | Busca por tema, desarrollo o tarea en toda la app |
| **Respaldo JSON** | Exporta e importa todos tus datos |
| **Google Sheets sync** | Sincroniza clases con tu hoja de cálculo vía Apps Script |
| **Modo oscuro** | Tema claro/oscuro persistente |
| **100% offline** | Sin servidor, sin instalación, funciona con `file://` |

## 🚀 Cómo usar

### Opción 1 — Directamente en tu PC o celular
1. Descarga `index.html` y `script.js` en la misma carpeta.
2. Abre `index.html` con doble clic (Chrome, Edge o Firefox).

### Opción 2 — GitHub Pages (acceso desde cualquier dispositivo)
1. Haz un fork de este repositorio o crea uno nuevo.
2. Sube `index.html` y `script.js` al repositorio.
3. Ve a **Settings → Pages → Branch: main → / (root) → Save**.
4. Tu app estará disponible en `https://TU_USUARIO.github.io/NOMBRE_REPO/`.
5. Abre esa URL en tu celular y agrégala a la pantalla de inicio.

## 📊 Sincronización con Google Sheets

1. Abre tu hoja de Google Sheets.
2. Ve a **Extensiones → Apps Script**.
3. Pega el código que aparece en la sección **Configuración → Ver código de Apps Script**.
4. Clic en **Implementar → Nueva implementación → Aplicación web**.
5. Acceso: **Cualquier persona** → **Implementar** → copia la URL `/exec`.
6. Pégala en **Configuración → URL de la Web App → Guardar URL → Sincronizar**.

> **Nota:** La sincronización usa `mode: 'no-cors'` para compatibilidad con `file://`.
> Los datos **sí llegan** a Sheets aunque el navegador no pueda leer la respuesta.

## 🗂 Estructura de archivos

```
diario-clase/
├── index.html   ← HTML + CSS completo embebido
├── script.js    ← Toda la lógica (IIFE, sin módulos ES6)
└── README.md
```

## 💾 Almacenamiento

Los datos se guardan en `localStorage` del navegador.  
Usa **Configuración → Exportar respaldo** periódicamente para hacer copias de seguridad.

## 🛠 Tecnologías

- HTML5 · CSS3 · JavaScript ES5/ES6 vanilla
- Sin frameworks, sin dependencias, sin build tools
- Compatible con Chrome, Firefox, Edge y Safari (iOS y Android)

---

Hecho con ❤️ para docentes colombianos.
