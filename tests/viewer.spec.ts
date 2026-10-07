import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hostTestHtml } from "./host-test-fixture.js";
import { test, expect, type Page } from "@playwright/test";
test("navigates 3D preview and filters actual rendered geometry", async ({
  page,
}) => {
  // Shared CI runners render rounded beads in software; allow time for the
  // repeated full-canvas captures without dropping any navigation assertions.
  if (process.env.CI) test.setTimeout(300000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?demo=1");
  await expect(page.locator("#status")).toContainText("trayectorias cargadas", {
    timeout: 30000,
  });
  await expect(page.locator("#source")).toContainText("demostración");
  await expect(page.locator("#total-time")).toContainText("No disponible");
  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible();
  const before = await canvas.screenshot();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.6, {
    steps: 12,
  });
  await page.mouse.up();
  await page.waitForTimeout(200);
  expect(Buffer.compare(before, await canvas.screenshot())).not.toBe(0);
  await page.mouse.wheel(0, -250);
  await page.waitForTimeout(200);
  const zoomed = await canvas.screenshot();
  expect(Buffer.compare(before, zoomed)).not.toBe(0);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.65, {
    steps: 8,
  });
  await page.mouse.up({ button: "right" });
  await page.waitForTimeout(150);
  expect(Buffer.compare(zoomed, await canvas.screenshot())).not.toBe(0);
  await page.locator("#layer-end").fill("8");
  await page.locator("#layer-end").dispatchEvent("input");
  await expect(page.locator("#layer-label")).toContainText("8 / 90");
  await page.locator("#travels").check();
  await page.locator("#color-mode").selectOption("speed");
  await page.getByRole("button", { name: "Vista superior" }).click();
  await page.getByRole("button", { name: "Encuadrar" }).click();
  await expect(page.locator(".timeline")).toHaveCount(0);
  await page.screenshot({
    path: join(tmpdir(), "laminador-preview.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("has an accessible empty state and shows invalid project errors", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#empty")).toBeVisible();
  await page.locator("#project-path").fill("../fuera.3mf");
  await page.getByRole("button", { name: "Abrir laminado" }).click();
  await expect(page.locator("#status")).toContainText(
    /no such|ruta|carpeta|ENOENT/i,
  );
  await page.setViewportSize({ width: 600, height: 800 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("imports and displays the real Bambu 3MF with source statistics", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.locator("#upload").setInputFiles("examples/cubo-p2s-laminado.3mf");
  await expect(page.locator("#status")).toContainText("Proyecto importado");
  await page.getByRole("button", { name: "Abrir laminado" }).click();
  await expect(page.locator("#status")).toContainText("trayectorias cargadas");
  await expect(page.locator("#total-time")).toHaveText("11 min 50 s");
  await expect(page.locator("#weight")).toHaveText("2,11 g");
  await expect(page.locator("#layer-label")).toContainText("50 / 50");
  await expect(page.locator("#seam-count")).toContainText("50 / 50");
  const allPaths = await page.locator("#segment-count").textContent();
  await page.locator("#seams").uncheck();
  await expect(page.locator("#seam-count")).toContainText("0 / 50");
  await expect(page.locator("#segment-count")).toHaveText(allPaths!);
  await page.locator("#seams").check();
  await page.locator("#single-layer").check();
  await expect(page.locator("#seam-count")).toContainText("1 / 50");
  await page.getByRole("button", { name: "Vista superior" }).click();
  await page.screenshot({
    path: join(tmpdir(), "laminador-real-preview.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("renders the same viewer through the MCP App iframe transport", async ({
  page,
}) => {
  const response = await page.request.get("/");
  const html = await response.text();
  const token = html.match(/name="laminador-token" content="([^"]+)"/)![1];
  await page.route("**/host-test", (route) =>
    route.fulfill({ contentType: "text/html", body: hostTestHtml(token) }),
  );
  await page.goto("/host-test");
  const frame = page.frameLocator("iframe");
  await frame.getByRole("button", { name: "Probar el visor 3D" }).click();
  await expect(frame.locator("#status")).toContainText(
    "trayectorias cargadas",
    { timeout: 30000 },
  );
  await expect(frame.locator("canvas")).toBeVisible();
  await expect(frame.locator("#source")).toContainText("demostración");
  const embedded = (await frame.locator("#viewport").boundingBox())!;
  await page.goto("/?demo=1");
  await expect(page.locator("#status")).toContainText("trayectorias cargadas");
  const browser = (await page.locator("#viewport").boundingBox())!;
  expect(Math.abs(embedded.width - browser.width)).toBeLessThan(2);
  expect(Math.abs(embedded.height - browser.height)).toBeLessThan(2);
});

test("loads ordered chunks concurrently and shows the complete preview at once", async ({
  page,
}) => {
  const requests: number[] = [];
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  await page.route("**/api/tool", async (route) => {
    const body = route.request().postDataJSON();
    if (body.name !== "get_toolpath_chunk") return route.continue();
    requests.push(body.arguments.offset);
    expect(body.arguments.limit).toBe(4000);
    if (body.arguments.offset === 0) await firstGate;
    const response = await route.fetch();
    await route.fulfill({ response });
  });
  try {
    await page.goto("/?demo=1");
    await expect.poll(() => requests.length).toBeGreaterThan(1);
    await expect(page.locator("#viewport")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    await expect(page.locator("canvas")).toBeHidden();
  } finally {
    releaseFirst();
  }
  await expect(page.locator("#status")).toContainText("trayectorias cargadas");
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.locator("#progress")).toHaveCount(0);
  await expect(page.locator("#play")).toHaveCount(0);
  const heights: number[] = [];
  for (const size of [
    { width: 1280, height: 720 },
    { width: 1800, height: 1080 },
  ]) {
    await page.setViewportSize(size);
    await expect
      .poll(() =>
        page.evaluate(() =>
          Math.round(
            document.querySelector(".workspace")!.getBoundingClientRect()
              .height,
          ),
        ),
      )
      .toBe(size.height);
    const box = (await page.locator("canvas").boundingBox())!;
    heights.push(box.height);
    expect(box.width).toBeGreaterThan(size.width - 350);
    expect(box.y + box.height).toBeLessThan(size.height);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= innerHeight,
      ),
    ).toBe(true);
  }
  expect(heights[1]).toBeGreaterThan(heights[0] + 300);
});

async function chatPreviews(page: Page) {
  const html = await (await page.request.get("/")).text();
  const token = html.match(/name="laminador-token" content="([^"]+)"/)![1];
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const response = await page.request.post("/api/tool", {
      headers: { "X-Laminador-Token": token },
      data: { name, arguments: args },
    });
    const result = await response.json();
    if (result.isError) throw Error(result.content[0].text);
    return result.structuredContent;
  };
  const bytes = await readFile("examples/cubo-p2s-laminado.3mf");
  const upload = await call("begin_import", { size: bytes.length });
  let imported;
  for (let offset = 0; offset < bytes.length; offset += 65536) {
    imported = await call("append_import", {
      uploadId: upload.uploadId,
      offset,
      base64: bytes.subarray(offset, offset + 65536).toString("base64"),
    });
  }
  return {
    token,
    demo: await call("open_demo"),
    real: await call("open_preview", { project: imported.project }),
  };
}

async function openChatBridge(
  page: Page,
  token: string,
  initial: Record<string, unknown>,
) {
  await page.addInitScript(
    ({ token, initial }) => {
      if (window.parent === window) return;
      (window as any).openai = {
        toolOutput: initial,
        callTool: async (name: string, args: Record<string, unknown>) => {
          const response = await fetch("/api/tool", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Laminador-Token": token,
            },
            body: JSON.stringify({ name, arguments: args }),
          });
          return response.json();
        },
      };
    },
    { token, initial },
  );
  await page.route("**/chat-test", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<iframe src="/" style="width:100%;height:900px;border:0"></iframe>',
    }),
  );
  await page.goto("/chat-test");
  return page.frameLocator("iframe");
}

async function pushChatResult(page: Page, data: Record<string, unknown>) {
  await page
    .frameLocator("iframe")
    .locator("body")
    .evaluate((_, data) => {
      (window as any).openai.toolOutput = data;
      window.dispatchEvent(
        new CustomEvent("openai:set_globals", {
          detail: { globals: { toolOutput: data } },
        }),
      );
    }, data);
}

test("receives a second chat preview while the initial preview is still loading", async ({
  page,
}) => {
  const { token, demo, real } = await chatPreviews(page);
  let release!: () => void;
  let waiting = false;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/tool", async (route) => {
    const body = route.request().postDataJSON();
    if (
      body.name === "get_toolpath_chunk" &&
      body.arguments.previewId === demo.previewId
    ) {
      waiting = true;
      await gate;
    }
    await route.continue();
  });
  const frame = await openChatBridge(page, token, demo);
  try {
    await expect.poll(() => waiting).toBe(true);
    await pushChatResult(page, real);
  } finally {
    release();
  }
  await expect(frame.locator("#source")).toContainText("Datos de Bambu", {
    timeout: 3000,
  });
  await expect(frame.locator("#total-time")).toHaveText("11 min 50 s");
  await expect(frame.locator("#layer-label")).toHaveText("50 / 50");
  await expect(frame.locator("#seam-count")).toContainText("50 / 50");
});

for (const stage of ["job_status", "open_preview"]) {
  test(`a late ${stage} from an older job cannot replace the latest chat preview`, async ({
    page,
  }) => {
    const { token, demo, real } = await chatPreviews(page);
    let release!: () => void;
    let waiting = false;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/tool", async (route) => {
      const body = route.request().postDataJSON();
      if (body.name === "job_status") {
        if (stage === "job_status") {
          waiting = true;
          await gate;
        }
        return route.fulfill({
          json: {
            structuredContent: {
              state: "completed",
              message: "Old job complete",
            },
          },
        });
      }
      if (
        body.name === "open_preview" &&
        body.arguments.jobId === "older-job"
      ) {
        if (stage === "open_preview") {
          waiting = true;
          await gate;
        }
        return route.fulfill({ json: { structuredContent: demo } });
      }
      await route.continue();
    });
    const frame = await openChatBridge(page, token, demo);
    await expect(frame.locator("#status")).toContainText(
      "trayectorias cargadas",
    );
    try {
      await pushChatResult(page, { id: "older-job", state: "running" });
      await expect.poll(() => waiting).toBe(true);
      await pushChatResult(page, real);
      await expect(frame.locator("#source")).toContainText("Datos de Bambu");
    } finally {
      release();
    }
    await expect(frame.locator("#cancel")).toBeHidden({ timeout: 3000 });
    await expect(frame.locator("#viewport")).toHaveAttribute(
      "aria-busy",
      "false",
    );
    await expect(frame.locator("#source")).toContainText("Datos de Bambu");
    await expect(frame.locator("#total-time")).toHaveText("11 min 50 s");
  });
}

test("updates the same MCP iframe across repeated tool invocations", async ({
  page,
}) => {
  const { token, demo, real } = await chatPreviews(page);
  await page.route("**/host-test", (route) =>
    route.fulfill({ contentType: "text/html", body: hostTestHtml(token) }),
  );
  await page.goto("/host-test");
  const frame = page.frameLocator("iframe");
  await frame.getByRole("button", { name: "Probar el visor 3D" }).click();
  await expect(frame.locator("#status")).toContainText("trayectorias cargadas");
  for (const data of [real, demo, real]) {
    await page.evaluate((data) => {
      const child = document.querySelector("iframe")!.contentWindow!;
      child.postMessage(
        {
          jsonrpc: "2.0",
          method: "ui/notifications/tool-result",
          params: { structuredContent: data, content: [] },
        },
        location.origin,
      );
    }, data);
    await expect(frame.locator("#source")).toContainText(
      data.demo ? "demostración" : "Datos de Bambu",
    );
    await expect(frame.locator("#viewport")).toHaveAttribute(
      "aria-busy",
      "false",
    );
    await expect(frame.locator("#layer-label")).toHaveText(
      data.demo ? "90 / 90" : "50 / 50",
    );
    await expect(frame.locator("#total-time")).toHaveText(
      data.demo ? "No disponible" : "11 min 50 s",
    );
  }
});

test("reports a failure loading the latest job instead of silently keeping the previous preview", async ({
  page,
}) => {
  const { token, demo, real } = await chatPreviews(page);
  await page.route("**/api/tool", async (route) => {
    const body = route.request().postDataJSON();
    if (body.name === "job_status")
      return route.fulfill({
        json: {
          structuredContent: {
            state: "completed",
            message: "Latest job complete",
          },
        },
      });
    if (body.name === "open_preview" && body.arguments.jobId === "latest-job")
      return route.fulfill({
        json: {
          structuredContent: { ...real, previewId: "missing-latest-preview" },
        },
      });
    await route.continue();
  });
  const frame = await openChatBridge(page, token, demo);
  await expect(frame.locator("#status")).toContainText("trayectorias cargadas");
  await pushChatResult(page, { id: "latest-job", state: "completed" });
  await expect(frame.locator("#status")).toContainText(
    "Vista previa no encontrada",
  );
  await expect(frame.locator("footer")).toHaveClass(/error/);
});

test("redraws the loaded preview after WebGL context restoration", async ({
  page,
}) => {
  await page.goto("/?demo=1");
  await expect(page.locator("#status")).toContainText("trayectorias cargadas");
  const canvas = page.locator("canvas");
  await page.waitForTimeout(400);
  const loaded = await canvas.screenshot();
  await canvas.evaluate(async (canvas) => {
    const gl = (canvas as HTMLCanvasElement).getContext("webgl2")!;
    const extension = gl.getExtension("WEBGL_lose_context")!;
    const lost = new Promise<void>((resolve) =>
      canvas.addEventListener("webglcontextlost", () => resolve(), {
        once: true,
      }),
    );
    (canvas as unknown as { restoreContext: () => void }).restoreContext = () =>
      extension.restoreContext();
    extension.loseContext();
    await lost;
  });
  const blank = await canvas.screenshot();
  expect(Buffer.compare(loaded, blank)).not.toBe(0);
  await canvas.evaluate(async (canvas) => {
    const restored = new Promise<void>((resolve) =>
      canvas.addEventListener("webglcontextrestored", () => resolve(), {
        once: true,
      }),
    );
    (canvas as unknown as { restoreContext: () => void }).restoreContext();
    await restored;
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  });
  expect(Buffer.compare(blank, await canvas.screenshot())).not.toBe(0);
  await expect(page.locator("#source")).toContainText("demostración");
});

test("keeps the loaded scene when a cached page is hidden and restored", async ({
  page,
}) => {
  await page.goto("/?demo=1");
  await expect(page.locator("#status")).toContainText("trayectorias cargadas");
  const canvas = page.locator("canvas");
  await page.waitForTimeout(400);
  const loaded = await canvas.screenshot();
  await page.evaluate(() =>
    window.dispatchEvent(
      new PageTransitionEvent("pagehide", { persisted: true }),
    ),
  );
  await page.setViewportSize({ width: 900, height: 700 });
  await page.waitForTimeout(100);
  await page.setViewportSize({ width: 1280, height: 850 });
  await page.evaluate(() =>
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    ),
  );
  await page.waitForTimeout(200);
  expect(Buffer.compare(loaded, await canvas.screenshot())).toBe(0);
  await page.getByRole("button", { name: "Vista superior" }).click();
  await page.waitForTimeout(200);
  expect(Buffer.compare(loaded, await canvas.screenshot())).not.toBe(0);
});

for (const embedded of [false, true]) {
  test(`collapses and restores panels without losing the preview (${embedded ? "MCP iframe" : "browser"})`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let view: Page | ReturnType<Page["frameLocator"]> = page;
    if (embedded) {
      const html = await (await page.request.get("/")).text();
      const token = html.match(/name="laminador-token" content="([^"]+)"/)![1];
      await page.route("**/host-test", (route) =>
        route.fulfill({ contentType: "text/html", body: hostTestHtml(token) }),
      );
      await page.goto("/host-test");
      view = page.frameLocator("iframe");
      await view.getByRole("button", { name: "Probar el visor 3D" }).click();
    } else await page.goto("/?demo=1");
    await expect(view.locator("#status")).toContainText(
      "trayectorias cargadas",
    );
    const visiblePaths = await view.locator("#segment-count").textContent();
    const layer = await view.locator("#layer-label").textContent();
    const viewport = view.locator("#viewport");
    const before = (await viewport.boundingBox())!;
    const topToggle = view.locator("#toggle-top");
    const sideToggle = view.locator("#toggle-inspector");
    await expect(topToggle).toHaveAttribute("aria-expanded", "true");
    await expect(sideToggle).toHaveAttribute("aria-expanded", "true");
    await topToggle.focus();
    await topToggle.press("Enter");
    await expect(view.locator("#top-controls")).toBeHidden();
    await expect(topToggle).toHaveAttribute("aria-expanded", "false");
    await expect
      .poll(async () => (await viewport.boundingBox())!.height)
      .toBeGreaterThan(before.height + 100);
    await sideToggle.click();
    await expect(view.locator("#inspector")).toBeHidden();
    await expect(sideToggle).toHaveAttribute("aria-expanded", "false");
    await expect
      .poll(async () => (await viewport.boundingBox())!.width)
      .toBeGreaterThan(before.width + 200);
    await expect(view.locator("canvas")).toBeVisible();
    await expect(view.locator("#segment-count")).toHaveText(visiblePaths!);
    await sideToggle.press("Space");
    await topToggle.click();
    await expect(view.locator("#top-controls")).toBeVisible();
    await expect(view.locator("#inspector")).toBeVisible();
    await expect(view.locator("#layer-label")).toHaveText(layer!);
    await expect(view.locator("#source")).toContainText("demostración");
    await page.setViewportSize({ width: 390, height: 800 });
    await topToggle.click();
    await sideToggle.click();
    await expect(topToggle).toBeVisible();
    await expect(sideToggle).toBeVisible();
    await expect(view.locator("canvas")).toBeVisible();
    expect(
      await view
        .locator("body")
        .evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true);
    await sideToggle.click();
    await topToggle.click();
    await expect(view.locator("#inspector")).toBeVisible();
    expect(errors).toEqual([]);
  });
}
