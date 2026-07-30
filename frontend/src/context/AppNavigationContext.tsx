import { createContext, useContext } from 'react';
import type { NavigateFn } from '../lib/navigation';

type AppNavigationValue = {
  navigateTo: NavigateFn;
  navigateToCustomer: (customerId: number) => void;
  goBack: () => void;
  /**
   * Sayfa içi gömülü görünüm (ör. iade ekranından açılan fatura) açıkken üst
   * bardaki Geri tuşunu o görünüme bağlar. Handler `true` dönerse geri işlemi
   * tüketilmiş sayılır ve sayfa değişmez — böylece geri tuşu ana sayfaya
   * atmak yerine bir önceki alana döner ve sayfanın state'i korunur.
   * Görünüm kapanırken `null` ile kaydı kaldırın.
   */
  registerBackHandler: (handler: (() => boolean) | null) => void;
};

export const AppNavigationContext = createContext<AppNavigationValue | null>(null);

export function useAppNavigation(): AppNavigationValue {
  const ctx = useContext(AppNavigationContext);
  if (!ctx) {
    throw new Error('useAppNavigation App içinde kullanılmalıdır.');
  }
  return ctx;
}

export function useAppNavigationOptional(): AppNavigationValue | null {
  return useContext(AppNavigationContext);
}
