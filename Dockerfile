FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY . .
# /data is the persistent volume (database, uploads, backups). A fresh named volume takes
# its ownership from the image, so creating it here lets the non-root user write to it.
RUN mkdir -p /data && chown node:node /data
USER node
ENV ELEV8_DATA_DIR=/data PORT=5460
EXPOSE 5460
CMD ["node", "server/index.js"]
