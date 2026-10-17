import Config

# En pruebas no se abre el puerto y el core es un doble en memoria.
config :parla_realtime,
  server: false,
  core: ParlaRealtime.Core.Fake,
  ring_timeout_ms: 200,
  internal_token: "token-de-prueba"

config :logger, level: :warning
