import { getProcessFlowOverviewSections, PROCESS_FLOW_NODES } from "./definition";
import { buildProcessFlowPageContext, inferProcessFlowBranchFromTexts } from "./page-context";
import { resolveProcessFlowContext, resolveProcessFlowState } from "./resolve";

function assertEqual<T>(actual: T, expected: T, message?: string) {
  if (actual !== expected) {
    throw new Error(message ?? `Expected ${String(expected)}, received ${String(actual)}`);
  }
}

function assertOk(value: unknown, message: string) {
  if (!value) {
    throw new Error(message);
  }
}

const tests: Array<{ name: string; run: () => void }> = [
  {
    name: "infers purchase branch from page text hints only when evidence is specific",
    run: () => {
      assertEqual(inferProcessFlowBranchFromTexts(["办公用品采购单", "固定资产购置说明"]), "purchase");
      assertEqual(inferProcessFlowBranchFromTexts(["会议采购与招待混合说明"]), null);
      assertEqual(inferProcessFlowBranchFromTexts(["普通处理记录"]), null);
    }
  },
  {
    name: "builds a generic overview context when page branch cannot be inferred safely",
    run: () => {
      const result = buildProcessFlowPageContext({
        currentNodeId: "archive_trace_query",
        businessEventId: "evt-archive"
      });

      assertEqual(result.activeBranch, undefined);
      assertEqual(result.businessEventId, "evt-archive");
      assertEqual(result.nodes.find((node) => node.id === "archive_trace_query")?.status, "current");
      assertEqual(result.nodes.find((node) => node.id === "purchase_classification")?.status, "done");
      assertEqual(result.nodes.find((node) => node.id === "entertainment_classification")?.status, "done");
    }
  },
  {
    name: "builds a branch-specific page context when page evidence is clear",
    run: () => {
      const result = buildProcessFlowPageContext({
        currentNodeId: "document_generation",
        branch: "entertainment",
        businessEventId: "evt-dinner"
      });

      assertEqual(result.activeBranch, "entertainment");
      assertEqual(result.nodes.find((node) => node.id === "entertainment_document_generation")?.status, "current");
      assertOk(!result.nodes.find((node) => node.id === "purchase_classification"), "Did not expect purchase branch nodes");
    }
  },
  {
    name: "routes procurement events into purchase branch",
    run: () => {
      const result = resolveProcessFlowContext({
        event: {
          id: "evt-1",
          type: "procurement",
          status: "analyzed"
        },
        detail: {
          tasks: [{ id: "tsk-1" }],
          generatedDocuments: [],
          vouchers: [],
          taxItems: []
        }
      });

      assertEqual(result.branch, "purchase");
      assertEqual(result.currentNodeId, "purchase_approval_dispatch");
      assertEqual(result.nodes.find((node) => node.id === "purchase_approval_dispatch")?.status, "current");
    }
  },
  {
    name: "uses ai precheck as current node for purchase events before downstream work starts",
    run: () => {
      const result = resolveProcessFlowContext({
        event: {
          id: "evt-purchase",
          type: "procurement",
          status: "analyzed"
        },
        detail: {
          tasks: [],
          generatedDocuments: [],
          vouchers: [],
          taxItems: []
        }
      });

      assertEqual(result.branch, "purchase");
      assertEqual(result.currentNodeId, "ai_precheck");
      assertEqual(result.nodes.find((node) => node.id === "ai_precheck")?.status, "current");
      assertEqual(result.nodes.find((node) => node.id === "purchase_classification")?.status, "pending");
    }
  },
  {
    name: "routes business entertainment events into entertainment branch",
    run: () => {
      const result = resolveProcessFlowContext({
        event: {
          id: "evt-2",
          type: "expense",
          status: "analyzed",
          title: "客户招待餐费"
        },
        detail: {
          tasks: [{ id: "tsk-1" }],
          generatedDocuments: [{ id: "doc-1" }],
          vouchers: [],
          taxItems: []
        }
      });

      assertEqual(result.branch, "entertainment");
      assertEqual(result.currentNodeId, "entertainment_document_generation");
      assertEqual(result.nodes.find((node) => node.id === "entertainment_document_generation")?.status, "current");
    }
  },
  {
    name: "routes travel and meeting types into entertainment branch by default",
    run: () => {
      const travelResult = resolveProcessFlowContext({
        event: {
          id: "evt-travel",
          type: "travel",
          status: "draft"
        },
        detail: {
          tasks: [],
          generatedDocuments: [],
          vouchers: [],
          taxItems: []
        }
      });
      const meetingResult = resolveProcessFlowContext({
        event: {
          id: "evt-meeting",
          type: "meeting",
          status: "draft"
        },
        detail: {
          tasks: [],
          generatedDocuments: [],
          vouchers: [],
          taxItems: []
        }
      });

      assertEqual(travelResult.branch, "entertainment");
      assertEqual(meetingResult.branch, "entertainment");
      assertEqual(travelResult.currentNodeId, "ai_precheck");
      assertEqual(meetingResult.currentNodeId, "ai_precheck");
    }
  },
  {
    name: "routes generic expense types into purchase branch by default",
    run: () => {
      const result = resolveProcessFlowContext({
        event: {
          id: "evt-expense",
          type: "expense",
          status: "draft",
          title: "购买办公文具"
        },
        detail: {
          tasks: [],
          generatedDocuments: [],
          vouchers: [],
          taxItems: []
        }
      });

      assertEqual(result.branch, "purchase");
      assertEqual(result.currentNodeId, "ai_precheck");
    }
  },
  {
    name: "uses ai precheck as current node for entertainment events before downstream work starts",
    run: () => {
      const result = resolveProcessFlowContext({
        event: {
          id: "evt-entertainment",
          type: "expense",
          status: "analyzed",
          title: "客户招待"
        },
        detail: {
          tasks: [],
          generatedDocuments: [],
          vouchers: [],
          taxItems: []
        }
      });

      assertEqual(result.branch, "entertainment");
      assertEqual(result.currentNodeId, "ai_precheck");
      assertEqual(result.nodes.find((node) => node.id === "ai_precheck")?.status, "current");
      assertEqual(result.nodes.find((node) => node.id === "entertainment_classification")?.status, "pending");
    }
  },
  {
    name: "advances to tax filing stage when tax filing batches exist",
    run: () => {
      const result = resolveProcessFlowContext({
        event: {
          id: "evt-3",
          type: "expense",
          status: "analyzed",
          title: "客户宴请报销"
        },
        detail: {
          tasks: [{ id: "tsk-1" }],
          generatedDocuments: [{ id: "doc-1" }],
          vouchers: [{ id: "vou-1" }],
          taxItems: [{ id: "tax-1" }],
          taxFilingBatches: [{ id: "batch-1" }]
        }
      });

      assertEqual(result.branch, "entertainment");
      assertEqual(result.currentNodeId, "tax_filing_archive");
      assertEqual(result.nodes.find((node) => node.id === "voucher_tax_processing")?.status, "done");
      assertEqual(result.nodes.find((node) => node.id === "tax_filing_archive")?.status, "current");
    }
  },
  {
    name: "advances to archive stage when archived artifacts exist",
    run: () => {
      const result = resolveProcessFlowContext({
        event: {
          id: "evt-archived",
          type: "procurement",
          status: "analyzed"
        },
        detail: {
          tasks: [{ id: "tsk-1" }],
          generatedDocuments: [{ id: "doc-1" }],
          vouchers: [{ id: "vou-1" }],
          taxItems: [{ id: "tax-1" }],
          taxFilingBatches: [{ id: "batch-1" }],
          hasArchivedArtifacts: true
        }
      });

      assertEqual(result.currentNodeId, "archive_trace_query");
      assertEqual(result.nodes.find((node) => node.id === "tax_filing_archive")?.status, "done");
      assertEqual(result.nodes.find((node) => node.id === "archive_trace_query")?.status, "current");
    }
  },
  {
    name: "defines the standalone common nodes and corrected default routes",
    run: () => {
      const nodesById = new Map(PROCESS_FLOW_NODES.map((node) => [node.id, node]));

      assertOk(nodesById.has("business_happens"), "Expected business_happens node definition");
      assertOk(nodesById.has("submit_ai_secretary"), "Expected submit_ai_secretary node definition");
      assertOk(nodesById.has("purchase_classification"), "Expected purchase_classification node definition");
      assertOk(nodesById.has("purchase_approval_dispatch"), "Expected purchase_approval_dispatch node definition");
      assertOk(nodesById.has("purchase_document_generation"), "Expected purchase_document_generation node definition");
      assertOk(nodesById.has("entertainment_classification"), "Expected entertainment_classification node definition");
      assertOk(nodesById.has("entertainment_approval_dispatch"), "Expected entertainment_approval_dispatch node definition");
      assertOk(nodesById.has("entertainment_document_generation"), "Expected entertainment_document_generation node definition");
      assertOk(nodesById.has("tax_filing_archive"), "Expected tax_filing_archive node definition");
      assertOk(nodesById.has("archive_trace_query"), "Expected archive_trace_query node definition");
      assertEqual(nodesById.get("ai_precheck")?.routes[0], "/events");
      assertEqual(nodesById.get("approval_dispatch")?.routes[0], "/tasks");
    }
  },
  {
    name: "keeps overview sections aligned to intro, branch, and outro ordering",
    run: () => {
      const overviewSections = getProcessFlowOverviewSections();
      const introSection = overviewSections.find((section) => section.id === "common-intro");
      const outroSection = overviewSections.find((section) => section.id === "common-outro");

      assertOk(introSection, "Expected intro overview section");
      assertOk(outroSection, "Expected outro overview section");
      assertEqual(
        introSection?.nodes.map((node) => node.id).join(","),
        ["business_happens", "submit_ai_secretary", "ai_precheck"].join(",")
      );
      assertEqual(
        outroSection?.nodes.map((node) => node.id).join(","),
        ["voucher_tax_processing", "tax_filing_archive", "archive_trace_query"].join(",")
      );
    }
  },
  {
    name: "inserts branch-specific nodes between the intro and shared downstream nodes",
    run: () => {
      const purchaseState = resolveProcessFlowState("purchase", "purchase_classification");
      const entertainmentState = resolveProcessFlowState("entertainment", "entertainment_classification");

      assertEqual(
        purchaseState.nodes.map((node) => node.id).join(","),
        [
          "business_happens",
          "submit_ai_secretary",
          "ai_precheck",
          "purchase_classification",
          "purchase_approval_dispatch",
          "purchase_document_generation",
          "voucher_tax_processing",
          "tax_filing_archive",
          "archive_trace_query"
        ].join(",")
      );
      assertEqual(
        entertainmentState.nodes.map((node) => node.id).join(","),
        [
          "business_happens",
          "submit_ai_secretary",
          "ai_precheck",
          "entertainment_classification",
          "entertainment_approval_dispatch",
          "entertainment_document_generation",
          "voucher_tax_processing",
          "tax_filing_archive",
          "archive_trace_query"
        ].join(",")
      );
    }
  },
  {
    name: "falls back to the first branch node when current node id is invalid",
    run: () => {
      const result = resolveProcessFlowState("purchase", "missing_node");

      assertEqual(result.currentNodeId, "business_happens");
      assertEqual(result.nodes.find((node) => node.id === "business_happens")?.status, "current");
      assertEqual(result.nodes.every((node) => node.status !== "done"), true);
    }
  }
];

let failures = 0;

for (const { name, run } of tests) {
  try {
    run();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures += 1;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`FAIL ${name}: ${message}`);
  }
}

if (failures > 0) {
  throw new Error(`${failures} process-flow tests failed`);
}
