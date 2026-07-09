import { useEffect } from 'react';
import { formatDocumentTitle } from '../lib/navigation';

/** Sayfa içi dinamik başlık (ör. müşteri adı yüklendiğinde sekme metnini günceller). */
export function useDocumentTitle(pageTitle: string | undefined) {
  useEffect(() => {
    const label = pageTitle?.trim();
    if (!label) return;
    document.title = formatDocumentTitle(label);
  }, [pageTitle]);
}
