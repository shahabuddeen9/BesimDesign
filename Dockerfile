# ==============================================================================
# BESIM DESIGN — PRODUCTION DOCKERFILE
# Multi-stage optimized Node.js 20 container for Render, Railway, or VPS deployment
# ==============================================================================

FROM node:20-alpine AS base

WORKDIR /app

# Install dependencies required for system libraries
RUN apk add --no-cache libc6-compat

# Copy package descriptors
COPY package*.json ./

# Install all dependencies
RUN npm ci

# Copy full application codebase
COPY . .

# Run production build and verify tests
RUN npm run build
RUN npm test

# Set production environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose HTTP port
EXPOSE 3000

# Declare persistent mount volumes for SQLite database file and uploaded images
VOLUME ["/app/server/db", "/app/uploads"]

# Run seed on startup (if unseeded) and launch Express production server
CMD ["npm", "start"]
