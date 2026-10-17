defmodule ParlaRealtime.LinkTest do
  use ExUnit.Case, async: false
  import Plug.Test
  import Plug.Conn, only: [put_req_header: 3]
  alias ParlaRealtime.{CallText, ContextCache, Core.Fake, Delivery, GatewayLink, Router}

  setup do
    Fake.reset()
    ContextCache.clear()

    Fake.put_conversation(%{
      "conversationId" => "c1",
      "participants" => [%{"id" => "laura"}, %{"id" => "andres"}],
      "maxCallParticipants" => 4
    })

    :ok
  end

  defp frame(state, map), do: GatewayLink.handle_in({Jason.encode!(map), [opcode: :text]}, state)

  test "la primera conexión pone a la persona en línea y la última la desconecta" do
    {:ok, state} = GatewayLink.init(nil)
    {:ok, state} = frame(state, %{op: "open", conn: "c1", user: "laura"})
    {:ok, state} = frame(state, %{op: "open", conn: "c2", user: "laura"})
    {:ok, state} = frame(state, %{op: "close", conn: "c1"})
    {:ok, _} = frame(state, %{op: "close", conn: "c2"})
    Process.sleep(50)

    presence = for {:presence, "laura", status, _at} <- Fake.calls(), do: status
    assert presence == ["online", "offline"]
    refute Delivery.online?("laura")
  end

  test "'escribiendo' llega a los demás participantes; la persona sale del enlace, no del marco" do
    {:ok, state} = GatewayLink.init(nil)
    {:ok, state} = frame(state, %{op: "open", conn: "c-laura", user: "laura"})
    {:ok, state} = frame(state, %{op: "open", conn: "c-andres", user: "andres"})

    # El marco dice "user: andres", pero la conexión c-laura es de Laura: manda la del enlace.
    {:ok, _} =
      frame(state, %{op: "event", conn: "c-laura", user: "andres", t: "typing", d: %{conversationId: "c1", isTyping: true}})

    assert_receive {:deliver, ["c-andres"], "typing", %{userId: "laura", isTyping: true}}, 1_000
  end

  test "un evento de una conexión que no se abrió se ignora" do
    {:ok, state} = GatewayLink.init(nil)
    {:ok, _} = frame(state, %{op: "event", conn: "fantasma", t: "typing", d: %{conversationId: "c1"}})
    refute_receive {:deliver, _, _, _}, 100
  end

  test "las acciones con respuesta devuelven un ack con su ref" do
    {:ok, state} = GatewayLink.init(nil)
    {:ok, state} = frame(state, %{op: "open", conn: "c-laura", user: "laura"})
    {:ok, _} = frame(state, %{op: "event", conn: "c-laura", t: "call:start", d: %{conversationId: "nadie", kind: "audio"}, ref: "r1"})
    assert_receive {:ack, "c-laura", "r1", %{ok: false, error: "Conversación no encontrada"}}, 1_000
  end

  test "el core publica eventos con el token interno" do
    Delivery.open("andres", "c-andres")

    conn =
      conn(:post, "/internal/publish", Jason.encode!(%{users: ["andres"], event: "message:new", data: %{id: "m1"}}))
      |> put_req_header("content-type", "application/json")
      |> put_req_header("x-internal-token", "token-de-prueba")
      |> Router.call(Router.init([]))

    assert conn.status == 202
    assert_receive {:deliver, ["c-andres"], "message:new", %{"id" => "m1"}}
  end

  test "sin token interno no se puede publicar ni abrir el enlace" do
    publish =
      conn(:post, "/internal/publish", Jason.encode!(%{users: ["andres"], event: "x"}))
      |> put_req_header("content-type", "application/json")
      |> put_req_header("x-internal-token", "otro")
      |> Router.call(Router.init([]))

    assert publish.status == 401
    assert Router.call(conn(:get, "/link"), Router.init([])).status == 401
    assert Router.call(conn(:get, "/health"), Router.init([])).status == 200
  end

  test "textos de las llamadas" do
    assert CallText.log("audio", true, 3_725_000) == "📞 Llamada de voz · 1:02:05"
    assert CallText.log("video", false, 0) == "🎥 Videollamada perdida"
  end
end
