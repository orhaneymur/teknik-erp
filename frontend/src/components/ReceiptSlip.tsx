import type { ReactNode } from 'react';
import { formatUsd } from '../lib/api';
import { RECEIPT_DISCLAIMER } from '../lib/receiptParty';
import { tryEquivalent, tryRateNote } from '../lib/receiptTl';
import { getTenantConfig } from '../lib/tenantConfig';

/**
 * Termal fişin ORTAK ÇERÇEVESİ — 68mm, yazıcı ölçüsü index.css'te.
 *
 * Beş ekran fiş basıyor (satış, alış, iade, tahsilat, ekstre) ve beşi de bu
 * çerçeveyi kullanır. Gövde her ekranda farklı olduğu için `children` olarak
 * geçilir; başlık, müşteri bloğu, açıklama ve alt bilgi burada tek yerde
 * durur. Önceden beş dosyaya ayrı ayrı yazılmıştı ve zamanla ayrışmıştı —
 * iade fişi `pdf-party` sınıfını kullanıyordu, tahsilat fişinde firma adı
 * hiç yoktu.
 *
 * Düzen (11 Eylül 2026):
 *   logo · müşteri · fiş no · tarih/satış yapan · açıklama
 *   → gövde →
 *   firma adı · iletişim · kur dipnotu · feragat
 */
export function ReceiptSlip({
  partyLines,
  title,
  metaLines,
  notes,
  tryRate,
  children,
}: {
  /** Müşteri/tedarikçi satırları — adres BASILMAZ (bkz. receiptParty.ts) */
  partyLines: string[];
  /** Fiş no veya fiş tipi — en belirgin satır */
  title: string;
  /** Tarih, satış yapan, ödeme yöntemi… Boş olanlar atılır */
  metaLines: Array<string | null | undefined>;
  /** Sipariş açıklaması — yazılmışsa çerçeveli basılır */
  notes?: string | null;
  /** Faturaya kaydedilmiş USD/TL kuru; yoksa TL satırları basılmaz */
  tryRate?: number | null;
  children: ReactNode;
}) {
  const tenant = getTenantConfig();
  const meta = metaLines.map((line) => line?.trim()).filter(Boolean) as string[];
  const note = notes?.trim();
  const rateNote = tryRateNote(tryRate);

  return (
    <div className="receipt-slip hidden">
      {/*
        LOGO — dosya geldiğinde `tenant.logoUrl` ayarlanır ve yer tutucu
        kendiliğinden kaybolur; kod değişmez, sürüm çıkmaz.
        Yer tutucu kesik çizgili: gerçek logo sanılmasın.
      */}
      <div className="receipt-slip-logo">
        {tenant.logoUrl ? (
          // alt boş: logo yüklenmezse fişte kırık görsel yazısı çıkmasın
          <img src={tenant.logoUrl} alt="" />
        ) : (
          <span className="receipt-slip-logo-placeholder">LOGO</span>
        )}
      </div>

      {partyLines.length > 0 && (
        <div className="receipt-slip-party">
          {partyLines.map((line) => (
            <p key={line} className="receipt-slip-party-line">
              {line}
            </p>
          ))}
        </div>
      )}

      <p className="receipt-slip-title">{title}</p>
      {meta.map((line) => (
        <p key={line} className="receipt-slip-meta">
          {line}
        </p>
      ))}

      {note && (
        <div className="receipt-slip-notes">
          <span className="receipt-slip-notes-label">AÇIKLAMA</span>
          <span className="receipt-slip-notes-body">{note}</span>
        </div>
      )}

      {children}

      <div className="receipt-slip-divider" />
      <p className="receipt-slip-company">{tenant.companyName}</p>
      {tenant.companyContact && (
        <p className="receipt-slip-company-contact">{tenant.companyContact}</p>
      )}
      {rateNote && <p className="receipt-slip-rate">{rateNote}</p>}
      <p className="receipt-slip-disclaimer">{RECEIPT_DISCLAIMER}</p>
    </div>
  );
}

/**
 * Fişteki para satırı — sağda USD, altında TL karşılığı.
 *
 * TL satırı yalnızca kur kayıtta varsa basılır. Kur yoksa satır hiç çıkmaz;
 * eski faturalar bugünün kuruyla yeniden hesaplanmış gibi görünmez.
 */
export function ReceiptMoneyRow({
  label,
  amountUsd,
  tryRate,
  grand = false,
}: {
  label: string;
  amountUsd: number;
  tryRate?: number | null;
  /** Net toplam / güncel bakiye gibi vurgulanan satırlar */
  grand?: boolean;
}) {
  const tl = tryEquivalent(amountUsd, tryRate);
  return (
    <>
      <div
        className={`receipt-item-row receipt-slip-summary${
          grand ? ' receipt-slip-grand' : ''
        }`}
      >
        <span className="receipt-item-name">{label}</span>
        <span className="receipt-item-total">{formatUsd(amountUsd)}</span>
      </div>
      {tl && <p className="receipt-slip-tl">≈ {tl}</p>}
    </>
  );
}

/** Para olmayan özet satırı (ör. "Toplam adet") */
export function ReceiptPlainRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="receipt-item-row receipt-slip-summary">
      <span className="receipt-item-name">{label}</span>
      <span className="receipt-item-total">{value}</span>
    </div>
  );
}

/** Ürün tablosunun başlık satırı — beş fişte aynı */
export function ReceiptItemsHead() {
  return (
    <div className="receipt-item-row receipt-item-head">
      <span className="receipt-item-name">Ürün</span>
      <span className="receipt-item-qty">Ad</span>
      <span className="receipt-item-price">Fiyat</span>
      <span className="receipt-item-total">Top.</span>
    </div>
  );
}
