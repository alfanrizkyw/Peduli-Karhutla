# 1. Gunakan Node.js versi 22
FROM node:22-alpine

# 2. Install build tools yang benar untuk kompilasi better-sqlite3
RUN apk add --no-cache python3 make g++

# 3. Set folder kerja di dalam container
WORKDIR /app

# 4. Salin file package.json dan package-lock.json
COPY package*.json ./

# 5. Install dependensi untuk produksi
RUN npm ci --omit=dev

# 6. Salin seluruh kode proyek
COPY . .

# 7. Buat folder data untuk SQLite
RUN mkdir -p /app/data

# 8. Expose port dan jalankan aplikasi
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]