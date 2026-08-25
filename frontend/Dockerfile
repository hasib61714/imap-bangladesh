# ── IMAP Frontend (Vite build → nginx static) ─────────────
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Serve from the domain root inside the container (override the gh-pages base path).
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build -- --base=/

FROM nginx:alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
