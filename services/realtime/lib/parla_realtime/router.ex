defmodule ParlaRealtime.Router do
  @moduledoc """
  Entradas HTTP del servicio (todas internas, protegidas con `x-internal-token`):
    * `GET /link` — enlace WebSocket con el gateway.
    * `POST /internal/publish` — el core publica eventos para las personas.
    * `GET /health` — salud.
  """
  use Plug.Router
  alias ParlaRealtime.Delivery

  plug :match
  plug Plug.Parsers, parsers: [:json], json_decoder: Jason, length: 1_000_000
  plug :dispatch

  get "/health" do
    json(conn, 200, %{status: "ok", service: "parla-realtime"})
  end

  get "/link" do
    if authorized?(conn) do
      conn
      |> WebSockAdapter.upgrade(ParlaRealtime.GatewayLink, nil, timeout: :infinity, max_frame_size: 8_000_000)
      |> halt()
    else
      json(conn, 401, %{error: "unauthorized"})
    end
  end

  post "/internal/publish" do
    with true <- authorized?(conn),
         %{"users" => users, "event" => event} when is_list(users) and is_binary(event) <- conn.body_params do
      Delivery.to_users(users, event, conn.body_params["data"])
      json(conn, 202, %{delivered: true})
    else
      false -> json(conn, 401, %{error: "unauthorized"})
      _ -> json(conn, 400, %{error: "invalid payload"})
    end
  end

  match _ do
    json(conn, 404, %{error: "not found"})
  end

  defp authorized?(conn) do
    expected = Application.fetch_env!(:parla_realtime, :internal_token)

    case get_req_header(conn, "x-internal-token") do
      [token] -> Plug.Crypto.secure_compare(token, expected)
      _ -> false
    end
  end

  defp json(conn, status, body) do
    conn
    |> put_resp_content_type("application/json")
    |> send_resp(status, Jason.encode!(body))
  end
end
