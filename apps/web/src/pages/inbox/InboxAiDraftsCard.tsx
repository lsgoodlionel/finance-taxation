/**
 * 收件箱 · AI 草稿卡片（批量复核队列）
 * Stage H wave2：draft-then-approve 闭环；V7 Stage L：批量勾选/批准/驳回 +
 * 键盘热键（j/k/x/a/Enter）+ 借贷合计校验 + 来源事项回溯。
 * 批准（含批量）仅生成 draft 状态凭证，仍需在凭证中心走既有过账流程，不越权过账。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert, Button, Checkbox, DatePicker, Dropdown, Empty, Space, Spin, Tag, Typography, message,
} from "antd";
import { DownOutlined, RobotOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import {
  getCloseDrafts, generateCloseDrafts, approveCloseDraft, rejectCloseDraft, type CloseDraft,
} from "../../lib/api";
import { usePeriod } from "../../lib/period-context";
import { useListHotkeys } from "../../lib/use-list-hotkeys";
import { InboxAiDraftItem } from "./InboxAiDraftItem";
import { InboxDraftBatchBar, type BatchRunState } from "./InboxDraftBatchBar";
import {
  groupDrafts, pruneIds, runSequentialBatch, sumSelectedAmount, summarizeBatchResult,
  toggleId, unionIds, type BatchFailure,
} from "./draft-batch";

const { Text } = Typography;

const MAX_VISIBLE = 4;

type ActingAction = "approve" | "reject";

function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function InboxAiDraftsCard() {
  const { period: globalPeriod } = usePeriod();
  const navigate = useNavigate();
  const [period, setPeriod] = useState(globalPeriod);
  const [drafts, setDrafts] = useState<CloseDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [acting, setActing] = useState<{ id: string; action: ActingAction } | null>(null);
  const [error, setError] = useState("");
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [batchRun, setBatchRun] = useState<BatchRunState | null>(null);
  const [batchFailures, setBatchFailures] = useState<BatchFailure[]>([]);

  useEffect(() => { setPeriod(globalPeriod); }, [globalPeriod]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getCloseDrafts("draft");
      setDrafts(data.items);
    } catch (err) {
      const msg = getErrorMessage(err, "AI 草稿加载失败");
      setError(msg);
      void message.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // 列表刷新后清理悬空勾选/展开 id
  useEffect(() => {
    const aliveIds = new Set(drafts.map((d) => d.id));
    setSelectedIds((prev) => pruneIds(prev, aliveIds));
    setExpandedIds((prev) => pruneIds(prev, aliveIds));
  }, [drafts]);

  const handleGenerate = useCallback(async () => {
    if (!/^\d{4}-\d{2}$/.test(period)) {
      void message.error("请先选择有效的属期（YYYY-MM）");
      return;
    }
    setGenerating(true);
    try {
      const res = await generateCloseDrafts(period);
      void message.success(`已生成 ${res.generated} 条草稿，跳过 ${res.skipped} 条`);
      await load();
    } catch (err) {
      void message.error(getErrorMessage(err, "生成草稿失败"));
    } finally {
      setGenerating(false);
    }
  }, [period, load]);

  const handleApprove = useCallback(async (id: string) => {
    setActing({ id, action: "approve" });
    try {
      await approveCloseDraft(id);
      void message.success("已生成草稿凭证，待过账");
      setDrafts((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      void message.error(getErrorMessage(err, "批准草稿失败"));
    } finally {
      setActing(null);
    }
  }, []);

  const handleReject = useCallback(async (id: string) => {
    setActing({ id, action: "reject" });
    try {
      await rejectCloseDraft(id, rejectReasons[id]?.trim() || undefined);
      void message.success("已驳回该草稿");
      setDrafts((prev) => prev.filter((d) => d.id !== id));
      setRejectReasons((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch (err) {
      void message.error(getErrorMessage(err, "驳回草稿失败"));
    } finally {
      setActing(null);
    }
  }, [rejectReasons]);

  // ── 批量执行：顺序调用，单条失败不中断，完成后汇总并刷新 ──
  const runBatch = useCallback(async (action: ActingAction, reason?: string) => {
    const targets = drafts
      .filter((d) => selectedIds.has(d.id))
      .map((d) => ({ id: d.id, summary: d.summary }));
    if (targets.length === 0) return;
    setBatchRun({ action, done: 0, total: targets.length });
    setBatchFailures([]);
    const exec = action === "approve"
      ? (id: string) => approveCloseDraft(id)
      : (id: string) => rejectCloseDraft(id, reason);
    const result = await runSequentialBatch(targets, exec, (done, total) => {
      setBatchRun({ action, done, total });
    });
    setBatchRun(null);
    setSelectedIds(new Set());
    setBatchFailures(result.failed);
    const summary = summarizeBatchResult(action === "approve" ? "批准" : "驳回", result);
    if (result.failed.length > 0) {
      void message.warning(summary);
    } else if (action === "approve") {
      void message.success(`${summary}（均为草稿凭证，待过账）`);
    } else {
      void message.success(summary);
    }
    await load();
  }, [drafts, selectedIds, load]);

  const visible = showAll ? drafts : drafts.slice(0, MAX_VISIBLE);
  const groups = useMemo(() => groupDrafts(drafts), [drafts]);
  const selectedAmount = useMemo(() => sumSelectedAmount(drafts, selectedIds), [drafts, selectedIds]);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => toggleId(prev, id));
  }, []);

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => toggleId(prev, id));
  }, []);

  // ── 键盘热键：j/k 高亮、x 勾选、a 批准当前条、Enter 展开明细 ──
  const hotkeysEnabled = !loading && visible.length > 0 && batchRun === null && acting === null;
  const { activeIndex } = useListHotkeys({
    itemCount: visible.length,
    isEnabled: hotkeysEnabled,
    onToggle: useCallback((index: number) => {
      const draft = visible[index];
      if (draft) toggleSelected(draft.id);
    }, [visible, toggleSelected]),
    onPrimary: useCallback((index: number) => {
      const draft = visible[index];
      if (draft) void handleApprove(draft.id);
    }, [visible, handleApprove]),
    onOpen: useCallback((index: number) => {
      const draft = visible[index];
      if (draft) toggleExpanded(draft.id);
    }, [visible, toggleExpanded]),
  });

  const isAllSelected = drafts.length > 0 && selectedIds.size === drafts.length;
  const groupMenuItems = groups.map((group) => ({
    key: group.key,
    label: `${group.label}（${group.ids.length} 条）`,
    onClick: () => {
      setSelectedIds((prev) => unionIds(prev, group.ids));
      setShowAll(true);
    },
  }));

  return (
    <section className="v3-section-shell" data-testid="inbox-ai-drafts">
      <Space style={{ justifyContent: "space-between", width: "100%", flexWrap: "wrap" }}>
        <Space size={8}>
          <Text strong>🤖 AI 草稿</Text>
          {drafts.length > 0 && <Tag color="processing">{drafts.length} 项待批准</Tag>}
        </Space>
        <Space size={8}>
          <DatePicker
            picker="month"
            size="small"
            allowClear={false}
            value={period ? dayjs(`${period}-01`) : null}
            format="YYYY-MM"
            onChange={(d) => { if (d) setPeriod(d.format("YYYY-MM")); }}
            aria-label="AI 草稿生成属期"
          />
          <Button size="small" icon={<ThunderboltOutlined />} loading={generating} onClick={() => void handleGenerate()}>
            生成本期草稿
          </Button>
        </Space>
      </Space>

      <Alert
        type="info"
        showIcon
        banner
        message="AI 仅生成草稿凭证，批准（含批量批准）后仍需在凭证中心过账入账"
        style={{ marginTop: 10, borderRadius: 8, fontSize: 12 }}
      />

      {error && <Alert type="error" showIcon message="加载失败" description={error} style={{ marginTop: 10 }} />}

      {batchFailures.length > 0 && (
        <Alert
          type="warning"
          showIcon
          closable
          onClose={() => setBatchFailures([])}
          message={`批量操作有 ${batchFailures.length} 条失败`}
          description={
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
              {batchFailures.map((failure) => (
                <li key={failure.id}>{failure.summary}：{failure.message}</li>
              ))}
            </ul>
          }
          style={{ marginTop: 10 }}
        />
      )}

      {loading ? (
        <div style={{ padding: "24px 0", textAlign: "center" }}><Spin /></div>
      ) : drafts.length === 0 ? (
        <Empty
          style={{ margin: "16px 0" }}
          image={<RobotOutlined style={{ fontSize: 32, color: "#94a3b8" }} />}
          description={
            <Space direction="vertical" size={2}>
              <Text>暂无待批准草稿</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                点击「生成本期草稿」让 AI 为未入账事项起草分录。
              </Text>
            </Space>
          }
        />
      ) : (
        <>
          <Space
            style={{ justifyContent: "space-between", width: "100%", flexWrap: "wrap", marginTop: 10 }}
          >
            <Space size={10}>
              <Checkbox
                checked={isAllSelected}
                indeterminate={selectedIds.size > 0 && !isAllSelected}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedIds(new Set(drafts.map((d) => d.id)));
                    setShowAll(true);
                  } else {
                    setSelectedIds(new Set());
                  }
                }}
              >
                <Text style={{ fontSize: 12 }}>全选</Text>
              </Checkbox>
              <Dropdown menu={{ items: groupMenuItems }} trigger={["click"]}>
                <Button size="small" type="text" style={{ fontSize: 12 }}>
                  按同类勾选 <DownOutlined style={{ fontSize: 10 }} />
                </Button>
              </Dropdown>
            </Space>
            <Text type="secondary" style={{ fontSize: 11 }}>
              j/k 移动 · x 选 · a 批准 · Enter 明细
            </Text>
          </Space>

          <InboxDraftBatchBar
            selectedCount={selectedIds.size}
            totalAmount={selectedAmount}
            running={batchRun}
            onApproveSelected={() => void runBatch("approve")}
            onRejectSelected={(reason) => void runBatch("reject", reason)}
          />

          <Space direction="vertical" size={10} style={{ width: "100%", marginTop: 10 }}>
            {visible.map((draft, index) => (
              <InboxAiDraftItem
                key={draft.id}
                draft={draft}
                reason={rejectReasons[draft.id] ?? ""}
                onReasonChange={(value) => setRejectReasons((prev) => ({ ...prev, [draft.id]: value }))}
                acting={acting?.id === draft.id ? acting.action : null}
                onApprove={() => void handleApprove(draft.id)}
                onReject={() => void handleReject(draft.id)}
                isSelected={selectedIds.has(draft.id)}
                onSelectedChange={() => toggleSelected(draft.id)}
                isActive={index === activeIndex}
                isExpanded={expandedIds.has(draft.id)}
                onExpandedChange={() => toggleExpanded(draft.id)}
                onOpenSourceEvent={() => navigate(`/events?event=${encodeURIComponent(draft.businessEventId)}`)}
              />
            ))}
            {drafts.length > MAX_VISIBLE && (
              <Button type="link" size="small" style={{ padding: 0 }} onClick={() => setShowAll((prev) => !prev)}>
                {showAll ? `收起，仅显示前 ${MAX_VISIBLE} 条` : `展开全部 ${drafts.length} 条待批准草稿`}
              </Button>
            )}
          </Space>
        </>
      )}
    </section>
  );
}
