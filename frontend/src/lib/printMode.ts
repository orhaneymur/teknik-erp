export type PrintMode = 'pdf' | 'thermal';

const PAGE_STYLE_ID = 'akgun-print-page-style';

function applyPageStyle(mode: PrintMode) {
  let styleEl = document.getElementById(PAGE_STYLE_ID) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = PAGE_STYLE_ID;
    document.head.appendChild(styleEl);
  }

  styleEl.textContent =
    mode === 'thermal'
      ? '@media print { @page { size: 72.1mm 297mm; margin: 2mm; } }'
      : '@media print { @page { size: A4 portrait; margin: 12mm; } }';
}

function clearPrintMode() {
  document.documentElement.classList.remove('print-thermal', 'print-pdf');
}

/**
 * PDF = A4 / eski geniş düzen.
 * thermal = 72.1mm fiş yazıcısı düzeni.
 */
export function printDocument(mode: PrintMode) {
  const root = document.documentElement;
  clearPrintMode();
  root.classList.add(mode === 'thermal' ? 'print-thermal' : 'print-pdf');
  applyPageStyle(mode);

  const cleanup = () => {
    clearPrintMode();
    window.removeEventListener('afterprint', cleanup);
  };

  window.addEventListener('afterprint', cleanup);
  window.print();

  // afterprint gelmezse sınıfı temizle
  window.setTimeout(cleanup, 60_000);
}
