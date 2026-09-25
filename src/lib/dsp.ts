/** Signal processing helpers for the spectrogram (10 Hz data, 0-5 Hz band). */

export const FFT_SIZE = 128;
export const SAMPLE_RATE_HZ = 10;
/** Frequency of bin k = k * SAMPLE_RATE_HZ / FFT_SIZE, k = 1..FFT_SIZE/2 (0.078..5 Hz). */
export const FREQ_BINS = FFT_SIZE / 2;
export const MAX_FREQ_HZ = SAMPLE_RATE_HZ / 2;

function hann(i: number, n: number) {
  return 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
}

/**
 * Magnitude spectrum of one window of samples.
 * Detrends (removes DC), applies a Hann window, zero-pads to FFT_SIZE.
 * Returns FREQ_BINS magnitudes, bin 0 = lowest non-DC frequency.
 */
export function magnitudeSpectrum(samples: number[], size = FFT_SIZE): Float64Array {
  const n = size;
  const re = new Float64Array(n);
  const im = new Float64Array(n);

  const count = Math.min(samples.length, n);
  let mean = 0;
  for (let i = 0; i < count; i++) mean += samples[i]!;
  mean = count > 0 ? mean / count : 0;

  for (let i = 0; i < count; i++) re[i] = (samples[i]! - mean) * hann(i, n);

  // iterative radix-2 FFT (n must be a power of two)
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]!;
      re[i] = re[j]!;
      re[j] = tr;
      const ti = im[i]!;
      im[i] = im[j]!;
      im[j] = ti;
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k]!;
        const ai = im[i + k]!;
        const br = re[i + k + len / 2]!;
        const bi = im[i + k + len / 2]!;
        const tr = br * cr - bi * ci;
        const ti = br * ci + bi * cr;
        re[i + k] = ar + tr;
        im[i + k] = ai + ti;
        re[i + k + len / 2] = ar - tr;
        im[i + k + len / 2] = ai - ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }

  const out = new Float64Array(FREQ_BINS);
  for (let k = 1; k <= FREQ_BINS; k++) {
    out[k - 1] = Math.sqrt(re[k]! * re[k]! + im[k]! * im[k]!) / (n / 2);
  }
  return out;
}

export type SpectrogramColumn = { t: number; mags: Float64Array };

export function buildSpectrogram(
  windows: Array<{ window_ts: string; vals: number[] | null }>,
): { columns: SpectrogramColumn[]; maxDb: number; minDb: number } {
  const columns: SpectrogramColumn[] = [];
  let max = -Infinity;

  for (const w of windows) {
    const vals = w.vals ?? [];
    if (vals.length < 24) continue;
    const mags = magnitudeSpectrum(vals);
    for (let i = 0; i < mags.length; i++) if (mags[i]! > max) max = mags[i]!;
    columns.push({ t: new Date(w.window_ts).getTime(), mags });
  }

  const maxDb = max > 0 ? 20 * Math.log10(max) : 0;
  return { columns, maxDb, minDb: maxDb - 60 };
}

/** Intensity (0..1) -> rgb, light background friendly ramp: white -> blue -> dark. */
export function intensityColor(v: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, v));
  const stops: Array<[number, [number, number, number]]> = [
    [0, [255, 255, 255]],
    [0.25, [204, 224, 245]],
    [0.5, [96, 150, 215]],
    [0.75, [27, 65, 150]],
    [1, [10, 15, 45]],
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const [p0, c0] = stops[i]!;
    const [p1, c1] = stops[i + 1]!;
    if (t >= p0 && t <= p1) {
      const f = (t - p0) / (p1 - p0);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * f),
        Math.round(c0[1] + (c1[1] - c0[1]) * f),
        Math.round(c0[2] + (c1[2] - c0[2]) * f),
      ];
    }
  }
  return [10, 15, 45];
}
