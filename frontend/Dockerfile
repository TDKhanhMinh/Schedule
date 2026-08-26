FROM node:22-bookworm-slim AS build
WORKDIR /app
ARG VITE_TENANT_ID
ENV VITE_TENANT_ID=$VITE_TENANT_ID
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci
COPY backend backend
COPY frontend frontend
COPY tsconfig.base.json .
RUN npm run build:frontend

FROM nginx:1.27-alpine
COPY --from=build /app/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
