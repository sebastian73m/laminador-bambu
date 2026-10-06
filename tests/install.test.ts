import { describe, it, expect } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
// The generator has no host npm/runtime dependency beyond Node.
// @ts-expect-error Standalone distribution script, exercised through real files.
import { dockerMcp, generateDockerPlugin } from "../scripts/docker-plugin.mjs";

describe("Docker plugin installation", () => {
  it.each(["windows", "linux"])(
    "generates a portable %s marketplace without losing the MCP schema",
    async (platform) => {
      const dir = await mkdtemp(join(tmpdir(), "laminador-install-"));
      const output = join(dir, "installation with spaces");
      try {
        const result = await generateDockerPlugin({
          output,
          platform,
          container: "laminador-test",
        });
        const plugin = join(output, "plugins", "laminador-bambu");
        const mcp = JSON.parse(
          await readFile(join(plugin, "mcp.json"), "utf8"),
        );
        expect(mcp.$schema).toBe(
          "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
        );
        const server = mcp.mcpServers["laminador-bambu"];
        expect(server.command).toBe(
          platform === "windows" ? "docker.exe" : "docker",
        );
        expect(server.args).toEqual([
          "exec",
          "-i",
          "laminador-test",
          "node",
          "/app/dist/server.js",
          "--stdio",
        ]);
        const manifest = JSON.parse(
          await readFile(join(plugin, "plugin.json"), "utf8"),
        );
        const original = JSON.parse(await readFile("plugin.json", "utf8"));
        expect(manifest).toEqual(original);
        expect(
          await readFile(
            join(plugin, "skills", "laminar-3mf", "SKILL.md"),
            "utf8",
          ),
        ).toContain("slice_project");
        const marketplace = JSON.parse(
          await readFile(result.marketplacePath, "utf8"),
        );
        expect(marketplace.plugins[0].source.path).toBe(
          "./plugins/laminador-bambu",
        );
        // A second export must not overwrite a marketplace or cached plugin silently.
        await expect(
          generateDockerPlugin({ output, platform }),
        ).rejects.toThrow();
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  );
  it("rejects unsupported platforms and option-like container names", () => {
    expect(() => dockerMcp("mac")).toThrow();
    expect(() => dockerMcp("linux", "--privileged")).toThrow();
  });
});
