defmodule ParlaRealtime.Core.Http do
  @moduledoc "Adaptador HTTP del core: `/api/internal/*` con el token interno."
  @behaviour ParlaRealtime.Core
  require Logger

  defp client do
    Req.new(
      base_url: Application.fetch_env!(:parla_realtime, :core_url),
      headers: [{"x-internal-token", Application.fetch_env!(:parla_realtime, :internal_token)}],
      receive_timeout: 5_000,
      retry: false
    )
  end

  @impl true
  def context(conversation_id, user_id) do
    case Req.get(client(), url: "/api/internal/conversations/#{URI.encode(conversation_id)}/context", params: [userId: user_id]) do
      {:ok, %{status: 200, body: body}} -> {:ok, body}
      {:ok, %{status: 404}} -> {:error, :not_found}
      other -> unavailable("contexto", other)
    end
  end

  @impl true
  def presence(user_id, presence, at),
    do: post("/api/internal/presence", %{userId: user_id, presence: presence, at: at})

  @impl true
  def call_log(payload), do: post("/api/internal/calls/log", payload)

  @impl true
  def call_notify(payload), do: post("/api/internal/calls/notify", payload)

  defp post(path, body) do
    case Req.post(client(), url: path, json: body) do
      {:ok, %{status: status}} when status in 200..299 -> :ok
      other ->
        unavailable(path, other)
        :ok
    end
  end

  defp unavailable(what, result) do
    Logger.warning("Core no disponible (#{what}): #{inspect(result, limit: 5)}")
    {:error, :unavailable}
  end
end
