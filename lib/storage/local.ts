import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";

// Local filesystem storage backend — gitignored `storage/` dir at project root.
// Served (with auth) via app/api/warning-letters/[...path]/route.ts.
const STORAGE_ROOT = join(process.cwd(), "storage");

export async function writeLocalFile(relativePath: string, bytes: Uint8Array): Promise<void> {
  const fullPath = join(STORAGE_ROOT, relativePath);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, bytes);
}

export function localFilePath(relativePath: string): string {
  return join(STORAGE_ROOT, relativePath);
}

export async function readLocalFile(relativePath: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(join(STORAGE_ROOT, relativePath)));
}
