import ts from "typescript";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolsDir = dirname(fileURLToPath(import.meta.url));
const projectPath = resolve(toolsDir, "tsconfig.json");

const configFile = ts.readConfigFile(projectPath, ts.sys.readFile);
if (configFile.error) {
  const host = {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => ts.sys.newLine
  };
  console.error(ts.formatDiagnosticsWithColorAndContext([configFile.error], host));
  process.exitCode = 1;
} else {
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    dirname(projectPath),
    undefined,
    projectPath
  );

  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);

  if (diagnostics.length > 0) {
    const host = {
      getCanonicalFileName: (fileName) => fileName,
      getCurrentDirectory: () => process.cwd(),
      getNewLine: () => ts.sys.newLine
    };
    console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, host));
    process.exitCode = 1;
  }
}
