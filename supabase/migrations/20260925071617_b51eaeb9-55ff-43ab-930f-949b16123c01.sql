CREATE TABLE public.stations (
  station_id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Сейсмостанция',
  sample_rate_hz DOUBLE PRECISION NOT NULL DEFAULT 10,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.readings (
  id BIGSERIAL PRIMARY KEY,
  station_id TEXT NOT NULL DEFAULT 'station-1',
  ts TIMESTAMP WITH TIME ZONE NOT NULL,
  value DOUBLE PRECISION NOT NULL,
  extra JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX readings_station_ts_idx ON public.readings (station_id, ts DESC);
CREATE UNIQUE INDEX readings_station_ts_unique ON public.readings (station_id, ts);

GRANT SELECT ON public.stations TO anon, authenticated;
GRANT ALL ON public.stations TO service_role;
GRANT SELECT ON public.readings TO anon, authenticated;
GRANT ALL ON public.readings TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.readings_id_seq TO service_role;

ALTER TABLE public.stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.readings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Stations are publicly readable" ON public.stations FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Readings are publicly readable" ON public.readings FOR SELECT TO anon, authenticated USING (true);

INSERT INTO public.stations (station_id, name, sample_rate_hz) VALUES ('station-1', 'Сейсмостанция', 10);

CREATE OR REPLACE FUNCTION public.purge_old_readings()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.readings WHERE ts < now() - interval '3 days';
$$;