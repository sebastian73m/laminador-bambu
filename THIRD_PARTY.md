# Atribuciones y código correspondiente

Laminador Bambu se distribuye bajo AGPL-3.0-only. LICENSE incluye el texto de la licencia.

## Bambu Studio

- Autores: Bambu Lab y colaboradores; basado en PrusaSlicer y Slic3r.
- Repositorio: https://github.com/bambulab/BambuStudio
- Versión inspeccionada/probada: v02.08.02.61.
- Código correspondiente: https://github.com/bambulab/BambuStudio/tree/926a7192574bcb9b3a732e1ec59a46d79cb45466
- Licencia: GNU Affero General Public License versión 3.
- Integración: invocación del CLI, lectura de su formato de salida; no se hicieron modificaciones al motor y no se redistribuye su binario en el paquete del plugin.

La imagen Docker construida con este repositorio sí contiene la AppImage oficial sin modificar, junto con sus recursos y avisos. Dockerfile fija la URL y SHA256. El código correspondiente del motor es el commit enlazado arriba; el código de la integración y los scripts de construcción se distribuyen en este repositorio y en el ZIP. Conserva estas referencias y los avisos de la AppImage al compartir la imagen.

`examples/cubo.stl` fue generado para esta prueba: prisma de 20 × 20 × 10 mm. `examples/cubo-p2s-laminado.3mf` fue generado con Bambu Studio 02.08.02.61 y contiene perfiles completos de ejemplo de Bambu Lab P2S, proceso de 0,20 mm y Bambu PLA Basic. Es material de prueba del visor, no una recomendación de configuración para otra impresora.

`examples/cubo-p2s-proyecto.3mf` conserva el modelo y los perfiles del mismo ejemplo, con G-code y estadísticas de laminado retirados. Se usa para comprobar que el motor genera un laminado nuevo.

Los perfiles se obtuvieron de los ejemplos enlazados por la guía oficial del CLI:

- https://github.com/bambulab/BambuStudio/wiki/Command-Line-Usage
- https://github.com/user-attachments/files/26363641/machine.json
- https://github.com/user-attachments/files/26363644/process.json
- https://github.com/user-attachments/files/26363647/filament.json

No se necesita ni se incluye el plugin propietario de conectividad con impresoras.

## Bibliotecas de la integración

Las versiones concretas y sus dependencias están fijadas en package-lock.json. Se reproducen avisos de licencia en DEPENDENCY_LICENSES.txt y se mantienen en los paquetes npm:

- @modelcontextprotocol/sdk y @modelcontextprotocol/ext-apps: MIT.
- Three.js: MIT.
- Express: MIT.
- yauzl: MIT.
- Zod: MIT.
- Herramientas de desarrollo: TypeScript (Apache-2.0), Vite/Vitest (MIT), Playwright (Apache-2.0).

El paquete incluye el código fuente del visor y del servidor, además de su compilación. `npm ci` obtiene las dependencias con sus licencias; no se incluyen node_modules ni credenciales. El motor puede compilarse mediante los scripts que fijan su revisión.
