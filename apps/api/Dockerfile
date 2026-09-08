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
RUN pnpm install --no-frozen-lockfile --prod=false
RUN pnpm --filter @payroll/contracts build
RUN pnpm --filter @payroll/config build
RUN pnpm --filter @payroll/database build
RUN pnpm --filter @payroll/api build

FROM base AS runtime

ENV NODE_ENV=production
WORKDIR /app
RUN groupadd --system --gid 1001 app \
  && useradd --system --uid 1001 --gid app -m -d /home/app app \
  && mkdir -p /app/apps/api/storage/payslips

COPY --chown=app:app --from=build /app ./
RUN chown -R app:app /app

USER app
EXPOSE 4000
CMD ["node", "apps/api/scripts/start-production.mjs"]
