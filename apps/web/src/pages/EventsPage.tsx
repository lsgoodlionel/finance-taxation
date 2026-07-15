import { useEffect, useMemo, useState } from "react";
import type { BusinessEvent, BusinessEventStatus } from "@finance-taxation/domain-model";
import {
  analyzeEvent,
  createEvent,
  getEventDetail,
  listEvents,
  listTasks,
  runEventRiskCheck,
  updateEvent,
  type EventDetail
} from "../lib/api";
import { useI18n, EVENT_TYPE_LABELS, EVENT_STATUS_LABELS } from "../lib/i18n";
import { EVENTS_ENTRY_SUBTITLE } from "../lib/entry-guidance";
import { PageHeader } from "../components/ui/PageHeader";
import { HelpTriggerButton } from "../components/ui/HelpPanel";
import { NextStepBar } from "../components/ui/NextStepBar";
import { PageSkeleton } from "../components/ui/PageSkeleton";
import { ResultBanner } from "../components/ui/ResultBanner";
import { useQueryState } from "../hooks/useQueryState";
import { EventsShell } from "./events/EventsShell";
import { EventListPanel } from "./events/EventListPanel";
import { EventCreatePanel } from "./events/EventCreatePanel";
import { EventDetailPanel } from "./events/EventDetailPanel";
import { EventDetailActions } from "./events/EventDetailActions";
import { EventDetailBody } from "./events/EventDetailBody";
import { EventsHelpPanel } from "./events/EventsHelpPanel";

const EVENT_TYPE_KEYS = [
  "sales", "procurement", "expense", "payroll",
  "tax", "asset", "financing", "rnd", "general", "purchase_expense", "travel_expense", "contract_revenue"
] as const;

export function EventsPage() {
  const [events, setEvents] = useState<BusinessEvent[]>([]);
  const [selectedEventIdState, setSelectedEventIdState] = useQueryState("event", "");
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState("idle");
  const [message, setMessage] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  const [form, setForm] = useState({
    type: "general",
    title: "",
    description: "",
    department: "财务部",
    occurredOn: new Date().toISOString().slice(0, 10),
    amount: "",
    currency: "CNY",
    source: "manual"
  });
  const [statusDraft, setStatusDraft] = useState<BusinessEventStatus>("draft");
  const { t } = useI18n();
  const selectedEventId = selectedEventIdState || null;

  async function loadEvents() {
    setLoading("loading");
    try {
      const payload = await listEvents();
      setEvents(payload.items);
      const targetId = (selectedEventId && payload.items.some((e) => e.id === selectedEventId))
        ? selectedEventId
        : payload.items[0]?.id ?? null;
      setSelectedEventIdState(targetId ?? "");
      setMessage(`已加载 ${payload.total} 条经营事项`);
      if (targetId) {
        const d = await getEventDetail(targetId);
        setDetail(d);
      } else {
        setDetail(null);
        setStatusDraft("draft");
      }
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setLoading("done");
    }
  }

  useEffect(() => { void loadEvents(); }, []);

  useEffect(() => {
    if (detail) {
      setStatusDraft(detail.status);
    }
  }, [detail]);

  async function refreshDetail(eventId: string) {
    const d = await getEventDetail(eventId);
    setDetail(d);
  }

  async function handleCreate() {
    if (!form.title.trim()) return;
    setLoading("saving");
    try {
      const created = await createEvent({ ...form, amount: form.amount || null });
      const payload = await listEvents();
      setEvents(payload.items);
      setSelectedEventIdState(created.id);
      await refreshDetail(created.id);
      setMessage(`已创建：${created.title}`);
      setForm((f) => ({ ...f, title: "", description: "", amount: "" }));
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setLoading("done");
    }
  }

  async function handleAnalyze(eventId: string) {
    setLoading("analyzing");
    try {
      const result = await analyzeEvent(eventId);
      await refreshDetail(eventId);
      const tasks = await listTasks(eventId);
      setMessage(`AI 已生成 ${result.generatedTasks} 个任务，当前共 ${tasks.total} 个`);
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setLoading("done");
    }
  }

  async function handleStatusUpdate(eventId: string) {
    setLoading("updating");
    try {
      await updateEvent(eventId, { status: statusDraft });
      await refreshDetail(eventId);
      const payload = await listEvents();
      setEvents(payload.items);
      setMessage(`状态已更新为 ${statusDraft}`);
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setLoading("done");
    }
  }

  async function handleRiskCheck(eventId: string) {
    setLoading("updating");
    try {
      const result = await runEventRiskCheck(eventId);
      setMessage(`风险检查完成，生成 ${result.total} 条发现`);
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setLoading("done");
    }
  }

  const selectedSummary = useMemo(() => {
    if (!detail) return null;
    return `${t(EVENT_TYPE_LABELS, detail.type)} · ${detail.department} · ${detail.amount || "—"} ${detail.currency}`;
  }, [detail, t]);

  const isBusy = loading !== "done" && loading !== "idle";
  const eventTypeOptions = useMemo(
    () => EVENT_TYPE_KEYS.map((key) => ({ value: key, label: t(EVENT_TYPE_LABELS, key) })),
    [t]
  );
  const eventListItems = useMemo(
    () => events.map((event) => ({
      id: event.id,
      title: event.title,
      typeLabel: t(EVENT_TYPE_LABELS, event.type),
      department: event.department,
      status: event.status,
      statusLabel: t(EVENT_STATUS_LABELS, event.status)
    })),
    [events, t]
  );

  const header = (
    <PageHeader
      title="经营事项总线"
      subtitle={EVENTS_ENTRY_SUBTITLE}
      actions={(
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <HelpTriggerButton onClick={() => setShowHelp(true)} label="查看经营事项页说明" />
        </div>
      )}
    />
  );

  const createPanel = (
    <EventCreatePanel
      form={form}
      isBusy={isBusy}
      isSaving={loading === "saving"}
      options={eventTypeOptions}
      onChange={(next) => setForm((prev) => ({ ...prev, ...next }))}
      onSubmit={() => void handleCreate()}
    />
  );

  const listPanel = (
    <EventListPanel
      count={events.length}
      events={eventListItems}
      selectedEventId={selectedEventId}
      onSelect={(eventId, status) => {
        setSelectedEventIdState(eventId);
        setStatusDraft(status as BusinessEventStatus);
        void refreshDetail(eventId);
      }}
    />
  );

  const detailActions = selectedEventId ? (
    <EventDetailActions
      statusDraft={statusDraft}
      isBusy={isBusy}
      onStatusDraftChange={setStatusDraft}
      onAnalyze={() => void handleAnalyze(selectedEventId)}
      onRiskCheck={() => void handleRiskCheck(selectedEventId)}
      onStatusUpdate={() => void handleStatusUpdate(selectedEventId)}
    />
  ) : undefined;

  if (loading === "loading") {
    return <PageSkeleton variant="detail" rows={6} />;
  }

  return (
    <>
      <EventsHelpPanel open={showHelp} onClose={() => setShowHelp(false)} />
      <EventsShell
        header={header}
        banner={message ? <ResultBanner tone="info" message={message} /> : null}
        createPanel={createPanel}
        listPanel={listPanel}
        detailPanel={(
          <EventDetailPanel
            title={detail ? detail.title : "经营事项详情"}
            subtitle={selectedSummary ?? undefined}
            actions={detailActions}
          >
            {detail ? (
              <EventDetailBody detail={detail} selectedEventId={selectedEventId} />
            ) : (
              <div className="state-empty">请从左侧列表选择一条经营事项</div>
            )}
          </EventDetailPanel>
        )}
      />
      <NextStepBar
        current="事项已记录，财务会接着处理（无需您盯着每一步）"
        next={[
          { label: "看进展", path: "/tasks", hint: "看这件事后续的处理任务走到哪一步了" },
          { label: "传票据", path: "/bills", hint: "有发票、收据、回单就传上来，财务处理更快" },
          { label: "问 AI", path: "/assistant", hint: "不确定下一步做什么？用大白话直接问" },
        ]}
      />
    </>
  );
}
