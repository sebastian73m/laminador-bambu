# Estado de verificación

## Versión 0.1.3 — 7 de octubre de 2026

La versión 0.1.3 reúne los últimos ajustes funcionales del visor. Publicar el código no actualiza automáticamente el contenedor del usuario. El historial de versiones que figura más abajo describe comprobaciones anteriores, no una validación de estos cambios en ChatGPT Desktop.

| Comprobación                         | Resultado actual                                                                                                       |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| TypeScript, compilación y formato    | Correctos                                                                                                              |
| Servidor y contratos MCP             | 50 pruebas aprobadas; una de motor nativo omitida                                                                      |
| Visor Chromium                       | 14 pruebas aprobadas                                                                                                   |
| Actualizaciones del mismo chat       | Listener durante la carga inicial, respuestas tardías de trabajos y notificaciones repetidas en el mismo iframe        |
| Caché y archivos modificados         | Recencia de vistas y lectura nueva de G-code con el mismo nombre de proyecto                                           |
| Recuperación gráfica                 | Restauración WebGL, página persistida, redimensionado y cámara operativa                                               |
| Capturas actuales                    | `assets/ui-principal.png` y `assets/lineas-paralelas-zoom.png`, tomadas del ejemplo real con el visor compilado actual |
| ChatGPT Desktop y Docker del usuario | Pendiente repetir las correcciones en el equipo instalado                                                              |

La funcionalidad actual está explicada en [el uso del visor](../README.md#explorar-el-laminado). La suite conserva las pruebas de navegación, importación, filtros, costuras, estado vacío y transporte MCP. No se volvieron a ejecutar CI Windows ni el motor real para esta versión.

## Paneles colapsables (0.1.3)

El área superior incluye la cabecera y la barra del proyecto; el lateral contiene datos y filtros y se ubica debajo del visor en ventanas estrechas. Los controles **Proyecto ▴/▾** y **Datos ▸/◂** permanecen en la barra del 3D. Actualizan `aria-expanded`/`aria-controls`, funcionan por teclado y conservan geometría, cámara y filtros. La escena existente se redimensiona en lugar de volver a descargar el laminado. Los paneles comienzan desplegados en cada página nueva.

Verificación final de este cambio: las 14 pruebas visuales aprobaron; tipos, compilación y formato correctos. Las dos regresiones probaron plegado y restauración en navegador y en iframe MCP, ganancia de ancho/alto, conservación de capas y trayectorias, Enter/Espacio y ausencia de desbordamiento horizontal a 390 px. Fallaron por falta de los controles antes de implementar y aprobaron después. Las capturas `assets/ui-principal.png` y `assets/ui-paneles-colapsados.png` muestran el código de 0.1.3.

## Recuperación del área 3D al reabrir el panel (0.1.3)

7 de octubre de 2026. Se reprodujo un área 3D vacía con estadísticas conservadas al perder y restaurar WebGL: Three.js restauraba el contexto, pero el visor no solicitaba otro dibujo porque su bandera `dirty` ya estaba desactivada. También se reprodujo una escena que dejaba de responder tras `pagehide`/`pageshow` con `persisted: true`: el listener destruía recursos y cancelaba el dibujo de una página que el navegador solo estaba guardando.

Ahora la restauración de WebGL solicita un redibujado; la escena se conserva al suspender una página persistida y se actualiza al recuperar visibilidad, recibir `pageshow` o cambiar el contexto de visualización del host. Durante tamaños transitorios de cero se conservan el último buffer y la proyección válida. La salida definitiva de la página sigue liberando la escena.

Las regresiones fuerzan pérdida/restauración mediante `WEBGL_lose_context` y comparan capturas del área 3D; simulan el ciclo persistido, cambian el tamaño y comprueban que la cámara sigue respondiendo. Son pruebas en Chromium local, no una reproducción directa del navegador lateral de ChatGPT en el equipo del usuario. Los cambios están incluidos en 0.1.3 y no se aplicaron automáticamente a su contenedor. En la comprobación previa a los paneles colapsables aprobaron las 12 pruebas visuales, incluyendo ambas regresiones de recuperación. El total vigente está en la tabla inicial.

## Actualización de vistas dentro de una conversación (0.1.3)

7 de octubre de 2026. Se reprodujeron dos carreras con un iframe y el bridge `window.openai`: un segundo `openai:set_globals` recibido durante la carga inicial se perdía porque la suscripción se registraba después de esperar esa carga; además, un trabajo anterior podía reemplazar una vista más reciente al resolver `job_status` o `open_preview` tarde. Las pruebas fallaron mostrando la vista anterior antes del arreglo.

También se reprodujo la caducidad de una vista recién reutilizada al llenar la caché de tres vistas: la expulsión seguía el orden de creación. La caché ahora actualiza la recencia al abrir o leer una vista y conserva el mismo límite de tres.

El listener se registra antes de la primera operación asíncrona. Abrir una nueva vista invalida el polling anterior; iniciar otro trabajo invalida la descarga de la vista anterior. Se comprueba la vigencia de la consulta después de esperar la apertura del resultado y se descartan errores tardíos de operaciones reemplazadas. Esto deja de seguir el trabajo anterior en el visor; no cancela su motor.

Las regresiones usan datos reales del cubo para verificar estadísticas, capas y costuras, bloquean respuestas para forzar las carreras y prueban invocaciones repetidas con notificaciones MCP en el mismo iframe. No se ha reproducido directamente en el ChatGPT Desktop ni el Docker Desktop del equipo del usuario. La instalación Docker sirve `dist/viewer/index.html`: editar fuentes o reiniciar una imagen antigua no incorpora el arreglo; hay que reconstruir y recrear el servicio con los cambios locales antes de probarlo allí. Esta corrección está incluida en 0.1.3.

Comprobación final local: tipos, compilación y formato correctos; 50 pruebas del servidor aprobadas y una de motor nativo omitida; nueve pruebas visuales en la suite completa, seguidas de cinco regresiones finales aprobadas (incluida la visualización de errores de la última vista). Se verificó que reabrir un proyecto modificado con el mismo nombre obtiene otro previewId y el G-code nuevo. El canal `toolOutput` y sus eventos se contrastaron con la [referencia oficial de OpenAI](https://developers.openai.com/plugins/reference).

## Historial: versión 0.1.2

La carga pide hasta cuatro bloques de 4.000 trayectorias en paralelo, conserva el orden del G-code y construye/filtra la geometría una sola vez. El modelo se muestra completo al finalizar. La barra manual de recorrido de esa versión se eliminó después en el checkout local, que ahora muestra todas las trayectorias de las capas seleccionadas sin reproducción animada. La interfaz ocupa todo el ancho y alto disponibles, con desplazamiento propio del inspector. En ventanas estrechas los controles siguen accesibles mediante desplazamiento.

Verificado en Linux el 6 de octubre de 2026: TypeScript, compilación, formato, 48 pruebas del servidor (una prueba de motor nativo omitida) y cinco pruebas Chromium. La nueva regresión bloquea el primer bloque para comprobar concurrencia y ocultación del modelo parcial, confirma inicio al 100% sin reproducción y verifica el ajuste a 1280×720 y 1800×1080. La prueba MCP compara las dimensiones del área 3D con el navegador cuando el iframe tiene el mismo tamaño. El tamaño máximo del plugin sigue dependiendo del espacio que conceda el host; no se ha verificado este cambio dentro de ChatGPT Desktop real. Estas optimizaciones aceleran la carga de la vista previa; no modifican el tiempo que necesita Bambu para laminar.

## Historial: versión 0.1.1

Fecha: 6 de octubre de 2026. Host Linux amd64, Node 22, Docker Engine 29.1.3, Compose 2.40.3; imagen Ubuntu 24.04 con Bambu Studio oficial v02.08.02.61 y Node 22. El checkout Windows y Docker Desktop descritos en el informe de instalación están en otro equipo.

| Comprobación                 | Evidencia en este host                                                                                                |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| TypeScript y compilación     | `npm run check`, `npm run build`                                                                                      |
| Suite con motor real         | 49 pruebas; proyecto de cubo sin G-code previo                                                                        |
| Suite dentro del contenedor  | 49 pruebas como UID 1001 con `--configLoader runner`                                                                  |
| Visor Chromium               | 4 pruebas; rotación/zoom/pan, capas, importación, iframe MCP App; costuras activadas/desactivadas y una sola capa     |
| Captura visual               | `docs/assets/cordones-costuras.png`: cordones redondeados distinguibles y costura blanca en la capa superior          |
| Manifiestos de instalación   | Generación Windows/Linux, schema y comando portable; parser real `plugin/read` en Codex 0.160.1                       |
| Integración del plugin Linux | App-server real: 12 herramientas, `toolsError: null`, recurso `ui://laminador/preview.html`; sin turno de modelo      |
| Docker y MCP                 | Contenedor healthy, usuario laminador, publicación loopback, capacidades retiradas; stdio y HTTP con motor disponible |
| Laminado de diagnóstico      | 50 capas, 3.840 segmentos, 50 costuras, 2,11 g; 291 s modelo y 710 s total                                            |
| Instalador                   | Ejecución con imagen construida localmente y `--skip-build`, generación de marketplace nuevo                          |
| Persistencia                 | Resultado reabierto tras reinicio por stdio/HTTP; IDs de sesión caducan y archivos permanecen                         |
| Paquete                      | ZIP con fuentes, compilación, Docker/Compose, instalación y licencias; CRC y extracción limpia comprobados            |

Las regresiones de ciclo de vida reproducen un motor activo con EOF y stdout roto; verifican que servidor y motor terminen. La revisión independiente detectó el problema de cierre y el inicio de contornos mixtos de voladizo/pared exterior; ambos fueron corregidos con pruebas que fallaron antes del cambio.

Las costuras se infieren del cierre de paredes exteriores, siguiendo el umbral de 0,25 mm de la revisión inspeccionada. Las pruebas excluyen relleno, paredes interiores, contornos abiertos y variación de Z. Los 50 marcadores del ejemplo viajan en los bloques de geometría, no como coordenadas completas en cada resumen MCP.

Las pruebas HTTP usan peticiones reales con Host no autorizado: `fetch` de Node normaliza Host, por lo que esa comprobación utiliza `node:http`. Se comprueba 403 ante Host/Origin ajenos y falta de token tanto en bind loopback como en bind de contenedor. El diagnóstico reproduce además el descubrimiento mediante el parser real de Codex; una conexión SDK aislada no sustituye esa comprobación.

El informe de instalación previo confirma Docker Desktop Linux y MCP en el equipo Windows del usuario. En este host se reproduce Docker Linux y se comprueba el manifiesto Windows con el parser; no se ejecutan Docker Desktop, PowerShell ni `docker.exe` aquí. CI ejecuta servidor/visor en Windows y Linux, y Docker con motor real en Linux. La vista MCP App embebida real en ChatGPT Desktop sigue sin verificarse; el iframe de prueba y la captura del navegador no prueban esa integración. Tampoco se compiló Bambu Studio C++ desde cero, ni se probó Linux arm64/emulación.

## Historial: verificación inicial (0.1.0)

Las cifras y limitaciones de este apartado corresponden a la comprobación inicial; los resultados actuales están al principio de este documento.

Entorno: Ubuntu 26.04, Node.js 22.22.1, Chromium de Playwright con WebGL por software.

### Comprobaciones realizadas

| Comprobación                             | Resultado                                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------- |
| TypeScript servidor y visor              | Compilación y comprobación de tipos correctas                                                     |
| Vitest con BAMBU_STUDIO_PATH configurado | 35 pruebas, incluyendo laminado con el motor real                                                 |
| Visor en Chromium                        | 4 pruebas: navegación/filtros, estado vacío/errores, importación real y transporte iframe MCP App |
| Protocolo MCP                            | Descubrimiento de 12 herramientas, lectura de interfaz HTML, errores y bloques de geometría       |
| Servidor compilado stdio                 | Probado con cliente SDK real; vista previa del ejemplo y recurso HTML autocontenido               |
| Servidor compilado Streamable HTTP       | Probado con cliente SDK real: laminado, estado, vista previa y bloque de descarga                 |
| Flujo completo del visor local           | Abrir 3MF, laminar con motor real y descargar resultado: correcto                                 |
| Acceso del navegador local               | Petición sin token y origen no autorizado devuelven 403                                           |
| Dependencias npm                         | Auditoría sin vulnerabilidades reportadas                                                         |
| Bash                                     | Sintaxis de arranque, compilación del motor y adaptador headless comprobada                       |
| Revisión de código                       | Revisión propia; no hubo una herramienta de revisor independiente disponible                      |

Se observaron fallos iniciales de las pruebas de cada componente antes de implementar. Durante la revisión se añadieron regresiones para G92, G91/M82 y aislamiento de las consultas `--help`; fallaron antes de corregirlas y pasaron después. La primera prueba de navegación excedió 30 segundos con WebGL por software. Se cambió a renderizado bajo demanda, se redujo la resolución del ejemplo sintético y se dio un límite de prueba de 90 segundos; el flujo pasa aproximadamente en 25–30 segundos con este renderizador.

### Prueba real

Motor oficial Bambu Studio 02.08.02.61, tag v02.08.02.61, commit 926a7192574bcb9b3a732e1ec59a46d79cb45466. Se usó la AppImage Ubuntu 24.04 extraída, con sus bibliotecas de ejecución y Xvfb. No fue un proceso simulado.

El ejemplo incluido se generó desde un prisma STL de 20 × 20 × 10 mm y perfiles completos de P2S, PLA Basic y proceso de 0,20 mm enlazados por la documentación oficial del CLI.

| Dato del ejemplo                                              | Valor leído del resultado |
| ------------------------------------------------------------- | ------------------------- |
| Capas del modelo                                              | 50                        |
| Segmentos de la vista, incluyendo desplazamientos/preparación | 3840                      |
| Tiempo del modelo                                             | 291 s — 4 min 51 s        |
| Tiempo total estimado                                         | 710 s — 11 min 50 s       |
| Peso total de filamento                                       | 2,11 g                    |
| Longitud del encabezado                                       | 694,76 mm                 |

Se volvió a laminar ese 3MF mediante JobManager y herramientas MCP HTTP. El resultado conservó 50 capas, los tiempos y 2,11 g; la longitud del nuevo laminado fue 694,85 mm. Se comprobó el archivo descargado y su firma ZIP. El visor muestra los valores del resultado de cada ejecución, no valores fijos del ejemplo.

Las capturas de la demostración y del resultado real se inspeccionaron visualmente. La prueba de iframe utiliza un host mínimo MCP App: comprueba el transporte postMessage y las llamadas reales al servicio, sin afirmar que reproduce las políticas de ChatGPT.

### Límites de verificación

- No se tuvo acceso a ChatGPT Desktop real ni se instaló el plugin en la cuenta del usuario.
- No se ejecutaron las pruebas en Windows. Se incluyeron scripts PowerShell, cancelación con taskkill y una plantilla de CI para Windows y Linux; una definición de CI no demuestra una ejecución en Windows.
- No se compiló Bambu Studio C++ desde cero. Se inspeccionaron sus scripts y se entregaron adaptadores para la revisión fijada; se verificó el binario oficial de esa revisión.
- Descargas y pantalla completa dentro de ChatGPT dependen de los permisos del host. La descarga local se probó.
- La vista no emula el firmware, el homing ni todas las rutinas propietarias de preparación/calibración. Se muestran avisos de comandos geométricos no representados. El cubo y el ejemplo sintético no prueban todos los proyectos multicolor, múltiples boquillas o placas grandes.
- Los tiempos mostrados son las estimaciones del motor.
- El límite de geometría es configurable; en proyectos grandes se debe observar memoria y rendimiento. El analizador usa memoria local y no es un servicio multitenant.

### Decisiones de implementación

1. Se usó la carpeta nueva sobre una rama de trabajo: no había un proyecto previo que aislar ni una rama principal que modificar.
2. Se verificó la integración con el binario oficial en Linux, conservando instrucciones y revisión del código fuente para compilación. La compilación C++ completa queda sin verificar.
3. Se añadió importación por bloques desde el visor para elegir el archivo en la interfaz sin presuponer acceso a un adjunto de chat. Se guarda una copia local con nombre UUID.

Para repetir la prueba del motor, configura BAMBU_STUDIO_PATH antes de `npm test`. Sin esa variable se omite únicamente la prueba de laminado real; la lectura del artefacto incluido sigue comprobándose. Una prueba adicional del aislamiento de ejecutables POSIX se omite en Windows.

### Paquete distribuible

Se verificó el ZIP con CRC, estructura de directorio único, manifiestos, permisos de scripts, código fuente, licencias y visor compilado sin scripts externos. En una carpeta temporal independiente se ejecutaron `npm ci`, comprobación de tipos y las pruebas: 34 correctas y una omitida por no configurar el binario del motor. El servidor compilado del paquete arrancó por stdio y devolvió las estadísticas exactas del ejemplo incluido. La prueba real del motor se ejecutó por separado en el proyecto de desarrollo.

En la publicación inicial, GitHub rechazó el workflow porque la credencial no tenía el permiso `workflow`. Se activó posteriormente en [.github/workflows/ci.yml](../.github/workflows/ci.yml): [la comprobación de Windows, Linux y Docker de la versión 0.1.1](https://github.com/sebastian73m/laminador-bambu/actions/runs/37524163514) terminó correctamente. La publicación de 0.1.3 dispara una nueva ejecución de CI; su resultado debe comprobarse en GitHub Actions.
