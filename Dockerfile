FROM node:22-alpine

# Build tools untuk better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Database disimpan di volume permanen Deplexo (/data). Jangan simpan data di dalam /app.
ENV PORT=3000 DATA_DIR=/data
EXPOSE 3000

CMD ["node", "server.js"]
