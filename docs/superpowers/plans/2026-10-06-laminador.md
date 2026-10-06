# Laminador 3MF — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Entregar una primera prueba de laminado 3MF con Bambu Studio y visor 3D interactivo con consumo y tiempos dentro de una interfaz MCP App.

**Architecture:** Servicio local TypeScript que invoca Bambu Studio y conserva trabajos aislados. Analizador de G-code y metadatos por placa; visor Three.js empaquetado como MCP App. El motor se obtiene del repositorio oficial con revisión fijada y scripts de compilación para Windows y Linux.

**Tech Stack:** Node.js, TypeScript, SDK oficial MCP, MCP Apps, Three.js, Vite, Vitest y Playwright.

**Spec:** ../specs/2026-10-06-laminador-design.md

## Global Constraints

- Windows y Linux para servicio y motor; verificar por separado disponibilidad y soporte del cliente ChatGPT.
- Usar configuración incorporada al proyecto, salvo perfiles completos proporcionados expresamente.
- Estadísticas del resultado Bambu Studio por placa, con unidades y datos ausentes explícitos.
- Visor independiente aceptado; incluir órbita, zoom, desplazamiento, capas y trayectorias.
- Carpetas autorizadas, procesos sin shell y originales conservados.
- AGPL-3.0, fuentes del motor identificadas y ninguna dependencia del componente propietario de conectividad.
- No declarar pruebas reales del motor, Windows o ChatGPT que no se hayan ejecutado.

## Review Focus

- Proyectos de varias placas: estadísticas y geometría pertenecen a la placa seleccionada.
- G92 y movimientos relativos: no aparecen saltos ni extrusiones falsas.
- Archivo sin estadísticas: mostrar no disponible, nunca cero inventado.
- Ruta con espacios o enlace fuera de la carpeta: argumentos intactos o rechazo explícito.
- Trabajo grande o cancelado: interfaz consultable, límites explícitos y sin procesos huérfanos.

### Task 1: Motor y trabajos locales

**Files:** package.json, tsconfig.json, src/config.ts, src/engine.ts, src/jobs.ts, scripts/build-engine.sh, scripts/build-engine.ps1, tests/engine.test.ts.

**Interfaces:** engineStatus(): Promise<EngineStatus>; startSlice(input: SliceInput): Promise<JobSummary>; getJob(id: string): JobSummary; cancelJob(id: string): Promise<JobSummary>. SliceInput contiene ruta relativa, placa y perfiles opcionales; JobSummary contiene id, estado, diagnóstico y artefactos internos.

- [x] Inspeccionar CLI y guía de compilación del repositorio oficial; registrar commit, argumentos y prerequisitos reales en docs/engine.md.
- [x] Escribir pruebas de argumentos con espacios, rutas externas/enlaces, binario ausente, salida fallida, timeout y cancelación; ejecutar `npx vitest run tests/engine.test.ts` y comprobar fallo inicial.
- [x] Implementar configuración validada, adaptador CLI y trabajos asíncronos con directorio propio, límites y cancelación específica de plataforma.
- [x] Crear scripts de obtención y compilación del motor con revisión fijada; no ejecutar descargas desde el servidor.
- [x] Ejecutar las pruebas y `npx tsc --noEmit`; exigir éxito antes de integrar el siguiente componente.

### Task 2: Artefactos, estadísticas y geometría

**Files:** src/artifacts.ts, src/gcode.ts, src/types.ts, tests/gcode.test.ts, tests/artifacts.test.ts, tests/fixtures/.

**Interfaces:** loadSlice(path: string): Promise<SliceResult>; parseGcode(text: string): PlatePreview. SliceResult contiene placas; PlatePreview contiene índice de capas, segmentos y estadísticas con unidades y origen. Los límites y comandos geométricos no soportados producen diagnósticos explícitos.

- [x] Inspeccionar exportación 3MF y comentarios/metadatos reales del motor; definir tipos de estadísticas y ubicación de G-code por placa.
- [x] Escribir pruebas para G90/G91, M82/M83, G92, retracción, herramientas y arcos, ZIP inválido/excesivo, múltiples placas y estadísticas ausentes; ejecutar Vitest y comprobar fallo inicial.
- [x] Implementar extracción limitada del archivo, lectura de estadísticas y analizador con indexación de segmentos y capas. Mostrar tiempos del motor y consumo por filamento cuando existan; no inventar valores.
- [x] Ejecutar `npx vitest run tests/gcode.test.ts tests/artifacts.test.ts` y comprobar coordenadas, estados, unidades y separación de placas.

### Task 3: Contrato MCP y recurso de interfaz

**Files:** src/server.ts, src/tools.ts, src/resources.ts, tests/mcp.test.ts, mcp.json, .plugin/plugin.json.

**Interfaces:** herramientas engine_status, list_projects, inspect_project, slice_project, job_status, cancel_job, open_preview y get_toolpath_chunk. get_toolpath_chunk recibe trabajo, placa, offset y límite y devuelve segmentos e índice siguiente. open_preview entrega el recurso de interfaz y resumen estructurado.

- [x] Consultar documentación de las versiones instaladas de MCP y MCP Apps; fijar dependencias y definir transporte de servicio y metadatos de UI compatibles.
- [x] Escribir prueba de inicialización, listado de herramientas/recurso, llamada inocua, identificador inválido y paginación; ejecutar `npx vitest run tests/mcp.test.ts` y comprobar fallo inicial.
- [x] Implementar esquemas, anotaciones, resultados estructurados y errores legibles; restringir bloques a límites configurados sin enviar geometría completa al contexto.
- [x] Ejecutar pruebas y comprobar descubrimiento con un cliente MCP del SDK.

### Task 4: Visor de prueba

**Files:** viewer/index.html, viewer/main.ts, viewer/scene.ts, viewer/styles.css, vite.config.ts, tests/viewer.spec.ts.

**Interfaces:** interfaz MCP App que llama las herramientas de Task 3; renderPlate(preview: PlatePreview): void y setVisibleRange(startLayer: number, endLayer: number, progress: number): void.

- [x] Escribir prueba Playwright con un resultado de ejemplo identificado como tal: selección de placa, órbita/zoom/desplazamiento, capas, filtros, estadísticas ausentes y cambio de placa; comprobar fallo inicial.
- [x] Implementar escena Three.js, controles de navegación, geometría por bloques, colores por trayectoria/herramienta, filtro de desplazamientos, progreso y panel de tiempo/filamento.
- [x] Empaquetar recurso autocontenido sin CDN; incluir página local de prueba que use los mismos datos y visor, claramente diferenciada de la integración ChatGPT.
- [x] Ejecutar `npx playwright test`, comprobar consola, descarga de artefactos y ausencia de bloqueo durante carga o error.

### Task 5: Prueba real y entrega multiplataforma

**Files:** README.md, LICENSE, THIRD_PARTY.md, scripts/start.sh, scripts/start.ps1, .github/workflows/ci.yml, docs/testing.md, docs/chatgpt.md.

**Interfaces:** comandos documentados de instalación, configuración del binario y carpeta, arranque y conexión MCP; artefacto distribuible con servidor, visor y manifiestos.

- [x] Preparar un 3MF de prueba con perfiles completos y procedencia documentada; ejecutar el motor real cuando el entorno lo permita.
- [x] Comparar salida por placa, geometría, tiempo y consumo con los metadatos reales del laminado. Registrar resultados y fallos; una prueba simulada no sustituye este paso.
- [x] Crear arranque Bash/PowerShell, CI Windows/Linux y documentación de compilación y configuración con rutas reales de ejemplo.
- [x] Documentar conexión mediante transporte admitido por ChatGPT y requisitos de túnel/autenticación; no publicar ni modificar la cuenta del usuario sin necesidad.
- [x] Ejecutar compilación, pruebas y revisión final; probar la vista en ChatGPT solo con acceso disponible y registrar límites de verificación.
- [x] Entregar paquete, instrucciones de prueba y estado preciso de los checks, incluido Windows si solo se configuró CI.

## Resultado

Primera versión entregada; verificación y límites documentados en ../../testing.md. Se verificó el binario oficial de Linux, no una compilación C++ desde cero. Windows y ChatGPT Desktop real requieren prueba externa. Se añadió importación de archivos por bloques desde la interfaz.
