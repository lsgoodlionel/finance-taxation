// Unit tests for RndPage logic — no DOM required
function okRnd(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// ─── KPI aggregation ──────────────────────────────────────────────────────────

interface RndSummary { expenseAmount: string; capitalizedAmount: string; superDeductionEligibleBase: string }
interface RndProject { status: string; summary: RndSummary }

function aggregateKpis(projects: RndProject[]) {
  const active = projects.filter(p => p.status === "active" || p.status === "planning").length;
  const totalInvestment = projects.reduce((s, p) =>
    s + parseFloat(p.summary.expenseAmount || "0") + parseFloat(p.summary.capitalizedAmount || "0"), 0
  );
  const eligibleBase = projects.reduce((s, p) =>
    s + parseFloat(p.summary.superDeductionEligibleBase || "0"), 0
  );
  return { active, totalInvestment, eligibleBase, estimatedDeduction: eligibleBase * 0.75 };
}

const projects: RndProject[] = [
  { status: "active",    summary: { expenseAmount: "100000", capitalizedAmount: "50000", superDeductionEligibleBase: "120000" } },
  { status: "planning",  summary: { expenseAmount: "20000",  capitalizedAmount: "0",     superDeductionEligibleBase: "20000"  } },
  { status: "completed", summary: { expenseAmount: "80000",  capitalizedAmount: "30000", superDeductionEligibleBase: "90000"  } },
];

const kpis = aggregateKpis(projects);
okRnd(kpis.active === 2,                              "2 active/planning projects");
okRnd(kpis.totalInvestment === 280000,                "total investment is 280000");
okRnd(kpis.eligibleBase === 230000,                   "eligible base is 230000");
okRnd(kpis.estimatedDeduction === 230000 * 0.75,      "deduction is 75% of eligible base");

// ─── Cost collection totals ───────────────────────────────────────────────────

interface CostEntry { accountingTreatment: string; amount: string }

function computeTotals(entries: CostEntry[]) {
  const expensed    = entries.filter(e => e.accountingTreatment === "expensed").reduce((s, e) => s + parseFloat(e.amount || "0"), 0);
  const capitalized = entries.filter(e => e.accountingTreatment === "capitalized").reduce((s, e) => s + parseFloat(e.amount || "0"), 0);
  return { expensed, capitalized, total: expensed + capitalized, eligibleBase: expensed + capitalized * 0.6 };
}

const entries: CostEntry[] = [
  { accountingTreatment: "expensed",    amount: "50000" },
  { accountingTreatment: "expensed",    amount: "30000" },
  { accountingTreatment: "capitalized", amount: "20000" },
];

const totals = computeTotals(entries);
okRnd(totals.expensed    === 80000,  "expensed total is 80000");
okRnd(totals.capitalized === 20000,  "capitalized total is 20000");
okRnd(totals.total       === 100000, "total is 100000");
okRnd(totals.eligibleBase === 80000 + 20000 * 0.6, "eligible base is expensed + 60% of capitalized");

// ─── Super-deduction rate ─────────────────────────────────────────────────────

function computeDeduction(eligibleBase: number, rate = 0.75) {
  return eligibleBase * rate;
}

okRnd(computeDeduction(100000)        === 75000,  "75% deduction on 100000");
okRnd(computeDeduction(100000, 1.0)   === 100000, "100% deduction for high-tech enterprises");
okRnd(computeDeduction(0)             === 0,      "zero base gives zero deduction");
