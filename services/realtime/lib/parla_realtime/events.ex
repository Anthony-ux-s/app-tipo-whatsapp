defmodule ParlaRealtime.Events do
  @moduledoc """
  Eventos que llegan de los navegadores (ya validados y limpios por el traductor del gateway).

  Devuelve `{:async, fun}` cuando hay que hablar con el core (se ejecuta fuera del enlace para no
  bloquear al resto de conexiones; si la función responde, el ack sale con el `ref`) o `:noreply`.
  La señalización de llamadas se procesa en orden, sin pasar por tareas, para no desordenar
  ofertas, respuestas y candidatos.
  """
  alias ParlaRealtime.{Calls, ContextCache, Delivery}

  @spec handle(String.t(), Delivery.endpoint(), String.t(), map()) ::
          :noreply | {:async, (-> :noreply | {:reply, map()})}
  def handle(user, _endpoint, "typing", %{"conversationId" => conversation_id} = data) do
    {:async,
     fn ->
       with {:ok, context} <- ContextCache.fetch(conversation_id, user) do
         Delivery.to_users(ContextCache.participant_ids(context) -- [user], "typing", %{
           conversationId: conversation_id,
           userId: user,
           isTyping: data["isTyping"] == true
         })
       end

       :noreply
     end}
  end

  def handle(user, endpoint, "call:start", data),
    do: {:async, fn -> {:reply, ack(Calls.start(user, endpoint, data))} end}

  def handle(user, endpoint, "call:join", %{"callId" => call_id}),
    do: {:async, fn -> {:reply, ack(Calls.join(user, endpoint, call_id))} end}

  def handle(user, _endpoint, "call:decline", %{"callId" => call_id}), do: tap_noreply(Calls.decline(user, call_id))
  def handle(user, _endpoint, "call:leave", %{"callId" => call_id}), do: tap_noreply(Calls.leave(user, call_id))

  def handle(user, _endpoint, "call:signal", %{"callId" => call_id, "to" => to, "data" => data}),
    do: tap_noreply(Calls.relay(user, call_id, to, data))

  def handle(_user, _endpoint, _event, _data), do: :noreply

  defp ack({:ok, call}), do: %{ok: true, call: call}
  defp ack({:error, message}), do: %{ok: false, error: message}

  defp tap_noreply(_), do: :noreply
end
