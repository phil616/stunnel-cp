FROM node:24-alpine AS frontend
WORKDIR /src/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM golang:1.26.10-alpine AS backend
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=frontend /src/web/dist ./web/dist
RUN mkdir -p /out/data && chmod 700 /out/data
RUN CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /out/stunnel-cp ./cmd/stunnel-cp

FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /app
COPY --from=backend /out/stunnel-cp /app/stunnel-cp
COPY --from=backend --chown=65532:65532 /out/data /data
ENV STCP_ADDR=0.0.0.0:8080 STCP_DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 8080
USER 65532:65532
ENTRYPOINT ["/app/stunnel-cp"]
CMD ["serve"]
