import express from "express";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { fileURLToPath } from "node:url";
import { resolve, join } from "node:path";
import { readFile, mkdir } from "node:fs/promises";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { readConfig } from "./config.js";
import { createService } from "./service.js";
import { createMcpServer, callService } from "./tools.js";
const config = readConfig();
const service = createService(config);
// Works from src/server.ts and dist/server.js (both are one directory below package root).
const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const htmlPath = join(packageRoot, "dist", "viewer", "index.html");
await mkdir(config.projects, { recursive: true });
await mkdir(config.jobs, { recursive: true });
const shutdown = async () => {
  await service.jobs.shutdown();
  process.exit(0);
};
process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());
if (process.argv.includes("--stdio")) {
  await createMcpServer(service, htmlPath).connect(new StdioServerTransport());
  console.error("Laminador MCP stdio listo");
} else {
  const port = Number(process.env.PORT ?? 4319);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535)
    throw Error("PORT inválido");
  const web = createMcpExpressApp({ host: "127.0.0.1" });
  const token = randomBytes(32).toString("base64url");
  // Browser operations require same origin and a per-start token. MCP is loopback-only;
  // connect it via an authenticated private tunnel, never an anonymous public forwarder.
  web.use((req, res, next) => {
    const origin = req.get("origin");
    if (
      origin &&
      origin !== `http://127.0.0.1:${port}` &&
      origin !== `http://localhost:${port}`
    ) {
      res.status(403).json({ error: "Origen no autorizado" });
      return;
    }
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
  });
  web.get("/", async (_req, res, next) => {
    try {
      const html = await readFile(htmlPath, "utf8");
      res.setHeader("Cache-Control", "no-store");
      res
        .type("html")
        .send(
          html.replace(
            "</head>",
            `<meta name="laminador-token" content="${token}"></head>`,
          ),
        );
    } catch (e) {
      next(e);
    }
  });
  web.get("/health", (_req, res) => res.json({ ok: true }));
  web.use("/api", (req, res, next) => {
    const supplied = Buffer.from(req.get("x-laminador-token") ?? ""),
      expected = Buffer.from(token);
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    ) {
      res.status(403).json({ error: "Token local inválido" });
      return;
    }
    next();
  });
  web.post("/api/tool", async (req, res) => {
    try {
      const data = await callService(
        service,
        req.body.name,
        req.body.arguments ?? {},
      );
      res.json({
        content: [{ type: "text", text: "Datos cargados" }],
        structuredContent: data,
      });
    } catch (e) {
      res.status(400).json({
        isError: true,
        content: [
          { type: "text", text: e instanceof Error ? e.message : String(e) },
        ],
      });
    }
  });
  web.post("/mcp", async (req, res) => {
    const server = createMcpServer(service, htmlPath);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (e) {
      if (!res.headersSent)
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: e instanceof Error ? e.message : String(e),
          },
          id: null,
        });
    }
  });
  web.all("/mcp", (_req, res) => res.status(405).set("Allow", "POST").end());
  web.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res.status(400).json({ error: err.message });
    },
  );
  const listener = web.listen(port, "127.0.0.1", () =>
    console.error(
      `Visor: http://127.0.0.1:${port}\nMCP: http://127.0.0.1:${port}/mcp\nProyectos: ${config.projects}`,
    ),
  );
  listener.on("error", (e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
}
