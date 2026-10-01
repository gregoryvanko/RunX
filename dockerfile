FROM node:22

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

USER node

EXPOSE 9999

CMD ["node", "index.js"]