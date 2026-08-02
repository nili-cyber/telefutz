FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npx prisma generate
EXPOSE 4002
CMD sh -c "npx prisma db push && npm run seed && npm run dev"
