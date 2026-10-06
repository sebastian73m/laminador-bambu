import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { parseArgs } from "node:util";
import { cp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import assert from "node:assert/strict";

const { values } = parseArgs({
  options: {
    container: { type: "string" },
    http: { type: "string" },
    slice: { type: "boolean", default: false },
    project: { type: "string" },
  },
});
const client = new Client({ name: "laminador-diagnostics", version: "0.1.1" });
const serviceEnv = Object.fromEntries(
  [
    "BAMBU_STUDIO_PATH",
    "PROJECTS_DIR",
    "JOBS_DIR",
    "SLICE_TIMEOUT_MS",
    "MAX_CONCURRENT_JOBS",
    "MAX_JOBS",
    "MAX_SEGMENTS",
    "MAX_FILE_BYTES",
    "MAX_EXPANDED_BYTES",
  ]
    .filter((name) => process.env[name] !== undefined)
    .map((name) => [name, process.env[name]]),
);
const transport = values.http
  ? new StreamableHTTPClientTransport(new URL(values.http))
  : new StdioClientTransport(
      values.container
        ? {
            command: process.platform === "win32" ? "docker.exe" : "docker",
            args: [
              "exec",
              "-i",
              values.container,
              "node",
              "/app/dist/server.js",
              "--stdio",
            ],
            stderr: "inherit",
          }
        : {
            command: process.execPath,
            args: ["dist/server.js", "--stdio"],
            // SDK deliberately forwards a minimal environment; pass only our
            // service configuration so this non-root probe uses /projects, /jobs.
            env: serviceEnv,
            stderr: "inherit",
          },
    );
const call = async (name, args = {}) => {
  const response = await client.callTool({ name, arguments: args });
  if (response.isError) throw Error(JSON.stringify(response.content));
  return response.structuredContent;
};
let imported;
try {
  await client.connect(transport);
  const tools = (await client.listTools()).tools.map((t) => t.name);
  assert.equal(tools.length, 12);
  assert(tools.includes("slice_project") && tools.includes("open_preview"));
  const engine = await call("engine_status");
  assert.equal(engine.available, true, engine.message);
  assert.equal(engine.cli, true, engine.message);
  const ui = await client.readResource({ uri: "ui://laminador/preview.html" });
  assert(
    ui.contents[0].text.includes("<canvas") ||
      ui.contents[0].text.includes("viewport"),
  );
  const projects = await call("list_projects");
  const demo = await call("open_demo");
  assert(demo.plates[0].segmentCount > 0);
  const report = {
    transport: values.http ? "http" : "stdio",
    tools,
    engine,
    uiBytes: ui.contents[0].text.length,
    projects: projects.projects.length,
  };
  if (values.project) {
    const preview = await call("open_preview", { project: values.project });
    assert(preview.plates[0].segmentCount > 0);
    report.preview = {
      project: values.project,
      segmentCount: preview.plates[0].segmentCount,
      seamCount: preview.plates[0].seamCount,
      statistics: preview.plates[0].statistics,
    };
  }
  if (values.slice) {
    // In-container operation: preserve the checked-in example and all user files.
    const source = "examples/cubo-p2s-proyecto.3mf";
    const digest = async () =>
      createHash("sha256")
        .update(await readFile(source))
        .digest("hex");
    const before = await digest();
    const project = `diagnostico-${randomUUID()}.3mf`;
    imported = join(process.env.PROJECTS_DIR ?? "projects", project);
    await cp(source, imported, { errorOnExist: true, force: false });
    const inspected = await call("inspect_project", { project });
    assert.deepEqual(
      inspected.slicedPlates,
      [],
      "Diagnostic input must not contain cached G-code",
    );
    const job = await call("slice_project", { project, plate: 0 });
    let state;
    const deadline = Date.now() + 120000;
    do {
      state = await call("job_status", { jobId: job.id });
      if (["completed", "failed", "cancelled"].includes(state.state)) break;
      await new Promise((r) => setTimeout(r, 300));
    } while (Date.now() < deadline);
    assert.equal(state.state, "completed", state.message + "\n" + state.log);
    const preview = await call("open_preview", { jobId: job.id });
    const plate = preview.plates[0];
    assert.equal(plate.statistics.weightG, 2.11);
    assert.equal(plate.statistics.totalSeconds, 710);
    assert.equal(plate.statistics.printSeconds, 291);
    assert.equal(plate.layers.filter((l) => l.index > 0).length, 50);
    assert(plate.segmentCount > 2000);
    assert(plate.seamCount > 0);
    assert.equal(await digest(), before, "Original example changed");
    report.slice = {
      jobId: job.id,
      segmentCount: plate.segmentCount,
      seamCount: plate.seamCount,
      statistics: plate.statistics,
      persistentResult: join(
        process.env.JOBS_DIR ?? ".jobs",
        job.id,
        "result.3mf",
      ),
      warnings: preview.warnings,
      engineLog: state.log,
    };
  }
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await client.close();
  if (imported) await rm(imported, { force: true });
}
