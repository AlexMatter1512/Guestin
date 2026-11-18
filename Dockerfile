# Static assets and TypeScript checks run natively, even for multi-platform images.
FROM --platform=$BUILDPLATFORM oven/bun:1.4.0 AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/host/package.json apps/host/package.json
COPY apps/guest/package.json apps/guest/package.json
RUN bun install --frozen-lockfile
COPY . .
ARG GUESTIN_BUILD_ID=""
ARG GUESTIN_VERSION="development"
ARG GUESTIN_COMMIT=""
ARG GUESTIN_BUILT_AT=""
ARG GUESTIN_IMAGE="alexmatter/guestin"
ARG GUESTIN_REPOSITORY="AlexMatter1512/guestin"
RUN GUESTIN_BUILD_ID="$GUESTIN_BUILD_ID" GUESTIN_VERSION="$GUESTIN_VERSION" GUESTIN_COMMIT="$GUESTIN_COMMIT" GUESTIN_BUILT_AT="$GUESTIN_BUILT_AT" GUESTIN_IMAGE="$GUESTIN_IMAGE" GUESTIN_REPOSITORY="$GUESTIN_REPOSITORY" bun scripts/stamp-build.ts
# CI image jobs already require the separate type-check and test job to pass.
ARG GUESTIN_TYPE_CHECK=1
RUN if [ "$GUESTIN_TYPE_CHECK" = "1" ]; then bun run check; fi && bun run build
FROM oven/bun:1.4.0 AS runtime
ARG GUESTIN_BUILD_ID=""
ARG GUESTIN_VERSION="development"
ARG GUESTIN_COMMIT=""
ARG GUESTIN_BUILT_AT=""
LABEL app.guestin.build-id="$GUESTIN_BUILD_ID" \
      org.opencontainers.image.version="$GUESTIN_VERSION" \
      org.opencontainers.image.revision="$GUESTIN_COMMIT" \
      org.opencontainers.image.created="$GUESTIN_BUILT_AT"
WORKDIR /app
COPY --from=build /app/package.json /app/bun.lock /app/LICENSE ./
COPY --from=build /app/apps/host/package.json apps/host/package.json
COPY --from=build /app/apps/guest/package.json apps/guest/package.json
RUN bun install --production --frozen-lockfile
COPY --from=build /app/server server
COPY --from=build /app/shared shared
COPY --from=build /app/scripts scripts
COPY --from=build /app/docs/licenses docs/licenses
COPY --from=build /app/apps/host/build apps/host/build
COPY --from=build /app/apps/guest/build apps/guest/build
RUN mkdir -p /app/data && chown -R bun:bun /app
USER bun
EXPOSE 3000
HEALTHCHECK --interval=30s CMD bun -e 'fetch((process.env.TLS_CERT?"https":"http")+"://localhost:3000/api/v1/health",{tls:{rejectUnauthorized:false}}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))'
CMD ["bun","server/index.ts"]
