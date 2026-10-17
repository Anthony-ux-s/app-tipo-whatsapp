defmodule ParlaRealtime.ContextCache do
  @moduledoc """
  Participantes de cada conversación, pedidos al core y guardados en ETS por un tiempo corto.
  Sirve para autorizar "escribiendo" sin preguntarle al core en cada tecla.
  Si alguien no aparece en la copia guardada (p. ej. lo acaban de agregar), se vuelve a preguntar.
  """
  use GenServer
  alias ParlaRealtime.Core

  @table __MODULE__

  def start_link(_), do: GenServer.start_link(__MODULE__, nil, name: __MODULE__)

  @impl true
  def init(nil) do
    :ets.new(@table, [:named_table, :public, :set, read_concurrency: true])
    {:ok, nil}
  end

  @doc "Contexto de la conversación si la persona participa; {:error, :not_found} si no."
  def fetch(conversation_id, user_id) do
    now = System.monotonic_time(:millisecond)

    case :ets.lookup(@table, conversation_id) do
      [{_, context, expires}] when expires > now ->
        if participant?(context, user_id), do: {:ok, context}, else: refresh(conversation_id, user_id, now)

      _ ->
        refresh(conversation_id, user_id, now)
    end
  end

  def participant?(context, user_id), do: Enum.any?(context["participants"] || [], &(&1["id"] == user_id))

  def participant_ids(context), do: Enum.map(context["participants"] || [], & &1["id"])

  def clear, do: :ets.delete_all_objects(@table)

  defp refresh(conversation_id, user_id, now) do
    case Core.context(conversation_id, user_id) do
      {:ok, context} ->
        ttl = Application.get_env(:parla_realtime, :context_ttl_ms, 30_000)
        :ets.insert(@table, {conversation_id, context, now + ttl})
        {:ok, context}

      error ->
        error
    end
  end
end
