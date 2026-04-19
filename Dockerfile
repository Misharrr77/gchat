FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY server ./server
# БД и uploads: примонтируйте том на /data в Railway и задайте DATA_DIR=/data
ENV DATA_DIR=/data
RUN mkdir -p /data
EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "server/index.js"]
