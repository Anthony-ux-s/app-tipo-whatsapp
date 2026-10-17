defmodule ParlaRealtime.CallServer do
  @moduledoc """
  Un proceso por llamada en curso (voz o video, 1:1 o grupal en malla).

  El proceso se registra en `ParlaRealtime.CallRegistry` con claves únicas:
    * `{:call, id}` — para encontrar la llamada,
    * `{:conversation, id}` — una sola llamada por conversación,
    * `{:user, id}` — por cada persona conectada: nadie puede estar en dos llamadas a la vez.
  Al terminar, el proceso se detiene y el registro se limpia solo.

  El servidor solo coordina y reenvía la señalización WebRTC; el audio y el video van P2P.
  """
  use GenServer, restart: :temporary
  alias ParlaRealtime.{CallText, Core, Delivery}

  @registry ParlaRealtime.CallRegistry
  @max_sdp 100_000

  # ── Arranque ────────────────────────────────────────────────────────────────

  def start_link(args), do: GenServer.start_link(__MODULE__, args)

  @impl true
  def init(%{context: context, kind: kind, starter: starter, endpoint: endpoint}) do
    id = Base.encode16(:crypto.strong_rand_bytes(12), case: :lower)
    conversation_id = context["conversationId"]

    with {:ok, _} <- register({:conversation, conversation_id}),
         {:ok, _} <- register({:user, starter}),
         {:ok, _} <- register({:call, id}) do
      participants = Enum.map(context["participants"], & &1["id"])
      others = participants -- [starter]
      timeout = Application.get_env(:parla_realtime, :ring_timeout_ms, 45_000)

      state = %{
        id: id,
        conversation_id: conversation_id,
        participants: participants,
        kind: kind,
        started_by: starter,
        answered_at: nil,
        max: context["maxCallParticipants"] || 4,
        joined: %{starter => endpoint},
        ringing: MapSet.new(others),
        ring_ref: Process.send_after(self(), :ring_timeout, timeout)
      }

      Delivery.to_users(others, "call:incoming", %{call: info(state)})

      Core.async(fn ->
        Core.call_notify(%{
          conversationId: conversation_id,
          callerId: starter,
          callId: id,
          kind: kind,
          recipients: others
        })
      end)

      {:ok, state}
    else
      {:error, {:already_registered, pid}} ->
        if pid_for({:conversation, conversation_id}) == pid,
          do: {:stop, {:shutdown, {:conversation_busy, pid}}},
          else: {:stop, {:shutdown, :busy}}
    end
  end

  defp register(key), do: Registry.register(@registry, key, nil)

  defp pid_for(key) do
    case Registry.lookup(@registry, key) do
      [{pid, _}] -> pid
      [] -> nil
    end
  end

  # ── Acciones ────────────────────────────────────────────────────────────────

  @impl true
  def handle_call(:info, _from, state), do: {:reply, info(state), state}

  def handle_call({:join, user, endpoint}, _from, state) do
    cond do
      user not in state.participants ->
        {:reply, {:error, "Llamada no encontrada"}, state}

      Map.has_key?(state.joined, user) ->
        {:reply, {:error, "Ya estás en esta llamada desde otro dispositivo"}, state}

      map_size(state.joined) >= state.max ->
        {:reply, {:error, "La llamada ya tiene #{state.max} personas, el máximo de tu plan"}, state}

      true ->
        case register({:user, user}) do
          {:ok, _} ->
            existing = state.joined
            Delivery.to_endpoints(Map.values(existing), "call:participant-joined", %{callId: state.id, userId: user})
            Delivery.to_users([user], "call:answered-elsewhere", %{callId: state.id})

            state =
              state
              |> Map.update!(:joined, &Map.put(&1, user, endpoint))
              |> Map.update!(:ringing, &MapSet.delete(&1, user))
              |> answered()

            {:reply, {:ok, info(state, Map.keys(existing))}, state}

          {:error, _} ->
            {:reply, {:error, "Ya estás en otra llamada"}, state}
        end
    end
  end

  @impl true
  def handle_cast({:decline, user}, state) do
    if MapSet.member?(state.ringing, user) do
      state = Map.update!(state, :ringing, &MapSet.delete(&1, user))
      Delivery.to_endpoints(Map.values(state.joined), "call:declined", %{callId: state.id, userId: user})
      Delivery.to_users([user], "call:answered-elsewhere", %{callId: state.id})

      if is_nil(state.answered_at) and MapSet.size(state.ringing) == 0,
        do: finish(state, "declined"),
        else: {:noreply, state}
    else
      {:noreply, state}
    end
  end

  def handle_cast({:leave, user}, state), do: leave(user, state)

  def handle_cast({:endpoint_closed, user, endpoint}, state) do
    if Map.get(state.joined, user) == endpoint, do: leave(user, state), else: {:noreply, state}
  end

  def handle_cast({:relay, from, to, data}, state) do
    target = Map.get(state.joined, to)

    if target && from != to && Map.has_key?(state.joined, from) && valid_signal?(data) do
      Delivery.to_endpoints([target], "call:signal", %{callId: state.id, from: from, data: data})
    end

    {:noreply, state}
  end

  @impl true
  def handle_info(:ring_timeout, %{answered_at: nil} = state), do: finish(state, "missed")
  def handle_info(:ring_timeout, state), do: {:noreply, state}

  # ── Internos ────────────────────────────────────────────────────────────────

  defp leave(user, state) do
    if Map.has_key?(state.joined, user) do
      Registry.unregister(@registry, {:user, user})
      state = Map.update!(state, :joined, &Map.delete(&1, user))
      Delivery.to_endpoints(Map.values(state.joined), "call:participant-left", %{callId: state.id, userId: user})

      cond do
        is_nil(state.answered_at) and map_size(state.joined) == 0 -> finish(state, "cancelled")
        state.answered_at && map_size(state.joined) <= 1 -> finish(state, "completed")
        true -> {:noreply, state}
      end
    else
      {:noreply, state}
    end
  end

  defp answered(%{answered_at: nil} = state) do
    Process.cancel_timer(state.ring_ref)
    %{state | answered_at: System.monotonic_time(:millisecond)}
  end

  defp answered(state), do: state

  defp finish(state, reason) do
    Process.cancel_timer(state.ring_ref)
    Delivery.to_users(state.participants, "call:ended", %{callId: state.id, reason: reason})
    answered? = not is_nil(state.answered_at)
    duration = if answered?, do: System.monotonic_time(:millisecond) - state.answered_at, else: 0

    log = %{
      conversationId: state.conversation_id,
      actorId: state.started_by,
      text: CallText.log(state.kind, answered?, duration),
      audience: state.participants
    }

    Core.async(fn -> Core.call_log(log) end)
    {:stop, :normal, state}
  end

  defp info(state, participants \\ nil) do
    %{
      callId: state.id,
      conversationId: state.conversation_id,
      kind: state.kind,
      startedBy: state.started_by,
      participants: participants || Map.keys(state.joined)
    }
  end

  defp valid_signal?(%{"type" => type, "sdp" => sdp}) when type in ["offer", "answer"],
    do: is_binary(sdp) and byte_size(sdp) < @max_sdp

  defp valid_signal?(%{"type" => "candidate", "candidate" => %{"candidate" => c}}), do: is_binary(c)
  defp valid_signal?(_), do: false
end
