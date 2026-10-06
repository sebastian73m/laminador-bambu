import { spawn } from "node:child_process";
import { access, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { docker, dockerCommand } from "./docker-cli.mjs";
import { dockerMcp, generateDockerPlugin } from "./docker-plugin.mjs";
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
try {
  const { values } = parseArgs({
    options: {
      output: { type: "string" },
      platform: {
        type: "string",
        default: process.platform === "win32" ? "windows" : "linux",
      },
      container: { type: "string", default: "laminador-bambu" },
      "skip-build": { type: "boolean", default: false },
    },
  });
  if (!values.output) throw Error("Falta --output <directorio nuevo>");
  dockerMcp(values.platform, values.container);
  const output = resolve(values.output);
  let exists = false;
  try {
    await access(output);
    exists = true;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (exists)
    throw Error(
      "La salida ya existe: elige otra carpeta para conservar la instalación anterior",
    );
  const os = (await docker(["info", "--format", "{{.OSType}}"])).trim();
  if (os !== "linux") throw Error("Docker debe usar contenedores Linux");
  await docker(["compose", "version"]);
  console.error("Iniciando servicio local con Compose…");
  const status = await new Promise((resolve, reject) => {
    const child = spawn(
      dockerCommand,
      [
        "compose",
        "-f",
        "compose.yaml",
        "up",
        ...(values["skip-build"] ? [] : ["--build"]),
        "--wait",
        "--wait-timeout",
        "120",
      ],
      {
        cwd: root,
        env: { ...process.env, LAMINADOR_CONTAINER_NAME: values.container },
        stdio: "inherit",
      },
    );
    child.on("error", reject);
    child.on("exit", resolve);
  });
  if (status !== 0)
    throw Error(
      "Compose falló; revisa docker compose logs antes de reinstalar",
    );
  await mkdir(dirname(output), { recursive: true });
  const result = await generateDockerPlugin({ ...values, output });
  console.log(
    JSON.stringify(
      {
        ...result,
        next: "Registra el directorio con codex plugin marketplace add, instala laminador-bambu@laminador-local y ejecuta docker-doctor.mjs",
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
