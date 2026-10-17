# Simuladores de los sistemas externos (MercaYa, Rapidito, PagaYa) para demos y pruebas.
# En producción se reemplazan por las APIs reales de cada proveedor.
FROM golang:1.25-bookworm AS build
WORKDIR /src
COPY go.mod ./
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/providers ./cmd/providers

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/providers /providers
ENV PROVIDERS_PORT=4103
EXPOSE 4103
USER nonroot
ENTRYPOINT ["/providers"]
