# syntax=docker/dockerfile:1

# ── Vite production build ──────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .

# Boş bırakılırsa tarayıcı aynı origin'den /api'ye gider (nginx proxy)
ARG VITE_API_BASE=
ENV VITE_API_BASE=$VITE_API_BASE

# Arayuzde gorunen surum yazisi. build-images.sh imaj etiketini buraya gecer,
# boylece ekrandaki surum ile calisan imaj hicbir zaman ayrisamaz.
ARG VITE_APP_VERSION=dev
ENV VITE_APP_VERSION=$VITE_APP_VERSION

RUN npm run build

# ── Nginx ile statik dosya sunumu ───────────────────────────────────────────
FROM nginx:1.27-alpine AS runner

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
