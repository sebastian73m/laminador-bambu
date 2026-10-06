# Conexión a ChatGPT

El plugin contiene un servidor MCP y una interfaz MCP App autocontenida. La vista se renderiza dentro del host que admita esos recursos: no abre la ventana nativa de Bambu Studio ni captura su pantalla.

Se incluyen dos transportes. La conexión depende de las funciones disponibles en tu versión, cuenta y espacio de ChatGPT. No se verificó una instalación de ChatGPT Desktop desde este entorno.

## Opción A: plugin local / túnel MCP privado

1. Descomprime el paquete en una carpeta permanente de tu equipo.
2. Ejecuta `npm ci` y `npm run build` en esa carpeta.
3. Configura `BAMBU_STUDIO_PATH` y `PROJECTS_DIR` en el entorno del proceso que arrancará el servidor. Reinicia el host o el cliente del túnel si cambias sus variables heredadas.
4. Si el host admite plugins locales, añade el directorio como fuente local usando su flujo de marketplace. `plugin.json` y `mcp.json` describen el comando stdio real: `node <carpeta>/dist/server.js --stdio`.
5. Si ChatGPT requiere una conexión mediante túnel, instala/configura su cliente de **Secure MCP Tunnel** en el equipo donde está Bambu Studio. Conecta el túnel al comando stdio anterior o al endpoint HTTP local.
6. En la interfaz de Plugins de ChatGPT, añade el MCP personalizado usando el túnel disponible. Revisa las herramientas descubiertas e instala/activa el plugin en una conversación nueva.

Usa la guía actual de OpenAI para el flujo de conexión y las opciones que estén habilitadas en tu cuenta:

https://developers.openai.com/plugins/deploy/connect-chatgpt

Una configuración stdio contiene el proceso local; guardar el manifiesto en la cuenta no instala ese proceso en otro equipo. Esta entrega no da por creada una conexión en tu cuenta.

## Opción B: endpoint HTTP local para el túnel

Arranca `npm start` después de compilar, o usa los scripts incluidos. El endpoint es:

```text
http://127.0.0.1:4319/mcp
```

Es Streamable HTTP sin estado de sesión: el estado de los trabajos vive en el servicio. `/mcp` admite POST; GET y DELETE devuelven 405 por diseño. El servidor solo escucha loopback y rechaza otros orígenes de navegador. Un túnel que preserve el `Host` público tendrá que usar el transporte stdio o reescribirlo al destino loopback conforme a la configuración admitida del túnel.

**No pegues localhost como un endpoint HTTPS remoto de ChatGPT.** El servidor no incluye OAuth para exposición pública. Utiliza un túnel privado autenticado; para publicar un servicio HTTP sería necesario añadir autenticación y alojamiento apropiados. El paquete no abre puertos de red ni publica el servicio.

## Primera conversación de prueba

```text
Abre la demostración del Laminador Bambu para probar la navegación 3D.
```

Luego:

```text
Abre el visor de examples/cubo-p2s-laminado.3mf y muéstrame el tiempo y el filamento de la placa 1.
```

La ruta se resuelve dentro de PROJECTS_DIR. Si usaste los scripts con su carpeta por defecto, copia el ejemplo allí; si configuraste PROJECTS_DIR a la raíz de la entrega, la ruta del ejemplo funciona directamente.

Puedes seleccionar un archivo con **Elegir archivo** dentro del visor. Se transmite al servicio mediante bloques MCP y se valida antes de publicarlo como proyecto local. Se guarda con un nombre UUID que aparece en el campo de proyecto. El botón no necesita un adjunto de chat ni acceso directo a tu disco desde el modelo. La primera versión no abre automáticamente los adjuntos del compositor de ChatGPT.

Para un proyecto nuevo:

```text
Lamina mi-proyecto.3mf con sus perfiles incorporados y abre la vista previa cuando termine.
```

Si la interfaz no aparece pero las herramientas funcionan, comprueba el soporte MCP Apps del host, el recurso `ui://laminador/preview.html`, los metadatos de `open_preview` y reinicia/refresca la conexión. También se incluyen metadatos y un puente de compatibilidad para el widget de OpenAI; este puente no se ha probado en ChatGPT real.

## Datos, descarga y límites

La interfaz pide segmentos por bloques y usa geometría instanciada para la extrusión. Hay filtros por capa/tipo de trayectoria, colores por filamento o velocidad y reproducción progresiva. El servicio conserva hasta tres vistas en memoria; abrir otra puede caducar una vista anterior. Vuelve a abrirla si recibes ese aviso.

Los resultados nuevos tienen el botón **Descargar 3MF laminado**. Usa bloques MCP para reconstruir el archivo. La descarga final depende de que el host permita descargas desde su interfaz; siempre existe una copia en JOBS_DIR/<jobId>/result.3mf. Un 3MF abierto desde el disco conserva su archivo original.

Para Linux, el servicio y el visor local funcionan en navegador. La entrega no presupone la disponibilidad de una aplicación oficial ChatGPT Desktop para Linux; usa el cliente de ChatGPT que admita MCP Apps y la conexión elegida.
