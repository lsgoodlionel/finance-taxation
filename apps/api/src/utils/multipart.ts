import busboy from "busboy";
import { mkdir, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import type { IncomingMessage } from "node:http";

export interface UploadedFile {
  fieldName: string;
  fileName: string;
  mimeType: string;
  size: number;
  savedPath: string;
  storageKey: string;
}

const UPLOADS_DIR = new URL("../data/uploads/", import.meta.url);

export async function parseMultipart(req: IncomingMessage): Promise<UploadedFile[]> {
  await mkdir(UPLOADS_DIR, { recursive: true });

  return new Promise((resolve, reject) => {
    const bb = busboy({ headers: req.headers, limits: { fileSize: 20 * 1024 * 1024 } });
    const uploads: UploadedFile[] = [];
    const pending: Promise<void>[] = [];
    let hasError = false;

    bb.on("file", (fieldName, stream, info) => {
      const { filename, mimeType } = info;
      const storageKey = `${Date.now()}-${randomBytes(8).toString("hex")}`;
      const ext = filename.includes(".") ? filename.slice(filename.lastIndexOf(".")) : "";
      const savedName = `${storageKey}${ext}`;
      const savedPath = new URL(savedName, UPLOADS_DIR);
      const chunks: Buffer[] = [];
      let size = 0;

      stream.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
        size += chunk.length;
      });

      const p = new Promise<void>((res, rej) => {
        stream.on("end", async () => {
          try {
            const buf = Buffer.concat(chunks);
            await writeFile(savedPath, buf);
            uploads.push({
              fieldName,
              fileName: filename,
              mimeType,
              size,
              savedPath: savedPath.pathname,
              storageKey: savedName
            });
            res();
          } catch (err) {
            rej(err);
          }
        });
        stream.on("error", rej);
      });

      pending.push(p);
    });

    bb.on("error", (err) => {
      hasError = true;
      reject(err);
    });

    bb.on("finish", () => {
      if (hasError) return;
      Promise.all(pending).then(() => resolve(uploads)).catch(reject);
    });

    req.pipe(bb);
  });
}
