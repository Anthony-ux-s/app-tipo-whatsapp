defmodule ParlaRealtime.GatewayLink do
  @moduledoc """
  Enlace WebSocket con una instancia del gateway Go. Por él viajan, multiplexadas, todas las
  conexiones de navegador de esa instancia (ver docs/architecture/realtime-protocol.md).
  """
  @behaviour WebSock
  require Logger
  alias ParlaRealtime.{Calls, Core, Delivery, Events}

  @impl true
  def init(_), do: {:ok, %{conns: %{}}}

  @impl true
  def handle_in({text, [opcode: :text]}, state) do
    case Jason.decode(text) do
      {:ok, frame} -> {:ok, handle_frame(frame, state)}
      {:error, _} -> {:ok, state}
    end
  end

  def handle_in(_other, state), do: {:ok, state}

  @impl true
  def handle_info({:deliver, conns, event, data}, state),
    do: push(%{op: "deliver", conns: conns, t: event, d: data}, state)

  def handle_info({:ack, conn, ref, data}, state),
    do: push(%{op: "ack", conn: conn, ref: ref, d: data}, state)

  def handle_info(_message, state), do: {:ok, state}

  @impl true
  def terminate(reason, state) do
    Logger.info("Enlace del gateway cerrado (#{inspect(reason)}); cerrando #{map_size(state.conns)} conexiones")
    Enum.each(state.conns, fn {conn, user} -> close_conn(conn, user) end)
    :ok
  end

  # ── Marcos del gateway ──────────────────────────────────────────────────────

  defp handle_frame(%{"op" => "open", "conn" => conn, "user" => user}, state)
       when is_binary(conn) and is_binary(user) do
    if Delivery.open(user, conn), do: presence(user, "online")
    put_in(state, [:conns, conn], user)
  end

  defp handle_frame(%{"op" => "close", "conn" => conn}, state) do
    case Map.pop(state.conns, conn) do
      {nil, _} -> state
      {user, conns} ->
        close_conn(conn, user)
        %{state | conns: conns}
    end
  end

  defp handle_frame(%{"op" => "event", "conn" => conn, "t" => event} = frame, state) do
    # La persona es la que el enlace registró al abrir la conexión: nunca se confía en el marco.
    case Map.get(state.conns, conn) do
      nil ->
        state

      user ->
        endpoint = {self(), conn}
        ref = frame["ref"]

        case Events.handle(user, endpoint, event, frame["d"] || %{}) do
          {:async, fun} -> run_async(fun, conn, ref)
          :noreply -> :ok
        end

        state
    end
  end

  defp handle_frame(_frame, state), do: state

  defp run_async(fun, conn, ref) do
    link = self()

    Task.Supervisor.start_child(ParlaRealtime.Tasks, fn ->
      case fun.() do
        {:reply, data} when not is_nil(ref) -> send(link, {:ack, conn, ref, data})
        _ -> :ok
      end
    end)
  end

  defp close_conn(conn, user) do
    if Delivery.close(user, conn), do: presence(user, "offline")
    Calls.endpoint_closed(user, {self(), conn})
  end

  defp presence(user, status) do
    at = DateTime.utc_now() |> DateTime.to_iso8601()
    Core.async(fn -> Core.presence(user, status, at) end)
  end

  defp push(frame, state), do: {:push, {:text, Jason.encode!(frame)}, state}
end
