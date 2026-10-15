FROM node:22-alpine

# Install build dependencies
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev

COPY . .

# Buat folder data dan berikan izin penuh (read/write/execute)
RUN mkdir -p /app/data && chmod -R 777 /app/data

EXPOSE 3000
ENV PORT=3000

CMD ["node", "server.js"]