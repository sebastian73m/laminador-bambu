import {
  mkdir,
  realpath,
  writeFile,
  appendFile,
  unlink,
  copyFile,
} from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { inspectArchive } from "./artifacts.js";
import type { Config } from "./types.js";
export function createImporter(config: Config) {
  const entries = new Map<
    string,
    {
      path: string;
      size: number;
      offset: number;
      createdAt: number;
      busy: boolean;
    }
  >();
  return {
    async beginImport(size: number) {
      if (!Number.isSafeInteger(size) || size < 1 || size > config.maxFileBytes)
        throw Error("El archivo excede el límite de importación");
      for (const [id, e] of entries)
        if (Date.now() - e.createdAt > 600000) {
          entries.delete(id);
          await unlink(e.path).catch(() => {});
        }
      if (entries.size >= 3)
        throw Error(
          "Ya hay tres importaciones pendientes; espera 10 minutos o reinicia el servicio",
        );
      const uploadId = randomUUID();
      const dir = join(config.jobs, "imports");
      await mkdir(dir, { recursive: true });
      const path = join(dir, uploadId + ".part");
      await writeFile(path, "", { flag: "wx" });
      entries.set(uploadId, {
        path,
        size,
        offset: 0,
        createdAt: Date.now(),
        busy: false,
      });
      return { uploadId, maxChunkBytes: 65536 };
    },
    async appendImport(input: {
      uploadId: string;
      offset: number;
      base64: string;
    }): Promise<{ nextOffset: number | null; project?: string }> {
      const entry = entries.get(input.uploadId);
      if (!entry) throw Error("Importación no encontrada");
      if (entry.busy) throw Error("Bloque de importación en curso");
      if (input.offset !== entry.offset)
        throw Error("Offset de importación inválido");
      if (
        input.base64.length > 349528 ||
        !input.base64.length ||
        !/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
          input.base64,
        )
      )
        throw Error("Bloque base64 inválido");
      const buffer = Buffer.from(input.base64, "base64");
      if (buffer.length > 262144 || entry.offset + buffer.length > entry.size)
        throw Error("Bloque excede el tamaño declarado");
      entry.busy = true;
      try {
        await appendFile(entry.path, buffer);
        entry.offset += buffer.length;
        if (entry.offset < entry.size) return { nextOffset: entry.offset };
        await inspectArchive(entry.path, {
          maxFileBytes: config.maxFileBytes,
          maxExpandedBytes: config.maxExpandedBytes,
        });
        // Use a random new file directly in the authorized real root, avoiding upload-directory symlinks.
        const root = await realpath(config.projects),
          project = input.uploadId + ".3mf";
        await copyFile(
          entry.path,
          join(root, project),
          constants.COPYFILE_EXCL,
        );
        await unlink(entry.path);
        entries.delete(input.uploadId);
        return { nextOffset: null, project };
      } catch (e) {
        entries.delete(input.uploadId);
        await unlink(entry.path).catch(() => {});
        throw e;
      } finally {
        entry.busy = false;
      }
    },
  };
}
