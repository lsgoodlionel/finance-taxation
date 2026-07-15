import { useEffect, useState } from "react";
import type { LedgerEntry, LedgerPostingBatch } from "@finance-taxation/domain-model";
import { FinanceFlowBar } from "../components/FinanceFlowBar";
import { HelpPanel, HelpTriggerButton } from "../components/ui/HelpPanel";
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

const LEDGER_SCENE_GUIDE: readonly (readonly [string, string])[] = [
  ["科目汇总", "按科目查看累计借贷发生额，先总览全账覆盖范围，再决定往哪里钻取"],
  ["科目余额", "查看各科目当前余额结构，适合月结前复核，发现异常科目后再追分录"],
  ["日记账", "按现金 / 银行账户查看每日资金流水，用于核对钱的实际收付"],
  ["分录与批次", "查看每笔过账形成的会计分录和过账批次，可按凭证号或事项号过滤定位来源"],
  ["期间锁账", "把已结账的月份锁定（或解锁），防止旧账被继续过账或篡改"]
] as const;

function LedgerHelpPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <HelpPanel
      open={open}
      title="总账中心 · 业务关系与操作说明"
      onClose={onClose}
      relations={(
        <>
          <strong>凭证中心</strong>审核过账后，分录进入<strong>总账中心</strong>按科目归集；总账是<strong>财务报表</strong>的直接数据来源，也为<strong>税务申报</strong>和<strong>归档审计</strong>提供账务依据。
        </>
      )}
      workflowSteps={[
        "凭证在凭证中心审核并过账",
        "过账批次进入总账，按科目形成分录和余额",
        "在本页复核科目汇总、余额和资金日记账",
        "月结完成后对账期执行锁账，保护已结账数据",
        "总账数据流向报表、税务和归档"
      ]}
      responsibility="这里是全公司账务的结果页：汇总所有已过账凭证，按科目展示发生额、余额和资金流水，并管理会计期间的锁账与解锁。"
      caution="总账数据只能通过凭证过账形成，不能在本页直接修改。发现错账应回到凭证中心处理；已锁账期间需先解锁（反结账）并会留下审计记录。"
    >
      <div>
        <strong>五个场景各是什么</strong>
        {LEDGER_SCENE_GUIDE.map(([scene, description]) => (
          <div key={scene} style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
            <span style={{ fontWeight: 600, minWidth: "76px" }}>{scene}</span>
            <span style={{ color: "#4d5d6c" }}>{description}</span>
          </div>
        ))}
      </div>
    </HelpPanel>
  );
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
  const [showHelp, setShowHelp] = useState(false);
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
    <div style={{ display: "grid", gap: 24 }}>
      <FinanceFlowBar current="ledger" />
      <LedgerHelpPanel open={showHelp} onClose={() => setShowHelp(false)} />
      <LedgerShell
        header={(
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <HelpTriggerButton onClick={() => setShowHelp(true)} label="查看总账中心操作说明" />
            </div>
            <LedgerHeader activeSceneLabel={activeOption.title} />
          </div>
        )}
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
    </div>
  );
}
