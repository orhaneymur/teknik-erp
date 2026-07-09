import SalesCreate from '../pages/SalesCreate';
import PurchaseCreate from '../pages/PurchaseCreate';
import SalesReturn from '../pages/SalesReturn';

export type EditableInvoiceRef = { id: number; type: string };

const EDITABLE_TYPES = new Set(['SATIS', 'ALIS', 'IADE']);

export function isEditableInvoiceType(type: string | undefined | null): type is 'SATIS' | 'ALIS' | 'IADE' {
  return type != null && EDITABLE_TYPES.has(type);
}

type InvoiceInlineEditorProps = {
  invoice: EditableInvoiceRef;
  f2Trigger?: number;
  onNotify?: (type: 'success' | 'error', message: string) => void;
  onDataChange?: () => void;
  onCancelEdit: () => void;
  onSaved: () => void;
  onF2ContextActive?: (active: boolean) => void;
};

/** Sayfadan ayrılmadan satış / alış / iade faturası düzenleme */
export default function InvoiceInlineEditor({
  invoice,
  f2Trigger = 0,
  onNotify,
  onDataChange,
  onCancelEdit,
  onSaved,
  onF2ContextActive,
}: InvoiceInlineEditorProps) {
  const common = {
    key: invoice.id,
    editInvoiceId: invoice.id,
    f2Trigger,
    onNotify,
    onDataChange,
    onCancelEdit,
    onSaved,
  };

  if (invoice.type === 'ALIS') {
    return <PurchaseCreate {...common} />;
  }
  if (invoice.type === 'IADE') {
    return <SalesReturn {...common} />;
  }
  return <SalesCreate {...common} onF2ContextActive={onF2ContextActive} />;
}
