import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const lock = JSON.parse(
  await readFile(join(root, "package-lock.json"), "utf8"),
);
const notices = [
  "Dependency notices for Laminador Bambu 0.1.0\n\nOriginal package licenses are reproduced below, including build dependencies.\n",
];
for (const path of Object.keys(lock.packages).sort()) {
  if (!path.startsWith("node_modules/")) continue;
  let pkg, files;
  try {
    pkg = JSON.parse(await readFile(join(root, path, "package.json"), "utf8"));
    files = await readdir(join(root, path));
  } catch {
    continue;
  }
  const names = files.filter((n) =>
    /^(?:licen[sc]e|copying|notice)(?:[-.]|$)/i.test(n),
  );
  if (!names.length) continue;
  notices.push(
    `\n${"=".repeat(72)}\n${pkg.name} ${pkg.version}\nDeclared license: ${typeof pkg.license === "string" ? pkg.license : JSON.stringify(pkg.license ?? "see below")}\n`,
  );
  for (const name of names) {
    try {
      notices.push(
        `\n${name}\n${await readFile(join(root, path, name), "utf8")}\n`,
      );
    } catch {}
  }
}
await writeFile(join(root, "DEPENDENCY_LICENSES.txt"), notices.join(""));
