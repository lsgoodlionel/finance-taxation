import { readRequestBody, sendJson } from "../../utils/http.js";
import { readJson, writeJson } from "../../services/json-store.js";
import { appConfig } from "../../config/app.js";

const printJobsFile = new URL("print-jobs.json", appConfig.dataDir);

const seedPrintJobs = [
  {
    id: "print-001",
    printType: "voucher",
    outputFormat: "pdf",
    status: "done",
    filePath: "/exports/voucher-202604-001.pdf"
  }
];

export async function createPrintJob(req, res) {
  const body = await readRequestBody(req);
  const rows = await readJson(printJobsFile, seedPrintJobs);
  const next = {
    id: `print-${Date.now()}`,
    documentId: body.documentId || null,
    printType: body.printType || "document",
    outputFormat: body.outputFormat || "pdf",
    status: "queued",
    filePath: null
  };
  rows.unshift(next);
  await writeJson(printJobsFile, rows);
  sendJson(res, 202, next);
}

export async function listPrintJobs(req, res) {
  const rows = await readJson(printJobsFile, seedPrintJobs);
  sendJson(res, 200, { items: rows, total: rows.length });
}
