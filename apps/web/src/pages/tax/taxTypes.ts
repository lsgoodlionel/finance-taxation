import type {
  TaxFilingBatch,
  TaxFilingBatchArchiveRecord,
  TaxFilingBatchReviewRecord,
  TaxItem
} from "@finance-taxation/domain-model";

export type TaxBatchDetail = TaxFilingBatch & {
  items: TaxItem[];
  reviews: TaxFilingBatchReviewRecord[];
  archives: TaxFilingBatchArchiveRecord[];
};

export type TaxNoticeTone = "info" | "success" | "warning" | "error";

export interface TaxNotice {
  tone: TaxNoticeTone;
  message: string;
}
