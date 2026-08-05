import { Trash2 } from 'lucide-react';

type InvoiceTrashButtonProps = {
  onTrash: () => void;
  trashing: boolean;
  disabled?: boolean;
};

/**
 * Fatura düzenlemede fiş silme — sayfanın sol altında, küçük ve ayrık.
 *
 * Önceden sağdaki işlem kolonunda "KAYDET"in hemen üstünde tam genişlikte bir
 * butondu; yanlışlıkla tıklanması çok kolaydı. Onay penceresi
 * `useTrashInvoice` içinde sorulur.
 */
export default function InvoiceTrashButton({
  onTrash,
  trashing,
  disabled = false,
}: InvoiceTrashButtonProps) {
  return (
    <div className="flex justify-start pt-1 print:hidden">
      <button
        type="button"
        onClick={onTrash}
        disabled={trashing || disabled}
        title="Fişi silinen işlemlere taşı"
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-400 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Trash2 className="h-3.5 w-3.5" />
        {trashing ? 'Siliniyor...' : 'Fişi sil'}
      </button>
    </div>
  );
}
