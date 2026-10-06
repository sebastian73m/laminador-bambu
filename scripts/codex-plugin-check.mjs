import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";

export async function checkCodexPlugin(
  marketplacePath,
  command = process.platform === "win32" ? "codex.exe" : "codex",
) {
  const path = resolve(marketplacePath);
  const marketplace = JSON.parse(await readFile(path, "utf8"));
  const pluginId = `laminador-bambu@${marketplace.name}`;
  // No model turn, login, config edits or direct MCP-server override. Discovery
  // must originate from the installed plugin through Codex's actual parser.
  const child = spawn(command, ["app-server"], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  const pending = new Map();
  let next = 0,
    logs = "";
  child.stderr.on("data", (data) => (logs += data));
  const fail = (error) => {
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(error);
    }
    pending.clear();
  };
  child.on("error", fail);
  child.stdin.on("error", fail);
  child.on("exit", () =>
    fail(Error(`Codex app-server stopped: ${logs.slice(-2000)}`)),
  );
  const lines = createInterface({ input: child.stdout });
  lines.on("line", (line) => {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    const p = pending.get(message.id);
    if (!p) return;
    pending.delete(message.id);
    clearTimeout(p.timer);
    if (message.error) p.reject(Error(JSON.stringify(message.error)));
    else p.resolve(message.result);
  });
  const call = (method, params) =>
    new Promise((resolve, reject) => {
      const id = ++next;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(Error(`Codex ${method} timed out`));
      }, 60000);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(JSON.stringify({ id, method, params }) + "\n");
    });
  try {
    await call("initialize", {
      clientInfo: { name: "laminador-plugin-check", version: "0.1.1" },
      capabilities: { experimentalApi: true },
    });
    child.stdin.write(JSON.stringify({ method: "initialized" }) + "\n");
    const { plugin } = await call("plugin/read", {
      pluginName: "laminador-bambu",
      marketplacePath: path,
    });
    assert(
      plugin.mcpServers.includes("laminador-bambu"),
      "Codex parser did not discover the MCP server: check mcp.json schema/command",
    );
    const inventory = await call("mcpServerStatus/list", {
      serverName: "laminador-bambu",
    });
    const server = inventory.data.find((s) => s.pluginId === pluginId);
    assert(
      server,
      "Plugin parsed but not connected. Install/enable the plugin and restart the host",
    );
    assert.equal(server.toolsError ?? null, null);
    assert.equal(Object.keys(server.tools).length, 12);
    assert(
      server.resources.some((r) => r.uri === "ui://laminador/preview.html"),
    );
    return {
      pluginId,
      mcpServers: plugin.mcpServers,
      toolCount: Object.keys(server.tools).length,
      toolsError: server.toolsError ?? null,
      uiResource: "ui://laminador/preview.html",
    };
  } finally {
    for (const p of pending.values()) clearTimeout(p.timer);
    pending.clear();
    lines.close();
    child.kill();
  }
}
