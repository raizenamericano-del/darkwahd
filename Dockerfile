# ============================================================
# KyyPureStatus — Docker image (untuk Railway / platform lain)
# ============================================================
FROM node:20-bookworm-slim

# ffmpeg sistem sebagai cadangan (ffmpeg-static juga di-install via npm)
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependency (workspaces: root + client)
COPY package.json package-lock.json* ./
COPY client/package.json client/package.json
RUN npm install

# Salin source & build frontend
COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]
