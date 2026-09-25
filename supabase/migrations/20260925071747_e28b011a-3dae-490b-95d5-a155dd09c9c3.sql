CREATE OR REPLACE FUNCTION public.get_seismogram(
  p_station TEXT,
  p_from TIMESTAMP WITH TIME ZONE,
  p_to TIMESTAMP WITH TIME ZONE,
  p_buckets INTEGER DEFAULT 1500
)
RETURNS TABLE (
  bucket_ts TIMESTAMP WITH TIME ZONE,
  min_value DOUBLE PRECISION,
  max_value DOUBLE PRECISION,
  avg_value DOUBLE PRECISION,
  sample_count BIGINT
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH p AS (
    SELECT GREATEST(
      0.1,
      (EXTRACT(EPOCH FROM p_to) - EXTRACT(EPOCH FROM p_from)) / GREATEST(p_buckets, 1)
    ) AS bucket_seconds
  )
  SELECT
    to_timestamp(EXTRACT(EPOCH FROM p_from) + b.idx * p.bucket_seconds) AS bucket_ts,
    b.min_value,
    b.max_value,
    b.avg_value,
    b.sample_count
  FROM p,
  LATERAL (
    SELECT
      floor((EXTRACT(EPOCH FROM r.ts) - EXTRACT(EPOCH FROM p_from)) / p.bucket_seconds)::BIGINT AS idx,
      min(r.value) AS min_value,
      max(r.value) AS max_value,
      avg(r.value) AS avg_value,
      count(*) AS sample_count
    FROM public.readings r
    WHERE r.station_id = p_station AND r.ts >= p_from AND r.ts <= p_to
    GROUP BY 1
  ) b
  ORDER BY bucket_ts;
$$;

CREATE OR REPLACE FUNCTION public.get_spectrogram_windows(
  p_station TEXT,
  p_from TIMESTAMP WITH TIME ZONE,
  p_to TIMESTAMP WITH TIME ZONE,
  p_max_windows INTEGER DEFAULT 260,
  p_window_seconds DOUBLE PRECISION DEFAULT 12.8
)
RETURNS TABLE (
  window_ts TIMESTAMP WITH TIME ZONE,
  vals DOUBLE PRECISION[]
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH p AS (
    SELECT GREATEST(
      1,
      ceil(
        ((EXTRACT(EPOCH FROM p_to) - EXTRACT(EPOCH FROM p_from)) / GREATEST(p_window_seconds, 0.1))
        / GREATEST(p_max_windows, 1)
      )::INTEGER
    ) AS step
  )
  SELECT
    to_timestamp(EXTRACT(EPOCH FROM p_from) + w.widx * p_window_seconds) AS window_ts,
    w.vals
  FROM p,
  LATERAL (
    SELECT
      floor((EXTRACT(EPOCH FROM r.ts) - EXTRACT(EPOCH FROM p_from)) / GREATEST(p_window_seconds, 0.1))::BIGINT AS widx,
      array_agg(r.value ORDER BY r.ts) AS vals
    FROM public.readings r
    WHERE r.station_id = p_station AND r.ts >= p_from AND r.ts <= p_to
    GROUP BY 1
    HAVING (floor((EXTRACT(EPOCH FROM min(r.ts)) - EXTRACT(EPOCH FROM p_from)) / GREATEST(p_window_seconds, 0.1))::BIGINT % p.step) = 0
  ) w
  ORDER BY window_ts;
$$;

GRANT EXECUTE ON FUNCTION public.get_seismogram(TEXT, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, INTEGER) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_spectrogram_windows(TEXT, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, INTEGER, DOUBLE PRECISION) TO anon, authenticated, service_role;