// Storage dispatcher. Local filesystem in dev; Azure Blob in prod (the container
// filesystem is ephemeral on Azure Container Apps, so generated PDFs must live in
// Blob). Backend chosen by STORAGE_BACKEND ("local" | "azure_blob"), default local.
import { writeLocalFile, readLocalFile } from "./local";

const BACKEND = (process.env.STORAGE_BACKEND || "local").toLowerCase();

export async function putFile(relativePath: string, bytes: Uint8Array): Promise<void> {
  if (BACKEND === "azure_blob") {
    const { writeBlob } = await import("./blob");
    return writeBlob(relativePath, bytes);
  }
  return writeLocalFile(relativePath, bytes);
}

export async function getFile(relativePath: string): Promise<Uint8Array> {
  if (BACKEND === "azure_blob") {
    const { readBlob } = await import("./blob");
    return readBlob(relativePath);
  }
  return readLocalFile(relativePath);
}
