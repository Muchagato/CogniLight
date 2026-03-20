FROM python:3.11-slim AS docs
WORKDIR /docs
COPY docs/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY docs/ .
RUN mkdocs build

FROM node:22-alpine AS build
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npx ng build --configuration production

FROM nginx:alpine
COPY --from=build /app/dist/frontend/browser /usr/share/nginx/html
COPY --from=docs /docs/site /usr/share/nginx/html/docs
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 4200
