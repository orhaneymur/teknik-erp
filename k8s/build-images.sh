#!/bin/bash
# TeknikERP — Docker imajlarini derler ve Docker Hub'a gonderir.
#
# Kullanim:
#   bash k8s/build-images.sh v1.9.0
#
# Onemli: Imajlar TUM musterilerde ayni. Musteriye ozel hicbir sey
# imajin icinde degildir — firma adi ConfigMap'ten, sifreler Secret'tan gelir.
# Bu yuzden yeni musteri acarken imaj derlemeye GEREK YOKTUR.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TAG="${1:-}"
REGISTRY="${REGISTRY:-since1907}"

if [[ -z "$TAG" ]]; then
  echo "Kullanim: bash k8s/build-images.sh <surum>"
  echo "Ornek   : bash k8s/build-images.sh v1.9.0"
  exit 1
fi

command -v docker >/dev/null 2>&1 || { echo "HATA: docker bulunamadi."; exit 1; }

BACKEND="${REGISTRY}/teknikerp-backend:${TAG}"
FRONTEND="${REGISTRY}/teknikerp-frontend:${TAG}"

echo "==> Backend derleniyor: ${BACKEND}"
docker build -t "$BACKEND" ./backend

echo "==> Frontend derleniyor: ${FRONTEND}"
# VITE_API_BASE bilerek bos: tarayici /api'ye ayni origin'den gider,
# nginx kendi namespace'indeki backend'e iletir.
# VITE_APP_VERSION: arayuzde gorunen surum yazisi imaj etiketinden gelir.
docker build -t "$FRONTEND" --build-arg "VITE_APP_VERSION=${TAG}" ./frontend

echo "==> Docker Hub'a gonderiliyor..."
docker push "$BACKEND"
docker push "$FRONTEND"

echo ""
echo "Tamam. Musterilere dagitmak icin:"
echo "  bash k8s/update-all-tenants.sh ${TAG}"
