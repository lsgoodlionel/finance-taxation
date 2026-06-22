import { readdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const webSourceRoot = join(repoRoot, "apps/web/src");

async function collectTests(directory) {
  const tests = [];
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      tests.push(...await collectTests(path));
    } else if (entry.isFile() && /\.test\.tsx?$/.test(entry.name)) {
      tests.push(path);
    }
  }

  return tests;
}

const testFiles = (await collectTests(webSourceRoot)).sort();

for (const testFile of testFiles) {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", relative(repoRoot, testFile)],
    {
      cwd: repoRoot,
      env: { ...process.env, NODE_ENV: "test" },
      stdio: "inherit"
    }
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log(`web tests passed: ${testFiles.length}`);
