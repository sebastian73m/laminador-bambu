# Motor Bambu Studio

La integración invoca el CLI de Bambu Studio; no reimplementa su laminador. Se inspeccionó y probó la versión **02.08.02.61**, tag `v02.08.02.61`, commit `926a7192574bcb9b3a732e1ec59a46d79cb45466`.

Repositorio: https://github.com/bambulab/BambuStudio

Código correspondiente: https://github.com/bambulab/BambuStudio/tree/926a7192574bcb9b3a732e1ec59a46d79cb45466

## Compilar desde el código fuente

Los scripts comprueban la revisión y ejecutan los scripts oficiales. No instalan automáticamente bibliotecas de sistema, no modifican un checkout con cambios y no se ejecutan al iniciar el plugin.

### Linux

Requiere Git, Node.js, CMake, compilador C++, herramientas de compilación y las bibliotecas de desarrollo de GTK/WebKit/GStreamer indicadas por el proyecto. El script oficial comprueba memoria y disco: exige más de 10 GB disponibles de ambos. Consulta las dependencias de tu distribución antes de compilar:

https://github.com/bambulab/BambuStudio/wiki/Linux-Compile-Guide

```bash
bash scripts/build-engine.sh
```

Ejecuta `BuildLinux.sh -ds` en `.engine/source`. El binario y sus recursos deben mantenerse juntos: consulta la salida de la compilación para elegir su ruta. Para preparar los paquetes del sistema, el proyecto ofrece `BuildLinux.sh -u`; revísalo y ejecútalo por separado si corresponde a tu distribución.

### Windows

Requiere Git, Node.js, CMake y Visual Studio con carga de trabajo de C++ para escritorio y Windows SDK. El código fijado admite versiones principales de Visual Studio 16–18; usa el entorno de desarrollo de Visual Studio.

https://github.com/bambulab/BambuStudio/blob/926a7192574bcb9b3a732e1ec59a46d79cb45466/build_win.bat

```powershell
.\scripts\build-engine.ps1
```

Ejecuta `build_win.bat -CONFIG Release -STEPS all -RUN none`. Mantén los recursos y DLL junto al ejecutable. Si la compilación produce `bambu-studio-console.exe`, úsalo para obtener el registro del CLI; en otro caso comprueba `bambu-studio.exe --help` y `engine_status`.

## Probar con una instalación existente

También puedes usar el binario de la instalación oficial, configurando **una ruta absoluta** en `BAMBU_STUDIO_PATH`. Para Linux el lanzamiento puede ser la AppImage o el `AppRun` de una AppImage extraída. No copies únicamente el binario interno perdiendo sus bibliotecas y recursos.

Versiones oficiales: https://github.com/bambulab/BambuStudio/releases/tag/v02.08.02.61

En Linux sin sesión gráfica, instala las bibliotecas de ejecución y Xvfb. Puedes usar el adaptador incluido:

```bash
export BAMBU_NATIVE_PATH='/ruta/absoluta/al/AppRun'
export BAMBU_STUDIO_PATH="$PWD/scripts/bambu-headless.sh"
```

En esta sesión se usó la AppImage oficial Ubuntu 24.04 extraída sobre Ubuntu 26.04, con GTK3, WebKit2GTK 4.1, GStreamer y Xvfb instalados. No se compiló el motor C++ desde cero. Hubo diagnósticos relacionados con miniaturas y Wayland, pero el CLI terminó con código 0 y produjo un 3MF con G-code y estadísticas que se validó.

## Comando e intercambio de datos

Para cada trabajo se copia el proyecto en un directorio propio y se invoca el equivalente a:

```text
bambu-studio --slice 0 --debug 2 --outputdir <directorio-del-trabajo> --export-3mf result.3mf <copia-input.3mf>
```

`--slice 0` selecciona todas las placas. Los perfiles completos opcionales se cargan con `--load-settings` y `--load-filaments`, tal como documenta el CLI. Los perfiles heredados de `resources/profiles` no son por sí solos configuraciones completas.

https://github.com/bambulab/BambuStudio/wiki/Command-Line-Usage

Datos inspeccionados en el código:

- `src/libslic3r/Format/bbs_3mf.cpp`: `Metadata/plate_N.gcode`, `Metadata/slice_info.config`, tiempos `prediction`, peso `weight` y filamentos `used_m`, `used_g`.
- `src/libslic3r/GCode/GCodeProcessor.cpp`: encabezados con tiempos del modelo y totales, consumo, etiquetas de capa y trayectoria.

Se conserva la longitud más precisa del encabezado de G-code cuando `used_m` está redondeado. En 02.08.02.61 el código emite volumen en mm³ bajo una etiqueta cm³: el analizador corrige esa versión concreta a cm³. El visor no muestra volumen.

Las instrucciones de preparación específicas del firmware, homing, rutinas de calibración y ramas condicionales no se simulan como movimientos físicos completos. El visor informa de comandos geométricos no representados. La geometría del modelo se representa a partir de G0/G1 y arcos G2/G3. No es un emulador de firmware ni una réplica exacta de la ventana nativa.

## Cordones y costuras

El visor representa cada extrusión con sección elíptica redondeada, usando LINE_WIDTH/LAYER_HEIGHT del G-code. Las luces permiten distinguir cordones contiguos sin reducir artificialmente su anchura ni alterar la trayectoria. Para revisar líneas paralelas de una superficie horizontal, selecciona su capa, activa **Solo la capa seleccionada**, pulsa **Vista superior** y acerca con la rueda. [Captura del detalle actual](assets/lineas-paralelas-zoom.png).

La AppImage probada no emite etiquetas SEAM en el ejemplo. Se detecta el cierre de una extrusión exterior continua cuyos extremos distan menos de 0,25 mm, mostrando la posición media de ambos extremos. Este umbral procede de `GCodeProcessor.cpp` de la revisión fijada (detector `m_seams_detector`); el detector del visor excluye paredes abiertas, rellenos, preparación y trazados que cambian de Z. La marca viaja en el bloque del segmento correspondiente y no carga todas las coordenadas en el resumen MCP. Las costuras scarf/espirales y algoritmos futuros del motor no se emulan completamente; una marca indica un cierre inferido del G-code, no una medición del defecto físico.

Los tramos de voladizo anteriores o posteriores a una pared exterior conservan el comienzo real del contorno. Si un contorno está etiquetado únicamente como voladizo, no se puede distinguir si pertenece a una pared exterior o interior: se omite su marca y se muestra un aviso, en lugar de inventar una costura exterior. El detector nativo inspeccionado también necesita una clasificación exterior para activarse.
