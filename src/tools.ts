import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  registerAppTool,
  registerAppResource,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { Service } from "./service.js";
export const VIEW_URI = "ui://laminador/preview.html";
export const toolSchemas = {
  engine_status: z.object({}),
  list_projects: z.object({}),
  inspect_project: z.object({ project: z.string().min(1) }),
  slice_project: z.object({
    project: z.string().min(1),
    plate: z.number().int().min(0).max(100).default(0),
    machine: z.string().optional(),
    process: z.string().optional(),
    filaments: z.array(z.string()).max(32).optional(),
  }),
  job_status: z.object({ jobId: z.string() }),
  cancel_job: z.object({ jobId: z.string() }),
  open_preview: z.object({
    project: z.string().optional(),
    jobId: z.string().optional(),
  }),
  open_demo: z.object({}),
  get_toolpath_chunk: z.object({
    previewId: z.string(),
    plate: z.number().int().min(1),
    offset: z.number().int().min(0),
    limit: z.number().int().min(1).max(4000).default(2000),
  }),
  begin_import: z.object({ size: z.number().int().min(1) }),
  append_import: z.object({
    uploadId: z.string(),
    offset: z.number().int().min(0),
    base64: z.string().min(1).max(349528),
  }),
  get_result_chunk: z.object({
    jobId: z.string(),
    offset: z.number().int().min(0),
    limit: z.number().int().min(1).max(262144).default(262144),
  }),
};
export type ToolName = keyof typeof toolSchemas;
export async function callService(
  service: Service,
  name: string,
  args: unknown,
): Promise<Record<string, unknown>> {
  if (!(name in toolSchemas)) throw Error("Herramienta desconocida");
  // Each branch parses its own exact schema: no unchecked casts of caller arguments.
  switch (name as ToolName) {
    case "engine_status":
      toolSchemas.engine_status.parse(args);
      return service.engineStatus();
    case "list_projects":
      toolSchemas.list_projects.parse(args);
      return service.listProjects();
    case "inspect_project":
      return service.inspectProject(
        toolSchemas.inspect_project.parse(args).project,
      );
    case "slice_project":
      return service.sliceProject(toolSchemas.slice_project.parse(args));
    case "job_status":
      return service.jobStatus(toolSchemas.job_status.parse(args).jobId);
    case "cancel_job":
      return service.cancelJob(toolSchemas.cancel_job.parse(args).jobId);
    case "open_preview":
      return service.openPreview(toolSchemas.open_preview.parse(args));
    case "open_demo":
      toolSchemas.open_demo.parse(args);
      return service.openPreview({ demo: true });
    case "get_toolpath_chunk":
      return service.getToolpathChunk(
        toolSchemas.get_toolpath_chunk.parse(args),
      );
    case "begin_import":
      return service.beginImport(toolSchemas.begin_import.parse(args).size);
    case "append_import":
      return service.appendImport(toolSchemas.append_import.parse(args));
    case "get_result_chunk":
      return service.getResultChunk(toolSchemas.get_result_chunk.parse(args));
  }
}
export function createMcpServer(service: Service, htmlPath: string): McpServer {
  const server = new McpServer({ name: "laminador-bambu", version: "0.1.0" });
  const descriptions: Record<ToolName, string> = {
    engine_status:
      "Comprueba que el CLI configurado de Bambu Studio está disponible.",
    list_projects: "Lista proyectos 3MF de la carpeta local autorizada.",
    inspect_project:
      "Inspecciona los metadatos y las placas ya laminadas de un 3MF.",
    slice_project:
      "Lamina un proyecto 3MF con Bambu Studio. Devuelve jobId inmediatamente. Usa sus perfiles incorporados; plate=0 lamina todas las placas.",
    job_status: "Consulta estado, diagnóstico y registro del laminado.",
    cancel_job: "Cancela un laminado en curso y termina su proceso.",
    open_preview:
      "Abre el visor 3D de las trayectorias y estadísticas de un trabajo terminado o un 3MF ya laminado. Permite órbita, zoom, capas y filtros.",
    open_demo:
      "Abre una demostración de trayectorias sintéticas para probar la navegación 3D; no realiza un laminado y no contiene estadísticas reales.",
    get_toolpath_chunk:
      "Carga un bloque de segmentos para el visor 3D. Uso desde la interfaz, no cargar todos los bloques al contexto.",
    begin_import:
      "Inicia la importación de un 3MF seleccionado por el usuario en la interfaz. No usar para copiar adjuntos sin acceso.",
    append_import:
      "Escribe y valida un bloque de un 3MF seleccionado por el usuario; devuelve la ruta relativa cuando termina.",
    get_result_chunk:
      "Carga un bloque binario base64 del 3MF resultado para descarga desde la interfaz.",
  };
  for (const name of Object.keys(toolSchemas) as ToolName[]) {
    const ui = ["open_preview", "open_demo", "slice_project"].includes(name);
    const hidden = [
      "get_toolpath_chunk",
      "get_result_chunk",
      "begin_import",
      "append_import",
    ].includes(name);
    const meta = {
      ...(ui || hidden
        ? {
            ui: {
              resourceUri: VIEW_URI,
              visibility: hidden
                ? ["app" as const]
                : ["model" as const, "app" as const],
            },
          }
        : {}),
      "openai/widgetAccessible": true,
      ...(ui ? { "openai/outputTemplate": VIEW_URI } : {}),
    };
    const callback = async (args: unknown) => {
      try {
        const data = await callService(service, name, args);
        return {
          content: [
            {
              type: "text" as const,
              text: hidden ? "Bloque cargado" : JSON.stringify(data),
            },
          ],
          structuredContent: data,
        };
      } catch (e) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: e instanceof Error ? e.message : String(e),
            },
          ],
        };
      }
    };
    const config = {
      description: descriptions[name],
      inputSchema: toolSchemas[name],
      annotations: {
        readOnlyHint: ![
          "slice_project",
          "cancel_job",
          "begin_import",
          "append_import",
        ].includes(name),
        destructiveHint: name === "cancel_job",
        openWorldHint: false,
      },
      _meta: meta,
    };
    if (ui || hidden) registerAppTool(server, name, config, callback);
    else server.registerTool(name, config, callback);
  }
  registerAppResource(
    server,
    "Vista previa de laminado",
    VIEW_URI,
    {},
    async () => ({
      contents: [
        {
          uri: VIEW_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: await readFile(htmlPath, "utf8"),
          _meta: {
            ui: {
              csp: { connectDomains: [], resourceDomains: [] },
              prefersBorder: true,
            },
            "openai/widgetDescription":
              "Visor interactivo de trayectorias 3D con selección de capas, tiempo y consumo de filamento.",
            "openai/widgetPrefersBorder": true,
            "openai/widgetCSP": { connect_domains: [], resource_domains: [] },
          },
        },
      ],
    }),
  );
  return server;
}
