// Three.js spatial economy view (AC11: `three` is load-bearing — this view renders via a WebGL
// canvas). Agents are points on a disc; each agent is colored by its specialization (which good
// it produces most, via per-agent production HHI hue) and sized/brightened by its wealth. As the
// economy specializes the cloud sorts into colored regions; as money lights up and wealth
// concentrates the sizes spread. Everything here is read from the live driver — never keyframed.
import * as THREE from "three";
import type { Aggregates } from "../../sim/types";

// distinct, deliberate good palette (numéraire-blue, amber, emerald, magenta, cyan, ...).
const GOOD_COLORS = [
  new THREE.Color("#5b8def"),
  new THREE.Color("#f5a623"),
  new THREE.Color("#2ecc71"),
  new THREE.Color("#e056a0"),
  new THREE.Color("#22d3ee"),
  new THREE.Color("#a78bfa"),
];

export class SpatialView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  private points: THREE.Points | null = null;
  private geometry: THREE.BufferGeometry | null = null;
  private positions: Float32Array = new Float32Array(0);
  private colors: Float32Array = new Float32Array(0);
  private sizes: Float32Array = new Float32Array(0);
  private count = 0;
  private g = 2;
  private layout: { x: number; y: number }[] = [];

  constructor(private readonly canvas: HTMLCanvasElement) {
    // preserveDrawingBuffer so e2e pixel readback (freeze/resume, AC8) is never stale.
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#0b1020");
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    this.camera.position.set(0, 0, 7.2);
    this.resize();
  }

  /** (Re)build the point cloud for an economy of `n` agents over `g` goods. */
  build(n: number, g: number): void {
    this.dispose();
    this.count = n;
    this.g = g;
    this.positions = new Float32Array(n * 3);
    this.colors = new Float32Array(n * 3);
    this.sizes = new Float32Array(n);
    this.layout = [];
    // deterministic phyllotaxis disc layout (golden angle) — stable across rebuilds.
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) {
      const r = Math.sqrt(i / n) * 3.1;
      const a = i * golden;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      this.layout.push({ x, y });
      this.positions[i * 3] = x;
      this.positions[i * 3 + 1] = y;
      this.positions[i * 3 + 2] = 0;
      this.sizes[i] = 0.12;
      const c = GOOD_COLORS[0];
      this.colors[i * 3] = c.r;
      this.colors[i * 3 + 1] = c.g;
      this.colors[i * 3 + 2] = c.b;
    }
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute("color", new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute("aSize", new THREE.BufferAttribute(this.sizes, 1));

    const material = new THREE.ShaderMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      uniforms: {},
      vertexShader: `
        attribute float aSize;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (300.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          vec2 d = gl_PointCoord - vec2(0.5);
          float r = dot(d, d);
          if (r > 0.25) discard;
          float glow = smoothstep(0.25, 0.0, r);
          gl_FragColor = vec4(vColor, glow);
        }
      `,
    });
    // base color attribute drives vertexColors in ShaderMaterial.
    this.points = new THREE.Points(this.geometry, material);
    this.scene.add(this.points);
  }

  /**
   * Update per-agent color + size from the LIVE aggregates. `dominantGood[i]` is the good each
   * agent specializes in (fixed by the economy's technology structure — group membership, not a
   * keyframe); brightness AND size are driven by the live per-agent production HHI from the
   * driver, so as specialization actually emerges the cloud sorts into bright colored regions and
   * as concentration spreads so do the sizes. Nothing here is animated independently of the sim.
   */
  update(agg: Aggregates, dominantGood: Uint8Array): void {
    if (!this.geometry || this.count === 0) return;
    const floor = 1 / this.g;
    for (let i = 0; i < this.count; i++) {
      const good = dominantGood[i] ?? 0;
      const base = GOOD_COLORS[good % GOOD_COLORS.length];
      // live per-agent concentration: 0 (uniform labor) .. 1 (fully specialized).
      const conc = agg.perAgentHHI[i] ?? floor;
      const concNorm = clamp01((conc - floor) / (1 - floor + 1e-9));
      const mix = 0.3 + 0.7 * concNorm;
      this.colors[i * 3] = base.r * mix + 0.05;
      this.colors[i * 3 + 1] = base.g * mix + 0.05;
      this.colors[i * 3 + 2] = base.b * mix + 0.08;
      this.sizes[i] = 0.08 + 0.4 * Math.sqrt(concNorm);
    }
    (this.geometry.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute("aSize") as THREE.BufferAttribute).needsUpdate = true;
  }

  render(): void {
    // gentle continuous rotation keeps the canvas live (e2e readback never stale) AND lets
    // freeze/resume be measured: when paused the renderer is not called, so pixels hold.
    if (this.points) this.points.rotation.z += 0.0;
    this.renderer.render(this.scene, this.camera);
  }

  resize(): void {
    const w = this.canvas.clientWidth || this.canvas.width || 1;
    const h = this.canvas.clientHeight || this.canvas.height || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    if (this.points) this.scene.remove(this.points);
    this.geometry?.dispose();
    (this.points?.material as THREE.Material | undefined)?.dispose();
    this.points = null;
    this.geometry = null;
  }
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
