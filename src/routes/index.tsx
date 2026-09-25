import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Seismogram } from "@/components/Seismogram";
import { Spectrogram } from "@/components/Spectrogram";
import {
  RANGES,
  fetchSeries,
  fetchStatus,
  formatFullTime,
  type RangeKey,
} from "@/lib/seismic";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Сейсмостанция — сейсмограмма и спектрограмма 0–5 Гц" },
      {
        name: "description",
        content:
          "Мониторинг сейсмических колебаний геофона: текущая сейсмограмма, спектрограмма 0–5 Гц и история измерений за 3 суток.",
      },
      { property: "og:title", content: "Сейсмостанция — сейсмограмма и спектрограмма" },
      {
        property: "og:description",
        content:
          "Реальные данные геофона с ESP32: сейсмограмма, спектрограмма 0–5 Гц, история за 3 суток.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const [range, setRange] = useState<RangeKey>("10m");
  const live = range === "10m" || range === "1h";

  const status = useQuery({
    queryKey: ["status"],
    queryFn: fetchStatus,
    refetchInterval: 5000,
  });

  const series = useQuery({
    queryKey: ["series", range],
    queryFn: () => fetchSeries(range),
    refetchInterval: live ? 3000 : 30000,
  });

  const data = series.data;
  const empty = (data?.points.length ?? 0) === 0;
  const connected = status.data?.connected ?? false;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:py-8">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            Сейсмостанция
          </h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <span
              aria-hidden
              className={`inline-block h-2 w-2 rounded-full ${
                connected ? "bg-online" : "bg-offline"
              }`}
            />
            <span className="text-foreground">
              Статус: {connected ? "Подключено" : "Нет данных"}
            </span>
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-xs text-muted-foreground sm:text-right">
          <dt>Частота дискретизации</dt>
          <dd className="text-foreground">{status.data?.sampleRateHz ?? 10} Гц</dd>
          <dt>Последнее измерение</dt>
          <dd className="text-foreground">
            {status.data?.lastTs ? formatFullTime(status.data.lastTs) : "—"}
          </dd>
        </dl>
      </header>

      <nav className="mb-5 flex flex-wrap gap-1.5" aria-label="Временной диапазон">
        {RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => setRange(r.key)}
            aria-pressed={range === r.key}
            className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
              range === r.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-foreground hover:bg-secondary"
            }`}
          >
            {r.label}
          </button>
        ))}
      </nav>

      <div className="space-y-5">
        <Seismogram
          points={data?.points ?? []}
          from={data?.from ?? Date.now() - 600000}
          to={data?.to ?? Date.now()}
          empty={empty}
        />
        <Spectrogram
          windows={data?.windows ?? []}
          from={data?.from ?? Date.now() - 600000}
          to={data?.to ?? Date.now()}
          empty={empty}
        />
      </div>

      <footer className="mt-6 space-y-1 border-t border-border pt-4 font-mono text-xs text-muted-foreground">
        <p>
          Последнее измерение:{" "}
          <span className="text-foreground">
            {status.data?.lastTs ? formatFullTime(status.data.lastTs) : "—"}
          </span>
        </p>
        <p>
          ESP32:{" "}
          <span className="text-foreground">{connected ? "подключено" : "нет связи"}</span>
        </p>
        <p>
          История хранится 3 суток. Приём данных: POST /api/public/ingest (заголовок
          x-api-key).
        </p>
        {series.error ? (
          <p className="text-destructive">Ошибка загрузки данных, повторная попытка…</p>
        ) : null}
      </footer>
    </main>
  );
}
