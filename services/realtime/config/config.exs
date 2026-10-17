import Config

# Servicio de tiempo real de Parla. Los valores reales se leen del entorno en config/runtime.exs.
config :parla_realtime,
  server: true,
  core: ParlaRealtime.Core.Http,
  ring_timeout_ms: 45_000,
  context_ttl_ms: 30_000

config :logger, :default_formatter, format: "$time [$level] $message\n"

import_config "#{config_env()}.exs"
