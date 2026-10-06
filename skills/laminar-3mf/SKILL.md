---
name: laminar-3mf
description: Usa el servicio local Laminador Bambu para laminar proyectos 3MF, mostrar la vista previa 3D y consultar tiempos estimados y consumo de filamento.
---

Comprueba engine_status cuando el usuario pide un nuevo laminado. Usa list_projects para encontrar un archivo si no indicó uno. Los archivos se leen desde PROJECTS_DIR: un adjunto de chat no implica acceso a la carpeta local. No inventes rutas ni perfiles de impresora.

Inspecciona el proyecto. Para un laminado nuevo llama slice_project con plate=0 para todas las placas, o el índice que el usuario pida. Usa los perfiles incorporados salvo que el usuario proporcione perfiles JSON completos compatibles.

Consulta job_status hasta completed, failed o cancelled, sin afirmar que terminó mientras está running. Tras completed llama open_preview con jobId. Si el usuario ya tiene un 3MF laminado, usa open_preview con project directamente. La interfaz muestra la geometría; no cargues get_toolpath_chunk ni get_result_chunk repetidamente en el contexto del modelo.

Las estadísticas son estimaciones del motor, por placa. Mantén las unidades y reporta valores ausentes como no disponibles. open_demo muestra trayectorias sintéticas sin consumo ni tiempo reales: úsalo solo para probar la navegación y descríbelo como demostración.

No envíes trabajos a impresoras. Explica los diagnósticos de perfiles incompatibles y los comandos geométricos no representados cuando afecten a lo que el usuario quiere verificar.
