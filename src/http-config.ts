export function readHttpConfig(env: NodeJS.ProcessEnv = process.env) {
  const port = Number(env.PORT ?? 4319);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535)
    throw Error("PORT inválido");
  const host = env.HTTP_BIND_HOST ?? "127.0.0.1";
  if (host !== "127.0.0.1" && host !== "0.0.0.0")
    throw Error("HTTP_BIND_HOST debe ser 127.0.0.1 o 0.0.0.0");
  // Binding all interfaces is for containers only. Keep Host and Origin checks
  // independent of the bind address, and publish the Docker port on loopback.
  return { host, port, allowedHosts: ["127.0.0.1", "localhost"] };
}
