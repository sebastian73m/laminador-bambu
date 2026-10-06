import { parseArgs } from "node:util";
import { docker, validateContainer } from "./docker-cli.mjs";
import { checkCodexPlugin } from "./codex-plugin-check.mjs";
const { values } = parseArgs({
  options: {
    container: { type: "string", default: "laminador-bambu" },
    slice: { type: "boolean", default: false },
    marketplace: { type: "string" },
    "codex-command": { type: "string" },
    project: { type: "string" },
  },
});
try {
  const daemon = JSON.parse(await docker(["info", "--format", "{{json .}}"]));
  if (daemon.OSType !== "linux")
    throw Error("Cambia Docker Desktop a contenedores Linux");
  const container = validateContainer(
    JSON.parse(await docker(["inspect", values.container]))[0],
  );
  if (
    !(
      await fetch("http://127.0.0.1:4319/health", {
        signal: AbortSignal.timeout(5000),
      })
    ).ok
  )
    throw Error("No se puede acceder al servicio desde loopback del host");
  const stdio = JSON.parse(
    await docker([
      "exec",
      "-i",
      values.container,
      "node",
      "/app/scripts/mcp-smoke.mjs",
      ...(values.slice ? ["--slice"] : []),
      ...(values.project ? ["--project", values.project] : []),
    ]),
  );
  const http = JSON.parse(
    await docker([
      "exec",
      "-i",
      values.container,
      "node",
      "/app/scripts/mcp-smoke.mjs",
      "--http",
      "http://127.0.0.1:4319/mcp",
      ...(values.project ? ["--project", values.project] : []),
    ]),
  );
  const report = {
    daemon: { version: daemon.ServerVersion, os: daemon.OSType },
    container,
    stdio,
    http,
  };
  if (values.marketplace)
    report.codex = await checkCodexPlugin(
      values.marketplace,
      values["codex-command"],
    );
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
