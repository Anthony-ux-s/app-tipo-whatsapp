defmodule ParlaRealtime.Application do
  @moduledoc """
  Árbol de supervisión del tiempo real:

    * `Connections`  — qué conexiones (de qué enlace del gateway) tiene cada persona.
    * `CallRegistry` — llamadas en curso; una persona y una conversación solo pueden estar en una.
    * `CallSupervisor` — un proceso por llamada: si una falla, las demás siguen.
    * `ContextCache` — participantes de cada conversación (pedidos al core, con caducidad).
    * `Tasks` — trabajo asíncrono hacia el core, para no bloquear el enlace multiplexado.
  """
  use Application
  require Logger

  @impl true
  def start(_type, _args) do
    children =
      [
        {Registry, keys: :duplicate, name: ParlaRealtime.Connections},
        {Registry, keys: :unique, name: ParlaRealtime.CallRegistry},
        {DynamicSupervisor, name: ParlaRealtime.CallSupervisor, strategy: :one_for_one},
        {Task.Supervisor, name: ParlaRealtime.Tasks},
        ParlaRealtime.ContextCache
      ] ++ server()

    Supervisor.start_link(children, strategy: :one_for_one, name: ParlaRealtime.Supervisor)
  end

  defp server do
    if Application.get_env(:parla_realtime, :server, true) do
      port = Application.get_env(:parla_realtime, :port, 4102)
      Logger.info("Realtime de Parla escuchando en http://localhost:#{port}")
      [{Bandit, plug: ParlaRealtime.Router, port: port, ip: :any}]
    else
      []
    end
  end
end
