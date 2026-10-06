import { it, expect, beforeEach, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createService } from "../src/service.js";
import { createMcpServer } from "../src/tools.js";
import { zipFixture } from "./zip-fixture.js";
let dir: string, client: Client;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "mcp-"));
  await mkdir(join(dir, "projects"));
  await writeFile(
    join(dir, "projects", "sliced.3mf"),
    zipFixture({ "Metadata/plate_1.gcode": "G1 X1 E1\nG1 X2 E2" }),
  );
  await writeFile(join(dir, "view.html"), "<html>visor</html>");
  const svc = createService({
    engine: "",
    projects: join(dir, "projects"),
    jobs: join(dir, "jobs"),
    timeoutMs: 1000,
    maxConcurrent: 1,
    maxSegments: 100,
    maxFileBytes: 100000,
    maxExpandedBytes: 100000,
    maxJobs: 10,
  });
  const server = createMcpServer(svc, join(dir, "view.html"));
  client = new Client({ name: "test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
});
afterEach(async () => {
  await client.close();
  await rm(dir, { recursive: true, force: true });
});
it("discovers tools and MCP app resource with UI metadata", async () => {
  const tools = await client.listTools();
  expect(tools.tools.map((t) => t.name)).toContain("open_preview");
  expect(
    tools.tools.find((t) => t.name === "open_preview")?._meta,
  ).toMatchObject({ "openai/outputTemplate": "ui://laminador/preview.html" });
  expect((await client.listResources()).resources[0].mimeType).toContain(
    "mcp-app",
  );
  expect(
    (await client.readResource({ uri: "ui://laminador/preview.html" }))
      .contents[0],
  ).toMatchObject({ text: "<html>visor</html>" });
});
it("returns harmless missing engine status and project list", async () => {
  const status = await client.callTool({
    name: "engine_status",
    arguments: {},
  });
  expect(status.structuredContent).toMatchObject({ available: false });
  const list = await client.callTool({ name: "list_projects", arguments: {} });
  expect(list.structuredContent).toMatchObject({ projects: ["sliced.3mf"] });
});
it("opens existing sliced 3mf and paginates actual geometry", async () => {
  const preview = await client.callTool({
    name: "open_preview",
    arguments: { project: "sliced.3mf" },
  });
  const data = preview.structuredContent as { previewId: string };
  expect(data.previewId).toBeTruthy();
  const first = await client.callTool({
    name: "get_toolpath_chunk",
    arguments: { previewId: data.previewId, plate: 1, offset: 0, limit: 1 },
  });
  expect(first.structuredContent).toMatchObject({ nextOffset: 1, total: 2 });
  const next = await client.callTool({
    name: "get_toolpath_chunk",
    arguments: { previewId: data.previewId, plate: 1, offset: 1, limit: 1 },
  });
  expect(next.structuredContent).toMatchObject({ nextOffset: null, total: 2 });
});
it("reports invalid identifiers as useful tool errors", async () => {
  const r = await client.callTool({
    name: "job_status",
    arguments: { jobId: "missing" },
  });
  expect(r.isError).toBe(true);
  expect(JSON.stringify(r.content)).toContain("no encontrado");
});
