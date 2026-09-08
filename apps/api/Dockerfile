FROM node:24-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable
WORKDIR /app

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile --prod=false
RUN pnpm --filter @payroll/contracts build
RUN pnpm --filter @payroll/config build
RUN pnpm --filter @payroll/database build
RUN pnpm --filter @payroll/api build
RUN CI=true pnpm prune --prod

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 app \
  && useradd --system --uid 1001 --gid app app \
  && mkdir -p /app/apps/api/storage/payslips \
  && chown -R app:app /app/apps/api/storage

COPY --chown=app:app --from=build /app/node_modules ./node_modules
COPY --chown=app:app --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --chown=app:app --from=build /app/apps/api/dist ./apps/api/dist
COPY --chown=app:app --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --chown=app:app --from=build /app/packages/config/dist ./packages/config/dist
COPY --chown=app:app --from=build /app/packages/config/package.json ./packages/config/package.json
COPY --chown=app:app --from=build /app/packages/contracts/dist ./packages/contracts/dist
COPY --chown=app:app --from=build /app/packages/contracts/package.json ./packages/contracts/package.json
COPY --chown=app:app --from=build /app/packages/database/dist ./packages/database/dist
COPY --chown=app:app --from=build /app/packages/database/package.json ./packages/database/package.json
COPY --chown=app:app --from=build /app/packages/database/prisma ./packages/database/prisma

USER app
EXPOSE 4000
CMD ["node", "apps/api/dist/main.js"]
