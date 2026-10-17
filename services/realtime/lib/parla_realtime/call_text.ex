defmodule ParlaRealtime.CallText do
  @moduledoc "Textos de las llamadas (los mismos que mostraba el core en TypeScript)."

  def label("video"), do: "Videollamada"
  def label(_), do: "Llamada de voz"

  def duration(ms) do
    total = max(1, round(ms / 1000))
    h = div(total, 3600)
    m = div(rem(total, 3600), 60)
    s = rem(total, 60)
    pad = &String.pad_leading(Integer.to_string(&1), 2, "0")
    if h > 0, do: "#{h}:#{pad.(m)}:#{pad.(s)}", else: "#{m}:#{pad.(s)}"
  end

  @doc "Aviso que queda en el chat al terminar la llamada."
  def log(kind, answered?, duration_ms) do
    icon = if kind == "video", do: "🎥", else: "📞"
    if answered?, do: "#{icon} #{label(kind)} · #{duration(duration_ms)}", else: "#{icon} #{label(kind)} perdida"
  end
end
