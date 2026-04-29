import { appConfig } from "../../config/app.js";
import { readRequestBody, sendJson } from "../../utils/http.js";
import { readJson, writeJson } from "../../services/json-store.js";

const companyFile = new URL("company.json", appConfig.dataDir);

const defaultCompany = {
  id: "demo-company",
  name: "示例中小企业（上海）有限公司",
  creditCode: "91310000MA1K12345X",
  legalRepresentative: "李明",
  phone: "021-58880001",
  address: "上海市浦东新区张江高科技园区示例路 88 号",
  bankName: "招商银行上海张江支行",
  bankAccount: "110000123456789",
  taxpayerIdentity: "general",
  vatMethod: "standard"
};

export async function getCompanyProfile(req, res) {
  const company = await readJson(companyFile, defaultCompany);
  sendJson(res, 200, company);
}

export async function updateCompanyProfile(req, res) {
  const body = await readRequestBody(req);
  const current = await readJson(companyFile, defaultCompany);
  const next = { ...current, ...body, id: current.id };
  await writeJson(companyFile, next);
  sendJson(res, 200, next);
}
