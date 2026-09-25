import { useCanvas } from "@/hooks/use-canvas";
import { useZoomPan } from "@/hooks/use-zoom-pan";
import { ChartCard } from "@/components/ChartCard";
import { formatTime, type SeismoPoint } from "@/lib/seismic";

const PAD = { left: 56, right: 10, top: 12, bottom: 26 };

export function Seismogram({
  points,
  from,
  to,
  empty,
}: {
  points: SeismoPoint[];
  from: number;
  to: number;
  empty: boolean;
}) {
  const { ref, view, reset, isZoomed } = useZoomPan(true);

  const t0 = from + (to - from) * view.x0;
  const t1 = from + (to - from) * view.x1;

  const canvasRef = useCanvas(
    (ctx, w, h) => {
      const plotW = w - PAD.left - PAD.right;
      const plotH = h - PAD.top - PAD.bottom;
      if (plotW <= 0 || plotH <= 0) return;

      const visible = points.filter((p) => p.t >= t0 && p.t <= t1);
      const style = getComputedStyle(document.documentElement);
      const grid = style.getPropertyValue("--chart-grid").trim() || "#e6e8ec";
      const axis = style.getPropertyValue("--chart-axis").trim() || "#8b94a3";
      const signal = style.getPropertyValue("--chart-signal").trim() || "#1546c8";
      const band = style.getPropertyValue("--chart-band").trim() || "#c9d9f5";

      let baseMin = Infinity;
      let baseMax = -Infinity;
      for (const p of visible) {
        if (p.min < baseMin) baseMin = p.min;
        if (p.max > baseMax) baseMax = p.max;
      }
      if (!Number.isFinite(baseMin) || !Number.isFinite(baseMax)) {
        baseMin = -1;
        baseMax = 1;
      }
      if (baseMax - baseMin < 1e-9) {
        baseMin -= 1;
        baseMax += 1;
      }
      const pad = (baseMax - baseMin) * 0.08;
      baseMin -= pad;
      baseMax += pad;

      const span = baseMax - baseMin;
      const yMax = baseMax - span * view.y0;
      const yMin = baseMax - span * view.y1;

      const xOf = (t: number) => PAD.left + ((t - t0) / (t1 - t0 || 1)) * plotW;
      const yOf = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin || 1)) * plotH;

      // grid + amplitude labels
      ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textBaseline = "middle";
      ctx.textAlign = "right";
      for (let i = 0; i <= 4; i++) {
        const value = yMin + ((yMax - yMin) * i) / 4;
        const y = yOf(value);
        ctx.strokeStyle = grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(PAD.left, Math.round(y) + 0.5);
        ctx.lineTo(PAD.left + plotW, Math.round(y) + 0.5);
        ctx.stroke();
        ctx.fillStyle = axis;
        ctx.fillText(formatAmp(value), PAD.left - 8, y);
      }

      // time labels
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const ticks = Math.max(2, Math.min(7, Math.floor(plotW / 90)));
      for (let i = 0; i <= ticks; i++) {
        const t = t0 + ((t1 - t0) * i) / ticks;
        const x = xOf(t);
        ctx.strokeStyle = grid;
        ctx.beginPath();
        ctx.moveTo(Math.round(x) + 0.5, PAD.top);
        ctx.lineTo(Math.round(x) + 0.5, PAD.top + plotH);
        ctx.stroke();
        ctx.fillStyle = axis;
        ctx.fillText(formatTime(t, t1 - t0), x, PAD.top + plotH + 7);
      }

      if (visible.length === 0) {
        ctx.fillStyle = axis;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "13px ui-sans-serif, system-ui, sans-serif";
        ctx.fillText(
          empty ? "Нет данных от станции" : "Нет данных за выбранный интервал",
          PAD.left + plotW / 2,
          PAD.top + plotH / 2,
        );
        return;
      }

      ctx.save();
      ctx.beginPath();
      ctx.rect(PAD.left, PAD.top, plotW, plotH);
      ctx.clip();

      // min/max envelope
      ctx.fillStyle = band;
      ctx.beginPath();
      visible.forEach((p, i) => {
        const x = xOf(p.t);
        if (i === 0) ctx.moveTo(x, yOf(p.max));
        else ctx.lineTo(x, yOf(p.max));
      });
      for (let i = visible.length - 1; i >= 0; i--) {
        const p = visible[i]!;
        ctx.lineTo(xOf(p.t), yOf(p.min));
      }
      ctx.closePath();
      ctx.fill();

      // average trace
      ctx.strokeStyle = signal;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      visible.forEach((p, i) => {
        const x = xOf(p.t);
        const y = yOf(p.avg);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.restore();

      // frame
      ctx.strokeStyle = grid;
      ctx.strokeRect(PAD.left + 0.5, PAD.top + 0.5, plotW, plotH);
    },
    [points, t0, t1, view.y0, view.y1, empty],
  );

  return (
    <ChartCard
      title="Сейсмограмма"
      subtitle={`${formatTime(t0, t1 - t0)} — ${formatTime(t1, t1 - t0)}`}
      onReset={reset}
      resetDisabled={!isZoomed}
      hint="Колесо мыши — масштаб по времени, Shift + колесо — по амплитуде, перетаскивание — сдвиг, на смартфоне — жест двумя пальцами."
    >
      <div ref={ref} className="h-[320px] w-full touch-none select-none sm:h-[380px]">
        <canvas ref={canvasRef} className="block cursor-grab active:cursor-grabbing" />
      </div>
    </ChartCard>
  );
}

function formatAmp(v: number) {
  const abs = Math.abs(v);
  if (abs >= 10000 || (abs > 0 && abs < 0.01)) return v.toExponential(1);
  if (abs >= 100) return v.toFixed(0);
  if (abs >= 1) return v.toFixed(1);
  return v.toFixed(3);
}
