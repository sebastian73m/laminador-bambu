import { it, expect } from "vitest";
// @ts-expect-error Standalone host diagnostic script.
import { validateContainer } from "../scripts/docker-cli.mjs";
const container = () => ({
  State: { Running: true, Health: { Status: "healthy" } },
  Config: { User: "laminador" },
  HostConfig: { CapDrop: ["ALL"], SecurityOpt: ["no-new-privileges:true"] },
  NetworkSettings: {
    Ports: { "4319/tcp": [{ HostIp: "127.0.0.1", HostPort: "4319" }] },
  },
  Mounts: [{ Type: "volume", Destination: "/projects" }],
});
it("accepts the local non-root deployment", () => {
  expect(validateContainer(container()).published).toBe("127.0.0.1:4319");
});
it("detects exposure, missing privilege restrictions and Docker socket mounts", () => {
  const publicPort = container();
  publicPort.NetworkSettings.Ports["4319/tcp"][0].HostIp = "0.0.0.0";
  expect(() => validateContainer(publicPort)).toThrow(/127/);
  const root = container();
  root.Config.User = "root";
  expect(() => validateContainer(root)).toThrow(/usuario/);
  const capabilities = container();
  capabilities.HostConfig.CapDrop = [];
  expect(() => validateContainer(capabilities)).toThrow(/cap_drop/);
  const socket = container();
  socket.Mounts.push({ Type: "bind", Destination: "/var/run/docker.sock" });
  expect(() => validateContainer(socket)).toThrow(/socket/);
});
