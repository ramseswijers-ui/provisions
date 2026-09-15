FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./
COPY public ./public

# Data is stored here; mount a volume on this path to persist it.
ENV DATA_DIR=/app/data
RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "server.js"]
