import { readFile, readdir, stat, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";
const root = resolve(fileURLToPath(new URL("..", import.meta.url))),
  manifest = JSON.parse(await readFile(join(root, "plugin.json"), "utf8"));
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.name))
  throw Error("Invalid plugin name");
if (manifest.extensions["com.openai"].interface.shortDescription.length > 30)
  throw Error("Plugin subtitle too long");
await stat(join(root, "dist/server.js"));
await stat(join(root, "dist/viewer/index.html"));
await import("./collect-licenses.mjs");
const allow = [
  ".gitignore",
  ".gitattributes",
  "DEPENDENCY_LICENSES.txt",
  "plugin.json",
  "mcp.json",
  "package.json",
  "package-lock.json",
  "README.md",
  "CONTRIBUTING.md",
  "LICENSE",
  "THIRD_PARTY.md",
  "tsconfig.json",
  "tsconfig.build.json",
  "tsconfig.viewer.json",
  "vite.config.ts",
  "vitest.config.ts",
  "playwright.config.ts",
  "Dockerfile",
  ".dockerignore",
  "compose.yaml",
  "deploy",
  "src",
  "viewer",
  "scripts",
  "skills",
  "docs",
  "tests",
  "examples",
  "dist",
];
const files = [];
async function collect(relative) {
  const path = join(root, relative),
    s = await stat(path);
  if (s.isDirectory()) {
    for (const child of await readdir(path, { withFileTypes: true })) {
      if (child.isSymbolicLink()) throw Error("No symlinks in package");
      await collect(relative + "/" + child.name);
    }
  } else if (s.isFile()) files.push(relative);
}
for (const path of allow) await collect(path);
files.sort();
const chunks = [],
  central = [];
let offset = 0;
for (const path of files) {
  const name = Buffer.from(manifest.name + "/" + path),
    raw = await readFile(join(root, path)),
    data = deflateRawSync(raw);
  let crc = 0xffffffff;
  for (const b of raw) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  crc = (crc ^ 0xffffffff) >>> 0;
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x800, 6);
  header.writeUInt16LE(8, 8);
  header.writeUInt16LE(0x21, 12);
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(data.length, 18);
  header.writeUInt32LE(raw.length, 22);
  header.writeUInt16LE(name.length, 26);
  chunks.push(header, name, data);
  const c = Buffer.alloc(46);
  c.writeUInt32LE(0x02014b50);
  c.writeUInt16LE(0x314, 4);
  c.writeUInt16LE(20, 6);
  c.writeUInt16LE(0x800, 8);
  c.writeUInt16LE(8, 10);
  c.writeUInt16LE(0x21, 14);
  c.writeUInt32LE(crc, 16);
  c.writeUInt32LE(data.length, 20);
  c.writeUInt32LE(raw.length, 24);
  c.writeUInt16LE(name.length, 28);
  c.writeUInt32LE(
    (((await stat(join(root, path))).mode & 0xffff) << 16) >>> 0,
    38,
  );
  c.writeUInt32LE(offset, 42);
  central.push(c, name);
  offset += header.length + name.length + data.length;
}
const cd = Buffer.concat(central),
  end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(cd.length, 12);
end.writeUInt32LE(offset, 16);
const archive = Buffer.concat([...chunks, cd, end]);
await mkdir(join(root, "artifacts"), { recursive: true });
const dest = join(
  root,
  "artifacts",
  `${manifest.name}-${manifest.version}.zip`,
);
await writeFile(dest, archive);
console.log(`${dest}\n${files.length} files · ${archive.length} bytes`);
