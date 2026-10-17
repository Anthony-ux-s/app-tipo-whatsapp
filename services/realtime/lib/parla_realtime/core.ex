defmodule ParlaRealtime.Core do
  @moduledoc """
  Puerto hacia el core (NestJS): todo lo que es de dominio se le pregunta a él.
  El adaptador se elige en la configuración (`:core`): HTTP en ejecución, doble en memoria en pruebas.
  """

  @type context :: %{
          required(String.t()) => term()
        }

  @callback context(conversation_id :: String.t(), user_id :: String.t()) ::
              {:ok, context()} | {:error, :not_found | :unavailable}
  @callback presence(user_id :: String.t(), presence :: String.t(), at :: String.t()) :: :ok
  @callback call_log(map()) :: :ok
  @callback call_notify(map()) :: :ok

  defp impl, do: Application.get_env(:parla_realtime, :core, ParlaRealtime.Core.Http)

  def context(conversation_id, user_id), do: impl().context(conversation_id, user_id)
  def presence(user_id, presence, at), do: impl().presence(user_id, presence, at)
  def call_log(payload), do: impl().call_log(payload)
  def call_notify(payload), do: impl().call_notify(payload)

  @doc "Ejecuta una llamada al core sin bloquear al proceso que la pide."
  def async(fun) do
    Task.Supervisor.start_child(ParlaRealtime.Tasks, fun)
    :ok
  end
end
