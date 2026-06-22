import { readdir } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const webSourceRoot = join(repoRoot, "apps/web/src");

export async function collectWebTests(directory) {
  const tests = [];
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      tests.push(...await collectWebTests(path));
    } else if (entry.isFile() && /\.test\.tsx?$/.test(entry.name)) {
      tests.push(path);
    }
  }

  return tests.sort();
}

export function assertNonEmptyTests(testFiles, directory) {
  if (testFiles.length === 0) {
    throw new Error(`No web tests found in ${directory}`);
  }
}

async function runWebTests() {
  const testFiles = await collectWebTests(webSourceRoot);
  assertNonEmptyTests(testFiles, webSourceRoot);

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
}

const entryPath = process.argv[1];
if (
  entryPath &&
  realpathSync(resolve(entryPath)) === realpathSync(fileURLToPath(import.meta.url))
) {
  await runWebTests();
}
