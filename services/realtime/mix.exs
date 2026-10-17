defmodule ParlaRealtime.MixProject do
  use Mix.Project

  def project do
    [
      app: :parla_realtime,
      version: "0.1.0",
      elixir: "~> 1.17",
      start_permanent: Mix.env() == :prod,
      deps: deps()
    ]
  end

  def application do
    [
      extra_applications: [:logger, :crypto],
      mod: {ParlaRealtime.Application, []}
    ]
  end

  defp deps do
    [
      {:bandit, "~> 1.5"},
      {:websock_adapter, "~> 0.5"},
      {:plug, "~> 1.16"},
      {:jason, "~> 1.4"},
      {:req, "~> 0.5"}
    ]
  end
end
