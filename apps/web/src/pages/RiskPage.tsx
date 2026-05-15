import { useEffect, useState } from "react";
import type { RiskClosureRecord, RiskFinding } from "@finance-taxation/domain-model";
import {
  closeRiskFinding,
  listEvents,
  listRiskClosureRecords,
  listRiskFindings,
  login,
  refreshSession,
  runEventRiskCheck
} from "../lib/api";

function panelStyle() {
  return {
    background: "rgba(255,255,255,0.82)",
    borderRadius: "24px",
    border: "1px solid rgba(20,40,60,0.08)",
    padding: "24px"
  } as const;
}

function cellStyle() {
  return {
    borderBottom: "1px solid rgba(20,40,60,0.08)",
    padding: "10px 8px",
    textAlign: "left" as const,
    verticalAlign: "top" as const
  };
}

export function RiskPage() {
  const [findings, setFindings] = useState<RiskFinding[]>([]);
  const [closureRecords, setClosureRecords] = useState<RiskClosureRecord[]>([]);
  const [selectedFindingId, setSelectedFindingId] = useState("");
  const [eventId, setEventId] = useState("");
  const [resolution, setResolution] = useState("已复核并完成整改。");
  const [message, setMessage] = useState("正在准备风险勾稽。");

  useEffect(() => {
    async function bootstrap() {
      try {
        await login("chairman", "123456");
        await refreshSession();
        const [eventsPayload, findingsPayload] = await Promise.all([
          listEvents(),
          listRiskFindings()
        ]);
        setEventId(eventsPayload.items[0]?.id || "");
        setFindings(findingsPayload.items);
        setSelectedFindingId(findingsPayload.items[0]?.id || "");
        setMessage(`已加载 ${findingsPayload.total} 条风险发现。`);
      } catch (error) {
        setMessage((error as Error).message);
      }
    }
    void bootstrap();
  }, []);

  async function refreshFindings() {
    const payload = await listRiskFindings();
    setFindings(payload.items);
    setMessage(`已刷新 ${payload.total} 条风险发现。`);
  }

  async function loadClosureRecords(findingId: string) {
    const payload = await listRiskClosureRecords(findingId);
    setClosureRecords(payload.items);
    setSelectedFindingId(findingId);
  }

  return (
    <section style={{ display: "grid", gap: "20px" }}>
      <article style={panelStyle()}>
        <h2 style={{ marginTop: 0 }}>风险勾稽中心</h2>
        <p>{message}</p>
        <div style={{ display: "flex", gap: "10px" }}>
          <input value={eventId} onChange={(event) => setEventId(event.target.value)} placeholder="输入事项编号" style={{ flex: 1 }} />
          <input value={resolution} onChange={(event) => setResolution(event.target.value)} placeholder="关闭说明" style={{ flex: 1 }} />
          <button
            onClick={() =>
              void runEventRiskCheck(eventId)
                .then(() => refreshFindings())
                .catch((error) => setMessage((error as Error).message))
            }
          >
            执行风险检查
          </button>
        </div>
      </article>
      <article style={panelStyle()}>
        <h3 style={{ marginTop: 0 }}>风险发现</h3>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={cellStyle()}>规则</th>
              <th style={cellStyle()}>严重级别</th>
              <th style={cellStyle()}>评分</th>
              <th style={cellStyle()}>优先级</th>
              <th style={cellStyle()}>事项</th>
              <th style={cellStyle()}>标题</th>
              <th style={cellStyle()}>说明</th>
            </tr>
          </thead>
          <tbody>
            {findings.map((finding) => (
              <tr key={finding.id}>
                <td style={cellStyle()}>{finding.ruleCode}</td>
                <td style={cellStyle()}>{finding.severity}</td>
                <td style={cellStyle()}>{finding.score ?? "—"}</td>
                <td style={cellStyle()}>{finding.priority ?? "—"}</td>
                <td style={cellStyle()}>{finding.businessEventId || "—"}</td>
                <td style={cellStyle()}>{finding.title}</td>
                <td style={cellStyle()}>
                  <div>{finding.detail}</div>
                  <button
                    style={{ marginTop: "8px", marginRight: "8px" }}
                    onClick={() =>
                      void loadClosureRecords(finding.id).catch((error) => setMessage((error as Error).message))
                    }
                  >
                    查看复盘
                  </button>
                  {finding.status !== "resolved" ? (
                    <button
                      style={{ marginTop: "8px" }}
                      onClick={() =>
                        void closeRiskFinding(finding.id, resolution)
                          .then(() => Promise.all([refreshFindings(), loadClosureRecords(finding.id)]))
                          .catch((error) => setMessage((error as Error).message))
                      }
                    >
                      标记已关闭
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
      <article style={panelStyle()}>
        <h3 style={{ marginTop: 0 }}>异常关闭与复盘记录</h3>
        <p>当前查看：{selectedFindingId || "未选择风险发现"}</p>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={cellStyle()}>复盘编号</th>
              <th style={cellStyle()}>关闭人</th>
              <th style={cellStyle()}>关闭说明</th>
              <th style={cellStyle()}>复核时间</th>
            </tr>
          </thead>
          <tbody>
            {closureRecords.length ? closureRecords.map((record) => (
              <tr key={record.id}>
                <td style={cellStyle()}>{record.id}</td>
                <td style={cellStyle()}>{record.closedByName}</td>
                <td style={cellStyle()}>{record.resolution}</td>
                <td style={cellStyle()}>{record.reviewedAt}</td>
              </tr>
            )) : (
              <tr>
                <td style={cellStyle()} colSpan={4}>暂无关闭记录。</td>
              </tr>
            )}
          </tbody>
        </table>
      </article>
    </section>
  );
}
