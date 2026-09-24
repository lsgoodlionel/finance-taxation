import { useEffect, useMemo, useState } from "react";
import type { BusinessEvent, BusinessEventStatus } from "@finance-taxation/domain-model";
import {
  analyzeEvent,
  createEvent,
  listCounterparties,
  type Counterparty,
  getEventDetail,
  listEvents,
  listTasks,
  runEventRiskCheck,
  updateEvent,
  type EventDetail
} from "../lib/api";
import { listTaxableCategories, type TaxableCategoryOption } from "../lib/api-events";
import { useI18n, EVENT_TYPE_LABELS, EVENT_STATUS_LABELS } from "../lib/i18n";
import { EVENTS_ENTRY_SUBTITLE } from "../lib/entry-guidance";
import { PageHeader } from "../components/ui/PageHeader";
import { NextStepBar } from "../components/ui/NextStepBar";
import { ProPageBanner } from "../components/ui/ProPageBanner";
import { PageSkeleton } from "../components/ui/PageSkeleton";
import { ResultBanner } from "../components/ui/ResultBanner";
import { useQueryState } from "../hooks/useQueryState";
import { EventsShell } from "./events/EventsShell";
import { EventListPanel } from "./events/EventListPanel";
import { EventCreateModal } from "./events/EventCreateModal";
import { EventDetailPanel } from "./events/EventDetailPanel";
import { EventDetailActions } from "./events/EventDetailActions";
import { EventDetailBody } from "./events/EventDetailBody";

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
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    type: "general",
    title: "",
    description: "",
    department: "财务部",
    occurredOn: new Date().toISOString().slice(0, 10),
    amount: "",
    currency: "CNY",
    source: "manual",
    // 往来单位（V12-C2）。此前事项完全没有这个字段，导致凭证继承不到、
    // 账龄表与核销整条链路都是空的。
    counterpartyId: "",
    // 应税行为类别（V17 阶段二）。空串 = 没选，按公司主营类别兜底。
    // 挂载时若拿到公司主营类别会预填成它——大多数事项就是主营业务。
    taxableCategory: ""
  });
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [taxableCategories, setTaxableCategories] = useState<TaxableCategoryOption[]>([]);
  const [taxpayerType, setTaxpayerType] = useState<string | null>(null);
  const [statusDraft, setStatusDraft] = useState<BusinessEventStatus>("draft");
  // 详情里改类别的草稿值。切换事项时同步成那笔当前的类别——
  // 不同步的话用户会看着上一笔的类别，以为这笔标的是那个。
  const [categoryDraft, setCategoryDraft] = useState("");
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

  // 往来单位档案：只在挂载时拉一次，它不随事项列表变化。
  // 拉不到就让选择器空着——它是选填维度，不该因此挡住建事项。
  useEffect(() => {
    void listCounterparties()
      .then((payload) => setCounterparties(payload.items))
      .catch(() => setCounterparties([]));
  }, []);

  // 应税行为类别清单：清单本身是政策，来自服务端，前端不写死。
  // 顺带按公司主营类别预填——大多数事项就是主营业务，让用户每笔重选没有意义。
  //
  // 拉不到就让选择器空着：类别是选填的（有公司默认值兜底），
  // 不该因为这一个接口挂了就挡住建事项。
  useEffect(() => {
    void listTaxableCategories()
      .then((payload) => {
        setTaxableCategories(payload.options);
        setTaxpayerType(payload.taxpayerType);
        if (payload.companyDefault) {
          setForm((prev) => (prev.taxableCategory ? prev : { ...prev, taxableCategory: payload.companyDefault! }));
        }
      })
      .catch(() => setTaxableCategories([]));
  }, []);

  useEffect(() => {
    if (detail) {
      setStatusDraft(detail.status);
      // 类别草稿也要跟着换事项走——不同步的话用户看着上一笔的类别，
      // 会以为这一笔标的是那个。null（未标）对应空串「按公司主营类别」。
      setCategoryDraft(detail.taxableCategory ?? "");
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
      const created = await createEvent({
        ...form,
        amount: form.amount || null,
        // 空串是「没选」，不是一个 id —— 直传会让后端拿它去查一个不存在的往来单位
        counterpartyId: form.counterpartyId || null,
        // 同理，空串是「没选」不是一个类别值——直传会被后端的值域校验拒掉。
        taxableCategory: form.taxableCategory || null
      });
      const payload = await listEvents();
      setEvents(payload.items);
      setSelectedEventIdState(created.id);
      await refreshDetail(created.id);
      setMessage(`已创建：${created.title}`);
      setForm((f) => ({ ...f, title: "", description: "", amount: "", counterpartyId: "" }));
      // 创建成功即关闭对话框：用户接下来要看的是这一笔办到哪了，不是继续填表。
      setShowCreate(false);
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

  /**
   * 改正标错的应税行为类别。
   *
   * 与「更新状态」分开两个动作，而不是合成一个「保存」——它们的后果不同：
   * 状态变更走工作流校验，改税目影响的是这笔怎么算税。
   * 合成一个按钮会让用户以为改了状态顺便也提交了税目，反之亦然。
   */
  async function handleCategoryUpdate(eventId: string) {
    setLoading("updating");
    try {
      // 空串是「按公司主营类别」，要显式传 null 让服务端清掉原值。
      await updateEvent(eventId, { taxableCategory: categoryDraft || null });
      await refreshDetail(eventId);
      const payload = await listEvents();
      setEvents(payload.items);
      setMessage(categoryDraft ? "税目已更新" : "税目已改回按公司主营类别");
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setLoading("idle");
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

  // 页头 = guided 兜底提示 + 标题 + 帮助。新建事项的入口只有一个：列表区的按钮
  //（就在「有哪些事项」旁边），页头再放一个只会让人以为是两件事。
  const header = (
    <>
      <ProPageBanner
        pageName="经营事项总线"
        plain="全公司的业务事项都按财务口径登记在这里，字段和状态偏专业，还能看到别人提交的事。只想确认自己那件事办到哪一步，回「今天」页看进展更清楚。"
      />
      <PageHeader
        title="经营事项总线"
        subtitle={EVENTS_ENTRY_SUBTITLE}
        actions={(
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          </div>
        )}
      />
    </>
  );

  const createModal = (
    <EventCreateModal
      open={showCreate}
      form={form}
      isBusy={isBusy}
      isSaving={loading === "saving"}
      options={eventTypeOptions}
      counterparties={counterparties}
      taxableCategories={taxableCategories}
      taxpayerType={taxpayerType}
      onChange={(next) => setForm((prev) => ({ ...prev, ...next }))}
      onSubmit={() => void handleCreate()}
      onClose={() => setShowCreate(false)}
    />
  );

  const listPanel = (
    <EventListPanel
      count={events.length}
      onCreate={() => setShowCreate(true)}
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
      taxableCategories={taxableCategories}
      categoryDraft={categoryDraft}
      onCategoryDraftChange={setCategoryDraft}
      onCategoryUpdate={() => void handleCategoryUpdate(selectedEventId)}
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
      {createModal}
      <EventsShell
        header={header}
        banner={message ? <ResultBanner tone="info" message={message} /> : null}
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
