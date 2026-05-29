import { useEffect, useState } from "react";
import type { LedgerEntry, LedgerPostingBatch } from "@finance-taxation/domain-model";
import {
  getCashJournal,
  getLedgerBalances,
  getLedgerSummary,
  listLedgerEntries,
  listLedgerPostingBatches,
  listAccountingPeriods,
  lockPeriod,
  unlockPeriod
} from "../lib/api";
import type { AccountingPeriod } from "../lib/api";
import { useQueryState } from "../hooks/useQueryState";
import { LedgerBalancesPanel } from "./ledger/LedgerBalancesPanel";
import { LedgerContextPanel } from "./ledger/LedgerContextPanel";
import { LedgerEntriesPanel } from "./ledger/LedgerEntriesPanel";
import { LedgerHeader } from "./ledger/LedgerHeader";
import { LedgerJournalPanel } from "./ledger/LedgerJournalPanel";
import { LedgerPeriodsPanel } from "./ledger/LedgerPeriodsPanel";
import { LedgerSceneSelector } from "./ledger/LedgerSceneSelector";
import { LedgerSceneSummary } from "./ledger/LedgerSceneSummary";
import { LedgerShell } from "./ledger/LedgerShell";
import { LedgerSummaryPanel } from "./ledger/LedgerSummaryPanel";
import {
  type JournalItem,
  type LedgerBalanceItem,
  LEDGER_SCENE_OPTIONS,
  type LedgerSceneKey,
  type LedgerSummaryItem,
  isLedgerSceneKey
} from "./ledger/types";

function buildSceneSummary(
  scene: LedgerSceneKey,
  context: {
    entryCount: number;
    batchCount: number;
    summaryCount: number;
    balanceCount: number;
    journalCount: number;
    lockedPeriodCount: number;
    voucherFilter: string;
    eventFilter: string;
    journalType: "cash" | "bank";
  }
) {
  switch (scene) {
    case "summary":
      return {
        title: "科目汇总总览",
        description: "先看累计借贷发生额，再决定是否继续钻取到科目余额或具体分录。",
        highlights: [`${context.summaryCount} 个科目`, `${context.entryCount} 条分录`, `${context.batchCount} 个过账批次`],
        pendingCount: context.summaryCount
      };
    case "balances":
      return {
        title: "科目余额复核",
        description: "适合月结前检查余额结构，确认异常科目后再回到分录场景追踪来源。",
        highlights: [`${context.balanceCount} 个余额科目`, `${context.entryCount} 条分录`, "月结前复核"],
        pendingCount: context.balanceCount
      };
    case "journal":
      return {
        title: `${context.journalType === "cash" ? "现金" : "银行"}日记账`,
        description: "按资金账类型和日期区间查看流水，用于核对资金收付与凭证来源。",
        highlights: [`${context.journalCount} 条记录`, context.journalType === "cash" ? "现金（1001）" : "银行存款（1002）", "支持日期过滤"],
        pendingCount: context.journalCount
      };
    case "entries":
      return {
        title: "总账分录与过账批次",
        description: "按凭证编号或事项编号过滤，快速定位过账来源并查看完整会计分录。",
        highlights: [`${context.entryCount} 条分录`, `${context.batchCount} 个批次`, context.voucherFilter || context.eventFilter ? "已启用过滤" : "当前查看全部"],
        pendingCount: context.entryCount
      };
    case "periods":
      return {
        title: "会计期间锁账",
        description: "关闭账期后锁定期间，防止已结账月份被继续过账或篡改。",
        highlights: [`${context.lockedPeriodCount} 个期间`, "支持新增锁账", "支持解锁回退"],
        pendingCount: context.lockedPeriodCount
      };
  }
}

export function LedgerPage() {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [batches, setBatches] = useState<LedgerPostingBatch[]>([]);
  const [summary, setSummary] = useState<LedgerSummaryItem[]>([]);
  const [balances, setBalances] = useState<LedgerBalanceItem[]>([]);
  const [journal, setJournal] = useState<JournalItem[]>([]);
  const [journalType, setJournalType] = useState<"cash" | "bank">("cash");
  const [journalFrom, setJournalFrom] = useState("");
  const [journalTo, setJournalTo] = useState("");
  const [message, setMessage] = useState("正在准备总账数据。");
  const [selectedVoucherId, setSelectedVoucherId] = useState("");
  const [selectedEventId, setSelectedEventId] = useState("");
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [newPeriod, setNewPeriod] = useState("");
  const [periodOp, setPeriodOp] = useState<string | null>(null);
  const [sceneQuery, setSceneQuery] = useQueryState("ledgerTab", "summary");
  const activeScene = isLedgerSceneKey(sceneQuery) ? sceneQuery : "summary";

  useEffect(() => {
    async function bootstrap() {
      try {
        const [entriesPayload, batchesPayload, summaryPayload, balancesPayload] = await Promise.all([
          listLedgerEntries(),
          listLedgerPostingBatches(),
          getLedgerSummary(),
          getLedgerBalances()
        ]);
        setEntries(entriesPayload.items);
        setBatches(batchesPayload.items);
        setSummary(summaryPayload.items);
        setBalances(balancesPayload.items);
        setMessage(
          `已加载 ${entriesPayload.total} 条总账分录，${batchesPayload.total} 个过账批次，${summaryPayload.total} 个科目汇总。`
        );
      } catch (error) {
        setMessage((error as Error).message);
      }
    }
    void bootstrap();
  }, []);

  useEffect(() => {
    if (activeScene === "journal") {
      void loadJournal();
      return;
    }
    if (activeScene === "periods") {
      void loadPeriods();
    }
  }, [activeScene]);

  useEffect(() => {
    if (!isLedgerSceneKey(sceneQuery)) {
      setSceneQuery("summary");
    }
  }, [sceneQuery, setSceneQuery]);

  async function filterLedger(filters: { voucherId?: string; businessEventId?: string }) {
    const [entriesPayload, batchesPayload] = await Promise.all([
      listLedgerEntries(filters),
      listLedgerPostingBatches(filters.voucherId || undefined)
    ]);
    setEntries(entriesPayload.items);
    setBatches(batchesPayload.items);
    setMessage(
      filters.voucherId || filters.businessEventId
        ? `已按条件过滤，当前 ${entriesPayload.total} 条分录，${batchesPayload.total} 个批次。`
        : `已恢复全部总账数据，当前 ${entriesPayload.total} 条分录，${batchesPayload.total} 个批次。`
    );
  }

  async function loadPeriods() {
    try {
      const payload = await listAccountingPeriods();
      setPeriods(payload.items);
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function handleLock(period: string) {
    setPeriodOp(period);
    try {
      await lockPeriod(period);
      await loadPeriods();
      setMessage(`期间 ${period} 已锁账。`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setPeriodOp(null);
    }
  }

  async function handleUnlock(period: string) {
    setPeriodOp(period);
    try {
      await unlockPeriod(period);
      await loadPeriods();
      setMessage(`期间 ${period} 已解锁。`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setPeriodOp(null);
    }
  }

  async function handleLockNew() {
    if (!/^\d{4}-\d{2}$/.test(newPeriod)) {
      setMessage("期间格式错误，请输入 YYYY-MM 格式，例如 2026-05");
      return;
    }
    await handleLock(newPeriod);
    setNewPeriod("");
  }

  async function loadJournal() {
    try {
      const payload = await getCashJournal({
        type: journalType,
        from: journalFrom || undefined,
        to: journalTo || undefined
      });
      setJournal(payload.items);
      setMessage(`${journalType === "cash" ? "现金" : "银行"}日记账已加载，共 ${payload.total} 条记录。`);
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  function renderScene() {
    switch (activeScene) {
      case "summary":
        return <LedgerSummaryPanel items={summary} />;
      case "balances":
        return <LedgerBalancesPanel items={balances} />;
      case "journal":
        return (
          <LedgerJournalPanel
            items={journal}
            journalType={journalType}
            journalFrom={journalFrom}
            journalTo={journalTo}
            onJournalTypeChange={setJournalType}
            onJournalFromChange={setJournalFrom}
            onJournalToChange={setJournalTo}
            onLoadJournal={() => {
              void loadJournal();
            }}
          />
        );
      case "entries":
        return (
          <LedgerEntriesPanel
            entries={entries}
            batches={batches}
            selectedVoucherId={selectedVoucherId}
            selectedEventId={selectedEventId}
            onVoucherIdChange={setSelectedVoucherId}
            onEventIdChange={setSelectedEventId}
            onFilter={() => {
              void filterLedger({
                voucherId: selectedVoucherId || undefined,
                businessEventId: selectedEventId || undefined
              });
            }}
            onClear={() => {
              setSelectedVoucherId("");
              setSelectedEventId("");
              void filterLedger({});
            }}
          />
        );
      case "periods":
        return (
          <LedgerPeriodsPanel
            periods={periods}
            newPeriod={newPeriod}
            periodOp={periodOp}
            onNewPeriodChange={setNewPeriod}
            onLockNew={() => {
              void handleLockNew();
            }}
            onLock={(period) => {
              void handleLock(period);
            }}
            onUnlock={(period) => {
              void handleUnlock(period);
            }}
          />
        );
    }
  }

  const activeOption = LEDGER_SCENE_OPTIONS.find((option) => option.key === activeScene) ?? {
    key: "summary",
    title: "科目汇总",
    description: "查看累计借贷发生额，快速判断总账覆盖范围。",
    emoji: "📚"
  };
  const sceneSummary = buildSceneSummary(activeScene, {
    entryCount: entries.length,
    batchCount: batches.length,
    summaryCount: summary.length,
    balanceCount: balances.length,
    journalCount: journal.length,
    lockedPeriodCount: periods.length,
    voucherFilter: selectedVoucherId,
    eventFilter: selectedEventId,
    journalType
  });

  return (
    <LedgerShell
      header={<LedgerHeader activeSceneLabel={activeOption.title} />}
      summary={(
        <LedgerSceneSummary
          scene={activeScene}
          title={sceneSummary.title}
          description={sceneSummary.description}
          highlights={sceneSummary.highlights}
          pendingCount={sceneSummary.pendingCount}
        />
      )}
      sceneSelector={(
        <LedgerSceneSelector
          activeScene={activeScene}
          options={LEDGER_SCENE_OPTIONS}
          onChange={(scene) => setSceneQuery(scene)}
        />
      )}
      content={renderScene()}
      context={(
        <LedgerContextPanel
          scene={activeScene}
          message={message}
          entryCount={entries.length}
          batchCount={batches.length}
          summaryCount={summary.length}
          balanceCount={balances.length}
          journalCount={journal.length}
          lockedPeriodCount={periods.length}
          voucherFilter={selectedVoucherId}
          eventFilter={selectedEventId}
          journalType={journalType}
          journalFrom={journalFrom}
          journalTo={journalTo}
        />
      )}
    />
  );
}
