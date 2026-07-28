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
import { HelpPanel, HelpTriggerButton } from "../components/ui/HelpPanel";
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

function LedgerHelpPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <HelpPanel
      open={open}
      title="总账中心 · 业务关系与操作说明"
      onClose={onClose}
      relations={(
        <>
          <strong><Term k="voucher">凭证</Term>中心</strong>审核<Term k="posting">过账</Term>后，<Term k="journal-entry">分录</Term>进入<strong>总账中心</strong>按<Term k="account">科目</Term>归集；<Term k="general-ledger">总账</Term>是<strong>财务报表</strong>的直接数据来源，也为<strong>税务申报</strong>和<strong><Term k="archive">归档</Term>审计</strong>提供账务依据。
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
        <strong>五件事各是什么</strong>
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
  const [showHelp, setShowHelp] = useState(false);

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
          />
        );
    }
  }

  const activeTaskLabel = tasks.find((task) => task.key === activeTask)?.label ?? "";

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <ProPageBanner
        pageName="总账中心"
        plain="账本的原始记录：每笔业务记进了哪个科目、什么时候入的账、有没有正式生效，财务在这里查账对账。想知道钱花在哪儿、还剩多少，看「经营报告」或直接问 AI 更快。"
      />
      <LedgerHelpPanel open={showHelp} onClose={() => setShowHelp(false)} />
      <LedgerShell
        header={(
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <HelpTriggerButton onClick={() => setShowHelp(true)} label="查看总账中心操作说明" />
            </div>
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
