/**
 * 「新建经营事项」对话框。
 *
 * 表单从首屏收进对话框，由列表区的「新建事项」按钮触发：登记新事项和查看已有
 * 事项是两件事，同屏并排只会让人不知道从哪下手。创建成功后由调用方关闭对话框
 * 并选中新建的事项，用户直接落到「这一笔办到哪了」。
 */
import React from "react";
import { Modal } from "antd";
import { EventCreatePanel } from "./EventCreatePanel";
import type { TaxableCategoryOption } from "../../lib/api-events";

import type { Counterparty } from "../../lib/api";

type EventFormState = {
  type: string;
  title: string;
  description: string;
  department: string;
  occurredOn: string;
  amount: string;
  currency?: string;
  source?: string;
  counterpartyId?: string;
  taxableCategory?: string;
};

export interface EventCreateModalProps {
  open: boolean;
  form: EventFormState;
  isBusy: boolean;
  isSaving: boolean;
  options: Array<{ value: string; label: string }>;
  counterparties: Counterparty[];
  taxableCategories: TaxableCategoryOption[];
  taxpayerType: string | null;
  onChange(next: EventFormState): void;
  onSubmit(): void;
  onClose(): void;
}

export function EventCreateModal({
  open,
  form,
  isBusy,
  isSaving,
  options,
  counterparties,
  taxableCategories,
  taxpayerType,
  onChange,
  onSubmit,
  onClose
}: EventCreateModalProps) {
  return (
    <Modal
      open={open}
      title="新建经营事项"
      onCancel={onClose}
      footer={null}
      destroyOnHidden
      width={640}
      maskClosable={!isSaving}
    >
      <EventCreatePanel
        form={form}
        isBusy={isBusy}
        isSaving={isSaving}
        options={options}
        counterparties={counterparties}
        taxableCategories={taxableCategories}
        taxpayerType={taxpayerType}
        onChange={onChange}
        onSubmit={onSubmit}
      />
    </Modal>
  );
}
