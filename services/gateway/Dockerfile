# Gateway de Parla (Go): única puerta pública. Binario estático sobre una imagen mínima sin shell.
FROM golang:1.25-bookworm AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/gateway ./cmd/gateway

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/gateway /gateway
ENV GATEWAY_PORT=4100
EXPOSE 4100
USER nonroot
ENTRYPOINT ["/gateway"]
