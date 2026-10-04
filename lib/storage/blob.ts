import { BlobServiceClient, type ContainerClient } from "@azure/storage-blob";

// Azure Blob backend for warning-letter PDFs (and any future stored file). The
// container is a flat namespace; we use the same relative paths as the local FS
// backend as blob names (e.g. "warning-letters/<studentId>/<file>.pdf").
let container: ContainerClient | undefined;

function getContainer(): ContainerClient {
  if (container) return container;
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!conn) throw new Error("AZURE_STORAGE_CONNECTION_STRING not set");
  const name = process.env.AZURE_STORAGE_CONTAINER || "storage";
  container = BlobServiceClient.fromConnectionString(conn).getContainerClient(name);
  return container;
}

export async function writeBlob(relativePath: string, bytes: Uint8Array): Promise<void> {
  const block = getContainer().getBlockBlobClient(relativePath);
  const contentType = relativePath.endsWith(".pdf") ? "application/pdf" : "application/octet-stream";
  await block.uploadData(Buffer.from(bytes), {
    blobHTTPHeaders: { blobContentType: contentType },
  });
}

export async function readBlob(relativePath: string): Promise<Uint8Array> {
  const block = getContainer().getBlockBlobClient(relativePath);
  const buf = await block.downloadToBuffer();
  return new Uint8Array(buf);
}
