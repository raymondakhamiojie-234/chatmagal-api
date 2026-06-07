# Use the official Node.js image with Alpine Linux
FROM node:20-alpine

# Install openssl and libc compatibility libraries needed by Prisma Query Engine
RUN apk add --no-cache openssl libc6-compat

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy database schema and generate Prisma client
COPY prisma ./prisma
RUN npx prisma generate

# Copy the rest of the application files
COPY . .

# Build the TypeScript project
RUN npm run build

# Expose the port the app runs on
EXPOSE 3000

# Start the application
CMD ["npm", "run", "dev"]
