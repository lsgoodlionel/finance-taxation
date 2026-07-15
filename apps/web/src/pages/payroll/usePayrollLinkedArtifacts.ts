import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { PayrollTaxReviewLedger, RiskFinding, TaxItem, Voucher } from "@finance-taxation/domain-model";
import {
  getIndividualIncomeTaxMaterials,
  listPayrollReviewLedgers,
  listRiskFindings,
  listTaxItems,
  listVouchers,
  syncPayrollReviewLedgers
} from "../../lib/api";

export interface PayrollLinkedArtifactsInput {
  linkedEventId: string | null;
  selectedPeriod: string;
  setReviewLedgers: Dispatch<SetStateAction<PayrollTaxReviewLedger[]>>;
}

export interface PayrollLinkedArtifactsState {
  linkedTaxItemCount: number;
  linkedVoucherCount: number;
  linkedTaxItems: TaxItem[];
  linkedVouchers: Voucher[];
  linkedRisks: RiskFinding[];
  iitChecklist: string[];
  iitMaterialPeriod: string | null;
}

export function usePayrollLinkedArtifacts({
  linkedEventId,
  selectedPeriod,
  setReviewLedgers
}: PayrollLinkedArtifactsInput): PayrollLinkedArtifactsState {
  const [linkedTaxItemCount, setLinkedTaxItemCount] = useState(0);
  const [linkedVoucherCount, setLinkedVoucherCount] = useState(0);
  const [linkedTaxItems, setLinkedTaxItems] = useState<TaxItem[]>([]);
  const [linkedVouchers, setLinkedVouchers] = useState<Voucher[]>([]);
  const [linkedRisks, setLinkedRisks] = useState<RiskFinding[]>([]);
  const [iitChecklist, setIitChecklist] = useState<string[]>([]);
  const [iitMaterialPeriod, setIitMaterialPeriod] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadLinkedArtifacts() {
      try {
        const [taxRes, voucherRes, riskRes, iitRes, ledgerRes] = await Promise.all([
          linkedEventId ? listTaxItems({ businessEventId: linkedEventId }) : Promise.resolve({ items: [], total: 0 }),
          linkedEventId ? listVouchers({ businessEventId: linkedEventId }) : Promise.resolve({ items: [], total: 0 }),
          linkedEventId ? listRiskFindings() : Promise.resolve({ items: [], total: 0 }),
          getIndividualIncomeTaxMaterials(selectedPeriod),
          linkedEventId
            ? syncPayrollReviewLedgers({
                period: selectedPeriod,
                businessEventId: linkedEventId
              }).catch(() => ({ items: [], total: 0 }))
            : listPayrollReviewLedgers(selectedPeriod).catch(() => ({ items: [], total: 0 }))
        ]);
        if (!active) return;
        setLinkedTaxItemCount(taxRes.total);
        setLinkedVoucherCount(voucherRes.total);
        setLinkedTaxItems(taxRes.items);
        setLinkedVouchers(voucherRes.items);
        setLinkedRisks(
          riskRes.items
            .filter((item) => item.businessEventId === linkedEventId)
        );
        setIitChecklist(iitRes.checklist);
        setIitMaterialPeriod(iitRes.filingPeriod);
        setReviewLedgers(ledgerRes.items);
      } catch {
        if (!active) return;
        setLinkedTaxItemCount(0);
        setLinkedVoucherCount(0);
        setLinkedTaxItems([]);
        setLinkedVouchers([]);
        setLinkedRisks([]);
        setReviewLedgers([]);
        setIitChecklist([]);
        setIitMaterialPeriod(null);
      }
    }

    void loadLinkedArtifacts();
    return () => {
      active = false;
    };
  }, [linkedEventId, selectedPeriod]);

  return {
    linkedTaxItemCount,
    linkedVoucherCount,
    linkedTaxItems,
    linkedVouchers,
    linkedRisks,
    iitChecklist,
    iitMaterialPeriod
  };
}
