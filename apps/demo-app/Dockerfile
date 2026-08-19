FROM node:24-alpine AS build

WORKDIR /workspace

COPY package.json package-lock.json ./
COPY apps/demo-app/package.json apps/demo-app/package.json

RUN npm ci --workspace=demo-app --include-workspace-root=false

COPY apps/demo-app/tsconfig.json apps/demo-app/tsconfig.json
COPY apps/demo-app/src apps/demo-app/src

RUN npm run build -w apps/demo-app

FROM node:24-alpine AS runtime

WORKDIR /workspace
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY apps/demo-app/package.json apps/demo-app/package.json

RUN npm ci --omit=dev --workspace=demo-app --include-workspace-root=false

COPY --from=build /workspace/apps/demo-app/dist apps/demo-app/dist

WORKDIR /workspace/apps/demo-app

EXPOSE 4100

CMD ["node", "dist/index.js"]
