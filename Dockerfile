# 1. Gunakan Node.js versi 22 (sesuai requirement better-sqlite3)
FROM node:22-alpine

# 2. Install build tools (Python, make, g++) yang dibutuhkan untuk kompilasi better-sqlite3
RUN apk add --no-libc-dev --no-cache python3 make g++

# 3. Set folder kerja di dalam container
WORKDIR /app

# 4. Salin file package.json dan package-lock.json
COPY package*.json ./

# 5. Install dependensi untuk produksi
RUN npm ci --omit=dev

# 6. Salin seluruh kode proyek
COPY . .

# 7. Buat folder data agar SQLite memiliki tempat penyimpanan
RUN mkdir -p /app/data

# 8. Expose port 3000
EXPOSE 3000

ENV PORT=3000

# 9. Jalankan aplikasi
CMD ["node", "server.js"]