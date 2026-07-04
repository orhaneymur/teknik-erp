import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Package, PlusCircle, Save } from 'lucide-react';
import TypeaheadField from '../components/TypeaheadField';
import { API_BASE, ensureArray, formatUsd, roundPrice } from '../lib/api';
import { APPEARANCE_OPTIONS, QUALITY_OPTIONS } from '../lib/productOptions';

type Category = {
  id: number;
  name: string;
};

type BrandModelOption = {
  id: number;
  name: string;
  kind: 'MARKA' | 'MODEL';
  categoryId: number | null;
  category: { id: number; name: string } | null;
};

type ProductCreateProps = {
  onNotify?: (type: 'success' | 'error', message: string) => void;
};

function matchesCategory(item: BrandModelOption, categoryId: number | ''): boolean {
  if (categoryId === '') return true;
  // Secili kategori veya kategori baglantisi olmayan tanimlar
  return item.categoryId === categoryId || item.categoryId == null;
}

export default function ProductCreate({ onNotify }: ProductCreateProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [brandModels, setBrandModels] = useState<BrandModelOption[]>([]);
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState<number | ''>('');
  const [categoryText, setCategoryText] = useState('');
  const [brandText, setBrandText] = useState('');
  const [modelText, setModelText] = useState('');
  const [appearance, setAppearance] = useState('');
  const [quality, setQuality] = useState('');
  const [rbmPrice, setRbmPrice] = useState('');
  const [costPriceUsd, setCostPriceUsd] = useState('');
  const [priceUsd, setPriceUsd] = useState('');
  const [description, setDescription] = useState('');
  const [barcode, setBarcode] = useState('');
  const [initialQuantity, setInitialQuantity] = useState('0');
  const [submitting, setSubmitting] = useState(false);

  const notify = (type: 'success' | 'error', message: string) => {
    onNotify?.(type, message);
  };

  useEffect(() => {
    void Promise.all([
      axios.get<{ success: boolean; data: Category[] }>(`${API_BASE}/api/settings/categories`),
      axios.get<{ success: boolean; data: BrandModelOption[] }>(
        `${API_BASE}/api/settings/brand-models`
      ),
    ])
      .then(([catRes, brandRes]) => {
        if (catRes.data.success) setCategories(ensureArray(catRes.data.data));
        if (brandRes.data.success) setBrandModels(ensureArray(brandRes.data.data));
      })
      .catch(() => {
        /* tanımlar opsiyonel */
      });
  }, []);

  const brandOptions = useMemo(() => {
    const items = brandModels.filter((item) => item.kind === 'MARKA');
    const filtered = items.filter((item) => matchesCategory(item, categoryId));
    // Ayni isimli kayitlari tekilleştir
    const seen = new Set<string>();
    return filtered.filter((item) => {
      const key = item.name.toLocaleLowerCase('tr-TR');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [brandModels, categoryId]);

  const modelOptions = useMemo(() => {
    const items = brandModels.filter((item) => item.kind === 'MODEL');
    const filtered = items.filter((item) => matchesCategory(item, categoryId));
    const seen = new Set<string>();
    return filtered.filter((item) => {
      const key = item.name.toLocaleLowerCase('tr-TR');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [brandModels, categoryId]);

  const filteredModelOptions = useMemo(() => {
    const brandQuery = brandText.trim().toLocaleLowerCase('tr-TR');
    if (!brandQuery) return modelOptions;
    return modelOptions.filter((item) =>
      item.name.toLocaleLowerCase('tr-TR').includes(brandQuery)
    );
  }, [modelOptions, brandText]);

  const selectedBrandName = brandText.trim();
  const selectedModelName = modelText.trim();

  const matchedModelId = useMemo(() => {
    if (!selectedModelName) return undefined;
    const match = modelOptions.find(
      (item) => item.name.toLocaleLowerCase('tr-TR') === selectedModelName.toLocaleLowerCase('tr-TR')
    );
    return match?.id;
  }, [modelOptions, selectedModelName]);

  const parsedCost = Number(costPriceUsd) || 0;
  const parsedSale = Number(priceUsd) || 0;
  const parsedRbm = Number(rbmPrice) || 0;
  const margin =
    parsedSale > 0 ? ((parsedSale - parsedCost) / parsedSale) * 100 : 0;

  const generatedPreview = useMemo(() => {
    const parts = [selectedBrandName, selectedModelName, name.trim()].filter(Boolean);
    return parts.join(' ') || name.trim();
  }, [selectedBrandName, selectedModelName, name]);

  const resetForm = () => {
    setName('');
    setCategoryId('');
    setCategoryText('');
    setBrandText('');
    setModelText('');
    setAppearance('');
    setQuality('');
    setRbmPrice('');
    setCostPriceUsd('');
    setPriceUsd('');
    setDescription('');
    setBarcode('');
    setInitialQuantity('0');
  };

  const applyCategory = (value: number | '', label = '') => {
    setCategoryId(value);
    setCategoryText(label);
    setBrandText('');
    setModelText('');
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!name.trim()) {
      notify('error', 'Stok adı zorunludur.');
      return;
    }

    if (!costPriceUsd || Number.isNaN(parsedCost) || parsedCost < 0) {
      notify('error', 'Geçerli bir alış fiyatı (USD) girin.');
      return;
    }

    if (!priceUsd || Number.isNaN(parsedSale) || parsedSale < 0) {
      notify('error', 'Geçerli bir satış fiyatı (USD) girin.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await axios.post(`${API_BASE}/api/products`, {
        name: generatedPreview || name.trim(),
        costPrice: parsedCost,
        priceUsd: parsedSale,
        priceTl: roundPrice(parsedSale),
        barcode: barcode.trim() || undefined,
        initialQuantity: Number(initialQuantity) || 0,
        categoryId: categoryId !== '' ? Number(categoryId) : undefined,
        brand: selectedBrandName || undefined,
        model: selectedModelName || undefined,
        brandModelId: matchedModelId,
        appearance: appearance || undefined,
        quality: quality || undefined,
        rbmPrice: parsedRbm,
        description: description.trim() || undefined,
      });

      if (response.data.success) {
        notify(
          'success',
          `Stok kartı oluşturuldu: ${response.data.data?.sku ?? generatedPreview}`
        );
        resetForm();
      }
    } catch (error) {
      const message =
        axios.isAxiosError(error) && error.response?.data?.message
          ? String(error.response.data.message)
          : 'Stok kartı oluşturulamadı.';
      notify('error', message);
    } finally {
      setSubmitting(false);
    }
  };

  const fieldClass = 'field-input';
  const labelClass = 'field-label';

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-indigo-600 p-2.5 text-white">
          <PlusCircle className="h-5 w-5" />
        </div>
        <div>
          <h1 className="page-title">Stok Kartı Oluştur</h1>
          <p className="page-subtitle">
            Kategori ile tanımları filtreler · marka/model listeden veya elle yazılır
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="card-section overflow-hidden">
        <div className="grid grid-cols-1 gap-0 lg:grid-cols-2">
          <div className="space-y-4 border-b border-slate-100 p-5 lg:border-b-0 lg:border-r">
            <h2 className="text-sm font-bold uppercase tracking-wide text-indigo-700">
              Ürün Bilgileri
            </h2>

            <div>
              <label className={labelClass}>Kategori</label>
              <TypeaheadField
                value={categoryText}
                onChange={(value) => {
                  setCategoryText(value);
                  const match = categories.find(
                    (cat) =>
                      cat.name.toLocaleLowerCase('tr-TR') ===
                      value.trim().toLocaleLowerCase('tr-TR')
                  );
                  const nextId = match?.id ?? '';
                  if (nextId !== categoryId) {
                    setCategoryId(nextId);
                    if (nextId !== '') {
                      setBrandText('');
                      setModelText('');
                    }
                  }
                }}
                onSelectOption={(option) => {
                  applyCategory(Number(option.id), option.label);
                }}
                options={categories.map((cat) => ({
                  id: cat.id,
                  label: cat.name,
                }))}
                placeholder="Yazmaya başlayın..."
                inputClassName={fieldClass}
              />
              <p className="mt-1 text-caption text-slate-400">
                Yazınca altta öneriler çıkar · Excel tanımlarından dolar
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Marka</label>
                <TypeaheadField
                  value={brandText}
                  onChange={setBrandText}
                  options={brandOptions.map((item) => ({
                    id: item.id,
                    label: item.name,
                  }))}
                  placeholder="Yazmaya başlayın..."
                  inputClassName={fieldClass}
                />
              </div>
              <div>
                <label className={labelClass}>Model</label>
                <TypeaheadField
                  value={modelText}
                  onChange={setModelText}
                  options={filteredModelOptions.map((item) => ({
                    id: item.id,
                    label: item.name,
                  }))}
                  placeholder="Yazmaya başlayın..."
                  inputClassName={fieldClass}
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>Stok Adı *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className={fieldClass}
                placeholder="Ekran, batarya, cam..."
              />
              <p className="mt-1 text-caption text-slate-400">
                Marka + model + stok adı birleşerek kayıt adı oluşur · tanımlar opsiyonel
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Renk / Görünüm</label>
                <select
                  value={appearance}
                  onChange={(e) => setAppearance(e.target.value)}
                  className={fieldClass}
                >
                  <option value="">Seçin...</option>
                  {APPEARANCE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Kalite</label>
                <select
                  value={quality}
                  onChange={(e) => setQuality(e.target.value)}
                  className={fieldClass}
                >
                  <option value="">Seçin...</option>
                  {QUALITY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className={labelClass}>Barkod</label>
              <input
                type="text"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                className={fieldClass}
                placeholder="8690000000000"
              />
            </div>

            <div>
              <label className={labelClass}>Başlangıç Stoğu (MERKEZ_DEPO)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={initialQuantity}
                onChange={(e) => setInitialQuantity(e.target.value)}
                className={`${fieldClass} sm:max-w-[10rem]`}
              />
            </div>
          </div>

          <div className="space-y-4 bg-slate-50/60 p-5">
            <h2 className="text-sm font-bold uppercase tracking-wide text-emerald-700">
              Fiyat & Açıklama
            </h2>

            <div>
              <label className={labelClass}>RBM Fiyatı (USD)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={rbmPrice}
                onChange={(e) => setRbmPrice(e.target.value)}
                className={fieldClass}
                placeholder="0.00"
              />
            </div>

            <div>
              <label className={labelClass}>Alış Fiyatı (USD) *</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={costPriceUsd}
                onChange={(e) => setCostPriceUsd(e.target.value)}
                required
                className={fieldClass}
                placeholder="0.00"
              />
            </div>

            <div>
              <label className={labelClass}>Satış Fiyatı (USD) *</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={priceUsd}
                onChange={(e) => setPriceUsd(e.target.value)}
                required
                className={fieldClass}
                placeholder="0.00"
              />
            </div>

            {parsedCost > 0 && parsedSale > 0 && (
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600">
                <Package className="h-4 w-4 shrink-0 text-indigo-500" />
                <span>
                  Kâr: {formatUsd(parsedSale - parsedCost)} · Marj: {margin.toFixed(1)}%
                </span>
              </div>
            )}

            <div>
              <label className={labelClass}>Açıklama</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className={`${fieldClass} resize-none`}
                placeholder="Ürün notları, uyumluluk, tedarikçi bilgisi..."
              />
            </div>

            {generatedPreview && (
              <p className="text-caption text-slate-500">
                Kayıt adı: <span className="font-medium text-slate-700">{generatedPreview}</span>
              </p>
            )}
          </div>
        </div>

        <div className="border-t border-slate-100 bg-white px-5 py-4">
          <button type="submit" disabled={submitting} className="btn btn-secondary">
            <Save className="h-5 w-5" />
            {submitting ? 'Kaydediliyor...' : 'Stok Kartını Kaydet'}
          </button>
        </div>
      </form>
    </div>
  );
}
