import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
export function dockerMcp(platform, container = "laminador-bambu") {
  if (!["windows", "linux"].includes(platform))
    throw Error("Usa windows o linux");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(container))
    throw Error("Nombre de contenedor inválido");
  return {
    $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
    mcpServers: {
      "laminador-bambu": {
        type: "stdio",
        command: platform === "windows" ? "docker.exe" : "docker",
        args: [
          "exec",
          "-i",
          container,
          "node",
          "/app/dist/server.js",
          "--stdio",
        ],
      },
    },
  };
}

export async function generateDockerPlugin({
  output,
  platform,
  container,
  marketplace = "laminador-local",
}) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(marketplace))
    throw Error("Marketplace inválido");
  const mcp = dockerMcp(platform, container);
  const manifest = JSON.parse(
    await readFile(join(root, "plugin.json"), "utf8"),
  );
  const dest = resolve(output);
  const plugin = join(dest, "plugins", manifest.name);
  // Dedicated output only: never merge with a user's existing marketplace.
  await mkdir(dirname(dest), { recursive: true });
  await mkdir(dest, { recursive: false });
  await mkdir(plugin, { recursive: true });
  await mkdir(join(dest, ".agents", "plugins"), { recursive: true });
  const json = (path, value) =>
    writeFile(path, JSON.stringify(value, null, 2) + "\n");
  await json(join(plugin, "plugin.json"), manifest);
  await json(join(plugin, "mcp.json"), mcp);
  await cp(join(root, "skills"), join(plugin, "skills"), { recursive: true });
  await cp(join(root, "LICENSE"), join(plugin, "LICENSE"));
  await cp(join(root, "docs", "docker.md"), join(plugin, "README.md"));
  await json(join(dest, ".agents", "plugins", "marketplace.json"), {
    name: marketplace,
    interface: { displayName: "Laminador Bambu local (Docker)" },
    plugins: [
      {
        name: manifest.name,
        source: { source: "local", path: `./plugins/${manifest.name}` },
        policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
        category: "Productivity",
      },
    ],
  });
  return {
    directory: dest,
    marketplacePath: join(dest, ".agents", "plugins", "marketplace.json"),
    pluginId: `${manifest.name}@${marketplace}`,
    version: manifest.version,
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const { values } = parseArgs({
      options: {
        output: { type: "string" },
        platform: {
          type: "string",
          default: process.platform === "win32" ? "windows" : "linux",
        },
        container: { type: "string", default: "laminador-bambu" },
        marketplace: { type: "string", default: "laminador-local" },
      },
    });
    if (!values.output) throw Error("Falta --output <directorio nuevo>");
    console.log(JSON.stringify(await generateDockerPlugin(values), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
