import { useEffect, useId, useMemo, useRef, useState } from 'react';

export type TypeaheadOption = {
  id: string | number;
  label: string;
};

type TypeaheadFieldProps = {
  value: string;
  onChange: (value: string) => void;
  options: TypeaheadOption[];
  onSelectOption?: (option: TypeaheadOption) => void;
  placeholder?: string;
  inputClassName?: string;
  disabled?: boolean;
};

/** F2 benzeri: sadece yazınca altta minimal öneri listesi */
export default function TypeaheadField({
  value,
  onChange,
  options,
  onSelectOption,
  placeholder = 'Yazmaya başlayın...',
  inputClassName = '',
  disabled = false,
}: TypeaheadFieldProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const filtered = useMemo(() => {
    const query = value.trim().toLocaleLowerCase('tr-TR');
    if (!query) return [];
    return options
      .filter((option) =>
        option.label.toLocaleLowerCase('tr-TR').includes(query)
      )
      .slice(0, 12);
  }, [options, value]);

  const showList = open && value.trim().length > 0 && filtered.length > 0;

  useEffect(() => {
    setActiveIndex(0);
  }, [value]);

  useEffect(() => {
    if (!showList) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [showList]);

  const pick = (option: TypeaheadOption) => {
    onChange(option.label);
    onSelectOption?.(option);
    setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showList) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, filtered.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
    } else if (event.key === 'Enter') {
      const option = filtered[activeIndex];
      if (option) {
        event.preventDefault();
        pick(option);
      }
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <input
        type="text"
        value={value}
        disabled={disabled}
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        placeholder={placeholder}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className={inputClassName}
      />
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 z-30 mt-1 max-h-36 overflow-y-auto rounded-md border border-slate-200 bg-white py-0.5 shadow-sm"
        >
          {filtered.map((option, index) => (
            <li key={`${option.id}-${option.label}`} role="option" aria-selected={index === activeIndex}>
              <button
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  pick(option);
                }}
                onMouseEnter={() => setActiveIndex(index)}
                className={`block w-full truncate px-2.5 py-1.5 text-left text-xs ${
                  index === activeIndex
                    ? 'bg-indigo-50 text-indigo-900'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
