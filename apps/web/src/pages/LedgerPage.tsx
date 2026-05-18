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

type ActiveTab = "summary" | "balances" | "journal" | "entries" | "periods";

interface JournalItem {
  id: string;
  accountCode: string;
  accountName: string;
  summary: string;
  debit: string;
  credit: string;
  balance: string;
  postedAt: string;
  voucherId: string;
}

function panelStyle() {
  return {
    background: "rgba(255,255,255,0.82)",
    borderRadius: "24px",
    border: "1px solid rgba(20,40,60,0.08)",
    padding: "24px"
  } as const;
}

function tableStyle() {
  return { width: "100%", borderCollapse: "collapse" as const };
}

function cellStyle() {
  return {
    borderBottom: "1px solid rgba(20,40,60,0.08)",
    padding: "10px 8px",
    textAlign: "left" as const
  };
}

function numCell() {
  return { ...cellStyle(), textAlign: "right" as const, fontVariantNumeric: "tabular-nums" as const };
}

function tabBtn(active: boolean, onClick: () => void, label: string) {
  return (
    <button
      key={label}
      onClick={onClick}
      style={{
        padding: "8px 18px",
        borderRadius: "20px",
        border: "none",
        cursor: "pointer",
        fontWeight: active ? 700 : 400,
        background: active ? "#1e2a37" : "transparent",
        color: active ? "#fff" : "#4d5d6c"
      }}
    >
      {label}
    </button>
  );
}

export function LedgerPage() {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [batches, setBatches] = useState<LedgerPostingBatch[]>([]);
  const [summary, setSummary] = useState<
    Array<{ accountCode: string; accountName: string; debit: string; credit: string }>
  >([]);
  const [balances, setBalances] = useState<
    Array<{ accountCode: string; accountName: string; debit: string; credit: string; balance: string }>
  >([]);
  const [journal, setJournal] = useState<JournalItem[]>([]);
  const [journalType, setJournalType] = useState<"cash" | "bank">("cash");
  const [journalFrom, setJournalFrom] = useState("");
  const [journalTo, setJournalTo] = useState("");
  const [message, setMessage] = useState("正在准备总账数据。");
  const [selectedVoucherId, setSelectedVoucherId] = useState<string>("");
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<ActiveTab>("summary");
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [newPeriod, setNewPeriod] = useState("");
  const [periodOp, setPeriodOp] = useState<string | null>(null);

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
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  async function handleLock(period: string) {
    setPeriodOp(period);
    try {
      await lockPeriod(period);
      await loadPeriods();
      setMessage(`期间 ${period} 已锁账。`);
    } catch (err) {
      setMessage((err as Error).message);
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
    } catch (err) {
      setMessage((err as Error).message);
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
      setMessage(
        `${journalType === "cash" ? "现金" : "银行"}日记账已加载，共 ${payload.total} 条记录。`
      );
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  return (
    <section style={{ display: "grid", gap: "20px" }}>
      <article style={panelStyle()}>
        <h2 style={{ marginTop: 0 }}>总账中心</h2>
        <p style={{ lineHeight: 1.8, color: "#4d5d6c" }}>{message}</p>
      </article>

      {/* Tab bar */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          background: "rgba(255,255,255,0.6)",
          borderRadius: "24px",
          border: "1px solid rgba(20,40,60,0.08)",
          padding: "6px 10px"
        }}
      >
        {tabBtn(activeTab === "summary", () => setActiveTab("summary"), "科目汇总")}
        {tabBtn(activeTab === "balances", () => setActiveTab("balances"), "科目余额")}
        {tabBtn(activeTab === "journal", () => { setActiveTab("journal"); void loadJournal(); }, "现金/银行日记账")}
        {tabBtn(activeTab === "entries", () => setActiveTab("entries"), "总账分录")}
        {tabBtn(activeTab === "periods", () => { setActiveTab("periods"); void loadPeriods(); }, "期间锁账")}
      </div>

      {/* ── 科目汇总 ── */}
      {activeTab === "summary" && (
        <article style={panelStyle()}>
          <h3 style={{ marginTop: 0 }}>科目汇总</h3>
          <table style={tableStyle()}>
            <thead>
              <tr>
                <th style={cellStyle()}>科目编码</th>
                <th style={cellStyle()}>科目名称</th>
                <th style={numCell()}>借方累计</th>
                <th style={numCell()}>贷方累计</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((item) => (
                <tr key={`${item.accountCode}-${item.accountName}`}>
                  <td style={cellStyle()}>{item.accountCode}</td>
                  <td style={cellStyle()}>{item.accountName}</td>
                  <td style={numCell()}>{item.debit}</td>
                  <td style={numCell()}>{item.credit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      )}

      {/* ── 科目余额 ── */}
      {activeTab === "balances" && (
        <article style={panelStyle()}>
          <h3 style={{ marginTop: 0 }}>科目余额</h3>
          <table style={tableStyle()}>
            <thead>
              <tr>
                <th style={cellStyle()}>科目编码</th>
                <th style={cellStyle()}>科目名称</th>
                <th style={numCell()}>借方累计</th>
                <th style={numCell()}>贷方累计</th>
                <th style={numCell()}>余额</th>
              </tr>
            </thead>
            <tbody>
              {balances.map((item) => (
                <tr key={`${item.accountCode}-${item.accountName}-balance`}>
                  <td style={cellStyle()}>{item.accountCode}</td>
                  <td style={cellStyle()}>{item.accountName}</td>
                  <td style={numCell()}>{item.debit}</td>
                  <td style={numCell()}>{item.credit}</td>
                  <td style={{ ...numCell(), fontWeight: 600 }}>{item.balance}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      )}

      {/* ── 现金/银行日记账 ── */}
      {activeTab === "journal" && (
        <article style={panelStyle()}>
          <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap", marginBottom: "16px" }}>
            <h3 style={{ margin: 0 }}>日记账</h3>
            <div style={{ display: "flex", gap: "8px", background: "rgba(20,40,60,0.06)", borderRadius: "12px", padding: "4px" }}>
              <button
                onClick={() => setJournalType("cash")}
                style={{
                  padding: "4px 14px", borderRadius: "8px", border: "none", cursor: "pointer",
                  background: journalType === "cash" ? "#1e2a37" : "transparent",
                  color: journalType === "cash" ? "#fff" : "#4d5d6c"
                }}
              >
                现金（1001）
              </button>
              <button
                onClick={() => setJournalType("bank")}
                style={{
                  padding: "4px 14px", borderRadius: "8px", border: "none", cursor: "pointer",
                  background: journalType === "bank" ? "#1e2a37" : "transparent",
                  color: journalType === "bank" ? "#fff" : "#4d5d6c"
                }}
              >
                银行存款（1002）
              </button>
            </div>
            <input
              value={journalFrom}
              onChange={(e) => setJournalFrom(e.target.value)}
              placeholder="开始日期 2026-01-01"
              style={{ width: "150px" }}
            />
            <input
              value={journalTo}
              onChange={(e) => setJournalTo(e.target.value)}
              placeholder="结束日期 2026-12-31"
              style={{ width: "150px" }}
            />
            <button onClick={() => void loadJournal()}>查询</button>
          </div>
          {journal.length === 0 ? (
            <p style={{ color: "#aaa" }}>暂无日记账记录，请点击「查询」加载。</p>
          ) : (
            <table style={tableStyle()}>
              <thead>
                <tr>
                  <th style={cellStyle()}>日期</th>
                  <th style={cellStyle()}>科目</th>
                  <th style={cellStyle()}>摘要</th>
                  <th style={numCell()}>借方</th>
                  <th style={numCell()}>贷方</th>
                  <th style={numCell()}>余额</th>
                  <th style={cellStyle()}>来源凭证</th>
                </tr>
              </thead>
              <tbody>
                {journal.map((item) => {
                  const bal = Number(item.balance);
                  return (
                    <tr key={item.id}>
                      <td style={cellStyle()}>{item.postedAt?.slice(0, 10)}</td>
                      <td style={cellStyle()}>
                        <span style={{ fontSize: "12px", color: "#4d5d6c" }}>{item.accountCode}</span>{" "}
                        {item.accountName}
                      </td>
                      <td style={cellStyle()}>{item.summary}</td>
                      <td style={numCell()}>{Number(item.debit) > 0 ? item.debit : ""}</td>
                      <td style={numCell()}>{Number(item.credit) > 0 ? item.credit : ""}</td>
                      <td style={{ ...numCell(), color: bal < 0 ? "#c0392b" : "inherit" }}>{item.balance}</td>
                      <td style={{ ...cellStyle(), fontSize: "11px", color: "#4d5d6c" }}>
                        {item.voucherId?.slice(-8).toUpperCase()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </article>
      )}

      {/* ── 期间锁账 ── */}
      {activeTab === "periods" && (
        <article style={panelStyle()}>
          <h3 style={{ marginTop: 0 }}>会计期间锁账管理</h3>
          <p style={{ color: "#4d5d6c", fontSize: "13px", marginBottom: "16px" }}>
            锁账后，该会计期间内的凭证将无法过账，防止账期关闭后的数据篡改。
          </p>

          {/* 新增锁账 */}
          <div style={{ display: "flex", gap: "10px", marginBottom: "20px", alignItems: "center" }}>
            <input
              value={newPeriod}
              onChange={(e) => setNewPeriod(e.target.value)}
              placeholder="输入期间 YYYY-MM，如 2026-05"
              style={{ width: "200px" }}
            />
            <button
              onClick={() => void handleLockNew()}
              disabled={!newPeriod || periodOp !== null}
              style={{
                background: "#c0392b", color: "#fff", border: "none",
                padding: "8px 16px", borderRadius: "8px", cursor: "pointer"
              }}
            >
              锁定该期间
            </button>
          </div>

          {/* 期间列表 */}
          {periods.length === 0 ? (
            <p style={{ color: "#aaa" }}>暂无已锁定期间记录。</p>
          ) : (
            <table style={tableStyle()}>
              <thead>
                <tr>
                  <th style={cellStyle()}>会计期间</th>
                  <th style={cellStyle()}>状态</th>
                  <th style={cellStyle()}>锁定时间</th>
                  <th style={cellStyle()}>操作人</th>
                  <th style={cellStyle()}>操作</th>
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => (
                  <tr key={p.id}>
                    <td style={{ ...cellStyle(), fontWeight: 600 }}>{p.period}</td>
                    <td style={cellStyle()}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 10px",
                          borderRadius: "12px",
                          fontSize: "12px",
                          background: p.isLocked ? "rgba(192,57,43,0.12)" : "rgba(39,174,96,0.12)",
                          color: p.isLocked ? "#c0392b" : "#27ae60",
                          fontWeight: 600
                        }}
                      >
                        {p.isLocked ? "🔒 已锁账" : "🔓 未锁账"}
                      </span>
                    </td>
                    <td style={cellStyle()}>{p.lockedAt ? p.lockedAt.slice(0, 16).replace("T", " ") : "—"}</td>
                    <td style={cellStyle()}>{p.lockedBy ?? "—"}</td>
                    <td style={cellStyle()}>
                      {p.isLocked ? (
                        <button
                          onClick={() => void handleUnlock(p.period)}
                          disabled={periodOp === p.period}
                          style={{
                            background: "transparent", border: "1px solid #27ae60",
                            color: "#27ae60", padding: "4px 12px", borderRadius: "6px",
                            cursor: "pointer", fontSize: "12px"
                          }}
                        >
                          {periodOp === p.period ? "处理中…" : "解锁"}
                        </button>
                      ) : (
                        <button
                          onClick={() => void handleLock(p.period)}
                          disabled={periodOp === p.period}
                          style={{
                            background: "transparent", border: "1px solid #c0392b",
                            color: "#c0392b", padding: "4px 12px", borderRadius: "6px",
                            cursor: "pointer", fontSize: "12px"
                          }}
                        >
                          {periodOp === p.period ? "处理中…" : "锁账"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </article>
      )}

      {/* ── 总账分录 ── */}
      {activeTab === "entries" && (
        <>
          <article style={panelStyle()}>
            <h3 style={{ marginTop: 0 }}>过滤条件</h3>
            <div style={{ display: "flex", gap: "10px" }}>
              <input
                value={selectedVoucherId}
                onChange={(event) => setSelectedVoucherId(event.target.value)}
                placeholder="输入凭证编号过滤"
                style={{ flex: 1 }}
              />
              <input
                value={selectedEventId}
                onChange={(event) => setSelectedEventId(event.target.value)}
                placeholder="输入事项编号过滤"
                style={{ flex: 1 }}
              />
              <button
                onClick={() =>
                  void filterLedger({
                    voucherId: selectedVoucherId || undefined,
                    businessEventId: selectedEventId || undefined
                  })
                }
              >
                过滤
              </button>
              <button
                onClick={() => {
                  setSelectedVoucherId("");
                  setSelectedEventId("");
                  void filterLedger({});
                }}
              >
                清空
              </button>
            </div>
          </article>
          <article style={panelStyle()}>
            <h3 style={{ marginTop: 0 }}>过账批次</h3>
            <table style={tableStyle()}>
              <thead>
                <tr>
                  <th style={cellStyle()}>批次编号</th>
                  <th style={cellStyle()}>凭证</th>
                  <th style={cellStyle()}>事项</th>
                  <th style={cellStyle()}>分录数</th>
                  <th style={cellStyle()}>过账时间</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((item) => (
                  <tr key={item.id}>
                    <td style={cellStyle()}>{item.id}</td>
                    <td style={cellStyle()}>{item.voucherId}</td>
                    <td style={cellStyle()}>{item.businessEventId}</td>
                    <td style={cellStyle()}>{item.entryIds.length}</td>
                    <td style={cellStyle()}>{item.postedAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>
          <article style={panelStyle()}>
            <h3 style={{ marginTop: 0 }}>总账分录</h3>
            <table style={tableStyle()}>
              <thead>
                <tr>
                  <th style={cellStyle()}>日期</th>
                  <th style={cellStyle()}>摘要</th>
                  <th style={cellStyle()}>科目</th>
                  <th style={numCell()}>借方</th>
                  <th style={numCell()}>贷方</th>
                  <th style={cellStyle()}>来源凭证</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((item) => (
                  <tr key={item.id}>
                    <td style={cellStyle()}>{item.entryDate}</td>
                    <td style={cellStyle()}>{item.summary}</td>
                    <td style={cellStyle()}>
                      {item.accountCode} / {item.accountName}
                    </td>
                    <td style={numCell()}>{item.debit}</td>
                    <td style={numCell()}>{item.credit}</td>
                    <td style={cellStyle()}>{item.voucherId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>
        </>
      )}
    </section>
  );
}
