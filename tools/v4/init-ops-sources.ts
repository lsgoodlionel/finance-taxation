import {
  createAiEvalTemplate,
  createBackupRestoreTemplate,
  createConnectorTemplate,
  writeAiEvalSource,
  writeBackupRestoreSource,
  writeConnectorSource
} from "./ops-source-recorders.ts";

export async function initializeOpsSources(input: {
  repoRoot: string;
  generatedAt?: string;
}) {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const files = await Promise.all([
    writeBackupRestoreSource(input.repoRoot, createBackupRestoreTemplate(generatedAt)),
    writeConnectorSource(input.repoRoot, createConnectorTemplate(generatedAt)),
    writeAiEvalSource(input.repoRoot, createAiEvalTemplate(generatedAt))
  ]);

  return {
    generatedAt,
    files
  };
}
