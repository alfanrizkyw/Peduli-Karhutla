# Gunakan Node.js LTS versi 20
FROM node:20-alpine

# Set folder kerja di dalam container
WORKDIR /app

# Salin file package.json dan package-lock.json
COPY package*.json ./

# Install dependensi (termasuk modul native untuk SQLite jika ada)
RUN npm ci --only=production

# Salin seluruh kode proyek
COPY . .

# Buat folder data agar SQLite memiliki tempat penyimpanan
RUN mkdir -p /app/data

# Expose port yang digunakan Express (3000)
EXPOSE 3000

# Set environment variable untuk port
ENV PORT=3000

# Perintah untuk menjalankan aplikasi
CMD ["node", "server.js"]