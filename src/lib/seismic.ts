import { supabase } from "@/integrations/supabase/client";

export const STATION_ID = "station-1";

export type RangeKey = "10m" | "1h" | "6h" | "12h" | "24h" | "3d";

export const RANGES: Array<{ key: RangeKey; label: string; ms: number }> = [
  { key: "10m", label: "10 мин", ms: 10 * 60 * 1000 },
  { key: "1h", label: "1 ч", ms: 60 * 60 * 1000 },
  { key: "6h", label: "6 ч", ms: 6 * 60 * 60 * 1000 },
  { key: "12h", label: "12 ч", ms: 12 * 60 * 60 * 1000 },
  { key: "24h", label: "24 ч", ms: 24 * 60 * 60 * 1000 },
  { key: "3d", label: "3 дня", ms: 3 * 24 * 60 * 60 * 1000 },
];

export function rangeMs(key: RangeKey) {
  return RANGES.find((r) => r.key === key)!.ms;
}

/** Spectrogram window length in seconds: 12.8 s = 128 samples at 10 Hz. */
export const WINDOW_SECONDS = 12.8;

export type SeismoPoint = {
  t: number;
  min: number;
  max: number;
  avg: number;
};

export type SeriesResult = {
  from: number;
  to: number;
  points: SeismoPoint[];
  windows: Array<{ window_ts: string; vals: number[] | null }>;
};

export async function fetchSeries(key: RangeKey): Promise<SeriesResult> {
  const to = Date.now();
  const from = to - rangeMs(key);
  const fromIso = new Date(from).toISOString();
  const toIso = new Date(to).toISOString();

  const [seismo, spectro] = await Promise.all([
    supabase.rpc("get_seismogram", {
      p_station: STATION_ID,
      p_from: fromIso,
      p_to: toIso,
      p_buckets: 1400,
    }),
    supabase.rpc("get_spectrogram_windows", {
      p_station: STATION_ID,
      p_from: fromIso,
      p_to: toIso,
      p_max_windows: 260,
      p_window_seconds: WINDOW_SECONDS,
    }),
  ]);

  if (seismo.error) throw seismo.error;
  if (spectro.error) throw spectro.error;

  const points: SeismoPoint[] = (seismo.data ?? []).map((row) => ({
    t: new Date(row.bucket_ts as string).getTime(),
    min: Number(row.min_value),
    max: Number(row.max_value),
    avg: Number(row.avg_value),
  }));

  const windows = (spectro.data ?? []).map((row) => ({
    window_ts: row.window_ts as string,
    vals: (row.vals as number[] | null) ?? null,
  }));

  return { from, to, points, windows };
}

export type StationStatus = {
  lastTs: number | null;
  sampleRateHz: number;
  connected: boolean;
};

export async function fetchStatus(): Promise<StationStatus> {
  const [{ data: station }, { data: last }] = await Promise.all([
    supabase
      .from("stations")
      .select("sample_rate_hz")
      .eq("station_id", STATION_ID)
      .maybeSingle(),
    supabase
      .from("readings")
      .select("ts")
      .eq("station_id", STATION_ID)
      .order("ts", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const lastTs = last?.ts ? new Date(last.ts).getTime() : null;
  return {
    lastTs,
    sampleRateHz: station?.sample_rate_hz ?? 10,
    connected: lastTs != null && Date.now() - lastTs < 60_000,
  };
}

export function formatTime(ms: number, span: number) {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  if (span <= 2 * 60 * 60 * 1000) {
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
  if (span <= 24 * 60 * 60 * 1000) {
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatFullTime(ms: number) {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
