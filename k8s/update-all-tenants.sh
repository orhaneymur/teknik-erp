#!/bin/bash
# TeknikERP — tum musterileri (veya tek bir musteriyi) yeni surume gecirir.
#
# Kullanim:
#   bash k8s/update-all-tenants.sh v1.9.1              # tum musteriler
#   bash k8s/update-all-tenants.sh v1.9.1 demo         # yalnizca demo
#
# TAVSIYE: once demo'yu guncelle, kontrol et, sonra digerlerine gec.
# Bir musteride sorun cikarsa yalnizca o musteri geri alinir:
#   helm rollback teknikerp -n tenant-<ad>
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHART="${ROOT}/charts/teknikerp"

TAG="${1:-}"
ONLY="${2:-}"

if [[ -z "$TAG" ]]; then
  echo "Kullanim: bash k8s/update-all-tenants.sh <surum> [musteri-kisa-adi]"
  exit 1
fi

for cmd in kubectl helm; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "HATA: '$cmd' bulunamadi."; exit 1; }
done

if [[ -n "$ONLY" ]]; then
  NAMESPACES="tenant-${ONLY}"
else
  # new-tenant.sh her namespace'i bu etiketle isaretler
  NAMESPACES="$(kubectl get namespaces -l teknikerp.io/tenant -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}')"
fi

if [[ -z "${NAMESPACES// }" ]]; then
  echo "Guncellenecek musteri bulunamadi."
  exit 0
fi

echo "==> Hedef surum: ${TAG}"
echo "==> Musteriler:"
echo "$NAMESPACES" | sed 's/^/    /'
echo ""

FAILED=""

for ns in $NAMESPACES; do
  echo "======================================================================"
  echo " ${ns}"
  echo "======================================================================"

  # --reuse-values: musteriye ozel ayarlar (firma adi, replica sayisi,
  # disk boyutu) korunur; yalnizca imaj surumu degisir.
  # --wait kullanilmiyor: yedek diski (WaitForFirstConsumer) gecelik
  # CronJob calisana kadar Pending kalir ve --wait bosuna bekler.
  # Bunun yerine yalnizca uygulama deployment'larini bekliyoruz.
  if helm upgrade teknikerp "$CHART" \
      --namespace "$ns" \
      --reuse-values \
      --set "image.tag=${TAG}" \
      --timeout 10m \
    && kubectl rollout status deployment/teknikerp-backend -n "$ns" --timeout=600s \
    && kubectl rollout status deployment/teknikerp-frontend -n "$ns" --timeout=300s; then
    echo "    OK: ${ns}"
  else
    echo "    HATA: ${ns} guncellenemedi."
    FAILED="${FAILED} ${ns}"
  fi
  echo ""
done

echo "======================================================================"
if [[ -n "$FAILED" ]]; then
  echo " BAZI MUSTERILER GUNCELLENEMEDI:${FAILED}"
  echo ""
  echo " Inceleme : kubectl get pods -n <namespace>"
  echo " Geri alma: helm rollback teknikerp -n <namespace>"
  exit 1
fi

echo " Tum musteriler ${TAG} surumune gecti."
echo "======================================================================"
helm list -A -f teknikerp
