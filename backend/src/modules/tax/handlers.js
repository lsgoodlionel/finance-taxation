import { readRequestBody, sendJson } from "../../utils/http.js";
import { readJson, writeJson } from "../../services/json-store.js";
import { appConfig } from "../../config/app.js";

const taxpayerProfilesFile = new URL("taxpayer-profiles.json", appConfig.dataDir);
const taxItemsFile = new URL("tax-items.json", appConfig.dataDir);

const seedProfiles = [
  {
    id: "tp-001",
    taxpayerIdentity: "general",
    vatMethod: "standard",
    effectiveFrom: "2026-01-01",
    description: "一般纳税人一般计税"
  },
  {
    id: "tp-002",
    taxpayerIdentity: "small-scale",
    vatMethod: "standard",
    effectiveFrom: "2026-01-01",
    description: "小规模纳税人"
  },
  {
    id: "tp-003",
    taxpayerIdentity: "general",
    vatMethod: "simplified",
    effectiveFrom: "2026-01-01",
    description: "一般纳税人简易计税"
  }
];

const seedTaxItems = [
  {
    id: "tax-001",
    taxType: "增值税及附加",
    taxpayerIdentity: "general",
    taxPeriod: "2026-04",
    amount: "18720.00",
    status: "draft"
  }
];

export async function listTaxpayerProfiles(req, res) {
  const rows = await readJson(taxpayerProfilesFile, seedProfiles);
  sendJson(res, 200, { items: rows, total: rows.length });
}

export async function createTaxpayerProfile(req, res) {
  const body = await readRequestBody(req);
  const rows = await readJson(taxpayerProfilesFile, seedProfiles);
  const next = {
    id: `tp-${Date.now()}`,
    taxpayerIdentity: body.taxpayerIdentity || "general",
    vatMethod: body.vatMethod || "standard",
    effectiveFrom: body.effectiveFrom || new Date().toISOString().slice(0, 10),
    description: body.description || "未命名纳税人配置"
  };
  rows.unshift(next);
  await writeJson(taxpayerProfilesFile, rows);
  sendJson(res, 201, next);
}

export async function listTaxItems(req, res) {
  const rows = await readJson(taxItemsFile, seedTaxItems);
  sendJson(res, 200, { items: rows, total: rows.length });
}
