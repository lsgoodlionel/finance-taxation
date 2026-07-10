import { readFile } from "node:fs/promises";
import type {
  AiEvalSourceInput,
  BackupRestoreSourceInput,
  ConnectorSourceInput,
  OpsSourceType
} from "./ops-source-recorders.ts";
import {
  validateImportedAiEvalSource,
  validateImportedBackupRestoreSource,
  validateImportedConnectorSource,
  writeAiEvalSource,
  writeBackupRestoreSource,
  writeConnectorSource
} from "./ops-source-recorders.ts";

export interface RecordOpsSourceInput {
  repoRoot: string;
  sourceType: OpsSourceType;
  inputPath: string;
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

export async function recordOpsSource(input: RecordOpsSourceInput) {
  let outputPath = "";

  if (input.sourceType === "backup-restore") {
    const payload = await readJsonFile<BackupRestoreSourceInput>(input.inputPath);
    validateImportedBackupRestoreSource(payload);
    outputPath = await writeBackupRestoreSource(
      input.repoRoot,
      payload
    );
  } else if (input.sourceType === "connectors") {
    const payload = await readJsonFile<ConnectorSourceInput>(input.inputPath);
    validateImportedConnectorSource(payload);
    outputPath = await writeConnectorSource(
      input.repoRoot,
      payload
    );
  } else {
    const payload = await readJsonFile<AiEvalSourceInput>(input.inputPath);
    validateImportedAiEvalSource(payload);
    outputPath = await writeAiEvalSource(
      input.repoRoot,
      payload
    );
  }

  return {
    sourceType: input.sourceType,
    inputPath: input.inputPath,
    outputPath
  };
}

function parseArgs(argv: string[]) {
  const sourceType = argv[0];
  let repoRoot = process.cwd();
  let inputPath = "";

  for (let index = 1; index < argv.length; index += 1) {
    if (argv[index] === "--repo-root") {
      repoRoot = argv[index + 1] ?? repoRoot;
      index += 1;
    } else if (argv[index] === "--input") {
      inputPath = argv[index + 1] ?? inputPath;
      index += 1;
    }
  }

  if (sourceType !== "backup-restore" && sourceType !== "connectors" && sourceType !== "ai-evals") {
    throw new Error("usage: record-ops-source.ts <backup-restore|connectors|ai-evals> --input <json-file> [--repo-root <path>]");
  }
  if (!inputPath) {
    throw new Error("missing required --input <json-file>");
  }

  return {
    repoRoot,
    sourceType,
    inputPath
  } satisfies RecordOpsSourceInput;
}

async function main() {
  const result = await recordOpsSource(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
