FROM node:16.0-alpine
WORKDIR /app
COPY . /app
RUN npm install
EXPOSE 3080
CMD ["node", "server.js"]