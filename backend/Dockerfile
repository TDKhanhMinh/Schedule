FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --include=optional

FROM dependencies AS build
COPY backend backend
COPY frontend frontend
COPY tsconfig.base.json .
RUN npm run build:backend

FROM dependencies AS production-dependencies
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS api
WORKDIR /app
ENV NODE_ENV=production
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/database ./backend/database
COPY --from=build /app/package.json package.json
USER node
EXPOSE 3000
CMD ["node", "backend/dist/main.js"]

FROM node:22-bookworm-slim AS worker
WORKDIR /app
ENV NODE_ENV=production
ENV SOLVER_ROOT=/app/backend/solver
ENV SOLVER_PYTHON=/usr/local/bin/python
RUN apt-get update \
  && apt-get install --no-install-recommends -y python3 python3-pip \
  && rm -rf /var/lib/apt/lists/* \
  && ln -s /usr/bin/python3 /usr/local/bin/python
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/solver ./backend/solver
COPY --from=build /app/backend/contracts ./backend/contracts
RUN python -m pip install --no-cache-dir --break-system-packages ./backend/solver \
  && python -c "import ortools, pydantic; print('solver dependencies ready: pydantic=' + pydantic.__version__ + ', ortools=' + ortools.__version__)"
COPY --from=build /app/package.json package.json
USER node
CMD ["node", "backend/dist/worker/main.js"]
