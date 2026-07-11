import path from "node:path";

function parseArgs(argv) {
  let repoRoot = process.cwd();
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--repo-root") {
      repoRoot = argv[index + 1] ?? repoRoot;
      index += 1;
    }
  }
  return { repoRoot };
}

const { repoRoot } = parseArgs(process.argv.slice(2));
const moduleRef = await import("./init-ops-sources.ts");
const result = await moduleRef.initializeOpsSources({ repoRoot });

process.stdout.write(`${JSON.stringify({
  repoRoot: path.resolve(repoRoot),
  generatedAt: result.generatedAt,
  files: result.files.map((file) => path.relative(repoRoot, file))
}, null, 2)}\n`);
