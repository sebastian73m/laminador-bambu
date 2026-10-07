# Instalación con Docker en Windows y Linux

Requiere Docker con Compose v2, contenedores Linux y Node.js 22.12+ **en el host** para los scripts de instalación. En Windows inicia Docker Desktop antes de ejecutar los comandos. La imagen usa Linux amd64, Ubuntu 24.04, Node 22 y Bambu Studio oficial v02.08.02.61. Descarga la AppImage fijada y verifica SHA256; conserva todos sus recursos. No compila el motor C++ desde cero.

## Instalar

Desde un checkout del repositorio, sin necesidad de instalar Bambu Studio en el host:

```bash
node scripts/docker-install.mjs --output ./artifacts/instalacion-docker
```

El script comprueba Docker/Compose, construye la imagen, inicia el contenedor, espera al healthcheck y genera un marketplace en una **carpeta nueva**. No modifica el manifiesto nativo, las configuraciones de otros plugins ni sus cachés. Para actualizaciones elige otra carpeta de salida y reinstala el plugin. Puedes indicar `--platform windows` o `--platform linux` y `--container laminador-bambu` si necesitas generar el paquete para otro sistema; usa el mismo nombre en Compose mediante `LAMINADOR_CONTAINER_NAME`.

Abre http://127.0.0.1:4319. Selecciona un 3MF mediante **Elegir archivo**, luego **Abrir laminado** o **Laminar proyecto**. El archivo original del host se conserva. Los archivos importados y los resultados viven en dos volúmenes Docker persistentes separados.

Para registrar e instalar el paquete en Codex:

```bash
codex plugin marketplace add ./artifacts/instalacion-docker
codex plugin add laminador-bambu@laminador-local
```

Para reemplazar un marketplace `laminador-local` anterior sin conservar su copia en caché, una vez generada la nueva carpeta:

```bash
codex plugin remove laminador-bambu@laminador-local
codex plugin marketplace remove laminador-local
codex plugin marketplace add ./artifacts/instalacion-docker
codex plugin add laminador-bambu@laminador-local
```

Estos comandos afectan solo al plugin y marketplace indicados; no borran los volúmenes Docker ni los 3MF. Si tu marketplace anterior tiene otro nombre, usa ese nombre al retirarlo.

Reinicia/recarga el host después de instalar. La versión 0.1.3 permite distinguir este paquete del inicial. Si ya tienes una variante nativa del mismo plugin habilitada, conserva una sola variante activa para evitar confusión. La instalación local usa el formato documentado por [OpenAI](https://developers.openai.com/plugins/build/plugins). La vista MCP App embebida dentro de ChatGPT Desktop debe comprobarse en el host; ver el visor en un navegador o descubrir herramientas no demuestra por sí solo esa vista.

El paquete Docker contiene `plugin.json` con la identidad/extensions originales y `mcp.json` con `$schema`. El comando es el nombre simple `docker.exe` en Windows y `docker` en Linux, nunca una ruta absoluta a Program Files. Usa `exec -i` **sin `-t`** para mantener stdio MCP limpio. Docker debe estar en el PATH del proceso de ChatGPT/Codex, no solo en la terminal.

## Actualizar el servicio y el visor

El contenedor sirve el visor compilado en `dist/viewer/index.html`. Editar fuentes en el host o ejecutar `docker compose restart` no cambia lo que contiene la imagen. Desde el checkout que incluya los cambios, sin un laminado en curso:

```bash
docker compose up --build --force-recreate --wait
node scripts/docker-doctor.mjs
```

Compose conserva los volúmenes nombrados de proyectos y resultados. Recrear el servicio termina sus sesiones y sus identificadores en memoria: guarda los resultados que quieras recuperar y sigue [Persistencia y sesiones](#persistencia-y-sesiones). Si usas bind mounts, ejecuta el mismo comando con `-f compose.yaml -f deploy/compose.bind.yaml`.

Cierra y vuelve a abrir la conexión del plugin y recarga el navegador lateral para que usen el HTML nuevo. Si también cambia el paquete/manifiesto, genera una carpeta nueva de marketplace y reinstala solo ese plugin siguiendo los comandos anteriores. Los ajustes de actualización del laminado, recuperación WebGL y paneles colapsables están incluidos en 0.1.3: reconstruir un checkout anterior no los añade. Actualiza el checkout a esa versión antes de reconstruir.

### Comprobar los cambios en el equipo instalado

1. Abre un laminado, modifica el proyecto, vuelve a laminar y abre el nuevo `jobId` en la misma sesión. Deben cambiar geometría, capas y estadísticas cuando el resultado sea diferente.
2. Cierra/abre el navegador lateral y cambia su tamaño. El área 3D debe seguir visible y responder a rotación y zoom. Pliega y despliega los paneles con **Proyecto ▴/▾** y **Datos ▸/◂**: sus botones deben seguir accesibles, el visor debe ocupar el espacio libre y los filtros deben conservarse.
3. Activa **Solo la capa seleccionada** en una superficie horizontal y acerca: los cordones paralelos deben distinguirse por su relieve. Comprueba también **Mostrar costuras**.

Si las estadísticas siguen presentes y solo desaparece el modelo, informa del ciclo de apertura/ocultación y cualquier error del visor. Si aparece “vista previa caducada” o “trabajo no encontrado”, comprueba que no cambió la sesión del servicio o se reinició el contenedor. Los diagnósticos y las [pruebas locales](testing.md) no sustituyen estas comprobaciones en ChatGPT Desktop.

## Diagnóstico y pruebas reales

```bash
node scripts/docker-doctor.mjs
```

Comprueba daemon Linux, estado/usuario/publicación del contenedor, healthcheck, descubrimiento MCP, motor y lectura del ejemplo. No cambia permisos ni instala plugins. Para comprobar además el parser y el descubrimiento del plugin instalado en un app-server Codex real:

```bash
node scripts/docker-doctor.mjs --marketplace ./artifacts/instalacion-docker/.agents/plugins/marketplace.json
```

Se requiere `codex` en PATH y el plugin instalado/habilitado. Se inicializa el app-server con API experimental, se usa `plugin/read` con la ruta al **archivo** marketplace y luego `mcpServerStatus/list`. Debe haber un servidor `laminador-bambu`, 12 herramientas y recurso `ui://laminador/preview.html`, sin `toolsError`. La habilidad visible con lista de servidores vacía indica un problema de instalación/manifiesto; abrir el navegador no lo soluciona.

Si el CLI de Windows solo proporciona un shim `codex.cmd`, indica el binario real del app-server con `--codex-command <ruta-al-codex.exe>`; esta ruta pertenece al diagnóstico, nunca al comando MCP del manifiesto. El diagnóstico no instala ni habilita automáticamente el plugin.

Prueba adicional de laminado real y persistencia:

```bash
node scripts/docker-doctor.mjs --slice
```

Copia únicamente el proyecto propio `examples/cubo-p2s-proyecto.3mf` al volumen, verifica que no tenga G-code previo, lamina y comprueba estadísticas; conserva el resultado. El ejemplo ya laminado se mantiene separado para pruebas de lectura/visor. No envía nada a impresoras. Para ejecutar toda la suite del servidor dentro de la imagen como usuario sin privilegios:

```bash
docker compose exec -T laminador node node_modules/vitest/vitest.mjs run --configLoader runner
```

El loader `runner` evita escribir en `/app/node_modules/.vite-temp`, que pertenece a root. No cambies los permisos de `/app` ni agregues capacidades para ejecutar las pruebas.

## Persistencia y sesiones

El proceso web y cada `docker exec ... --stdio` crean servicios independientes: sus jobs y previews en memoria **no se comparten**. Consulta `job_status` y `open_preview(jobId)` en la misma sesión que inició el trabajo. Al cerrar/reiniciar esa sesión los identificadores caducan; los archivos permanecen en `/jobs/<UUID>/result.3mf`.

Cerrar stdio cancela y termina los trabajos todavía activos de esa sesión. No deja laminados huérfanos ejecutándose dentro del contenedor; los trabajos terminados conservan sus archivos. El proceso web sigue siendo independiente.

Para volver a abrir un resultado, cópialo a `/projects` con otro nombre. Por ejemplo, sustituyendo `<UUID>` por el directorio real:

```bash
docker exec laminador-bambu cp /jobs/<UUID>/result.3mf /projects/resultado-recuperado.3mf
```

Después usa `list_projects` y `open_preview` con `project: "resultado-recuperado.3mf"`, o ábrelo desde el visor. Para guardar una copia en el host:

```bash
docker cp laminador-bambu:/jobs/<UUID>/result.3mf ./resultado.3mf
```

Puedes comprobar su reapertura desde ambas sesiones con `node scripts/docker-doctor.mjs --project resultado-recuperado.3mf`.

`docker compose down` conserva los volúmenes; `docker compose down --volumes` los elimina. No uses esta última opción para una actualización si deseas conservar datos. Con el servicio detenido puedes limpiar trabajos viejos manualmente.

## Carpetas del host opcionales

El despliegue predeterminado usa volúmenes nombrados, con propietario UID 1001 preparado por la imagen. No depende de una ruta personal. Si prefieres bind mounts, crea dos carpetas separadas y configura rutas absolutas:

```powershell
$env:LAMINADOR_PROJECTS_DIR = 'C:/Impresion/laminador/projects'
$env:LAMINADOR_JOBS_DIR = 'C:/Impresion/laminador/jobs'
New-Item -ItemType Directory -Force $env:LAMINADOR_PROJECTS_DIR, $env:LAMINADOR_JOBS_DIR
```

```bash
export LAMINADOR_PROJECTS_DIR="$HOME/Impresion/laminador/projects"
export LAMINADOR_JOBS_DIR="$HOME/Impresion/laminador/jobs"
mkdir -p "$LAMINADOR_PROJECTS_DIR" "$LAMINADOR_JOBS_DIR"
# Linux: adapta propietario/grupo/ACL para que UID 1001 pueda escribir.
```

Luego en cualquiera de los sistemas:

```bash
docker compose -f compose.yaml -f deploy/compose.bind.yaml up --build --wait
```

El override sustituye los montajes de `/projects` y `/jobs`. No montes la raíz de tu disco ni el socket Docker dentro del contenedor. Para el generador, usa `node scripts/docker-plugin.mjs --output ./artifacts/instalacion-bind` después de iniciar el servicio.

## Red, ejecución y límites

El servidor escucha `0.0.0.0:4319` **dentro del contenedor**; Compose publica únicamente `127.0.0.1:4319:4319`. Host y Origin siguen restringidos a localhost/127.0.0.1, y las acciones de navegador exigen token por arranque. En una instalación nativa `HTTP_BIND_HOST` sigue siendo `127.0.0.1`; no configures `0.0.0.0` en el host ni cambies el mapping a todas las interfaces. No hay autenticación remota para publicación en Internet.

El proceso corre como `laminador` UID 1001 (Ubuntu ya reserva UID 1000), con init, `no-new-privileges` y todas las capacidades retiradas. Usa Xvfb y no necesita FUSE ni modo privilegiado. El healthcheck verifica el servicio HTTP, no garantiza un laminado: usa el diagnóstico MCP del motor para eso. Mantén los límites de tamaño, memoria geométrica, concurrencia y tiempo documentados en README; el límite de concurrencia se aplica por proceso, no a todas las sesiones juntas.

Bambu puede emitir diagnósticos de presets, miniaturas o Wayland sin impedir el laminado. Se conserva el log y solo se considera correcto si el proceso termina con éxito y existe un 3MF válido con G-code/estadísticas. Un fallo de motor o perfiles se muestra, no se oculta.

Para builds detrás de un proxy con CA propia, Dockerfile admite el secreto BuildKit opcional `proxy_ca`. Monta el bundle de CA del entorno en cada paso que lo necesita; no desactives TLS. La imagen base y los paquetes de sistema reciben actualizaciones: la AppImage y las dependencias npm están fijadas, pero no se promete identidad byte a byte de toda la imagen.
