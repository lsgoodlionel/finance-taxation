import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import type {
  CorporateIncomeTaxPreparation,
  IndividualIncomeTaxMaterial,
  StampAndSurtaxSummary,
  TaxRuleProfile,
  TaxFilingBatch,
  TaxItem,
  TaxpayerProfile,
  VatWorkingPaper
} from "@finance-taxation/domain-model";
import { ProcessFlowStageSection } from "../features/process-flow/ProcessFlowStageSection";
import { ResultBanner } from "../components/ui/ResultBanner";
import { useQueryState } from "../hooks/useQueryState";
import { normalizeDrilldownState } from "./drilldown";
import {
  archiveTaxFilingBatch,
  createTaxpayerProfile,
  getCorporateIncomeTaxPreparation,
  getIndividualIncomeTaxMaterials,
  getStampAndSurtaxSummary,
  getTaxFilingBatchDetail,
  getTaxPrintableHtml,
  getTaxRuleProfile,
  getVatWorkingPaper,
  listTaxFilingBatches,
  listTaxItems,
  listTaxpayerProfiles,
  reviewTaxFilingBatch,
  submitTaxFilingBatch,
  validateTaxFilingBatch
} from "../lib/api";
import { TaxBatchesPanel } from "./tax/TaxBatchesPanel";
import { TaxHeader } from "./tax/TaxHeader";
import { TaxHelpModal } from "./tax/TaxHelpModal";
import { TaxItemsPanel } from "./tax/TaxItemsPanel";
import { TaxMaterialsPanel, type TaxMaterialKey } from "./tax/TaxMaterialsPanel";
import { TaxProfilePanel } from "./tax/TaxProfilePanel";
import { TaxShell } from "./tax/TaxShell";
import type { TaxBatchDetail, TaxNotice } from "./tax/taxTypes";
import { TaxCalendar } from "./tax/TaxCalendar";
import { VatDeclarationWizard } from "./tax/VatDeclarationWizard";
import { DeclarationExportPanel } from "./tax/DeclarationExportPanel";
import { TaxWorkspaceSummary } from "./tax/TaxWorkspaceSummary";

const MATERIAL_LABELS: Record<TaxMaterialKey, string> = {
  vat: "增值税底稿",
  iit: "个税申报资料",
  stamp: "印花税与附加税",
  cit: "企业所得税准备"
};

function isMaterialKey(value: string): value is TaxMaterialKey {
  return value === "vat" || value === "iit" || value === "stamp" || value === "cit";
}

function openPrintableHtml(html: string) {
  const printableWindow = window.open("", "_blank", "noopener,noreferrer");
  if (!printableWindow) {
    throw new Error("无法打开打印窗口");
  }
  printableWindow.document.open();
  printableWindow.document.write(html);
  printableWindow.document.close();
}

export function TaxPage() {
  const location = useLocation();
  const navState = normalizeDrilldownState(location.state);
  const navEventId = navState.businessEventId ?? null;
  const navTaxItemId = navState.taxItemId ?? null;
  const [selectedBatchState, setSelectedBatchState] = useQueryState("batch", "");
  const [activeMaterialState, setActiveMaterialState] = useQueryState("material", "vat");
  const activeMaterial = isMaterialKey(activeMaterialState) ? activeMaterialState : "vat";

  const [items, setItems] = useState<TaxItem[]>([]);
  const [batches, setBatches] = useState<TaxFilingBatch[]>([]);
  const [profiles, setProfiles] = useState<TaxpayerProfile[]>([]);
  const [selectedBatchDetail, setSelectedBatchDetail] = useState<TaxBatchDetail | null>(null);
  const [validation, setValidation] = useState<{ valid: boolean; issues: string[]; itemCount: number } | null>(null);
  const [ruleProfile, setRuleProfile] = useState<(TaxRuleProfile & { filingPeriod: string }) | null>(null);
  const [vatPaper, setVatPaper] = useState<VatWorkingPaper | null>(null);
  const [incomeTaxPreparation, setIncomeTaxPreparation] = useState<CorporateIncomeTaxPreparation | null>(null);
  const [iitMaterials, setIitMaterials] = useState<IndividualIncomeTaxMaterial | null>(null);
  const [stampAndSurtax, setStampAndSurtax] = useState<StampAndSurtaxSummary | null>(null);
  const [vatFilingPeriod, setVatFilingPeriod] = useState("2026-05");
  const [iitFilingPeriod, setIitFilingPeriod] = useState("2026-05");
  const [stampFilingPeriod, setStampFilingPeriod] = useState("2026-Q2");
  const [incomeTaxPeriod, setIncomeTaxPeriod] = useState("2026-Q2");
  const [reviewForm, setReviewForm] = useState({
    reviewResult: "approved" as "approved" | "rejected",
    reviewNotes: ""
  });
  const [archiveForm, setArchiveForm] = useState({
    archiveLabel: "",
    archiveNotes: ""
  });
  const [profileForm, setProfileForm] = useState({
    taxpayerType: "general_vat" as "general_vat" | "small_scale" | "general_simplified",
    effectiveFrom: "2026-05-01",
    notes: ""
  });
  const [notice, setNotice] = useState<TaxNotice>({
    tone: "info",
    message: "正在准备税务数据。"
  });
  const [showHelp, setShowHelp] = useState(false);
  const [vatWizardOpen, setVatWizardOpen] = useState(false);

  useEffect(() => {
    async function bootstrap() {
      try {
        const [itemsPayload, batchesPayload, profilesPayload] = await Promise.all([
          listTaxItems(navEventId ? { businessEventId: navEventId } : undefined),
          listTaxFilingBatches(),
          listTaxpayerProfiles()
        ]);
        setItems(itemsPayload.items);
        setBatches(batchesPayload.items);
        setProfiles(profilesPayload.items);

        const nextBatchId = selectedBatchState || batchesPayload.items[0]?.id || "";
        if (nextBatchId) {
          if (selectedBatchState !== nextBatchId) {
            setSelectedBatchState(nextBatchId);
          }
          setSelectedBatchDetail(await getTaxFilingBatchDetail(nextBatchId));
        } else {
          setSelectedBatchDetail(null);
        }

        setNotice({
          tone: "info",
          message: `${navEventId ? `当前事项 ${navEventId}：` : navTaxItemId ? `当前税务事项 ${navTaxItemId}：` : ""}已加载 ${itemsPayload.total} 条税务事项，${batchesPayload.total} 个申报批次。`
        });
      } catch (error) {
        setNotice({
          tone: "error",
          message: (error as Error).message
        });
      }
    }

    void bootstrap();
  }, [navEventId, navTaxItemId, selectedBatchState]);

  async function refreshBatches(batchId?: string) {
    const batchesPayload = await listTaxFilingBatches();
    setBatches(batchesPayload.items);
    const targetId = batchId || selectedBatchState || batchesPayload.items[0]?.id || "";
    if (!targetId) {
      setSelectedBatchDetail(null);
      return;
    }
    if (selectedBatchState !== targetId) {
      setSelectedBatchState(targetId);
    }
    setSelectedBatchDetail(await getTaxFilingBatchDetail(targetId));
  }

  async function handleSelectBatch(batchId: string) {
    setValidation(null);
    setSelectedBatchState(batchId);
    setSelectedBatchDetail(await getTaxFilingBatchDetail(batchId));
  }

  async function handleCreateProfile() {
    try {
      await createTaxpayerProfile(profileForm);
      const profilesPayload = await listTaxpayerProfiles();
      setProfiles(profilesPayload.items);
      const rulePayload = await getTaxRuleProfile("增值税", profileForm.effectiveFrom);
      setRuleProfile(rulePayload);
      setVatFilingPeriod(rulePayload.filingPeriod);
      setNotice({ tone: "success", message: "已保存纳税人口径并刷新税率规则。" });
    } catch (error) {
      setNotice({ tone: "error", message: (error as Error).message });
    }
  }

  async function handleResolveRuleProfile() {
    try {
      const payload = await getTaxRuleProfile("增值税", profileForm.effectiveFrom);
      setRuleProfile(payload);
      setVatFilingPeriod(payload.filingPeriod);
      setNotice({ tone: "success", message: "已解析增值税规则。" });
    } catch (error) {
      setNotice({ tone: "error", message: (error as Error).message });
    }
  }

  async function handleValidateBatch() {
    if (!selectedBatchDetail) {
      return;
    }
    const result = await validateTaxFilingBatch(selectedBatchDetail.id);
    setValidation(result);
    setNotice({
      tone: result.valid ? "success" : "warning",
      message: result.valid
        ? `批次 ${selectedBatchDetail.id} 校验通过。`
        : `批次 ${selectedBatchDetail.id} 校验未通过。`
    });
  }

  async function handleSubmitBatch() {
    if (!selectedBatchDetail) {
      return;
    }
    try {
      await submitTaxFilingBatch(selectedBatchDetail.id);
      await refreshBatches(selectedBatchDetail.id);
      setNotice({ tone: "success", message: `批次 ${selectedBatchDetail.id} 已提交。` });
    } catch (error) {
      setNotice({ tone: "error", message: (error as Error).message });
    }
  }

  async function handleReviewBatch() {
    if (!selectedBatchDetail) {
      return;
    }
    try {
      const detail = await reviewTaxFilingBatch(selectedBatchDetail.id, reviewForm);
      setSelectedBatchDetail(detail);
      setReviewForm((current) => ({ ...current, reviewNotes: "" }));
      setNotice({ tone: "success", message: `批次 ${selectedBatchDetail.id} 已完成复核。` });
    } catch (error) {
      setNotice({ tone: "error", message: (error as Error).message });
    }
  }

  async function handleArchiveBatch() {
    if (!selectedBatchDetail) {
      return;
    }
    try {
      const detail = await archiveTaxFilingBatch(selectedBatchDetail.id, archiveForm);
      setSelectedBatchDetail(detail);
      await refreshBatches(selectedBatchDetail.id);
      setArchiveForm((current) => ({ ...current, archiveNotes: "" }));
      setNotice({ tone: "success", message: `批次 ${selectedBatchDetail.id} 已留档。` });
    } catch (error) {
      setNotice({ tone: "error", message: (error as Error).message });
    }
  }

  async function handleGenerateVat() {
    try {
      const payload = await getVatWorkingPaper(vatFilingPeriod);
      setVatPaper(payload);
      setNotice({ tone: "success", message: "已生成增值税底稿。" });
    } catch (error) {
      setNotice({ tone: "error", message: (error as Error).message });
    }
  }

  async function handlePrintVat() {
    try {
      const html = await getTaxPrintableHtml("vat", vatFilingPeriod);
      openPrintableHtml(html);
      setNotice({ tone: "success", message: "已打开增值税底稿打印版。" });
    } catch (error) {
      setNotice({ tone: "error", message: (error as Error).message });
    }
  }

  async function handleGenerateIit() {
    try {
      const payload = await getIndividualIncomeTaxMaterials(iitFilingPeriod);
      setIitMaterials(payload);
      setNotice({ tone: "success", message: "已生成个税申报资料。" });
    } catch (error) {
      setNotice({ tone: "error", message: (error as Error).message });
    }
  }

  async function handleGenerateStamp() {
    try {
      const payload = await getStampAndSurtaxSummary(stampFilingPeriod);
      setStampAndSurtax(payload);
      setNotice({ tone: "success", message: "已汇总印花税与附加税事项。" });
    } catch (error) {
      setNotice({ tone: "error", message: (error as Error).message });
    }
  }

  async function handleGenerateCit() {
    try {
      const payload = await getCorporateIncomeTaxPreparation(incomeTaxPeriod);
      setIncomeTaxPreparation(payload);
      setNotice({ tone: "success", message: "已生成企业所得税预缴与汇算准备。" });
    } catch (error) {
      setNotice({ tone: "error", message: (error as Error).message });
    }
  }

  async function handlePrintCit() {
    try {
      const html = await getTaxPrintableHtml("corporate_income_tax", incomeTaxPeriod);
      openPrintableHtml(html);
      setNotice({ tone: "success", message: "已打开企业所得税打印版。" });
    } catch (error) {
      setNotice({ tone: "error", message: (error as Error).message });
    }
  }

  const selectedBatchLabel = selectedBatchDetail
    ? `${selectedBatchDetail.taxType} · ${selectedBatchDetail.filingPeriod}`
    : batches.find((item) => item.id === selectedBatchState)?.id || "";

  return (
    <section style={{ display: "grid", gap: "20px" }}>
      {showHelp ? <TaxHelpModal onClose={() => setShowHelp(false)} /> : null}
      <TaxShell
        header={<TaxHeader activeMaterialLabel={MATERIAL_LABELS[activeMaterial]} onOpenHelp={() => setShowHelp(true)} />}
        guidance={<ResultBanner tone={notice.tone} message={notice.message} />}
        summary={(
          <>
            <TaxCalendar batches={batches} onStartVatDeclaration={() => setVatWizardOpen(true)} />
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
