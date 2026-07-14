import { formatMoney, type Customer } from './api';

export type ReceiptParty = Pick<
  Customer,
  'code' | 'name' | 'balance'
> & {
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  district?: string | null;
  city?: string | null;
  taxOffice?: string | null;
  taxNumber?: string | null;
  contactPerson?: string | null;
};

/** Fişte müşteriye yarayan satırlar (dahili not yok) */
export function buildReceiptPartyLines(party: ReceiptParty | null | undefined): string[] {
  if (!party) return [];
  const lines: string[] = [];

  const title = [party.code, party.name].filter(Boolean).join(' — ');
  if (title) lines.push(title);

  if (party.contactPerson?.trim()) {
    lines.push(`Yetkili: ${party.contactPerson.trim()}`);
  }
  if (party.phone?.trim()) {
    lines.push(`Tel: ${party.phone.trim()}`);
  }
  if (party.taxNumber?.trim() || party.taxOffice?.trim()) {
    const taxParts: string[] = [];
    if (party.taxNumber?.trim()) taxParts.push(`VKN: ${party.taxNumber.trim()}`);
    if (party.taxOffice?.trim()) taxParts.push(party.taxOffice.trim());
    lines.push(taxParts.join(' · '));
  }
  const place = [party.address, party.district, party.city]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(', ');
  if (place) lines.push(place);

  return lines;
}

export const RECEIPT_DISCLAIMER =
  'Bu bir bilgi fişidir, herhangi bir mali değeri yoktur.';

export function formatReceiptBalanceLine(label: string, amount: number): string {
  return `${label}: ${formatMoney(amount)}`;
}
