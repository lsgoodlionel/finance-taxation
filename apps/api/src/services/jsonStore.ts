import { mkdir, readFile, writeFile } from "node:fs/promises";

export async function ensureJsonFile(fileUrl: URL, initialValue: unknown) {
  await mkdir(new URL(".", fileUrl), { recursive: true });
  try {
    await readFile(fileUrl, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      await writeFile(fileUrl, JSON.stringify(initialValue, null, 2));
      return;
    }
    throw error;
  }
}

export async function readJson<T>(fileUrl: URL, fallbackValue: T): Promise<T> {
  await ensureJsonFile(fileUrl, fallbackValue);
  const raw = await readFile(fileUrl, "utf8");
  return JSON.parse(raw || JSON.stringify(fallbackValue)) as T;
}

export async function writeJson<T>(fileUrl: URL, value: T): Promise<T> {
  await mkdir(new URL(".", fileUrl), { recursive: true });
  await writeFile(fileUrl, JSON.stringify(value, null, 2));
  return value;
}
