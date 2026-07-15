import { ProcessFlowStageSection } from "../features/process-flow/ProcessFlowStageSection";
import { ResultBanner } from "../components/ui/ResultBanner";
import { TaxBatchesPanel } from "./tax/TaxBatchesPanel";
import { TaxHeader } from "./tax/TaxHeader";
import { TaxHelpModal } from "./tax/TaxHelpModal";
import { TaxItemsPanel } from "./tax/TaxItemsPanel";
import { TaxMaterialsPanel, type TaxMaterialKey } from "./tax/TaxMaterialsPanel";
import { TaxProfilePanel } from "./tax/TaxProfilePanel";
import { TaxShell } from "./tax/TaxShell";
import { TaxCalendar } from "./tax/TaxCalendar";
import { VatDeclarationWizard } from "./tax/VatDeclarationWizard";
import { DeclarationExportPanel } from "./tax/DeclarationExportPanel";
import { TaxWorkspaceSummary } from "./tax/TaxWorkspaceSummary";
import { useTaxWorkspace } from "./tax/useTaxWorkspace";
import { WorkflowRuntimePanel } from "../features/runtime/WorkflowRuntimePanel";

const MATERIAL_LABELS: Record<TaxMaterialKey, string> = {
  vat: "增值税底稿",
  iit: "个税申报资料",
  stamp: "印花税与附加税",
  cit: "企业所得税准备"
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

  return (
    <section style={{ display: "grid", gap: "20px" }}>
      {showHelp ? <TaxHelpModal onClose={() => setShowHelp(false)} /> : null}
      <TaxShell
        header={<TaxHeader activeMaterialLabel={MATERIAL_LABELS[activeMaterial]} onOpenHelp={() => setShowHelp(true)} />}
        guidance={<ResultBanner tone={notice.tone} message={notice.message} />}
        summary={(
          <>
            <TaxCalendar batches={batches} onStartVatDeclaration={() => setVatWizardOpen(true)} />
            <WorkflowRuntimePanel
              title="税务运行态与授权态"
              summary={runtimeSummary}
              onAction={(action) => void handleRuntimeAction(action)}
              busyActionKey={runtimeActionKey}
            />
            <TaxWorkspaceSummary
              itemCount={items.length}
              batchCount={batches.length}
              profileCount={profiles.length}
              selectedBatchLabel={selectedBatchLabel}
              navEventId={navEventId}
              navTaxItemId={navTaxItemId}
            />
            <ProcessFlowStageSection
              title="税务阶段流程回看"
              subtitle="当前页定位到税务复核与申报留档节点；如果当前批次已完成留档，则定位到归档查询节点。"
              currentNodeId={selectedBatchDetail?.archives.length ? "archive_trace_query" : "tax_filing_archive"}
              branch={null}
            />
            <TaxProfilePanel
              profiles={profiles}
              profileForm={profileForm}
              ruleProfile={ruleProfile}
              onProfileFormChange={setProfileForm}
              onCreateProfile={() => void handleCreateProfile()}
              onResolveRuleProfile={() => void handleResolveRuleProfile()}
            />
          </>
        )}
        taxItems={<TaxItemsPanel items={items} navEventId={navEventId} navTaxItemId={navTaxItemId} />}
        batches={(
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
        )}
        materials={(
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
        )}
      />
      <DeclarationExportPanel currentPeriod={vatFilingPeriod} />
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
