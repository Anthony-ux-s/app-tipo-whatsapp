defmodule ParlaRealtime.Delivery do
  @moduledoc """
  Conexiones y entrega de eventos.

  Cada conexión de navegador es una conexión virtual (`conn`) dentro de un enlace del gateway
  (`link`, un proceso). El enlace registra sus conexiones en `ParlaRealtime.Connections` con la
  persona como clave; entregar a una persona es mandar el evento a cada enlace donde tiene conexiones.
  """

  @type endpoint :: {pid(), String.t()}

  @registry ParlaRealtime.Connections

  @doc "Registra una conexión (lo llama el proceso del enlace). Devuelve true si es la primera de la persona."
  def open(user_id, conn) do
    {:ok, _} = Registry.register(@registry, user_id, conn)
    count(user_id) == 1
  end

  @doc "Da de baja una conexión. Devuelve true si era la última de la persona."
  def close(user_id, conn) do
    Registry.unregister_match(@registry, user_id, conn)
    count(user_id) == 0
  end

  def count(user_id), do: length(Registry.lookup(@registry, user_id))

  def online?(user_id), do: count(user_id) > 0

  @doc "Entrega un evento a todas las conexiones de esas personas."
  def to_users(user_ids, event, data) do
    user_ids
    |> Enum.uniq()
    |> Enum.flat_map(&Registry.lookup(@registry, &1))
    |> to_endpoints(event, data)
  end

  @doc "Entrega un evento a conexiones concretas (p. ej. el dispositivo con el que alguien está en una llamada)."
  def to_endpoints(endpoints, event, data) do
    endpoints
    |> Enum.group_by(fn {pid, _conn} -> pid end, fn {_pid, conn} -> conn end)
    |> Enum.each(fn {pid, conns} -> send(pid, {:deliver, conns, event, data}) end)
  end
end
