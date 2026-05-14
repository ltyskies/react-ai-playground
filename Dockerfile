# Stage 1: Build everything
FROM node:22-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.17.1 --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/backend/package.json apps/backend/
COPY apps/frontend/package.json apps/frontend/

RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# Stage 2: Backend production
FROM node:22-alpine AS backend
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.17.1 --activate

COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
COPY --from=builder /app/apps/backend/package.json apps/backend/
COPY --from=builder /app/apps/frontend/package.json apps/frontend/

RUN pnpm install --frozen-lockfile --no-dev

COPY --from=builder /app/apps/backend/dist apps/backend/dist

CMD ["node", "apps/backend/dist/main.js"]

# Stage 3: Frontend + Nginx
FROM nginx:alpine AS frontend
COPY --from=builder /app/apps/frontend/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
