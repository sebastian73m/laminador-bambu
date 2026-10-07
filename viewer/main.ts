import "./styles.css";
import { App } from "@modelcontextprotocol/ext-apps";
import { ToolpathScene, roleColor, type Filters } from "./scene";
import type { PlateSummary, Segment } from "../src/types";
interface Preview {
  previewId: string;
  jobId: string | null;
  demo: boolean;
  plates: PlateSummary[];
  warnings: string[];
}
interface ToolResult {
  structuredContent?: Record<string, unknown>;
  content?: { type: string; text?: string }[];
  isError?: boolean;
}
const el = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const input = (id: string) => el<HTMLInputElement>(id),
  select = (id: string) => el<HTMLSelectElement>(id);
let scene: ToolpathScene | undefined,
  app: App | undefined,
  current: Preview | undefined,
  plate: PlateSummary | undefined,
  loadVersion = 0,
  jobId: string | undefined,
  pollVersion = 0;
const hiddenRoles = new Set<string>();
let roles = new Set<string>();
const local = window.parent === window;
const token = document.querySelector<HTMLMetaElement>(
  'meta[name="laminador-token"]',
)?.content;
const openai = (
  window as unknown as {
    openai?: {
      callTool: (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<ToolResult>;
      toolOutput?: Record<string, unknown>;
      requestDisplayMode?: (args: { mode: string }) => Promise<unknown>;
      downloadFile?: (args: unknown) => Promise<unknown>;
    };
  }
).openai;
function status(text: string, error = false) {
  el("status").textContent = text;
  el("status").closest("footer")!.classList.toggle("error", error);
}
function error(e: unknown) {
  status(e instanceof Error ? e.message : String(e), true);
}
async function call(
  name: string,
  args: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  let result: ToolResult;
  if (local) {
    const response = await fetch("/api/tool", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Laminador-Token": token ?? "",
      },
      body: JSON.stringify({ name, arguments: args }),
    });
    result = await response.json();
    if (!response.ok)
      throw Error(result.content?.[0]?.text ?? "Error del servicio");
  } else if (openai) result = await openai.callTool(name, args);
  else if (app)
    result = (await app.callServerTool({
      name,
      arguments: args,
    })) as ToolResult;
  else throw Error("La conexión con el servicio no está lista");
  if (result.isError)
    throw Error(
      result.content?.find((c) => c.type === "text")?.text ??
        "Error de herramienta",
    );
  if (result.structuredContent) return result.structuredContent;
  const text = result.content?.find((c) => c.type === "text")?.text;
  if (text) {
    try {
      return JSON.parse(text);
    } catch {}
  }
  // Some older ChatGPT bridges unwrap structuredContent.
  if ("previewId" in result || "state" in result || "projects" in result)
    return result as Record<string, unknown>;
  throw Error("El servicio no devolvió datos estructurados");
}
function duration(seconds: number | null) {
  if (seconds === null) return "No disponible";
  const s = Math.round(seconds),
    h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60);
  return `${h ? `${h} h ` : ""}${m} min${s % 60 ? ` ${s % 60} s` : ""}`;
}
function amount(value: number | null, unit: string) {
  return value === null
    ? "No disponible"
    : `${value.toLocaleString("es", { maximumFractionDigits: 2 })} ${unit}`;
}
function statistics(p: PlateSummary) {
  const s = p.statistics;
  el("total-time").textContent = duration(s.totalSeconds);
  el("model-time").textContent = duration(s.printSeconds);
  el("weight").textContent = amount(s.weightG, "g");
  const lengths = s.filaments.map((f) => f.lengthMm);
  el("length").textContent = amount(
    lengths.length && lengths.every((n) => n !== null)
      ? lengths.reduce<number>((a, b) => a + (b ?? 0), 0) / 1000
      : null,
    "m",
  );
  el("source").textContent = current?.demo
    ? "Trayectorias de demostración · datos sintéticos"
    : `Datos de ${s.source} · ${p.name}`;
  el("filaments").replaceChildren();
  for (const f of s.filaments) {
    const row = document.createElement("div");
    row.className = "filament-row";
    const name = document.createElement("span");
    name.className = "filament-name";
    const swatch = document.createElement("span");
    swatch.className = "legend-swatch";
    const color = f.color?.replace(/^#/, "").slice(0, 6);
    if (color && /^[a-f0-9]{6}$/i.test(color))
      swatch.style.background = "#" + color;
    else swatch.style.background = roleColor(String(f.tool));
    name.append(
      swatch,
      document.createTextNode(`${f.type ?? "Filamento"} ${f.tool + 1}`),
    );
    const usage = document.createElement("span");
    usage.textContent = `${amount(f.weightG, "g")} · ${amount(f.lengthMm === null ? null : f.lengthMm / 1000, "m")}`;
    row.append(name, usage);
    el("filaments").append(row);
  }
}
function filters(): Filters {
  const end = Number(input("layer-end").value);
  return {
    start: input("single-layer").checked
      ? end
      : Number(input("layer-start").value),
    end,
    progress: 100,
    travels: input("travels").checked,
    seams: input("seams").checked,
    preparation: input("preparation").checked,
    mode: select("color-mode").value,
    hiddenRoles,
  };
}
function update() {
  if (!scene || !plate) return;
  if (Number(input("layer-start").value) > Number(input("layer-end").value))
    input("layer-start").value = input("layer-end").value;
  const f = filters();
  if (f.preparation && f.start === 1) f.start = 0;
  const visible = scene.apply(f);
  el("segment-count").textContent =
    `${visible.toLocaleString("es")} trayectorias visibles`;
  el("seam-count").textContent =
    `${scene.visibleSeams} / ${plate.seamCount ?? 0} costuras en las capas visibles`;
  el("layer-label").textContent =
    `${f.end} / ${Math.max(...plate.layers.map((l) => l.index))}`;
  el("start-label").textContent = String(f.start);
  el("end-label").textContent = String(f.end);
  const z = plate.layers.find((l) => l.index === f.end)?.z;
  el("layer-height").textContent =
    `Altura Z: ${z !== undefined ? amount(z, "mm") : "—"}`;
}
function legend() {
  el("legend").replaceChildren();
  for (const role of roles) {
    const label = document.createElement("label");
    label.className = "legend-item";
    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = !hiddenRoles.has(role);
    check.addEventListener("change", () => {
      if (check.checked) hiddenRoles.delete(role);
      else hiddenRoles.add(role);
      update();
    });
    const swatch = document.createElement("span");
    swatch.className = "legend-swatch";
    swatch.style.background = roleColor(role);
    label.append(check, swatch, document.createTextNode(role));
    el("legend").append(label);
  }
}
function warnings(messages: string[]) {
  el("warnings").hidden = messages.length === 0;
  el("warning-list").replaceChildren(
    ...messages.map((text) => {
      const li = document.createElement("li");
      li.textContent = text;
      return li;
    }),
  );
}
async function loadPlate(id: number) {
  if (!current) return;
  const version = ++loadVersion;
  plate = current.plates.find((p) => p.id === id);
  if (!plate) throw Error("Placa no encontrada");
  if (!scene) scene = new ToolpathScene(el("viewport"));
  scene.clear();
  el("viewport").setAttribute("aria-busy", "true");
  roles = new Set();
  hiddenRoles.clear();
  el("empty").hidden = true;
  el("loading").hidden = false;
  const max = Math.max(1, ...plate.layers.map((l) => l.index));
  for (const name of ["layer-start", "layer-end"]) {
    input(name).max = String(max);
    input(name).disabled = false;
  }
  input("layer-start").value = "1";
  input("layer-end").value = String(max);
  statistics(plate);
  warnings([...current.warnings, ...plate.warnings]);
  el("download").hidden = !current.jobId;
  try {
    const previewId = current.previewId;
    const segments: Segment[] = [];
    const chunkSize = 4000;
    for (let offset = 0; offset < plate.segmentCount; offset += chunkSize * 4) {
      const offsets = Array.from(
        { length: 4 },
        (_, i) => offset + i * chunkSize,
      ).filter((start) => start < plate!.segmentCount);
      const chunks = await Promise.all(
        offsets.map((start) =>
          call("get_toolpath_chunk", {
            previewId,
            plate: id,
            offset: start,
            limit: chunkSize,
          }),
        ),
      );
      if (version !== loadVersion) return;
      // Preserve G-code order even when requests finish out of order.
      for (const chunk of chunks) {
        for (const segment of chunk.segments as Segment[]) {
          segments.push(segment);
          roles.add(segment.role);
        }
      }
      status(
        `Cargando ${segments.length} / ${plate.segmentCount} trayectorias…`,
      );
    }
    // Build and filter once, rather than reprocessing every previously loaded
    // batch and rendering a partial model after each network round trip.
    scene.addChunk(segments, 0);
    scene.color(select("color-mode").value, plate);
    scene.fit();
    legend();
    update();
    status(
      `${plate.segmentCount.toLocaleString("es")} trayectorias cargadas${current.demo ? " · demostración sintética" : ""}.`,
    );
  } catch (e) {
    if (version === loadVersion) throw e;
  } finally {
    if (version === loadVersion) {
      el("loading").hidden = true;
      el("viewport").setAttribute("aria-busy", "false");
    }
  }
}
async function showPreview(data: Record<string, unknown>) {
  // A new preview supersedes any older job still polling or opening its result.
  ++pollVersion;
  jobId = undefined;
  busy(false);
  current = data as unknown as Preview;
  const options = current.plates.map((p) => {
    const o = document.createElement("option");
    o.value = String(p.id);
    o.textContent = p.name;
    return o;
  });
  select("plate-select").replaceChildren(...options);
  select("plate-select").disabled = false;
  await loadPlate(current.plates[0].id);
}
async function projects() {
  const data = await call("list_projects");
  el("projects-list").replaceChildren(
    ...(data.projects as string[]).map((p) => {
      const o = document.createElement("option");
      o.value = p;
      return o;
    }),
  );
}
function busy(value: boolean) {
  for (const id of ["slice", "open", "demo", "empty-demo"])
    el<HTMLButtonElement>(id).disabled = value;
  el("cancel").hidden = !value;
}
async function watchJob(id: string) {
  jobId = id;
  const version = ++pollVersion;
  busy(true);
  try {
    while (version === pollVersion) {
      const j = await call("job_status", { jobId: id });
      if (version !== pollVersion) return;
      status(String(j.message));
      if (j.state === "completed") {
        const data = await call("open_preview", { jobId: id });
        if (version !== pollVersion) return;
        return showPreview(data);
      }
      if (j.state === "failed" || j.state === "cancelled")
        throw Error(String(j.message));
      await new Promise((r) => setTimeout(r, 1000));
    }
  } catch (e) {
    if (version === pollVersion) throw e;
  } finally {
    if (version === pollVersion) {
      busy(false);
      jobId = undefined;
    }
  }
}
const on = (id: string, action: () => unknown) =>
  el(id).addEventListener("click", () => {
    Promise.resolve().then(action).catch(error);
  });
on("demo", async () => showPreview(await call("open_demo")));
on("empty-demo", async () => showPreview(await call("open_demo")));
on("open", async () => {
  ++pollVersion;
  await showPreview(
    await call("open_preview", { project: input("project-path").value.trim() }),
  );
});
on("slice", async () => {
  const data = await call("slice_project", {
    project: input("project-path").value.trim(),
    plate: Number(select("slice-plate").value),
  });
  await watchJob(String(data.id));
});
on("cancel", async () => {
  if (jobId) await call("cancel_job", { jobId });
});
function togglePanel(buttonId: string, panelId: string, name: string) {
  const panel = el(panelId);
  panel.hidden = !panel.hidden;
  const button = el(buttonId);
  button.setAttribute("aria-expanded", String(!panel.hidden));
  button.setAttribute(
    "aria-label",
    `${panel.hidden ? "Mostrar" : "Ocultar"} panel ${name}`,
  );
  button.textContent =
    panelId === "inspector"
      ? `Datos ${panel.hidden ? "◂" : "▸"}`
      : `Proyecto ${panel.hidden ? "▾" : "▴"}`;
  if (panelId === "inspector")
    el("inspector")
      .closest(".main")!
      .classList.toggle("inspector-collapsed", panel.hidden);
  // Resize the existing scene; keep camera, layers and loaded geometry intact.
  scene?.refresh();
}
on("toggle-top", () => togglePanel("toggle-top", "top-controls", "superior"));
on("toggle-inspector", () =>
  togglePanel("toggle-inspector", "inspector", "lateral"),
);
on("fit", () => scene?.fit());
on("top", () => scene?.fit(true));
on("fullscreen", async () => {
  if (local) {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } else if (openai?.requestDisplayMode)
    await openai.requestDisplayMode({ mode: "fullscreen" });
  else await app?.requestDisplayMode({ mode: "fullscreen" });
});
select("plate-select").addEventListener("change", () =>
  loadPlate(Number(select("plate-select").value)).catch(error),
);
for (const id of [
  "layer-start",
  "layer-end",
  "travels",
  "seams",
  "single-layer",
  "preparation",
])
  input(id).addEventListener("input", update);
select("color-mode").addEventListener("change", () => {
  if (plate) scene?.color(select("color-mode").value, plate);
  el("speed-legend").hidden = select("color-mode").value !== "speed";
  update();
});
on("download", async () => {
  if (!current?.jobId) return;
  status("Preparando descarga del 3MF…");
  const buffers: Uint8Array[] = [];
  let offset: number | null = 0;
  while (offset !== null) {
    const data = await call("get_result_chunk", {
      jobId: current.jobId,
      offset,
      limit: 262144,
    });
    if (Number(data.total) > 256 * 1024 * 1024)
      throw Error(
        "Resultado demasiado grande para descarga en la interfaz; usa JOBS_DIR",
      );
    buffers.push(
      Uint8Array.from(atob(String(data.base64)), (c) => c.charCodeAt(0)),
    );
    offset = data.nextOffset as number | null;
  }
  const blob = new Blob(buffers as BlobPart[], {
    type: "application/vnd.ms-package.3dmanufacturing-3dmodel+xml",
  });
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = "laminado.3mf";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  status("Descarga preparada.");
});
input("upload").addEventListener("change", async () => {
  try {
    const file = input("upload").files?.[0];
    if (!file) return;
    status("Importando archivo…");
    const started = await call("begin_import", { size: file.size });
    let offset = 0,
      project: string | undefined;
    while (offset < file.size) {
      const buffer = new Uint8Array(
        await file.slice(offset, offset + 65536).arrayBuffer(),
      );
      let binary = "";
      for (let i = 0; i < buffer.length; i += 8192)
        binary += String.fromCharCode(...buffer.subarray(i, i + 8192));
      const result = await call("append_import", {
        uploadId: started.uploadId,
        offset,
        base64: btoa(binary),
      });
      offset += buffer.length;
      project = result.project as string | undefined;
      status(`Importando ${Math.round((offset / file.size) * 100)}%…`);
    }
    if (!project) throw Error("La importación no terminó");
    input("project-path").value = project;
    await projects();
    status(
      `Proyecto importado: ${file.name}. Puedes laminarlo o abrir sus trayectorias si ya está laminado.`,
    );
  } catch (e) {
    error(e);
  } finally {
    input("upload").value = "";
  }
});
async function handleResult(data: Record<string, unknown> | undefined) {
  if (!data) return;
  if (data.previewId) await showPreview(data);
  else if (data.id && data.state) {
    ++loadVersion;
    await watchJob(String(data.id));
  }
}
async function init() {
  if (local) {
    el("fullscreen").textContent = "Pantalla completa";
    await projects();
    if (new URLSearchParams(location.search).get("demo") === "1")
      await showPreview(await call("open_demo"));
  } else {
    if (openai) {
      window.addEventListener("openai:set_globals", (event) => {
        const detail = (event as CustomEvent).detail;
        scene?.refresh();
        void handleResult(detail?.globals?.toolOutput).catch(error);
      });
      // Subscribe before the first asynchronous load: later tool results can
      // arrive while its chunks/job are still being fetched.
      await handleResult(openai.toolOutput);
      await projects();
    } else {
      app = new App(
        { name: "Laminador 3D", version: "0.1.3" },
        {},
        { autoResize: true },
      );
      app.ontoolresult = (result) => {
        void handleResult(result.structuredContent).catch(error);
      };
      app.onhostcontextchanged = () => scene?.refresh();
      await app.connect();
      await projects();
    }
  }
}
window.addEventListener("pageshow", () => scene?.refresh());
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") scene?.refresh();
});
window.addEventListener("pagehide", (event) => {
  // A persisted page is suspended, not destroyed. Its scene and in-flight
  // state must remain usable when the side browser restores the same page.
  if (event.persisted) return;
  ++loadVersion;
  ++pollVersion;
  scene?.dispose();
});
init().catch(error);
