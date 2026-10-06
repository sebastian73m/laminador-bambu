# Contribuir

Las contribuciones, informes de errores y mejoras del visor son bienvenidos. El proyecto se distribuye bajo AGPL-3.0-only; las contribuciones se incorporan bajo esa misma licencia. Conserva las atribuciones de Bambu Studio y de las dependencias.

## Desarrollo

Requiere Node.js >=22.12.0. Clona el repositorio y ejecuta:

```bash
npm ci
npm run build
npm start
```

Prueba el visor en http://127.0.0.1:4319 con la demostración o el ejemplo incluido. No necesitas el motor para abrir un 3MF ya laminado. Para verificar laminado real, configura BAMBU_STUDIO_PATH con la ruta absoluta del CLI de Bambu Studio; consulta docs/engine.md.

## Comprobaciones antes de enviar un cambio

```bash
npm run check
npm run format:check
npm test
npm run build
npx playwright install chromium
npm run test:ui
```

Añade pruebas de comportamiento para cambios del analizador, manejo de trabajos y contratos MCP. Para cambios del visor, verifica las interacciones y evita errores en la consola. Identifica los datos sintéticos como tales y conserva las unidades y procedencia de las estadísticas.

Abre un pull request hacia main con el problema, el comportamiento resultante y las pruebas realizadas. Indica si pudiste probar Windows, Linux, el motor real y ChatGPT. No presentes una prueba simulada como validación del motor o del host real.

## Informes de errores

Incluye sistema operativo, versión de Node.js y Bambu Studio, pasos de reproducción y el diagnóstico del servicio. Si corresponde, adjunta un proyecto mínimo que puedas compartir públicamente. No publiques credenciales, archivos personales ni registros con información sensible.

El visor es una implementación independiente y no emula todas las rutinas del firmware; los avisos de comandos no representados ayudan a distinguir esas limitaciones de un error en las trayectorias del modelo.
