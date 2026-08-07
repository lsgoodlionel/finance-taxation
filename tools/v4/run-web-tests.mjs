/**
 * Web 测试运行器。
 *
 * 此前的实现是「按字母序串行 + 首个失败即 process.exit」。后果是一个排序靠前的
 * 文件失败会让它后面的全部用例根本没被执行到——上一轮有两条并行开发车道被同一个
 * 失败挡住，只能逐文件手动验证。**一次运行只暴露一个失败**，这是在掩盖问题。
 *
 * 现在：
 * 1. 无论失败与否都跑完全部文件，最后一次性汇总所有失败文件及其输出；
 * 2. 并行执行（126 个文件此前全串行）；
 * 3. 并行会打乱 stdio 顺序，所以子进程输出**按文件缓冲**，完成时整块打印，
 *    保证每个文件的输出是连续的；失败详情统一放到末尾摘要，不必在滚动日志里翻找；
 * 4. 退出码语义不变：有失败即非零。
 */

import { readdir } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const webSourceRoot = join(repoRoot, "apps/web/src");

/** 并行度上限。再高收益递减，且会让内存占用与输出量失控。 */
const MAX_CONCURRENCY = 8;

export async function collectWebTests(directory) {
  const tests = [];
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      tests.push(...await collectWebTests(path));
    } else if (entry.isFile() && /\.test\.(mjs|tsx?)$/.test(entry.name)) {
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

/**
 * 解析并行度：显式环境变量优先，否则按 CPU 核数取，封顶 MAX_CONCURRENCY。
 * 非法值（非数字、<1）一律回退到默认值而不是让运行器崩掉。
 */
export function resolveConcurrency(rawValue, cpuCount = 1) {
  const parsed = Number(rawValue);
  if (Number.isInteger(parsed) && parsed >= 1) {
    return parsed;
  }
  return Math.max(1, Math.min(cpuCount, MAX_CONCURRENCY));
}

/**
 * 把失败列表格式化成末尾摘要。
 *
 * 单独抽成纯函数是为了能直接断言输出内容——摘要是这次改动的核心产物，
 * 如果它退化成「只列第一个失败」，运行器就又回到了掩盖问题的状态。
 */
export function formatFailureSummary(failures, totalCount) {
  if (failures.length === 0) {
    return `web tests passed: ${totalCount}`;
  }

  const blocks = failures.map((failure, index) => {
    const output = failure.output.trim();
    return [
      `--- [${index + 1}/${failures.length}] ${failure.file} (exit ${failure.exitCode})`,
      output || "(no output)"
    ].join("\n");
  });

  return [
    "",
    `web tests FAILED: ${failures.length} of ${totalCount} file(s)`,
    "",
    ...blocks,
    "",
    "failed files:",
    ...failures.map((failure) => `  - ${failure.file}`),
    ""
  ].join("\n");
}

function runSingleTestFile(testFile) {
  const relativePath = relative(repoRoot, testFile);

  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, ["--import", "tsx", relativePath], {
      cwd: repoRoot,
      env: { ...process.env, NODE_ENV: "test" },
      stdio: ["ignore", "pipe", "pipe"]
    });

    // 按文件缓冲：并行下直接 inherit 会把 126 个文件的输出交织成噪音。
    const chunks = [];
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.on("data", (chunk) => chunks.push(chunk));

    const finish = (exitCode) => {
      resolvePromise({
        file: relativePath,
        exitCode,
        output: Buffer.concat(chunks).toString("utf8")
      });
    };

    child.on("error", (error) => {
      chunks.push(Buffer.from(`failed to spawn: ${error.message}\n`));
      finish(1);
    });
    child.on("close", (code, signal) => {
      finish(code ?? (signal ? 1 : 0));
    });
  });
}

/**
 * 以固定并行度跑完**全部**文件，不因失败提前返回。
 *
 * `runFile` 可注入，便于测试在不真正 spawn 进程的情况下断言调度与汇总行为。
 */
export async function runTestFiles(testFiles, { concurrency, runFile, onResult } = {}) {
  const effectiveConcurrency = Math.max(1, Math.min(concurrency || 1, testFiles.length || 1));
  const execute = runFile || runSingleTestFile;
  const results = new Array(testFiles.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < testFiles.length) {
      const index = nextIndex++;
      const result = await execute(testFiles[index]);
      results[index] = result;
      onResult?.(result);
    }
  }

  await Promise.all(
    Array.from({ length: effectiveConcurrency }, () => worker())
  );

  return results;
}

async function runWebTests() {
  const testFiles = await collectWebTests(webSourceRoot);
  assertNonEmptyTests(testFiles, webSourceRoot);

  const concurrency = resolveConcurrency(process.env.WEB_TEST_CONCURRENCY, availableParallelism());
  const isVerbose = process.env.WEB_TEST_VERBOSE === "1";
  console.log(`running ${testFiles.length} web test file(s) with concurrency ${concurrency}`);

  let completed = 0;
  const results = await runTestFiles(testFiles, {
    concurrency,
    onResult: (result) => {
      completed += 1;
      const marker = result.exitCode === 0 ? "PASS" : "FAIL";
      console.log(`[${completed}/${testFiles.length}] ${marker} ${result.file}`);
      // 通过的文件默认只留一行；失败详情在末尾摘要里统一给出。
      if (isVerbose && result.output.trim()) {
        console.log(result.output.trimEnd());
      }
    }
  });

  const failures = results.filter((result) => result.exitCode !== 0);
  console.log(formatFailureSummary(failures, testFiles.length));

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

const entryPath = process.argv[1];
if (
  entryPath &&
  realpathSync(resolve(entryPath)) === realpathSync(fileURLToPath(import.meta.url))
) {
  await runWebTests();
}
