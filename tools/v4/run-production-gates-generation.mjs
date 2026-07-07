import path from "node:path";
function parseArgs(argv) {
  let repoRoot = process.cwd();
  let healthUrl = process.env.V4_API_HEALTH_URL ?? "http://127.0.0.1:33100/api/health";
  let healthProbeLatencies = "";
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--repo-root") {
      repoRoot = argv[index + 1] ?? repoRoot;
      index += 1;
    } else if (argv[index] === "--health-url") {
      healthUrl = argv[index + 1] ?? healthUrl;
      index += 1;
    } else if (argv[index] === "--health-probe-latencies") {
      healthProbeLatencies = argv[index + 1] ?? healthProbeLatencies;
      index += 1;
    }
  }
  return { repoRoot, healthUrl, healthProbeLatencies };
}

function parseHealthProbeLatencies(rawValue) {
  if (!rawValue) {
    return [];
  }

  return rawValue
    .split(",")
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value) && value > 0);
}

const { repoRoot, healthUrl, healthProbeLatencies } = parseArgs(process.argv.slice(2));
const moduleRef = await import("./generate-production-gates.ts");
const healthProbeLatenciesMs = parseHealthProbeLatencies(healthProbeLatencies);
const result = await moduleRef.runProductionEvidenceGeneration({ repoRoot, healthProbeLatenciesMs });

process.stdout.write(`${JSON.stringify({
  repoRoot: path.resolve(repoRoot),
  healthUrl,
  healthProbeLatenciesMs,
  wrote: ["load.json", "backup-restore.json", "connectors.json", "ai-evals.json"],
  loadSource: result.load.source,
  backupRestoreSource: result.backupRestore.source,
  connectorSource: result.connectors.source,
  aiEvalSource: result.aiEvals.source
}, null, 2)}\n`);
