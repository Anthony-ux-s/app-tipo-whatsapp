defmodule ParlaRealtime.Core.Fake do
  @moduledoc """
  Core en memoria para las pruebas: las conversaciones se cargan con `put_conversation/1` y cada
  llamada al core queda registrada en `calls/0`.
  """
  @behaviour ParlaRealtime.Core
  use Agent

  def start_link(_ \\ []) do
    Agent.start_link(fn -> %{conversations: %{}, calls: []} end, name: __MODULE__)
  end

  def reset, do: Agent.update(__MODULE__, fn _ -> %{conversations: %{}, calls: []} end)

  def put_conversation(%{"conversationId" => id} = context),
    do: Agent.update(__MODULE__, &put_in(&1, [:conversations, id], context))

  def calls, do: Agent.get(__MODULE__, &Enum.reverse(&1.calls))

  defp record(entry), do: Agent.update(__MODULE__, &Map.update!(&1, :calls, fn calls -> [entry | calls] end))

  @impl true
  def context(conversation_id, user_id) do
    record({:context, conversation_id, user_id})

    case Agent.get(__MODULE__, &get_in(&1, [:conversations, conversation_id])) do
      nil ->
        {:error, :not_found}

      context ->
        if Enum.any?(context["participants"], &(&1["id"] == user_id)),
          do: {:ok, context},
          else: {:error, :not_found}
    end
  end

  @impl true
  def presence(user_id, presence, at), do: record({:presence, user_id, presence, at})

  @impl true
  def call_log(payload), do: record({:call_log, payload})

  @impl true
  def call_notify(payload), do: record({:call_notify, payload})
end
