import { useMemo } from 'react';
import {
  TURKEY_PROVINCES,
  districtsOf,
  normalizeDistrict,
  normalizeProvince,
} from '../lib/turkeyLocations';

type CityDistrictSelectProps = {
  city: string;
  district: string;
  /** İl ya da ilçe değiştiğinde ikisi birlikte bildirilir */
  onChange: (next: { city: string; district: string }) => void;
  fieldClass: string;
  labelClass: string;
  /** Alanları saran div'e eklenecek ek sınıflar (grid yerleşimi için) */
  cityWrapperClass?: string;
  districtWrapperClass?: string;
  disabled?: boolean;
};

/**
 * İl / İlçe seçimi — resmî Türkiye listesinden, ilçeler seçili ile bağlı.
 * Eski serbest metin kayıtları listede yoksa kaybolmaz, "(liste dışı)" olarak korunur.
 */
export default function CityDistrictSelect({
  city,
  district,
  onChange,
  fieldClass,
  labelClass,
  cityWrapperClass,
  districtWrapperClass,
  disabled,
}: CityDistrictSelectProps) {
  const normalizedCity = normalizeProvince(city);
  const districts = useMemo(() => districtsOf(normalizedCity), [normalizedCity]);

  /** Kayıtlı il listede yoksa seçili kalabilmesi için ek seçenek olarak eklenir */
  const legacyCity = city.trim() && !normalizedCity ? city.trim() : null;
  const legacyDistrict =
    district.trim() && !normalizeDistrict(normalizedCity, district)
      ? district.trim()
      : null;

  const handleCityChange = (nextCity: string) => {
    /* İl değişince ilçe geçersiz kalır; yeni ilde aynı ad varsa korunur */
    const keptDistrict = normalizeDistrict(nextCity, district);
    onChange({ city: nextCity, district: keptDistrict ?? '' });
  };

  return (
    <>
      <div className={cityWrapperClass}>
        <label className={labelClass}>İl</label>
        <select
          value={legacyCity ?? normalizedCity ?? ''}
          disabled={disabled}
          onChange={(e) => handleCityChange(e.target.value)}
          className={fieldClass}
        >
          <option value="">Seçiniz</option>
          {legacyCity && <option value={legacyCity}>{legacyCity} (liste dışı)</option>}
          {TURKEY_PROVINCES.map((province) => (
            <option key={province} value={province}>
              {province}
            </option>
          ))}
        </select>
      </div>
      <div className={districtWrapperClass}>
        <label className={labelClass}>İlçe</label>
        <select
          value={legacyDistrict ?? normalizeDistrict(normalizedCity, district) ?? ''}
          disabled={disabled || (!normalizedCity && !legacyDistrict)}
          onChange={(e) => onChange({ city, district: e.target.value })}
          className={fieldClass}
        >
          <option value="">{normalizedCity ? 'Seçiniz' : 'Önce il seçin'}</option>
          {legacyDistrict && (
            <option value={legacyDistrict}>{legacyDistrict} (liste dışı)</option>
          )}
          {districts.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
