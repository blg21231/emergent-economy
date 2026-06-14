// Exploratory gravity-demo flow map (2D canvas). Draws the regions as discs (radius ∝ economic
// size) on the plane and the realized bilateral trade flows as arcs whose WIDTH ∝ flow value, so
// the visitor SEES near regions exchange thick arcs while far regions thin out — the gravity
// distance decay, made visible. Everything is read from the live driver's tradeFlow + the fitted
// coefficients; nothing is keyframed (C1).
import type { RegionFlow } from "../../sim/gravity";
import { GRAVITY_POSITIONS, GRAVITY_REGION_AGENTS } from "../economies";

const REGION_COLORS = ["#5b8def", "#f5a623", "#2ecc71", "#e056a0", "#22d3ee", "#a78bfa"];

export class GravityMap {
  private readonly ctx: CanvasRenderingContext2D;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D context unavailable");
    this.ctx = ctx;
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth || 600;
    const h = this.canvas.clientHeight || 400;
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(h * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** Draw the regions + flow arcs from the live region-pair flows. */
  draw(flows: RegionFlow[]): void {
    const ctx = this.ctx;
    const w = this.canvas.clientWidth || 600;
    const h = this.canvas.clientHeight || 400;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0b1020";
    ctx.fillRect(0, 0, w, h);

    // map region positions into the canvas with padding.
    const xs = GRAVITY_POSITIONS.map((p) => p[0]);
    const ys = GRAVITY_POSITIONS.map((p) => p[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const pad = 56;
    const sx = (x: number) => pad + ((x - minX) / Math.max(1e-9, maxX - minX)) * (w - 2 * pad);
    const sy = (y: number) => pad + ((y - minY) / Math.max(1e-9, maxY - minY)) * (h - 2 * pad);

    const maxFlow = Math.max(1e-9, ...flows.map((f) => f.flow));

    // arcs (width ∝ flow).
    for (const f of flows) {
      const x1 = sx(GRAVITY_POSITIONS[f.i][0]);
      const y1 = sy(GRAVITY_POSITIONS[f.i][1]);
      const x2 = sx(GRAVITY_POSITIONS[f.j][0]);
      const y2 = sy(GRAVITY_POSITIONS[f.j][1]);
      const t = f.flow / maxFlow;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      // gentle quadratic bow for legibility.
      const mx = (x1 + x2) / 2 + (y2 - y1) * 0.12;
      const my = (y1 + y2) / 2 - (x2 - x1) * 0.12;
      ctx.quadraticCurveTo(mx, my, x2, y2);
      ctx.lineWidth = 0.6 + 7 * t;
      ctx.strokeStyle = `rgba(123,176,255,${0.12 + 0.6 * t})`;
      ctx.stroke();
    }

    // region discs (radius ∝ size = agent count).
    const maxSize = Math.max(...GRAVITY_REGION_AGENTS);
    for (let r = 0; r < GRAVITY_POSITIONS.length; r++) {
      const x = sx(GRAVITY_POSITIONS[r][0]);
      const y = sy(GRAVITY_POSITIONS[r][1]);
      const radius = 8 + 18 * (GRAVITY_REGION_AGENTS[r] / maxSize);
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = REGION_COLORS[r % REGION_COLORS.length];
      ctx.globalAlpha = 0.92;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#0b1020";
      ctx.font = "600 12px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`R${r}`, x, y);
    }
  }
}
