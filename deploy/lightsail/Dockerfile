FROM node:24-bookworm-slim

LABEL org.opencontainers.image.title="Flyprint" \
      org.opencontainers.image.description="Personal flight journal" \
      org.opencontainers.image.version="development"

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    FLYPRINT_DATA_DIR=/data

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY dist/standalone/ ./
# A fresh named volume mounted here takes this directory's owner.
RUN mkdir -p /data && chown node:node /data

USER node
EXPOSE 3000

HEALTHCHECK --interval=20s --timeout=5s --start-period=10s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "server.js"]
