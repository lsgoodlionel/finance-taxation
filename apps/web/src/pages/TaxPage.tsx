/**
 * 税务中心（V10 车道 F2a：按任务重组）。
 *
 * 改造前：首屏 13 个平级区块、要滚 3.9 屏，其中只有「申报批次」和「底稿生成」
 * 是用户此刻要动手的，其余是别的任务的入口（日历）、运维面板、只读统计、
 * 硬编码的阶段流程回看、低频配置和本属于导出中心的面板。
 *
 * 改造后：页面声明它承载哪几件事（见 tax/tax-tasks.ts），TaskFocusShell 一次
 * 只渲染一件事的工作区，其余收进顶部一行切换器（角标是真实待办数）。
 * 「当前这个批次走到哪了」由 ObjectFlowBar 按批次真实字段表达，取代原先
 * currentNodeId 写死的 ProcessFlowStageSection。
 *
 * 申报文件导出不在这里：它已归口到导出与归档中心
 * （pages/export-center/DeclarationExportPanel.tsx），主任务里只留一条链接。
 */
// 显式引入 React：仓库的 node 测试用经典 JSX 转换（见 tools/v4/run-web-tests.mjs），
// 其它页面/组件同样这样写，缺了它这一页就无法在测试里被渲染。
import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { ProPageBanner } from "../components/ui/ProPageBanner";
import { ResultBanner } from "../components/ui/ResultBanner";
import { ObjectFlowBar } from "../components/ui/ObjectFlowBar";
import { RelatedObjectsPanel } from "../components/ui/RelatedObjectsPanel";
import { TaskFocusShell } from "../components/ui/TaskFocusShell";
import { Term } from "../components/ui/Term";
import { resolveActiveTask } from "../lib/task-focus";
import { useQueryState } from "../hooks/useQueryState";
import { TaxBatchesPanel } from "./tax/TaxBatchesPanel";
import { TaxHeader } from "./tax/TaxHeader";
import { TaxHelpModal } from "./tax/TaxHelpModal";
import { TaxItemsPanel } from "./tax/TaxItemsPanel";
import { TaxMaterialsPanel, type TaxMaterialKey } from "./tax/TaxMaterialsPanel";
import { TaxProfilePanel } from "./tax/TaxProfilePanel";
import { TaxRatePanel } from "./tax/TaxRatePanel";
import { TaxShell } from "./tax/TaxShell";
import { TaxCalendar } from "./tax/TaxCalendar";
import { VatDeclarationWizard } from "./tax/VatDeclarationWizard";
import { TaxWorkspaceSummary } from "./tax/TaxWorkspaceSummary";
import { useTaxWorkspace } from "./tax/useTaxWorkspace";
import { WorkflowRuntimePanel } from "../features/runtime/WorkflowRuntimePanel";
import { buildBatchItemLinks, buildTaxBatchFlow, buildTaxBatchFlowTitle } from "./tax/tax-batch-flow";
import { countOverdueObligations, currentFilingPeriod, deriveTaxObligations } from "./tax/tax-obligations";
import { TAX_TASK_KEYS, TAX_TASK_QUERY_KEY, buildTaxTasks, type TaxTaskKey } from "./tax/tax-tasks";
import { actionButtonStyle } from "./tax/taxStyles";
import { needsRuntimeAttention } from "../features/runtime/runtime-attention";
import { VatSettlementPanel } from "./tax/VatSettlementPanel";

const MATERIAL_LABELS: Record<TaxMaterialKey, string> = {
  vat: "增值税底稿",
  iit: "个税申报资料",
  stamp: "印花税与附加税",
  cit: "企业所得税准备"
};

const ACTION_ROW_STYLE = { display: "flex", flexWrap: "wrap" as const, gap: "10px", alignItems: "center" };

/** 跳去导出中心的链接按钮：外观和同排的动作按钮一致，但语义上是导航而非动作。 */
const LINK_BUTTON_STYLE = {
  ...actionButtonStyle(),
  display: "inline-block",
  textDecoration: "none"
};

const HINT_STYLE = {
  margin: 0,
  padding: "12px 16px",
  borderRadius: "12px",
  background: "rgba(20,40,60,0.04)",
  border: "1px solid rgba(20,40,60,0.08)",
  color: "#5c6b7a",
  fontSize: "13px",
  lineHeight: 1.7
};

const DETAILS_SUMMARY_STYLE = {
  cursor: "pointer",
  fontSize: "13px",
  fontWeight: 600,
  color: "#4d5d6c"
};

export function TaxPage() {
  const {
    navEventId,
    navTaxItemId,
    selectedBatchState,
    activeMaterial,
    setActiveMaterialState,
    items,
    batches,
    profiles,
    selectedBatchDetail,
    validation,
    ruleProfile,
    vatPaper,
    incomeTaxPreparation,
    iitMaterials,
    stampAndSurtax,
    vatFilingPeriod,
    setVatFilingPeriod,
    iitFilingPeriod,
    setIitFilingPeriod,
    stampFilingPeriod,
    setStampFilingPeriod,
    incomeTaxPeriod,
    setIncomeTaxPeriod,
    reviewForm,
    setReviewForm,
    archiveForm,
    setArchiveForm,
    profileForm,
    setProfileForm,
    notice,
    setNotice,
    showHelp,
    setShowHelp,
    vatWizardOpen,
    setVatWizardOpen,
    runtimeActionKey,
    runtimeSummary,
    selectedBatchLabel,
    handleSelectBatch,
    handleCreateProfile,
    handleResolveRuleProfile,
    handleValidateBatch,
    handleSubmitBatch,
    handleReviewBatch,
    handleArchiveBatch,
    handleGenerateVat,
    handlePrintVat,
    handleGenerateIit,
    handleGenerateStamp,
    handleGenerateCit,
    handlePrintCit,
    handleRuntimeAction
  } = useTaxWorkspace();

  const [taskState, setTaskState] = useQueryState(TAX_TASK_QUERY_KEY, "");

  const overdueCount = useMemo(
    () => countOverdueObligations(deriveTaxObligations(batches, currentFilingPeriod())),
    [batches]
  );
  const tasks = useMemo(
    () => buildTaxTasks({ batches, items, overdueCount }),
    [batches, items, overdueCount]
  );
  const activeTask = (resolveActiveTask(tasks, taskState, TAX_TASK_KEYS.declare) ??
    TAX_TASK_KEYS.declare) as TaxTaskKey;

  const batchFlow = buildTaxBatchFlow(selectedBatchDetail, validation);
  const runtimeAttention = needsRuntimeAttention(runtimeSummary);

  const runtimePanel = (
    <WorkflowRuntimePanel
      title="税务运行态与授权态"
      summary={runtimeSummary}
      onAction={(action) => void handleRuntimeAction(action)}
      busyActionKey={runtimeActionKey}
    />
  );

  function renderDeclareWorkspace() {
    return (
      <>
        {batchFlow ? (
          <ObjectFlowBar flow={batchFlow} title={buildTaxBatchFlowTitle(selectedBatchDetail)} />
        ) : (
          <p style={HINT_STYLE}>
            还没有选中<Term k="filing-batch">申报批次</Term>。在下面的列表里点一个批次，这里就会显示它办到哪一步、下一步该谁做。
          </p>
        )}
        {runtimeAttention ? runtimePanel : null}
        <div style={ACTION_ROW_STYLE}>
          <button onClick={() => setVatWizardOpen(true)} style={actionButtonStyle("primary")}>
            按向导申报增值税（{vatFilingPeriod}）
          </button>
          <button onClick={() => setTaskState(TAX_TASK_KEYS.materials)} style={actionButtonStyle()}>
            去准备申报材料
          </button>
          <Link to="/export-center" style={LINK_BUTTON_STYLE}>
            去导出申报文件
          </Link>
          <span style={{ fontSize: "12px", color: "#6c7a89" }}>
            向导按「取数 → 核对 → 复核 → 提交」四步走完一次<Term k="vat">增值税</Term>申报；下面的列表用于逐个批次手工推进。
            报完之后要生成上传电子税务局的文件、登记回执流水号，去「导出与<Term k="archive">归档</Term>中心」的「税务申报文件」。
          </span>
        </div>
        <TaxBatchesPanel
          batches={batches}
          selectedBatchId={selectedBatchState || null}
          selectedBatchDetail={selectedBatchDetail}
          validation={validation}
          reviewForm={reviewForm}
          archiveForm={archiveForm}
          onSelectBatch={(batchId) => void handleSelectBatch(batchId)}
          onReviewFormChange={setReviewForm}
          onArchiveFormChange={setArchiveForm}
          onValidateBatch={() => void handleValidateBatch()}
          onSubmitBatch={() => void handleSubmitBatch()}
          onReviewBatch={() => void handleReviewBatch()}
          onArchiveBatch={() => void handleArchiveBatch()}
        />
      </>
    );
  }

  function renderMaterialsWorkspace() {
    return (
      <>
        <div style={ACTION_ROW_STYLE}>
          <button onClick={() => setTaskState(TAX_TASK_KEYS.declare)} style={actionButtonStyle()}>
            回到申报批次
          </button>
          <span style={{ fontSize: "12px", color: "#6c7a89" }}>
            这里生成的计算表和资料清单是申报的依据；金额确认无误后，回上一件事提交对应批次。
          </span>
        </div>
        <TaxMaterialsPanel
          activeMaterial={activeMaterial}
          vatPaper={vatPaper}
          incomeTaxPreparation={incomeTaxPreparation}
          iitMaterials={iitMaterials}
          stampAndSurtax={stampAndSurtax}
          vatFilingPeriod={vatFilingPeriod}
          iitFilingPeriod={iitFilingPeriod}
          stampFilingPeriod={stampFilingPeriod}
          incomeTaxPeriod={incomeTaxPeriod}
          onSelectMaterial={setActiveMaterialState}
          onVatPeriodChange={setVatFilingPeriod}
          onIitPeriodChange={setIitFilingPeriod}
          onStampPeriodChange={setStampFilingPeriod}
          onIncomeTaxPeriodChange={setIncomeTaxPeriod}
          onGenerateVat={() => void handleGenerateVat()}
          onPrintVat={() => void handlePrintVat()}
          onGenerateIit={() => void handleGenerateIit()}
          onGenerateStamp={() => void handleGenerateStamp()}
          onGenerateCit={() => void handleGenerateCit()}
          onPrintCit={() => void handlePrintCit()}
        />
      </>
    );
  }

  function renderWorkspace() {
    switch (activeTask) {
      case TAX_TASK_KEYS.materials:
        return renderMaterialsWorkspace();
      case TAX_TASK_KEYS.rates:
        return <TaxRatePanel />;
      case TAX_TASK_KEYS.settlement:
        return <VatSettlementPanel />;
      case TAX_TASK_KEYS.calendar:
        return <TaxCalendar batches={batches} onStartVatDeclaration={() => setVatWizardOpen(true)} />;
      case TAX_TASK_KEYS.items:
        return <TaxItemsPanel items={items} navEventId={navEventId} navTaxItemId={navTaxItemId} />;
      case TAX_TASK_KEYS.profile:
        return (
          <TaxProfilePanel
            profiles={profiles}
            profileForm={profileForm}
            ruleProfile={ruleProfile}
            onProfileFormChange={setProfileForm}
            onCreateProfile={() => void handleCreateProfile()}
            onResolveRuleProfile={() => void handleResolveRuleProfile()}
          />
        );
      default:
        return renderDeclareWorkspace();
    }
  }

  /** 只有主任务需要随身带上下文：关联事项、工作台数字、以及正常时收起的运行态。 */
  function renderAside() {
    if (activeTask !== TAX_TASK_KEYS.declare) {
      return null;
    }
    return (
      <>
        {selectedBatchDetail ? (
          <RelatedObjectsPanel
            objects={buildBatchItemLinks(selectedBatchDetail)}
            title="这个批次里的税务事项"
          />
        ) : null}
        <TaxWorkspaceSummary
          itemCount={items.length}
          batchCount={batches.length}
          profileCount={profiles.length}
          selectedBatchLabel={selectedBatchLabel}
          navEventId={navEventId}
          navTaxItemId={navTaxItemId}
        />
        {runtimeAttention ? null : (
          <details className="v3-section-shell" data-tone="muted" style={{ padding: "12px 16px" }}>
            <summary style={DETAILS_SUMMARY_STYLE}>运行与授权状态（当前无异常）</summary>
            <div style={{ marginTop: "12px" }}>{runtimePanel}</div>
          </details>
        )}
      </>
    );
  }

  return (
    <section style={{ display: "grid", gap: "20px" }}>
      {showHelp ? <TaxHelpModal onClose={() => setShowHelp(false)} /> : null}
      <ProPageBanner
        pageName="税务中心"
        plain="这里在算本期各个税种要交多少，并按税局要求准备申报用的材料，由财务或税务同事按申报期完成。您通常只需要知道「要交多少、什么时候交完」。"
      />
      <TaxShell
        header={<TaxHeader activeMaterialLabel={MATERIAL_LABELS[activeMaterial]} onOpenHelp={() => setShowHelp(true)} />}
        guidance={<ResultBanner tone={notice.tone} message={notice.message} />}
      >
        <TaskFocusShell
          tasks={tasks}
          activeKey={activeTask}
          onSelectTask={setTaskState}
          switcherLabel="税务中心能办的事"
          aside={renderAside()}
        >
          {renderWorkspace()}
        </TaskFocusShell>
      </TaxShell>
      <VatDeclarationWizard
        open={vatWizardOpen}
        filingPeriod={vatFilingPeriod}
        batch={batches.find(b => b.taxType === "vat" && b.filingPeriod === vatFilingPeriod) ?? null}
        onClose={() => setVatWizardOpen(false)}
        onComplete={() => {
          setVatWizardOpen(false);
          setNotice({ tone: "success", message: `增值税申报 ${vatFilingPeriod} 已完成。` });
        }}
      />
    </section>
  );
}
