# Verificación de la versión 0.1.0

Entorno: Ubuntu 26.04, Node.js 22.22.1, Chromium de Playwright con WebGL por software.

## Comprobaciones realizadas

| Comprobación | Resultado |
| --- | --- |
| TypeScript servidor y visor | Compilación y comprobación de tipos correctas |
| Vitest con BAMBU_STUDIO_PATH configurado | 35 pruebas, incluyendo laminado con el motor real |
| Visor en Chromium | 4 pruebas: navegación/filtros, estado vacío/errores, importación real y transporte iframe MCP App |
| Protocolo MCP | Descubrimiento de 12 herramientas, lectura de interfaz HTML, errores y bloques de geometría |
| Servidor compilado stdio | Probado con cliente SDK real; vista previa del ejemplo y recurso HTML autocontenido |
| Servidor compilado Streamable HTTP | Probado con cliente SDK real: laminado, estado, vista previa y bloque de descarga |
| Flujo completo del visor local | Abrir 3MF, laminar con motor real y descargar resultado: correcto |
| Acceso del navegador local | Petición sin token y origen no autorizado devuelven 403 |
| Dependencias npm | Auditoría sin vulnerabilidades reportadas |
| Bash | Sintaxis de arranque, compilación del motor y adaptador headless comprobada |
| Revisión de código | Revisión propia; no hubo una herramienta de revisor independiente disponible |

Se observaron fallos iniciales de las pruebas de cada componente antes de implementar. Durante la revisión se añadieron regresiones para G92, G91/M82 y aislamiento de las consultas `--help`; fallaron antes de corregirlas y pasaron después. La primera prueba de navegación excedió 30 segundos con WebGL por software. Se cambió a renderizado bajo demanda, se redujo la resolución del ejemplo sintético y se dio un límite de prueba de 90 segundos; el flujo pasa aproximadamente en 25–30 segundos con este renderizador.

## Prueba real

Motor oficial Bambu Studio 02.08.02.61, tag v02.08.02.61, commit 926a7192574bcb9b3a732e1ec59a46d79cb45466. Se usó la AppImage Ubuntu 24.04 extraída, con sus bibliotecas de ejecución y Xvfb. No fue un proceso simulado.

El ejemplo incluido se generó desde un prisma STL de 20 × 20 × 10 mm y perfiles completos de P2S, PLA Basic y proceso de 0,20 mm enlazados por la documentación oficial del CLI.

| Dato del ejemplo | Valor leído del resultado |
| --- | --- |
| Capas del modelo | 50 |
| Segmentos de la vista, incluyendo desplazamientos/preparación | 3840 |
| Tiempo del modelo | 291 s — 4 min 51 s |
| Tiempo total estimado | 710 s — 11 min 50 s |
| Peso total de filamento | 2,11 g |
| Longitud del encabezado | 694,76 mm |

Se volvió a laminar ese 3MF mediante JobManager y herramientas MCP HTTP. El resultado conservó 50 capas, los tiempos y 2,11 g; la longitud del nuevo laminado fue 694,85 mm. Se comprobó el archivo descargado y su firma ZIP. El visor muestra los valores del resultado de cada ejecución, no valores fijos del ejemplo.

Las capturas de la demostración y del resultado real se inspeccionaron visualmente. La prueba de iframe utiliza un host mínimo MCP App: comprueba el transporte postMessage y las llamadas reales al servicio, sin afirmar que reproduce las políticas de ChatGPT.

## Límites de verificación

- No se tuvo acceso a ChatGPT Desktop real ni se instaló el plugin en la cuenta del usuario.
- No se ejecutaron las pruebas en Windows. Se incluyeron scripts PowerShell, cancelación con taskkill y una plantilla de CI para Windows y Linux; una definición de CI no demuestra una ejecución en Windows.
- No se compiló Bambu Studio C++ desde cero. Se inspeccionaron sus scripts y se entregaron adaptadores para la revisión fijada; se verificó el binario oficial de esa revisión.
- Descargas y pantalla completa dentro de ChatGPT dependen de los permisos del host. La descarga local se probó.
- La vista no emula el firmware, el homing ni todas las rutinas propietarias de preparación/calibración. Se muestran avisos de comandos geométricos no representados. El cubo y el ejemplo sintético no prueban todos los proyectos multicolor, múltiples boquillas o placas grandes.
- La reproducción expresa avance por segmentos, no tiempo físico transcurrido. Los tiempos mostrados son las estimaciones del motor.
- El límite de geometría es configurable; en proyectos grandes se debe observar memoria y rendimiento. El analizador usa memoria local y no es un servicio multitenant.

## Decisiones de implementación

1. Se usó la carpeta nueva sobre una rama de trabajo: no había un proyecto previo que aislar ni una rama principal que modificar.
2. Se verificó la integración con el binario oficial en Linux, conservando instrucciones y revisión del código fuente para compilación. La compilación C++ completa queda sin verificar.
3. Se añadió importación por bloques desde el visor para elegir el archivo en la interfaz sin presuponer acceso a un adjunto de chat. Se guarda una copia local con nombre UUID.

Para repetir la prueba del motor, configura BAMBU_STUDIO_PATH antes de `npm test`. Sin esa variable se omite únicamente la prueba de laminado real; la lectura del artefacto incluido sigue comprobándose. Una prueba adicional del aislamiento de ejecutables POSIX se omite en Windows.

## Paquete distribuible

Se verificó el ZIP con CRC, estructura de directorio único, manifiestos, permisos de scripts, código fuente, licencias y visor compilado sin scripts externos. En una carpeta temporal independiente se ejecutaron `npm ci`, comprobación de tipos y las pruebas: 34 correctas y una omitida por no configurar el binario del motor. El servidor compilado del paquete arrancó por stdio y devolvió las estadísticas exactas del ejemplo incluido. La prueba real del motor se ejecutó por separado en el proyecto de desarrollo.

La configuración de GitHub Actions está en docs/ci/github-actions.yml como ejemplo instalable. No está activa: la credencial de publicación no tenía el permiso workflow requerido por GitHub.
