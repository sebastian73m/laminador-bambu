import { afterEach, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { request } from "node:http";
import { readHttpConfig } from "../src/http-config.js";

let child: ChildProcess | undefined;
let dir: string | undefined;
afterEach(async () => {
  if (child && child.exitCode === null) {
    const exited = new Promise((r) => child!.once("exit", r));
    child.kill();
    await exited;
  }
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe("HTTP deployment", () => {
  it("defaults to loopback and rejects invalid bind/port configuration", () => {
    expect(readHttpConfig({}).host).toBe("127.0.0.1");
    expect(() =>
      readHttpConfig({ HTTP_BIND_HOST: "public.example" }),
    ).toThrow();
    expect(() => readHttpConfig({ PORT: "0" })).toThrow();
    expect(() => readHttpConfig({ PORT: "65536" })).toThrow();
  });

  it.each(["127.0.0.1", "0.0.0.0"])(
    "keeps Host, Origin and browser-token checks when binding %s",
    async (host) => {
      dir = await mkdtemp(join(tmpdir(), "laminador-http-"));
      const reservation = createServer();
      await new Promise<void>((r) => reservation.listen(0, "127.0.0.1", r));
      const port = (reservation.address() as { port: number }).port;
      await new Promise<void>((r) => reservation.close(() => r()));
      child = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], {
        env: {
          ...process.env,
          HTTP_BIND_HOST: host,
          PORT: String(port),
          PROJECTS_DIR: join(dir, "projects"),
          JOBS_DIR: join(dir, "jobs"),
        },
        stdio: ["ignore", "ignore", "pipe"],
      });
      let logs = "";
      child.stderr!.on("data", (data) => (logs += data));
      const url = `http://127.0.0.1:${port}`;
      await expect
        .poll(
          async () => {
            if (child!.exitCode !== null) throw Error(logs);
            try {
              return (await fetch(`${url}/health`)).status;
            } catch {
              return 0;
            }
          },
          { timeout: 10000 },
        )
        .toBe(200);
      expect(await (await fetch(`${url}/health`)).json()).toEqual({ ok: true });
      // Node fetch normalizes Host to the URL; send a real hostile Host header.
      const badHost = await new Promise<number | undefined>(
        (resolve, reject) => {
          const req = request(
            `${url}/health`,
            { headers: { Host: "attacker.example" } },
            (res) => {
              res.resume();
              resolve(res.statusCode);
            },
          );
          req.on("error", reject);
          req.end();
        },
      );
      expect(badHost).toBe(403);
      expect(
        (
          await fetch(`${url}/mcp`, {
            method: "POST",
            headers: { Origin: "https://attacker.example" },
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await fetch(`${url}/api/tool`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await fetch(`${url}/health`, {
            headers: { Origin: `http://localhost:${port}` },
          })
        ).status,
      ).toBe(200);
    },
  );
});
