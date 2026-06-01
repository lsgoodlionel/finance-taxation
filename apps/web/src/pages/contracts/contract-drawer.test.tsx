// Unit tests for ContractDrawer and ContractCloseWizard logic
function okContract(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// ─── Checklist validation ─────────────────────────────────────────────────────

interface ChecklistItem { id: string; required: boolean }

const CHECKLIST: ChecklistItem[] = [
  { id: "payment",  required: true  },
  { id: "delivery", required: true  },
  { id: "accept",   required: true  },
  { id: "invoice",  required: true  },
  { id: "voucher",  required: false },
  { id: "archive",  required: false },
];

function allRequiredChecked(checked: Set<string>): boolean {
  return CHECKLIST.filter(i => i.required).every(i => checked.has(i.id));
}

const emptyChecked = new Set<string>();
const partialChecked = new Set(["payment", "delivery"]);
const allRequired = new Set(CHECKLIST.filter(i => i.required).map(i => i.id));
const allChecked  = new Set(CHECKLIST.map(i => i.id));

okContract(!allRequiredChecked(emptyChecked),  "empty set fails validation");
okContract(!allRequiredChecked(partialChecked), "partial required fails validation");
okContract(allRequiredChecked(allRequired),     "all required passes validation");
okContract(allRequiredChecked(allChecked),      "all items passes validation");

// ─── Toggle check ─────────────────────────────────────────────────────────────

function toggleCheck(prev: Set<string>, id: string): Set<string> {
  const next = new Set(prev);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

const s1 = toggleCheck(new Set<string>(), "payment");
okContract(s1.has("payment"), "toggle adds item");

const s2 = toggleCheck(s1, "payment");
okContract(!s2.has("payment"), "toggle removes item");

// ─── Status labels ────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  draft: "草稿", active: "执行中", fulfilled: "已履行", terminated: "已终止", expired: "已到期",
};

okContract(STATUS_LABELS.fulfilled  === "已履行", "fulfilled label correct");
okContract(STATUS_LABELS.terminated === "已终止", "terminated label correct");
okContract(STATUS_LABELS.active     === "执行中", "active label correct");

// ─── Contract close allowed statuses ─────────────────────────────────────────

function canClose(status: string): boolean {
  return status === "active" || status === "draft";
}

okContract(canClose("active"),    "active can be closed");
okContract(canClose("draft"),     "draft can be closed");
okContract(!canClose("fulfilled"),"fulfilled cannot be re-closed");
okContract(!canClose("terminated"),"terminated cannot be re-closed");
