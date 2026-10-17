import Config

if config_env() != :test do
  token = System.get_env("INTERNAL_TOKEN") || "parla-dev-internal-token"

  if config_env() == :prod and (token == "parla-dev-internal-token" or String.length(token) < 24) do
    raise "En producción INTERNAL_TOKEN debe ser un secreto propio de al menos 24 caracteres"
  end

  config :parla_realtime,
    port: String.to_integer(System.get_env("REALTIME_PORT") || "4102"),
    core_url: System.get_env("CORE_URL") || "http://localhost:4101",
    internal_token: token
end
