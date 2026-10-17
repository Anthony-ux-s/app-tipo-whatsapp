defmodule ParlaRealtime.Calls do
  @moduledoc "Puerta de entrada a las llamadas: localiza (o crea) el proceso de cada llamada."
  alias ParlaRealtime.{CallServer, ContextCache, Delivery}

  @registry ParlaRealtime.CallRegistry

  @type result :: {:ok, map()} | {:error, String.t()}

  @doc "Llamar. Si en ese chat ya hay una llamada en curso, se une a ella."
  @spec start(String.t(), Delivery.endpoint(), map()) :: result
  def start(user, endpoint, %{"conversationId" => conversation_id, "kind" => kind})
      when kind in ["audio", "video"] and is_binary(conversation_id) do
    with {:ok, context} <- context(conversation_id, user) do
      case lookup({:conversation, conversation_id}) do
        pid when is_pid(pid) ->
          join_pid(pid, user, endpoint)

        nil ->
          cond do
            lookup({:user, user}) -> {:error, "Ya estás en otra llamada"}
            ContextCache.participant_ids(context) -- [user] == [] -> {:error, "No hay nadie más en este chat para llamar"}
            true -> spawn_call(context, kind, user, endpoint)
          end
      end
    end
  end

  def start(_user, _endpoint, _payload), do: {:error, "Tipo de llamada no válido"}

  @spec join(String.t(), Delivery.endpoint(), String.t()) :: result
  def join(user, endpoint, call_id) do
    case lookup({:call, call_id}) do
      nil -> {:error, "La llamada ya terminó"}
      pid -> join_pid(pid, user, endpoint)
    end
  end

  def decline(user, call_id), do: cast({:call, call_id}, {:decline, user})
  def leave(user, call_id), do: cast({:call, call_id}, {:leave, user})
  def relay(user, call_id, to, data), do: cast({:call, call_id}, {:relay, user, to, data})

  @doc "Se cerró una conexión: si la persona estaba en una llamada con ella, sale."
  def endpoint_closed(user, endpoint), do: cast({:user, user}, {:endpoint_closed, user, endpoint})

  @doc "Llamada en la que está una persona (para diagnóstico y pruebas)."
  def active_call(user) do
    case lookup({:user, user}) do
      nil -> nil
      pid -> GenServer.call(pid, :info).callId
    end
  end

  defp spawn_call(context, kind, user, endpoint) do
    args = %{context: context, kind: kind, starter: user, endpoint: endpoint}

    case DynamicSupervisor.start_child(ParlaRealtime.CallSupervisor, {CallServer, args}) do
      {:ok, pid} -> {:ok, GenServer.call(pid, :info)}
      {:error, {:shutdown, {:conversation_busy, pid}}} -> join_pid(pid, user, endpoint)
      {:error, {:shutdown, :busy}} -> {:error, "Ya estás en otra llamada"}
      {:error, _} -> {:error, "No se pudo iniciar la llamada"}
    end
  end

  defp join_pid(pid, user, endpoint) do
    GenServer.call(pid, {:join, user, endpoint})
  catch
    :exit, _ -> {:error, "La llamada ya terminó"}
  end

  defp context(conversation_id, user) do
    case ContextCache.fetch(conversation_id, user) do
      {:ok, context} -> {:ok, context}
      {:error, :not_found} -> {:error, "Conversación no encontrada"}
      {:error, _} -> {:error, "No se pudo conectar la llamada. Inténtalo de nuevo."}
    end
  end

  defp lookup(key) do
    case Registry.lookup(@registry, key) do
      [{pid, _}] -> pid
      [] -> nil
    end
  end

  defp cast(key, message) do
    if pid = lookup(key), do: GenServer.cast(pid, message)
    :ok
  end
end
