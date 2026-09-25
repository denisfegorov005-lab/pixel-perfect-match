import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Ingest endpoint for ESP32 seismic stations.
 *
 *   POST /api/public/ingest
 *   Headers: Content-Type: application/json
 *            x-api-key: 0987654321JSDP
 *
 * Single sample:
 *   { "station_id": "station-1", "timestamp": "2026-09-25T07:00:00.000Z", "value": 123.4 }
 *
 * Batch (recommended for 10 Hz):
 *   { "station_id": "station-1",
 *     "samples": [ { "timestamp": 1758783600000, "value": 123.4 }, ... ] }
 *
 * `timestamp` accepts an ISO string, epoch milliseconds or epoch seconds.
 * `extra` (optional object) is stored as-is for future additional parameters.
 */

const timestampSchema = z.union([z.string(), z.number()]).optional();

const sampleSchema = z.object({
  timestamp: timestampSchema,
  ts: timestampSchema,
  time: timestampSchema,
  value: z.union([z.number(), z.string()]),
  extra: z.record(z.unknown()).optional(),
});

const bodySchema = z.object({
  station_id: z.string().min(1).max(64).optional(),
  stationId: z.string().min(1).max(64).optional(),
  samples: z.array(sampleSchema).max(5000).optional(),
  data: z.array(sampleSchema).max(5000).optional(),
  timestamp: timestampSchema,
  ts: timestampSchema,
  time: timestampSchema,
  value: z.union([z.number(), z.string()]).optional(),
  extra: z.record(z.unknown()).optional(),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function parseTimestamp(raw: unknown): Date | null {
  if (raw == null) return new Date();
  if (typeof raw === "number" || /^\d+(\.\d+)?$/.test(String(raw))) {
    let n = Number(raw);
    if (!Number.isFinite(n)) return null;
    // epoch seconds -> milliseconds
    if (n < 1e12) n = n * 1000;
    const d = new Date(n);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(String(raw));
  return Number.isNaN(d.getTime()) ? null : d;
}

export const Route = createFileRoute("/api/public/ingest")({
  server: {
    handlers: {
      GET: async () => json({ ok: true, endpoint: "/api/public/ingest", method: "POST" }),
      POST: async ({ request }) => {
        const expectedKey = process.env["SEISMO_INGEST_KEY"];
        if (!expectedKey) return json({ error: "Ingest key is not configured" }, 500);

        const provided =
          request.headers.get("x-api-key") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          "";
        if (provided !== expectedKey) return json({ error: "Unauthorized" }, 401);

        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }

        const parsed = bodySchema.safeParse(raw);
        if (!parsed.success) return json({ error: "Invalid payload" }, 400);
        const body = parsed.data;

        const stationId = body.station_id ?? body.stationId ?? "station-1";
        const rawSamples = body.samples ?? body.data ?? [];
        const list =
          rawSamples.length > 0
            ? rawSamples
            : body.value !== undefined
              ? [
                  {
                    timestamp: body.timestamp ?? body.ts ?? body.time,
                    value: body.value,
                    extra: body.extra,
                  },
                ]
              : [];

        if (list.length === 0) return json({ error: "No samples provided" }, 400);

        const rows: Array<{
          station_id: string;
          ts: string;
          value: number;
          extra: Record<string, unknown> | null;
        }> = [];

        for (const s of list) {
          const date = parseTimestamp(s.timestamp ?? s.ts ?? s.time);
          const value = Number(s.value);
          if (!date || !Number.isFinite(value)) continue;
          rows.push({
            station_id: stationId,
            ts: date.toISOString(),
            value,
            extra: s.extra ?? null,
          });
        }

        if (rows.length === 0) return json({ error: "No valid samples" }, 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        await supabaseAdmin
          .from("stations")
          .upsert({ station_id: stationId }, { onConflict: "station_id", ignoreDuplicates: true });

        const { error } = await supabaseAdmin
          .from("readings")
          .upsert(rows, { onConflict: "station_id,ts", ignoreDuplicates: true });

        if (error) {
          console.error("ingest insert failed", error);
          return json({ error: "Storage error" }, 500);
        }

        return json({ ok: true, stored: rows.length });
      },
    },
  },
});
