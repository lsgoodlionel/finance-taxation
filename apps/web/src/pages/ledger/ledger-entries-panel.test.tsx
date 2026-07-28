import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import type { LedgerEntry, LedgerPostingBatch } from "@finance-taxation/domain-model";
import { LedgerEntriesPanel } from "./LedgerEntriesPanel";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const batch = {
  id: "BATCH-1",
  companyId: "C-1",
  voucherId: "VCH-1",
  businessEventId: "EVT-1",
  entryIds: ["ENT-1"],
  postedAt: "2026-05-01T00:00:00.000Z",
  postedBy: "U-1"
} as unknown as LedgerPostingBatch;

const entry = {
  id: "ENT-1",
  companyId: "C-1",
  voucherId: "VCH-1",
  entryDate: "2026-05-01",
  summary: "采购入库",
  accountCode: "1001",
  accountName: "库存现金",
  debit: "100.00",
  credit: "0.00"
} as unknown as LedgerEntry;

function render(overrides: { onFilterByVoucher?: (voucherId: string) => void } = {}): string {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(LedgerEntriesPanel, {
        entries: [entry],
        batches: [batch],
        selectedVoucherId: "",
        selectedEventId: "",
        onVoucherIdChange: () => undefined,
        onEventIdChange: () => undefined,
        onFilter: () => undefined,
        onClear: () => undefined,
        onFilterByVoucher: overrides.onFilterByVoucher ?? (() => undefined)
      })
    )
  );
}

const html = render();

// 过账批次表：凭证与事项都要是能走过去的链接，而不是裸 id 文本。
assert(
  html.includes('href="/vouchers"') && html.includes('aria-label="打开凭证 VCH-1"'),
  `expected voucher link in batch table, got ${html}`
);
assert(
  html.includes('href="/events?event=EVT-1"') && html.includes('aria-label="打开经营事项 EVT-1"'),
  `expected business event link in batch table, got ${html}`
);

// 总账分录表：来源凭证是「就地过滤」按钮，用户不必把编号手抄进上方输入框。
assert(
  html.includes('aria-label="按凭证 VCH-1 过滤总账"'),
  `expected source-voucher filter button, got ${html}`
);
assert(
  html.includes("不必手工把编号抄进这里"),
  `expected filter hint describing the click-to-filter shortcut, got ${html}`
);

console.log("ledger-entries-panel-ok");
