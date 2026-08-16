#!/bin/bash
# TeknikERP — bir musterinin yonetici (admin) sifresini degistirir.
#
# Kullanim:
#   bash k8s/set-admin-password.sh tenant-demo
#
# Sifre ekranda GORUNMEZ ve komut satirina yazilmaz; bu yuzden kabuk
# gecmisine (~/.bash_history) dusmez.
#
# Neden "helm upgrade --set auth.adminPassword=..." kullanmiyoruz:
# o yontemde sifre Helm'in kendi kayitlarina islenir ve
# "helm get values" calistirabilen herkes tarafindan gorulebilir.
# Burada yalnizca Kubernetes Secret guncellenir.
#
# Chart mevcut Secret'i okudugu icin (secret.yaml icindeki lookup),
# bu degisiklik sonraki helm upgrade islemlerinde de korunur.
set -euo pipefail

NAMESPACE="${1:-}"
SECRET="teknikerp-secrets"

if [[ -z "$NAMESPACE" ]]; then
  echo "Kullanim: bash k8s/set-admin-password.sh <namespace>"
  echo "Ornek   : bash k8s/set-admin-password.sh tenant-demo"
  echo ""
  echo "Mevcut musteriler:"
  kubectl get namespaces -l teknikerp.io/tenant -o name 2>/dev/null | sed 's|namespace/|  |' || true
  exit 1
fi

command -v kubectl >/dev/null 2>&1 || { echo "HATA: kubectl bulunamadi."; exit 1; }

if ! kubectl get secret "$SECRET" -n "$NAMESPACE" >/dev/null 2>&1; then
  echo "HATA: '$NAMESPACE' icinde '$SECRET' bulunamadi."
  exit 1
fi

ADMIN_USER="$(kubectl get deployment teknikerp-backend -n "$NAMESPACE" \
  -o jsonpath='{.spec.template.spec.containers[0].env[?(@.name=="ADMIN_USERNAME")].value}' 2>/dev/null || echo "admin")"

echo "==> Musteri      : ${NAMESPACE}"
echo "==> Kullanici adi: ${ADMIN_USER}"
echo ""

# -s: yazilanlar ekranda gorunmez
read -r -s -p "Yeni sifre        : " PASS1; echo
read -r -s -p "Yeni sifre (tekrar): " PASS2; echo

if [[ "$PASS1" != "$PASS2" ]]; then
  echo "HATA: sifreler ayni degil."
  exit 1
fi

if [[ ${#PASS1} -lt 8 ]]; then
  echo "HATA: sifre en az 8 karakter olmali."
  exit 1
fi

# Secret icindeki degerler base64 kodludur. -n onemli: sondaki satir
# sonu sifrenin parcasi sayilmasin.
ENCODED="$(printf '%s' "$PASS1" | base64 | tr -d '\n')"

kubectl patch secret "$SECRET" -n "$NAMESPACE" \
  -p "{\"data\":{\"admin-password\":\"${ENCODED}\"}}" >/dev/null

echo ""
echo "==> Secret guncellendi. Backend yeniden baslatiliyor..."
# Sifre acilista okundugu icin yeniden baslatma sart.
kubectl rollout restart deployment/teknikerp-backend -n "$NAMESPACE" >/dev/null
kubectl rollout status deployment/teknikerp-backend -n "$NAMESPACE" --timeout=300s

echo ""
echo "Tamam. Yeni sifreyle giris yapabilirsin: ${ADMIN_USER}"
