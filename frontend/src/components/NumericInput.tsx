import {
  forwardRef,
  useState,
  type FocusEvent,
  type InputHTMLAttributes,
} from 'react';
import {
  formatDecimalDraft,
  parseDecimalInput,
  sanitizeDecimalDraft,
} from '../lib/decimalInput';

type NativeProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type' | 'min' | 'max'
>;

type NumericInputProps = NativeProps & {
  value: number;
  onValueChange: (value: number) => void;
  /** false ise yalnızca tam sayı kabul edilir (adet kutuları) */
  decimal?: boolean;
  min?: number;
  max?: number;
  /** Değer 0 iken kutu boş görünsün (iade adedi gibi alanlar) */
  emptyWhenZero?: boolean;
};

/**
 * Fatura kalemlerindeki adet ve fiyat kutusu.
 *
 * `type="number"` yerine metin kutusu kullanılır; sebebi ve çözümleme
 * kuralları için bkz. `lib/decimalInput.ts`. Kullanıcı yazarken metni
 * olduğu gibi gösteririz (taslak), alandan çıkınca sayının sadeleşmiş
 * hâline döneriz: "025" yazan biri kutuda "25" görür.
 */
const NumericInput = forwardRef<HTMLInputElement, NumericInputProps>(
  function NumericInput(
    {
      value,
      onValueChange,
      decimal = true,
      min,
      max,
      emptyWhenZero = false,
      onFocus,
      onBlur,
      ...rest
    },
    ref
  ) {
    const [draft, setDraft] = useState<string | null>(null);

    const displayed =
      draft ?? (emptyWhenZero && !value ? '' : formatDecimalDraft(value));

    const clamp = (n: number) => {
      let result = decimal ? n : Math.trunc(n);
      if (min != null && result < min) result = min;
      if (max != null && result > max) result = max;
      return result;
    };

    return (
      <input
        {...rest}
        ref={ref}
        type="text"
        inputMode={decimal ? 'decimal' : 'numeric'}
        autoComplete="off"
        value={displayed}
        onChange={(e) => {
          const next = sanitizeDecimalDraft(e.target.value, decimal);
          setDraft(next);
          const parsed = parseDecimalInput(next);
          if (parsed != null) {
            onValueChange(clamp(parsed));
          } else if (next === '' && emptyWhenZero) {
            // Boş görünmesi anlamlı olan alanda silmek sıfırlamak demektir
            onValueChange(clamp(0));
          }
          // Diğer alanlarda kutu boşaltılınca eski değer korunur;
          // alandan çıkınca geri gelir.
        }}
        onFocus={(e: FocusEvent<HTMLInputElement>) => {
          e.target.select();
          onFocus?.(e);
        }}
        onBlur={(e: FocusEvent<HTMLInputElement>) => {
          // Taslağı bırak: gösterim sayının sade hâline döner.
          setDraft(null);
          onBlur?.(e);
        }}
      />
    );
  }
);

export default NumericInput;
