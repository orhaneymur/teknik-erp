#!/bin/bash
# TeknikERP — bir musteriye DEMO TEST VERISI yukler.
#
# 10 musteri, 500 telefon aksesuar urunu, stok, 90 gune yayilmis satis
# faturalari, cari tahsilatlar ve giderler olusturur. Raporlarin bos
# gorunmemesi ve gercekci test yapilabilmesi icin.
#
# Kullanim:
#   bash k8s/seed-demo.sh              # varsayilan: tenant-demo
#   bash k8s/seed-demo.sh tenant-test  # baska bir namespace
#
# GUVENLIK: script yalnizca BOS bir veritabaninda calisir. Hedefte zaten
# urun varsa hicbir sey yapmadan cikar. Bu, yanlislikla gercek bir
# musteride calistirilmasina karsi korumadir.
set -euo pipefail

NAMESPACE="${1:-tenant-demo}"

command -v kubectl >/dev/null 2>&1 || { echo "HATA: kubectl bulunamadi."; exit 1; }

if ! kubectl get namespace "$NAMESPACE" >/dev/null 2>&1; then
  echo "HATA: '$NAMESPACE' namespace'i yok."
  exit 1
fi

echo "==> Hedef namespace: ${NAMESPACE}"
echo "==> Backend pod'unun hazir olmasi bekleniyor..."
kubectl rollout status deployment/teknikerp-backend -n "$NAMESPACE" --timeout=300s

echo "==> Demo verisi yukleniyor (birkac dakika surebilir)..."
kubectl exec -n "$NAMESPACE" deployment/teknikerp-backend -c backend -- \
  node prisma/seed-demo.js

echo ""
echo "Tamam. Tarayicidan girip kontrol edebilirsin."
