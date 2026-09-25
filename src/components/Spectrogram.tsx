import { useMemo } from "react";

import { useCanvas } from "@/hooks/use-canvas";
import { useZoomPan } from "@/hooks/use-zoom-pan";
import { ChartCard } from "@/components/ChartCard";
import { buildSpectrogram, intensityColor, MAX_FREQ_HZ, FREQ_BINS } from "@/lib/dsp";
import { formatTime } from "@/lib/seismic";

const PAD = { left: 56, right: 10, top: 12, bottom: 26 };

export function Spectrogram({
  windows,
  from,
  to,
  empty,
}: {
  windows: Array<{ window_ts: string; vals: number[] | null }>;
  from: number;
  to: number;
  empty: boolean;
}) {
  const { ref, view, reset, isZoomed } = useZoomPan(true);
  const { columns, minDb, maxDb } = useMemo(() => buildSpectrogram(windows), [windows]);

  const t0 = from + (to - from) * view.x0;
  const t1 = from + (to - from) * view.x1;
  const fTop = MAX_FREQ_HZ - MAX_FREQ_HZ * view.y0;
  const fBottom = MAX_FREQ_HZ - MAX_FREQ_HZ * view.y1;

  const columnDuration = useMemo(() => {
    if (columns.length < 2) return 12800;
    const gaps: number[] = [];
    for (let i = 1; i < columns.length; i++) gaps.push(columns[i]!.t - columns[i - 1]!.t);
    gaps.sort((a, b) => a - b);
    return gaps[Math.floor(gaps.length / 2)] || 12800;
  }, [columns]);

  const canvasRef = useCanvas(
    (ctx, w, h) => {
      const plotW = w - PAD.left - PAD.right;
      const plotH = h - PAD.top - PAD.bottom;
      if (plotW <= 0 || plotH <= 0) return;

      const style = getComputedStyle(document.documentElement);
      const grid = style.getPropertyValue("--chart-grid").trim() || "#e6e8ec";
      const axis = style.getPropertyValue("--chart-axis").trim() || "#8b94a3";

      const xOf = (t: number) => PAD.left + ((t - t0) / (t1 - t0 || 1)) * plotW;
      const yOf = (f: number) =>
        PAD.top + (1 - (f - fBottom) / (fTop - fBottom || 1)) * plotH;

      const visible = columns.filter(
        (c) => c.t + columnDuration >= t0 && c.t <= t1,
      );

      if (visible.length > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(PAD.left, PAD.top, plotW, plotH);
        ctx.clip();

        const range = Math.max(1e-9, maxDb - minDb);
        for (const col of visible) {
          const x = xOf(col.t);
          const xEnd = xOf(col.t + columnDuration);
          const cw = Math.max(1, xEnd - x);
          for (let i = 0; i < FREQ_BINS; i++) {
            const f0 = ((i + 1) * MAX_FREQ_HZ) / FREQ_BINS;
            const f1 = (i * MAX_FREQ_HZ) / FREQ_BINS;
            if (f0 < fBottom || f1 > fTop) continue;
            const mag = col.mags[i]!;
            const db = mag > 0 ? 20 * Math.log10(mag) : minDb;
            const intensity = Math.max(0, Math.min(1, (db - minDb) / range));
            const [r, g, b] = intensityColor(intensity);
            ctx.fillStyle = `rgb(${r},${g},${b})`;
            const yTop = yOf(f0);
            const yBottom = yOf(f1);
            ctx.fillRect(x, yTop, cw, Math.max(1, yBottom - yTop));
          }
        }
        ctx.restore();
      }

      // frequency labels
      ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textBaseline = "middle";
      ctx.textAlign = "right";
      for (let i = 0; i <= 5; i++) {
        const f = fBottom + ((fTop - fBottom) * i) / 5;
        const y = yOf(f);
        ctx.fillStyle = axis;
        ctx.fillText(`${f.toFixed(2)} Гц`, PAD.left - 8, y);
      }

      // time labels
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const ticks = Math.max(2, Math.min(7, Math.floor(plotW / 90)));
      for (let i = 0; i <= ticks; i++) {
        const t = t0 + ((t1 - t0) * i) / ticks;
        ctx.fillStyle = axis;
        ctx.fillText(formatTime(t, t1 - t0), xOf(t), PAD.top + plotH + 7);
      }

      if (visible.length === 0) {
        ctx.fillStyle = axis;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "13px ui-sans-serif, system-ui, sans-serif";
        ctx.fillText(
          empty ? "Нет данных от станции" : "Недостаточно данных для спектра",
          PAD.left + plotW / 2,
          PAD.top + plotH / 2,
        );
      }

      ctx.strokeStyle = grid;
      ctx.lineWidth = 1;
      ctx.strokeRect(PAD.left + 0.5, PAD.top + 0.5, plotW, plotH);
    },
    [columns, columnDuration, t0, t1, fTop, fBottom, minDb, maxDb, empty],
  );

  return (
    <ChartCard
      title="Спектрограмма 0–5 Гц"
      subtitle="Окно 12.8 с · частота дискретизации 10 Гц (предел Найквиста 5 Гц)"
      onReset={reset}
      resetDisabled={!isZoomed}
      hint="Колесо мыши — масштаб по времени, Shift + колесо — по частоте, перетаскивание — сдвиг, на смартфоне — жест двумя пальцами."
    >
      <div ref={ref} className="h-[300px] w-full touch-none select-none sm:h-[340px]">
        <canvas ref={canvasRef} className="block cursor-grab active:cursor-grabbing" />
      </div>
    </ChartCard>
  );
}
