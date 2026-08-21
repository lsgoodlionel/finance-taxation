/**
 * 总账中心（V10 车道 G2：按任务重组）。
 *
 * 改造前首屏 7 个平级区块：页头横幅、全站 10 环节导航条、页头卡、场景摘要、
 * 5 张场景卡、场景内容、右侧上下文面板。其中场景摘要与上下文面板讲的是同一批
 * 数字，场景卡是第三处「这页能干什么」的罗列——用户打开看到的是「总账能查什么」，
 * 而不是「你现在要查什么」。
 *
 * 改造后：五个场景成为五件事（见 ledger/ledger-tasks.ts），TaskFocusShell 一次
 * 只渲染一件事的工作区，上下文面板随任务收缩成 aside。全站导航条移除，理由与
 * /tax 一致：它按当前页下标算 done/current，本质是导航，左侧主菜单已在做同一件事。
 */
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import type { LedgerEntry, LedgerPostingBatch } from "@finance-taxation/domain-model";
import { ProPageBanner } from "../components/ui/ProPageBanner";
import { TaskFocusShell } from "../components/ui/TaskFocusShell";
import { Term } from "../components/ui/Term";
import {
  getCashJournal,
  getLedgerBalances,
  getLedgerSummary,
  listLedgerEntries,
  listLedgerPostingBatches,
  listAccountingPeriods,
  closeIncomeForPeriod,
  lockPeriod,
  unlockPeriod
} from "../lib/api";
import type { AccountingPeriod } from "../lib/api";
import { normalizeDrilldownState } from "./drilldown";
import { LedgerBalancesPanel } from "./ledger/LedgerBalancesPanel";
import { LedgerContextPanel } from "./ledger/LedgerContextPanel";
import { LedgerEntriesPanel } from "./ledger/LedgerEntriesPanel";
import { LedgerHeader } from "./ledger/LedgerHeader";
import { LedgerJournalPanel } from "./ledger/LedgerJournalPanel";
import { LedgerPeriodsPanel } from "./ledger/LedgerPeriodsPanel";
import { OpeningBalancePanel } from "./ledger/OpeningBalancePanel";
import { FiscalYearPanel } from "./ledger/FiscalYearPanel";
import { LedgerRevaluationPanel } from "./ledger/LedgerRevaluationPanel";
import { LedgerShell } from "./ledger/LedgerShell";
import { LedgerSummaryPanel } from "./ledger/LedgerSummaryPanel";
import {
  buildLedgerTasks,
  countUnlockedPeriods,
  readLedgerTask,
  writeLedgerTask
} from "./ledger/ledger-tasks";
import {
  type JournalItem,
  type LedgerBalanceItem,
  type LedgerSceneKey,
  type LedgerSummaryItem,
  isLedgerSceneKey
} from "./ledger/types";

const LEDGER_SCENE_GUIDE: readonly (readonly [string, string])[] = [
  ["科目汇总", "按科目查看累计借贷发生额，先总览全账覆盖范围，再决定往哪里钻取"],
  ["科目余额", "查看各科目当前余额结构，适合月结前复核，发现异常科目后再追分录"],
  ["日记账", "按现金 / 银行账户查看每日资金流水，用于核对钱的实际收付"],
  ["分录与批次", "查看每笔过账形成的会计分录和过账批次，可按凭证号或事项号过滤定位来源"],
  ["期间锁账", "把已结账的月份锁定（或解锁），防止旧账被继续过账或篡改"]
] as const;

export function LedgerPage() {
  const location = useLocation();
  const navState = normalizeDrilldownState(location.state);
  const navVoucherId = navState.voucherId ?? null;
  const navEventId = navState.businessEventId ?? null;

  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [batches, setBatches] = useState<LedgerPostingBatch[]>([]);
  const [summary, setSummary] = useState<LedgerSummaryItem[]>([]);
  const [balances, setBalances] = useState<LedgerBalanceItem[]>([]);
  const [journal, setJournal] = useState<JournalItem[]>([]);
  const [journalType, setJournalType] = useState<"cash" | "bank">("cash");
  const [journalFrom, setJournalFrom] = useState("");
  const [journalTo, setJournalTo] = useState("");
  const [message, setMessage] = useState("正在准备总账数据。");
  const [selectedVoucherId, setSelectedVoucherId] = useState(navVoucherId ?? "");
  const [selectedEventId, setSelectedEventId] = useState(navVoucherId ? "" : navEventId ?? "");
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [newPeriod, setNewPeriod] = useState("");
  const [periodOp, setPeriodOp] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTask: LedgerSceneKey = readLedgerTask(searchParams);
  const tasks = useMemo(() => buildLedgerTasks({ periods }), [periods]);

  function selectTask(task: string) {
    if (!isLedgerSceneKey(task)) {
      return;
    }
    setSearchParams(writeLedgerTask(searchParams, task));
  }

  /**
   * 从凭证中心「查看总账」跳过来时带着 voucherId：把当前这件事切到「追一笔分录的
   * 来源」，否则用户落在科目汇总上，还得自己找到过滤框把凭证号抄一遍。
   *
   * 写进 URL 而不是直接算进 activeTask：后者会让 location.state 永久压住切换器，
   * 用户点别的任务点不动。replace 是为了不在历史里多压一格。
   */
  useEffect(() => {
    if (!navVoucherId && !navEventId) {
      return;
    }
    setSearchParams(writeLedgerTask(searchParams, "entries"), { replace: true });
    // 只在跳转带来的定位信息变化时执行；searchParams 变化不该把用户拽回来。
  }, [navEventId, navVoucherId]);

  useEffect(() => {
    async function bootstrap() {
      // 从凭证/事项跳进来时首屏就按它过滤，别让用户面对全量数据再自己抄一遍编号。
      const arrivalFilter = navVoucherId
        ? { voucherId: navVoucherId }
        : navEventId
          ? { businessEventId: navEventId }
          : {};
      try {
        const [entriesPayload, batchesPayload, summaryPayload, balancesPayload] = await Promise.all([
          listLedgerEntries(arrivalFilter),
          listLedgerPostingBatches(navVoucherId ?? undefined),
          getLedgerSummary(),
          getLedgerBalances()
        ]);
        setEntries(entriesPayload.items);
        setBatches(batchesPayload.items);
        setSummary(summaryPayload.items);
        setBalances(balancesPayload.items);
        const arrivalLabel = navVoucherId
          ? `已按凭证 ${navVoucherId} 过滤：`
          : navEventId
            ? `已按事项 ${navEventId} 过滤：`
            : "已加载 ";
        setMessage(
          `${arrivalLabel}${entriesPayload.total} 条总账分录，${batchesPayload.total} 个过账批次，${summaryPayload.total} 个科目汇总。`
        );
      } catch (error) {
        setMessage((error as Error).message);
      }
    }
    void bootstrap();
    // 期间清单要在进页面时就拉：任务切换器上「还有几个期间没锁」的角标靠它，
    // 等用户点进锁账那件事再拉就永远是 0，角标等于骗人。
    void loadPeriods();
  }, [navEventId, navVoucherId]);

  useEffect(() => {
    if (activeTask === "journal") {
      void loadJournal();
      return;
    }
    if (activeTask === "periods") {
      void loadPeriods();
    }
  }, [activeTask]);

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

  /**
   * 结转损益。幂等：已结转过的属期不会重复生成分录。
   *
   * 提示要区分「刚生成」和「本来就已结转」——两种都成功，但用户该做的事不同。
   */
  async function handleCloseIncome(period: string) {
    setPeriodOp(period);
    try {
      const result = await closeIncomeForPeriod(period);
      setMessage(
        result.alreadyClosed
          ? `期间 ${period} 之前已经结转过损益，本次未重复生成。`
          : `已生成 ${period} 的结转损益凭证草稿，去凭证中心复核过账后才入账。`
      );
      await loadPeriods();
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

  function renderWorkspace() {
    switch (activeTask) {
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
            onFilterByVoucher={(voucherId) => {
              // 点击来源凭证 = 就地过滤（用户仍在总账里追这一张凭证的全部分录），
              // 而不是跳去凭证中心：跳走会丢掉当前场景。想看凭证本身，
              // 上方「过账批次」表的凭证列是可点的跳转链接。
              setSelectedVoucherId(voucherId);
              setSelectedEventId("");
              void filterLedger({ voucherId });
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
            onCloseIncome={(period) => {
              void handleCloseIncome(period);
            }}
          />
        );
      case "opening":
        return <OpeningBalancePanel />;
      case "fiscalYear":
        return <FiscalYearPanel />;
      case "revaluation":
        // 面板自己管汇率、截止日与预览：它们只服务这一件事，提到页面层
        // 只会让另外五件事的状态里多出几个用不上的字段。
        return <LedgerRevaluationPanel />;
    }
  }

  const activeTaskLabel = tasks.find((task) => task.key === activeTask)?.label ?? "";

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <ProPageBanner
        pageName="总账中心"
        plain="账本的原始记录：每笔业务记进了哪个科目、什么时候入的账、有没有正式生效，财务在这里查账对账。想知道钱花在哪儿、还剩多少，看「经营报告」或直接问 AI 更快。"
      />
      <LedgerShell
        header={(
          <div style={{ display: "grid", gap: 10 }}>
            <LedgerHeader activeSceneLabel={activeTaskLabel} />
          </div>
        )}
      >
        <TaskFocusShell
          tasks={tasks}
          activeKey={activeTask}
          onSelectTask={selectTask}
          switcherLabel="总账中心能办的事"
          aside={(
            <LedgerContextPanel
              scene={activeTask}
              message={message}
              entryCount={entries.length}
              batchCount={batches.length}
              summaryCount={summary.length}
              balanceCount={balances.length}
              journalCount={journal.length}
              lockedPeriodCount={periods.length - countUnlockedPeriods(periods)}
              unlockedPeriodCount={countUnlockedPeriods(periods)}
              voucherFilter={selectedVoucherId}
              eventFilter={selectedEventId}
              journalType={journalType}
              journalFrom={journalFrom}
              journalTo={journalTo}
            />
          )}
        >
          {renderWorkspace()}
        </TaskFocusShell>
      </LedgerShell>
    </div>
  );
}
