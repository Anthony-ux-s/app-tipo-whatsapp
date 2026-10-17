# Tiempo real de Parla (Elixir): release de OTP, sin Mix ni código fuente en la imagen final.
FROM elixir:1.18-otp-27-slim AS build
ENV MIX_ENV=prod
WORKDIR /src
RUN mix local.hex --force && mix local.rebar --force
COPY mix.exs mix.lock ./
COPY config config
RUN mix deps.get --only prod && mix deps.compile
COPY lib lib
RUN mix release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends libstdc++6 openssl libncurses6 ca-certificates locales \
  && rm -rf /var/lib/apt/lists/* \
  && sed -i '/en_US.UTF-8/s/^# //' /etc/locale.gen && locale-gen \
  && useradd --create-home --uid 10001 parla
ENV LANG=en_US.UTF-8 REALTIME_PORT=4102
WORKDIR /app
COPY --from=build --chown=parla /src/_build/prod/rel/parla_realtime ./
USER parla
EXPOSE 4102
CMD ["bin/parla_realtime", "start"]
