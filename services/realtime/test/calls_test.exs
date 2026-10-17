defmodule ParlaRealtime.CallsTest do
  # Las pruebas comparten registros globales: se ejecutan en serie.
  use ExUnit.Case, async: false
  alias ParlaRealtime.{Calls, ContextCache, Core.Fake, Delivery}

  @offer %{"type" => "offer", "sdp" => "v=0"}

  setup do
    Fake.reset()
    ContextCache.clear()
    on_exit(fn -> stop_all_calls() end)

    Fake.put_conversation(context("dm", ["laura", "andres"], "direct", 4))
    Fake.put_conversation(context("grupo", ["laura", "andres", "sofia"], "group", 3))
    # Este proceso hace de enlace del gateway: cada persona tiene una conexión "c-<persona>".
    for user <- ["laura", "andres", "sofia"], do: Delivery.open(user, "c-" <> user)
    :ok
  end

  defp context(id, users, kind, max) do
    %{
      "conversationId" => id,
      "workspaceId" => "w1",
      "kind" => kind,
      "title" => id,
      "participants" => Enum.map(users, &%{"id" => &1, "name" => String.capitalize(&1)}),
      "maxCallParticipants" => max
    }
  end

  defp endpoint(user), do: {self(), "c-" <> user}

  defp stop_all_calls do
    for {_, pid, _, _} <- DynamicSupervisor.which_children(ParlaRealtime.CallSupervisor),
        do: DynamicSupervisor.terminate_child(ParlaRealtime.CallSupervisor, pid)
  end

  # Espera un evento entregado a cierta conexión y devuelve sus datos.
  defp assert_delivered(conn, event) do
    assert_receive {:deliver, conns, ^event, data}, 1_000
    assert conn in conns, "#{event} no llegó a #{conn} (llegó a #{inspect(conns)})"
    data
  end

  defp wait_for_log do
    Enum.find_value(1..50, fn _ ->
      Process.sleep(10)
      Enum.find_value(Fake.calls(), fn
        {:call_log, payload} -> payload
        _ -> nil
      end)
    end)
  end

  test "llamar hace sonar a los demás y quien contesta recibe con quién negociar" do
    {:ok, call} = Calls.start("laura", endpoint("laura"), %{"conversationId" => "dm", "kind" => "video"})
    assert %{kind: "video", startedBy: "laura", participants: ["laura"]} = call

    incoming = assert_delivered("c-andres", "call:incoming")
    assert incoming.call.callId == call.callId

    {:ok, joined} = Calls.join("andres", endpoint("andres"), call.callId)
    assert joined.participants == ["laura"]
    assert %{userId: "andres"} = assert_delivered("c-laura", "call:participant-joined")
  end

  test "la señalización solo se reenvía entre personas que están en la llamada, y en orden" do
    {:ok, call} = Calls.start("laura", endpoint("laura"), %{"conversationId" => "dm", "kind" => "audio"})
    Calls.relay("laura", call.callId, "andres", @offer)
    {:ok, _} = Calls.join("andres", endpoint("andres"), call.callId)

    Calls.relay("andres", call.callId, "laura", @offer)
    Calls.relay("andres", call.callId, "laura", %{"type" => "answer", "sdp" => "segundo"})
    Calls.relay("andres", call.callId, "laura", %{"type" => "offer", "sdp" => String.duplicate("x", 200_000)})

    signals =
      for _ <- 1..2 do
        assert_receive {:deliver, ["c-laura"], "call:signal", data}, 1_000
        data
      end

    assert [%{from: "andres", data: @offer}, %{data: %{"sdp" => "segundo"}}] = signals
    refute_receive {:deliver, _, "call:signal", _}, 100
  end

  test "al colgar se registra la duración en el chat" do
    {:ok, call} = Calls.start("laura", endpoint("laura"), %{"conversationId" => "dm", "kind" => "video"})
    {:ok, _} = Calls.join("andres", endpoint("andres"), call.callId)
    Calls.leave("andres", call.callId)

    assert %{reason: "completed"} = assert_delivered("c-laura", "call:ended")
    assert %{text: "🎥 Videollamada · 0:01", audience: ["laura", "andres"]} = wait_for_log()
    assert Calls.active_call("laura") == nil
  end

  test "si nadie contesta a tiempo, queda como perdida" do
    {:ok, _} = Calls.start("laura", endpoint("laura"), %{"conversationId" => "dm", "kind" => "audio"})
    assert %{reason: "missed"} = assert_delivered("c-laura", "call:ended")
    assert %{text: "📞 Llamada de voz perdida"} = wait_for_log()
  end

  test "rechazar una llamada 1:1 la termina" do
    {:ok, call} = Calls.start("laura", endpoint("laura"), %{"conversationId" => "dm", "kind" => "audio"})
    Calls.decline("andres", call.callId)
    assert %{userId: "andres"} = assert_delivered("c-laura", "call:declined")
    assert %{reason: "declined"} = assert_delivered("c-laura", "call:ended")
  end

  test "en grupo, quien llama después se une a la llamada en curso" do
    {:ok, call} = Calls.start("laura", endpoint("laura"), %{"conversationId" => "grupo", "kind" => "video"})
    {:ok, _} = Calls.join("andres", endpoint("andres"), call.callId)
    {:ok, again} = Calls.start("sofia", endpoint("sofia"), %{"conversationId" => "grupo", "kind" => "audio"})
    assert again.callId == call.callId
    assert Enum.sort(again.participants) == ["andres", "laura"]
  end

  test "respeta el máximo de personas del plan" do
    Fake.put_conversation(context("dos", ["laura", "andres", "sofia"], "group", 2))
    {:ok, call} = Calls.start("laura", endpoint("laura"), %{"conversationId" => "dos", "kind" => "audio"})
    {:ok, _} = Calls.join("andres", endpoint("andres"), call.callId)
    assert {:error, "La llamada ya tiene 2 personas, el máximo de tu plan"} = Calls.join("sofia", endpoint("sofia"), call.callId)
  end

  test "no se puede estar en dos llamadas ni llamar a un chat ajeno" do
    {:ok, _} = Calls.start("laura", endpoint("laura"), %{"conversationId" => "dm", "kind" => "audio"})
    assert {:error, "Ya estás en otra llamada"} = Calls.start("laura", endpoint("laura"), %{"conversationId" => "grupo", "kind" => "audio"})
    assert {:error, "Conversación no encontrada"} = Calls.start("intruso", {self(), "c-x"}, %{"conversationId" => "dm", "kind" => "audio"})
    assert {:error, "Tipo de llamada no válido"} = Calls.start("sofia", endpoint("sofia"), %{"conversationId" => "grupo", "kind" => "fax"})
  end

  test "si se cierra la conexión con la que alguien estaba en la llamada, sale de ella" do
    {:ok, call} = Calls.start("laura", endpoint("laura"), %{"conversationId" => "dm", "kind" => "audio"})
    {:ok, _} = Calls.join("andres", endpoint("andres"), call.callId)
    Calls.endpoint_closed("andres", {self(), "otra-conexion"})
    refute_receive {:deliver, _, "call:participant-left", _}, 100

    Calls.endpoint_closed("andres", endpoint("andres"))
    assert %{userId: "andres"} = assert_delivered("c-laura", "call:participant-left")
    assert %{reason: "completed"} = assert_delivered("c-laura", "call:ended")
  end

  test "al llamar se pide al core el push para quien no tiene la app abierta" do
    {:ok, call} = Calls.start("laura", endpoint("laura"), %{"conversationId" => "grupo", "kind" => "video"})
    Process.sleep(50)

    assert Enum.any?(Fake.calls(), fn
             {:call_notify, %{callId: id, recipients: ["andres", "sofia"], kind: "video"}} -> id == call.callId
             _ -> false
           end)
  end
end
