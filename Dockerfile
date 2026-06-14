# Build the Vite app and serve the production build with `vite preview`.
# `allowedHosts` is enabled in vite.config, so it can sit behind any subdomain.
FROM node:25-bookworm-slim
WORKDIR /app

# Install dependencies first for better layer caching.
COPY package.json ./
RUN npm install

# App source (node_modules/dist are excluded via .dockerignore).
COPY . .

# Vite inlines import.meta.env.VITE_* at build time, so the Schoolynq API URL
# must be a BUILD argument (a runtime env var would have no effect). Set it in
# Dokploy's "Build Args", e.g. VITE_SCHOOLYNQ_API_URL=https://api.alterlabs.live
ARG VITE_SCHOOLYNQ_API_URL
ENV VITE_SCHOOLYNQ_API_URL=$VITE_SCHOOLYNQ_API_URL
RUN npm run build

ENV NODE_ENV=production
ENV PORT=4173
EXPOSE 4173
# `vite preview` serves the build; --host 0.0.0.0 binds in-container.
CMD ["sh", "-c", "npm run preview -- --host 0.0.0.0 --port ${PORT:-4173}"]
