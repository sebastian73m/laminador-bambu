# Laminador para ChatGPT — diseño propuesto

> Documento histórico del diseño y plan iniciales del 6 de octubre de 2026. Sus referencias al progreso de trayectorias y a verificaciones pendientes describen esa etapa. La barra de recorrido y la animación se eliminaron posteriormente; el visor actual carga el modelo completo y permite plegar los paneles. Consulta el [README actual](../../../README.md) y el [estado de verificación](../../testing.md).

Estado: primera versión implementada y verificada en Linux; conexión a ChatGPT Desktop y ejecución en Windows pendientes de prueba en esos entornos.

## Aclaración acordada

El usuario acepta un visor independiente que simule la navegación 3D de Bambu Studio. No se exige identidad visual ni reutilizar su ventana nativa. La prueba debe incluir rotación, zoom, desplazamiento, capas, trayectorias, consumo de filamento y tiempos estimados de impresión. Las estadísticas deben proceder de los metadatos generados por Bambu Studio, por placa y con unidades. Los valores ausentes se muestran como no disponibles; cualquier cálculo propio se identifica como estimación. Los tiempos son estimaciones del laminador, no mediciones de una impresión real.

## Objetivo y plataformas

Abrir un proyecto 3MF, laminarlo con Bambu Studio y explorar las trayectorias resultantes en un visor 3D integrado mediante MCP Apps. El usuario utilizará Windows y Linux. El servicio y el motor deben funcionar en ambos sistemas; la disponibilidad del cliente ChatGPT y sus funciones de plugins se verificará por separado, sin presuponer una aplicación Desktop oficial para Linux.

## Enfoques evaluados

1. Servicio local que invoca Bambu Studio compilado desde su repositorio oficial y entrega un visor MCP App. Recomendado: conserva el motor y los perfiles del proyecto, evita portar el laminador C++ a WebAssembly y permite usar archivos locales.
2. Servicio de laminado alojado: requiere transferir los proyectos y mantener infraestructura de ejecución; no se elige para esta primera versión.
3. Portar el motor completo al navegador: añade trabajo de compilación, memoria e integración; no se elige para esta primera versión.

## Componentes

- Motor: checkout de BambuStudio fijado a un commit durante la implementación, con instrucciones reproducibles de compilación para Windows y Linux. Registrar versión, commit y ubicación del binario. No descargar ni compilar silenciosamente al arrancar.
- Servicio Node.js/TypeScript: adaptador del CLI, gestión de trabajos, lectura limitada de archivos y servidor MCP. Binario configurable mediante BAMBU_STUDIO_PATH; carpeta de proyectos autorizada mediante configuración.
- Analizador de G-code: extrae trayectorias por placa, capa, tipo de extrusión, herramienta y velocidad, conservando unidades y estados de posicionamiento. Procesa coordenadas absolutas/relativas, extrusión absoluta/relativa, G92 y arcos G2/G3 con discretización controlada. Los comandos no soportados que afecten geometría generan un aviso explícito.
- Visor WebGL con Three.js: órbita, zoom, encuadre, selección de placa, intervalo de capas, progreso de trayectorias y filtros de extrusión/desplazamiento. Colores por tipo de recorrido y herramienta. Carga datos por bloques para no introducir el G-code completo en el contexto del modelo.
- Paquete de plugin: manifiesto, conexión MCP, instrucciones de uso, scripts PowerShell/Bash y guía de instalación.

## Flujo

1. Configurar el motor y una carpeta de proyectos. Consultar el estado del servicio y las capacidades del binario.
2. Seleccionar un 3MF de esa carpeta mediante la interfaz o indicar su ruta relativa en chat. La interfaz permite importar un archivo seleccionado mediante bloques MCP y guardarlo dentro de la carpeta autorizada. También admite rutas relativas de archivos locales; adjuntar un archivo al chat no implica que el servidor pueda leerlo.
3. Inspeccionar el archivo y sus placas. Laminar con la configuración incorporada al proyecto; si falta configuración compatible, solicitar perfiles completos de máquina, proceso y filamentos.
4. Crear un trabajo aislado y ejecutar el CLI con una lista de argumentos, sin shell. La interfaz oficial documenta --slice, --export-3mf y --outputdir; el adaptador comprobará el comportamiento de la versión fijada.
5. Consultar progreso, cancelar si hace falta y presentar errores del motor. El resultado no sustituye el archivo original.
6. Leer los G-code de las placas del 3MF resultante, indexar trayectorias y abrir la vista 3D. Ofrecer el resultado laminado para descarga.

## Contrato MCP

Herramientas propuestas: engine_status, list_projects, inspect_project, slice_project, job_status, cancel_job, open_preview y get_toolpath_chunk. Las operaciones de laminado devuelven un identificador de trabajo inmediatamente. La vista recibe identificadores y resúmenes; los bloques de geometría se solicitan desde la interfaz. Los errores se devuelven como resultados de herramienta con una explicación y la acción necesaria.

Se usará el SDK oficial MCP y un recurso HTML MCP App empaquetado, sin depender de un CDN para el visor. El transporte local y la conexión a ChatGPT se documentarán conforme al soporte real del host. Para una conexión remota se necesita un túnel MCP admitido o HTTPS autenticado; una dirección localhost no se presenta como accesible automáticamente desde ChatGPT.

## Archivos, procesos y límites

Resolver rutas reales y restringirlas a la carpeta configurada. Rechazar rutas externas, escapes mediante enlaces y archivos que no sean proyectos admitidos. Validar límites de tamaño y expansión de ZIP antes de procesar 3MF. Mantener límites de tiempo, concurrencia, salida del proceso y geometría; ante límites mostrar un error o carga progresiva explícita, nunca omitir rutas silenciosamente. Cancelar el árbol de procesos según el sistema operativo. Almacenar trabajos en un directorio independiente con limpieza configurable.

## Distribución y fuentes

Conservar atribuciones y licencia del motor. El proyecto se entregará con licencia AGPL-3.0 y referencias al código fuente correspondiente; cualquier modificación del motor quedará disponible como parche. No se necesita el componente propietario de conectividad con impresoras para laminar y visualizar. La primera versión no envía trabajos a una impresora.

## Verificación y criterios de aceptación

- Compilación TypeScript, pruebas de contratos MCP y descubrimiento de herramientas.
- Pruebas del analizador con extrusión, retracciones, desplazamientos, cambios de herramienta, estados relativos, G92 y arcos.
- Pruebas de rutas, ZIP inválido, perfiles ausentes, fallos y cancelación del proceso.
- Prueba real de un proyecto 3MF con Bambu Studio: salida laminada, G-code por placa y geometría verificable. Distinguir esta prueba de cualquier prueba con un motor simulado.
- Pruebas del visor en navegador: órbita, filtros, capas y carga por bloques; comprobar errores de consola.
- Scripts y CI para Windows y Linux. Si no se dispone de un ejecutor Windows, documentar esa limitación sin declarar verificación real en Windows.
- Verificación final en ChatGPT solo si hay acceso a ese host; entregar instrucciones y registrar la limitación cuando no se pueda comprobar la integración allí.

## Fuentes consultadas

- https://github.com/bambulab/BambuStudio
- https://github.com/bambulab/BambuStudio/wiki/Command-Line-Usage
- https://developers.openai.com/plugins/deploy/connect-chatgpt

## Decisiones pendientes de ejecución

La versión exacta del motor y de los SDK se fijará tras inspeccionar el código y las dependencias disponibles. Eso no modifica el alcance descrito. No se da por comprobada la compatibilidad de un 3MF arbitrario: los proyectos con perfiles incompatibles deberán producir un diagnóstico útil.
