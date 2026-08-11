import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertNonEmptyTests,
  collectWebTests,
  formatFailureSummary,
  resolveConcurrency,
  runTestFiles
} from "./run-web-tests.mjs";

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

// ── 「跑完全部用例」是这次改动的核心不变式 ────────────────────────────────────
// 旧实现首错即 process.exit，排在失败文件之后的用例根本不会被执行。以下三条
// 测试正是为了防止回退到那个行为。

test("runTestFiles executes every file even when an early one fails", async () => {
  const files = ["a.test.ts", "b.test.ts", "c.test.ts", "d.test.ts"];
  const executed = [];

  const results = await runTestFiles(files, {
    concurrency: 1,
    runFile: async (file) => {
      executed.push(file);
      return { file, exitCode: file === "a.test.ts" ? 1 : 0, output: `ran ${file}` };
    }
  });

  assert.deepEqual(executed, files, "第一个文件失败后，后续文件仍必须被执行");
  assert.equal(results.length, files.length);
  assert.deepEqual(
    results.filter((result) => result.exitCode !== 0).map((result) => result.file),
    ["a.test.ts"]
  );
});

test("runTestFiles reports all failures, not just the first", async () => {
  const files = ["a.test.ts", "b.test.ts", "c.test.ts"];

  const results = await runTestFiles(files, {
    concurrency: 2,
    runFile: async (file) => ({
      file,
      exitCode: file === "b.test.ts" ? 0 : 1,
      output: `output of ${file}`
    })
  });

  const failures = results.filter((result) => result.exitCode !== 0);
  assert.deepEqual(failures.map((failure) => failure.file), ["a.test.ts", "c.test.ts"]);

  const summary = formatFailureSummary(failures, files.length);
  assert.match(summary, /web tests FAILED: 2 of 3 file\(s\)/);
  assert.match(summary, /a\.test\.ts/);
  assert.match(summary, /c\.test\.ts/);
  assert.match(summary, /output of a\.test\.ts/);
  assert.match(summary, /output of c\.test\.ts/);
});

test("runTestFiles preserves input order in results while running in parallel", async () => {
  const files = ["slow.test.ts", "fast.test.ts"];
  let started = 0;

  const results = await runTestFiles(files, {
    concurrency: 2,
    runFile: async (file) => {
      started += 1;
      // slow 先启动但后完成；结果数组仍必须按输入顺序排列。
      const delay = file === "slow.test.ts" ? 20 : 0;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, delay));
      return { file, exitCode: 0, output: "" };
    }
  });

  assert.equal(started, 2);
  assert.deepEqual(results.map((result) => result.file), files);
});

test("runTestFiles never exceeds the configured concurrency", async () => {
  const files = Array.from({ length: 12 }, (_, index) => `f${index}.test.ts`);
  let inFlight = 0;
  let peak = 0;

  await runTestFiles(files, {
    concurrency: 3,
    runFile: async (file) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 1));
      inFlight -= 1;
      return { file, exitCode: 0, output: "" };
    }
  });

  assert.equal(peak, 3);
});

test("formatFailureSummary reports the pass line when nothing failed", () => {
  assert.equal(formatFailureSummary([], 7), "web tests passed: 7");
});

test("formatFailureSummary keeps a failing file listed even with empty output", () => {
  const summary = formatFailureSummary(
    [{ file: "silent.test.ts", exitCode: 137, output: "   \n" }],
    1
  );

  assert.match(summary, /silent\.test\.ts \(exit 137\)/);
  assert.match(summary, /\(no output\)/);
});

test("resolveConcurrency honours an explicit override and falls back safely", () => {
  assert.equal(resolveConcurrency("4", 16), 4);
  assert.equal(resolveConcurrency(undefined, 4), 4);
  assert.equal(resolveConcurrency("", 4), 4);
  assert.equal(resolveConcurrency("not-a-number", 2), 2);
  assert.equal(resolveConcurrency("0", 2), 2);
  assert.equal(resolveConcurrency("-3", 2), 2);
  // 封顶：核数再多也不会无限并行。
  assert.equal(resolveConcurrency(undefined, 64), 8);
  assert.equal(resolveConcurrency(undefined, 0), 1);
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
