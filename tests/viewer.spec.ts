import { tmpdir } from "node:os";
import { join } from "node:path";
import { hostTestHtml } from "./host-test-fixture.js";
import { test, expect } from "@playwright/test";
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
  await page.locator("#progress").fill("50");
  await page.locator("#progress").dispatchEvent("input");
  await expect(page.locator("#progress-label")).toHaveText("50%");
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
});
