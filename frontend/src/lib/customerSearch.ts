import type { Customer } from './api';

/** Arama kutusundan müşteri/tedarikçi seçimi — Enter ve klavye gezinme ile uyumlu */
export function pickCustomerFromSearch(query: string, results: Customer[]): Customer | null {
  const trimmed = query.trim();
  if (!trimmed || results.length === 0) return null;

  const codePart = trimmed.split(/[—\-]/)[0].trim().toLocaleLowerCase('tr-TR');
  const exactByCode = results.find(
    (customer) => customer.code.toLocaleLowerCase('tr-TR') === codePart
  );
  if (exactByCode) return exactByCode;

  const lower = trimmed.toLocaleLowerCase('tr-TR');
  const exactByName = results.find(
    (customer) => customer.name.toLocaleLowerCase('tr-TR') === lower
  );
  if (exactByName) return exactByName;

  if (results.length === 1) return results[0];

  return (
    results.find(
      (customer) =>
        customer.name.toLocaleLowerCase('tr-TR').includes(lower) ||
        customer.code.toLocaleLowerCase('tr-TR').includes(lower)
    ) ?? null
  );
}
