import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { assertNonEmptyTests, collectWebTests } from "./run-web-tests.mjs";

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

test("collectWebTests returns only sorted TypeScript test files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "v4-web-tests-"));

  try {
    await mkdir(path.join(root, "nested"));
    await Promise.all([
      writeFile(path.join(root, "z.test.ts"), ""),
      writeFile(path.join(root, "nested", "a.test.tsx"), ""),
      writeFile(path.join(root, "ignored.ts"), ""),
      writeFile(path.join(root, "ignored.test.js"), "")
    ]);

    assert.deepEqual(await collectWebTests(root), [
      path.join(root, "nested", "a.test.tsx"),
      path.join(root, "z.test.ts")
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
