# Müşteri ayarları

Her müşterinin kendine ait bir `<kisa-ad>.yaml` dosyası vardır. Sunucuda
çalışan gerçek ayarların kaydı burasıdır: kim hangi sürümde, hangi adreste,
hangi özellik açık.

## Kural

Sunucuda bir ayar değiştirdiğinde **aynı değişikliği buraya da yaz ve commit et.**
Bu iki taraf ayrıştığı anda "hangi müşteride ne açıktı" sorusunun cevabı
kaybolur — ve o soru er geç sorulur.

## Yeni müşteri açmak

```bash
# 1) Cloudflare'de A kaydı:  <ad>-erp -> 213.238.168.227  (Proxied)
#    Adres TEK seviye olmalı; iki seviyede ücretsiz sertifika kapsamaz.

# 2) Bu klasöre <ad>.yaml oluştur

# 3) Kur
bash k8s/new-tenant.sh <ad> "Firma Adı"
```

## Mevcut ayarı değiştirmek

```bash
helm upgrade teknikerp charts/teknikerp -n tenant-<ad> \
  --reuse-values --set <anahtar>=<deger>
```

Ardından bu klasördeki dosyayı da güncelle.

## Sunucudaki gerçek ayarı okumak

```bash
helm get values teknikerp -n tenant-<ad>
```
