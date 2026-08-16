#!/bin/bash
# TeknikERP — yeni musteri (tenant) acar.
#
# Kullanim:
#   bash k8s/new-tenant.sh <kisa-ad> "<Firma Adi>" [ek helm parametreleri...]
#
# Ornekler:
#   bash k8s/new-tenant.sh demo "TeknikERP Demo" --set demoReset.enabled=true
#   bash k8s/new-tenant.sh xyzoto "XYZ Oto Elektrik" --set mysql.storage=10Gi
#   bash k8s/new-tenant.sh akgunteknik "Akgun Teknik" --set backend.replicas=2
#
# Yaptiklari:
#   1. tenant-<kisa-ad> namespace'ini olusturur
#   2. Rastgele MySQL sifresi / JWT secret / yonetici sifresi uretir (Secret)
#   3. MySQL + backend + frontend + Ingress + yedek isini kurar
#   4. Sema migration'ini calistirir
#   5. Giris bilgilerini ekrana yazar
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHART="${ROOT}/charts/teknikerp"

TENANT_ID="${1:-}"
COMPANY_NAME="${2:-}"

if [[ -z "$TENANT_ID" || -z "$COMPANY_NAME" ]]; then
  echo "Kullanim: bash k8s/new-tenant.sh <kisa-ad> \"<Firma Adi>\" [helm parametreleri]"
  echo "Ornek   : bash k8s/new-tenant.sh xyzoto \"XYZ Oto Elektrik\""
  exit 1
fi

# Kisa ad hem namespace hem alt alan adi olacak — DNS kurallarina uymali.
if ! [[ "$TENANT_ID" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$ ]]; then
  echo "HATA: kisa ad yalnizca kucuk harf, rakam ve tire icerebilir."
  echo "      Gecersiz: '$TENANT_ID'  (ornek gecerli: akgunteknik, xyz-oto)"
  exit 1
fi

shift 2 || true
EXTRA_ARGS=("$@")

NAMESPACE="tenant-${TENANT_ID}"
RELEASE="teknikerp"

for cmd in kubectl helm; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "HATA: '$cmd' bulunamadi."; exit 1; }
done

[[ -d "$CHART" ]] || { echo "HATA: chart yok: $CHART"; exit 1; }

if kubectl get namespace "$NAMESPACE" >/dev/null 2>&1; then
  echo "UYARI: '$NAMESPACE' zaten var — mevcut kurulum guncellenecek."
  echo "       Yeni musteri acmak istiyorsan baska bir kisa ad kullan."
  read -r -p "Devam edilsin mi? [e/H] " answer
  [[ "$answer" =~ ^[eE]$ ]] || { echo "Iptal edildi."; exit 1; }
fi

echo "==> Musteri : ${COMPANY_NAME}"
echo "==> Namespace: ${NAMESPACE}"
echo ""

# --create-namespace: namespace yoksa olusturur
#
# DIKKAT: burada --wait KULLANILMIYOR. Sebebi: --wait tum PVC'lerin
# "Bound" olmasini da bekler, ama k3s'in local-path surucusu
# WaitForFirstConsumer modunda calisir — diski ancak onu kullanan ilk
# pod olusunca ayirir. Yedek diskini yalnizca gecelik CronJob kullandigi
# icin o disk sabaha kadar Pending kalir ve --wait bosuna bekleyip
# zaman asimina ugrar. Onun yerine asagida yalnizca uygulamanin
# hazir olmasini bekliyoruz.
helm upgrade --install "$RELEASE" "$CHART" \
  --namespace "$NAMESPACE" \
  --create-namespace \
  --set "tenant.id=${TENANT_ID}" \
  --set-string "tenant.companyName=${COMPANY_NAME}" \
  --timeout 10m \
  "${EXTRA_ARGS[@]}"

echo ""
echo "==> Uygulamanin hazir olmasi bekleniyor..."
# Backend'in initContainer'i once semayi kurar, bu yuzden suresi daha uzun.
kubectl rollout status deployment/teknikerp-mysql -n "$NAMESPACE" --timeout=300s
kubectl rollout status deployment/teknikerp-backend -n "$NAMESPACE" --timeout=600s
kubectl rollout status deployment/teknikerp-frontend -n "$NAMESPACE" --timeout=300s

# Namespace'i etiketle — toplu guncelleme scripti bunu kullanir
kubectl label namespace "$NAMESPACE" "teknikerp.io/tenant=${TENANT_ID}" --overwrite >/dev/null

echo ""
echo "==> Pod durumu:"
kubectl get pods -n "$NAMESPACE"

ADMIN_USER="$(kubectl get deployment teknikerp-backend -n "$NAMESPACE" \
  -o jsonpath='{.spec.template.spec.containers[0].env[?(@.name=="ADMIN_USERNAME")].value}' 2>/dev/null || echo "admin")"
ADMIN_PASS="$(kubectl get secret teknikerp-secrets -n "$NAMESPACE" \
  -o jsonpath='{.data.admin-password}' | base64 -d)"
HOST="$(kubectl get ingress teknikerp-ingress -n "$NAMESPACE" \
  -o jsonpath='{.spec.rules[0].host}' 2>/dev/null || echo "-")"

echo ""
echo "======================================================================"
echo " KURULUM TAMAM — ${COMPANY_NAME}"
echo "======================================================================"
echo " Adres     : https://${HOST}"
echo " Kullanici : ${ADMIN_USER}"
echo " Sifre     : ${ADMIN_PASS}"
echo " Namespace : ${NAMESPACE}"
echo "======================================================================"
echo ""
echo " Sifreyi guvenli bir yere kaydet. Daha sonra tekrar okumak icin:"
echo "   kubectl get secret teknikerp-secrets -n ${NAMESPACE} \\"
echo "     -o jsonpath='{.data.admin-password}' | base64 -d; echo"
echo ""
