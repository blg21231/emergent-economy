// Live charts (AC7/AC8/AC11). Each chart is a 2D canvas that plots a time series accumulated from
// the SAME Aggregates the __ECON__ hook returns (AC8: no separate hidden number). Charts:
//  - price convergence/dispersion (per-good relative price + dispersion band)
//  - mean production HHI
//  - per-good indirect/money share (commodity-money)
//  - Gini (inequality)
// Pure canvas2d — no external libs, self-contained (C3).
import type { Aggregates } from "../../sim/types";

const GOOD_HEX = ["#5b8def", "#f5a623", "#2ecc71", "#e056a0", "#22d3ee", "#a78bfa"];
const GRID = "#1c2540";

export interface SeriesPoint {
  tick: number;
  values: number[];
}

/** A rolling multi-line time-series chart on a 2D canvas. */
export class LineChart {
  private ctx: CanvasRenderingContext2D;
  private series: SeriesPoint[] = [];
  private readonly maxPoints = 600;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly opts: {
      title: string;
      lineLabels: string[];
      yMin?: number;
      yMax?: number;
      /** optional reference lines (e.g. Walrasian p*). */
      refs?: { value: number; label: string; color?: string }[];
    },
  ) {
    const c = canvas.getContext("2d");
    if (!c) throw new Error("2d context unavailable");
    this.ctx = c;
    this.resize();
  }

  push(tick: number, values: number[]): void {
    this.series.push({ tick, values });
    if (this.series.length > this.maxPoints) this.series.shift();
  }

  reset(): void {
    this.series = [];
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio, 2);
    const w = this.canvas.clientWidth || 320;
    const h = this.canvas.clientHeight || 160;
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(h * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  setRefs(refs: { value: number; label: string; color?: string }[]): void {
    this.opts.refs = refs;
  }

  draw(): void {
    const ctx = this.ctx;
    const W = this.canvas.clientWidth || 320;
    const H = this.canvas.clientHeight || 160;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0d1226";
    ctx.fillRect(0, 0, W, H);

    const padL = 38;
    const padR = 10;
    const padT = 24;
    const padB = 18;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    // y-bounds: explicit or auto from data + refs.
    let yMin = this.opts.yMin ?? Infinity;
    let yMax = this.opts.yMax ?? -Infinity;
    if (this.opts.yMin === undefined || this.opts.yMax === undefined) {
      for (const p of this.series) for (const v of p.values) {
        if (Number.isFinite(v)) {
          yMin = Math.min(yMin, v);
          yMax = Math.max(yMax, v);
        }
      }
      for (const r of this.opts.refs ?? []) {
        yMin = Math.min(yMin, r.value);
        yMax = Math.max(yMax, r.value);
      }
    }
    if (!Number.isFinite(yMin) || !Number.isFinite(yMax) || yMin === yMax) {
      yMin = this.opts.yMin ?? 0;
      yMax = this.opts.yMax ?? 1;
      if (yMin === yMax) yMax = yMin + 1;
    }
    const pad = (yMax - yMin) * 0.08;
    yMin -= pad;
    yMax += pad;

    const x = (i: number): number => padL + (this.series.length <= 1 ? 0 : (i / (this.series.length - 1)) * plotW);
    const y = (v: number): number => padT + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

    // grid
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let g = 0; g <= 4; g++) {
      const yy = padT + (g / 4) * plotH;
      ctx.moveTo(padL, yy);
      ctx.lineTo(W - padR, yy);
    }
    ctx.stroke();

    // axis labels
    ctx.fillStyle = "#8a93b2";
    ctx.font = "10px system-ui, sans-serif";
    ctx.textAlign = "right";
    for (let g = 0; g <= 4; g++) {
      const val = yMax - (g / 4) * (yMax - yMin);
      ctx.fillText(fmt(val), padL - 4, padT + (g / 4) * plotH + 3);
    }

    // reference lines
    for (const r of this.opts.refs ?? []) {
      ctx.strokeStyle = r.color ?? "#ffffff";
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(padL, y(r.value));
      ctx.lineTo(W - padR, y(r.value));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = r.color ?? "#ffffff";
      ctx.textAlign = "left";
      ctx.fillText(r.label, padL + 4, y(r.value) - 3);
    }

    // lines
    const nLines = this.opts.lineLabels.length;
    for (let li = 0; li < nLines; li++) {
      ctx.strokeStyle = GOOD_HEX[li % GOOD_HEX.length];
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < this.series.length; i++) {
        const v = this.series[i].values[li];
        if (!Number.isFinite(v)) continue;
        const px = x(i);
        const py = y(v);
        if (!started) {
          ctx.moveTo(px, py);
          started = true;
        } else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    // title + legend
    ctx.fillStyle = "#dfe5f5";
    ctx.font = "600 12px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(this.opts.title, padL, 14);
    ctx.font = "10px system-ui, sans-serif";
    let lx = padL + ctx.measureText(this.opts.title).width + 14;
    for (let li = 0; li < nLines; li++) {
      ctx.fillStyle = GOOD_HEX[li % GOOD_HEX.length];
      ctx.fillRect(lx, 5, 8, 8);
      ctx.fillStyle = "#9aa4c4";
      ctx.fillText(this.opts.lineLabels[li], lx + 11, 13);
      lx += 16 + ctx.measureText(this.opts.lineLabels[li]).width;
    }
  }
}

function fmt(v: number): string {
  if (Math.abs(v) >= 100) return v.toFixed(0);
  if (Math.abs(v) >= 1) return v.toFixed(2);
  return v.toFixed(3);
}

/** Extract a chart-friendly array of relative prices for goods 1..g-1. */
export function relPriceSeries(agg: Aggregates): number[] {
  const out: number[] = [];
  for (let i = 1; i < agg.relPrices.length; i++) out.push(agg.relPrices[i]);
  return out;
}
