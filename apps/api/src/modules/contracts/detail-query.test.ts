import test from "node:test";
import assert from "node:assert/strict";
import { buildGeneratedDocumentSelectQuery } from "./routes.js";

test("buildGeneratedDocumentSelectQuery does not depend on attachment_ids", () => {
  const sql = buildGeneratedDocumentSelectQuery();

  assert.equal(
    sql.includes("attachment_ids"),
    false,
    "contract detail query should not reference generated_documents.attachment_ids"
  );
  assert.equal(sql.includes('document_type as "documentType"'), true);
});
