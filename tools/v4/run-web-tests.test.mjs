import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { assertNonEmptyTests, collectWebTests } from "./run-web-tests.mjs";

const runnerPath = fileURLToPath(new URL("./run-web-tests.mjs", import.meta.url));

test("assertNonEmptyTests rejects a discovered empty test directory", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "v4-empty-web-tests-"));

  try {
    const testFiles = await collectWebTests(root);
    assert.throws(
      () => assertNonEmptyTests(testFiles, root),
      new RegExp(`No web tests found in ${root}`)
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("collectWebTests returns sorted ts, tsx, and mjs test files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "v4-web-tests-"));

  try {
    await mkdir(path.join(root, "nested"));
    await Promise.all([
      writeFile(path.join(root, "z.test.ts"), ""),
      writeFile(path.join(root, "nested", "a.test.tsx"), ""),
      writeFile(path.join(root, "nested", "b.test.mjs"), ""),
      writeFile(path.join(root, "ignored.ts"), ""),
      writeFile(path.join(root, "ignored.test.js"), "")
    ]);

    assert.deepEqual(await collectWebTests(root), [
      path.join(root, "nested", "a.test.tsx"),
      path.join(root, "nested", "b.test.mjs"),
      path.join(root, "z.test.ts")
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI runs when invoked through a symbolic link", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "v4-web-runner-link-"));
  const linkedRunner = path.join(root, "run-web-tests.mjs");

  try {
    await symlink(runnerPath, linkedRunner);
    const result = spawnSync(process.execPath, [linkedRunner], {
      cwd: path.resolve(path.dirname(runnerPath), "../.."),
      encoding: "utf8"
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /web tests passed: [1-9]\d*/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
