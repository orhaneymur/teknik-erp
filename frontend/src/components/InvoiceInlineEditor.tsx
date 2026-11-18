import { useEffect, useState } from 'react';
import SalesCreate from '../pages/SalesCreate';
import PurchaseCreate from '../pages/PurchaseCreate';
import SalesReturn from '../pages/SalesReturn';
import { useAppNavigationOptional } from '../context/AppNavigationContext';

export type EditableInvoiceRef = { id: number; type: string };

const EDITABLE_TYPES = new Set(['SATIS', 'ALIS', 'IADE']);

export function isEditableInvoiceType(type: string | undefined | null): type is 'SATIS' | 'ALIS' | 'IADE' {
  return type != null && EDITABLE_TYPES.has(type);
}

type InvoiceInlineEditorProps = {
  invoice: EditableInvoiceRef;
  onNotify?: (type: 'success' | 'error', message: string) => void;
  onDataChange?: () => void;
  onCancelEdit: () => void;
  onSaved: () => void;
  /** Fiş yüklenince yazdır, bitince onCancelEdit (Fatura Listesi "Yazdır") */
  autoPrint?: boolean;
};

/** Sayfadan ayrılmadan satış / alış / iade faturası düzenleme */
export default function InvoiceInlineEditor({
  invoice,
  onNotify,
  onDataChange,
  onCancelEdit,
  onSaved,
  autoPrint = false,
}: InvoiceInlineEditorProps) {
  /*
   * F2 — satis, alis ve iade icin AYNI yol (musteri bildirdi, 18 Kasim
   * 2026: alis fisi anasayfadan acilinca F2 "yalnizca ... ekranlarinda
   * calisir" uyarisi veriyordu). Onceden bu bildirimi yalnizca satis ekrani
   * yapiyordu; alis ve iade ile musteri karti / ekstreden acilan fisler
   * F2'yi alamiyordu.
   *
   * Sayac acilistaki degerden sayilir: daha once basilmis F2'ler fis
   * acilir acilmaz arama penceresini acmasin.
   */
  const navigation = useAppNavigationOptional();
  const setF2ContextActive = navigation?.setF2ContextActive;
  const tumF2 = navigation?.f2Trigger ?? 0;
  // Baska fise gecilince (ayni duzenleyici, yeni key) sayac sifirdan baslar
  const [f2Baslangic, setF2Baslangic] = useState({ id: invoice.id, deger: tumF2 });
  if (f2Baslangic.id !== invoice.id) {
    setF2Baslangic({ id: invoice.id, deger: tumF2 });
  }
  const f2Trigger =
    f2Baslangic.id === invoice.id ? Math.max(0, tumF2 - f2Baslangic.deger) : 0;

  useEffect(() => {
    setF2ContextActive?.(true);
    return () => setF2ContextActive?.(false);
  }, [setF2ContextActive]);

  const common = {
    key: invoice.id,
    editInvoiceId: invoice.id,
    f2Trigger,
    onNotify,
    onDataChange,
    onCancelEdit,
    onSaved,
    autoPrint,
  };

  if (invoice.type === 'ALIS') {
    return <PurchaseCreate {...common} />;
  }
  if (invoice.type === 'IADE') {
    return <SalesReturn {...common} />;
  }
  return <SalesCreate {...common} />;
}
