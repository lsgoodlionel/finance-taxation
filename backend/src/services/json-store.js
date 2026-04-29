import { mkdir, readFile, writeFile } from "node:fs/promises";

export async function ensureJsonFile(fileUrl, initialValue) {
  await mkdir(new URL(".", fileUrl), { recursive: true });
  try {
    await readFile(fileUrl, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      await writeFile(fileUrl, JSON.stringify(initialValue, null, 2));
      return;
    }
    throw error;
  }
}

export async function readJson(fileUrl, fallbackValue) {
  await ensureJsonFile(fileUrl, fallbackValue);
  const content = await readFile(fileUrl, "utf8");
  return JSON.parse(content || JSON.stringify(fallbackValue));
}

export async function writeJson(fileUrl, value) {
  await mkdir(new URL(".", fileUrl), { recursive: true });
  await writeFile(fileUrl, JSON.stringify(value, null, 2));
  return value;
}
