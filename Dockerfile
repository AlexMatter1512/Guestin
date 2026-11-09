FROM oven/bun:1.4.0 AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/host/package.json apps/host/package.json
COPY apps/guest/package.json apps/guest/package.json
RUN bun install --frozen-lockfile
COPY . .
RUN bun run check && bun run build
FROM oven/bun:1.4.0 AS runtime
WORKDIR /app
COPY --from=build /app/package.json /app/bun.lock ./
COPY --from=build /app/apps/host/package.json apps/host/package.json
COPY --from=build /app/apps/guest/package.json apps/guest/package.json
RUN bun install --production --frozen-lockfile
COPY --from=build /app/server server
COPY --from=build /app/shared shared
COPY --from=build /app/scripts scripts
COPY --from=build /app/docs/PROVENANCE.md docs/PROVENANCE.md
COPY --from=build /app/docs/licenses docs/licenses
COPY --from=build /app/apps/host/build apps/host/build
COPY --from=build /app/apps/guest/build apps/guest/build
RUN mkdir -p /app/data && chown -R bun:bun /app
USER bun
EXPOSE 3000
HEALTHCHECK --interval=30s CMD bun -e 'fetch((process.env.TLS_CERT?"https":"http")+"://localhost:3000/api/v1/health",{tls:{rejectUnauthorized:false}}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))'
CMD ["bun","server/index.ts"]
