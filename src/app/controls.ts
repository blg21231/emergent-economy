// Live parameter setters (AC8 causality). The controller owns the active SimDriver and rebuilds it
// from the current parameters whenever a setter changes one — so changing transportCost,
// comparativeAdvantageGap, tradeEnabled, or frictionMode visibly and causally changes the rendered
// economy (the magnitude laws are measured from getAggregates(), the SAME source the charts read).
//
// MUTATION M6 (AC8): the transportCost setter below applies the cost to the live sim. The pinned
// `from` string for M6 is the line marked `// M6-ANCHOR` — decoupling it from the rebuild makes
// trade volume stop responding to the slider and the transport causality e2e limb fails.
import type { Aggregates, EconomyConfig, FrictionMode, SimDriver } from "../sim/types";
import { createDriver } from "../sim/gpu";
import {
  gravityConfig,
  inequalityConfig,
  moneyConfig,
  pricesConfig,
  specializationConfig,
  type ViewKey,
} from "./economies";

export interface SimParams {
  view: ViewKey;
  transportCost: number; // 0..1
  comparativeAdvantageGap: number; // 0..1 (specialization view)
  tradeEnabled: boolean;
  frictionMode: FrictionMode; // money view
}

export const DEFAULT_PARAMS: SimParams = {
  view: "specialization",
  transportCost: 0,
  comparativeAdvantageGap: 0.8,
  tradeEnabled: true,
  frictionMode: "money",
};

/** Build the EconomyConfig for the current view from the live parameters. */
export function configFor(p: SimParams): EconomyConfig {
  switch (p.view) {
    case "prices":
      return pricesConfig(p.transportCost, p.tradeEnabled);
    case "money":
      return moneyConfig(p.frictionMode, p.transportCost, p.tradeEnabled);
    case "inequality":
      return inequalityConfig(p.transportCost, p.tradeEnabled);
    case "gravity":
      return gravityConfig(p.transportCost, p.tradeEnabled);
    case "specialization":
    default:
      return specializationConfig(p.comparativeAdvantageGap, p.transportCost, p.tradeEnabled);
  }
}

export interface ControllerOptions {
  backend?: "webgpu" | "cpu" | "auto";
  scale?: number;
  /** Called whenever the driver is (re)built, so the renderer can rebind to the new sim. */
  onRebuild?: (driver: SimDriver) => void;
}

/** Owns the active driver + the live parameters; rebuilds on parameter change. */
export class SimController {
  private params: SimParams;
  private driver: SimDriver | null = null;
  private paused = false;
  private readonly opts: ControllerOptions;

  constructor(params: Partial<SimParams> = {}, opts: ControllerOptions = {}) {
    this.params = { ...DEFAULT_PARAMS, ...params };
    this.opts = opts;
  }

  /** Build the initial driver. Async because the GPU path may probe capabilities. */
  async init(): Promise<void> {
    await this.rebuild();
  }

  getParams(): SimParams {
    return { ...this.params };
  }

  getDriver(): SimDriver {
    if (!this.driver) throw new Error("SimController.init() not called");
    return this.driver;
  }

  isPaused(): boolean {
    return this.paused;
  }

  setPaused(p: boolean): void {
    this.paused = p;
  }

  /** Advance one tick unless paused (called by the render loop). */
  tick(): void {
    if (!this.paused && this.driver) this.driver.step();
  }

  aggregates(): Aggregates {
    return this.getDriver().aggregates();
  }

  // ── live parameter setters (AC8) ───────────────────────────────────────────

  setTransportCost(value: number): Promise<void> {
    this.params.transportCost = clamp01(value); // M6-ANCHOR: transport cost feeds the rebuilt sim.
    return this.rebuild();
  }

  setComparativeAdvantageGap(value: number): Promise<void> {
    this.params.comparativeAdvantageGap = clamp01(value);
    return this.rebuild();
  }

  setTradeEnabled(value: boolean): Promise<void> {
    this.params.tradeEnabled = value;
    return this.rebuild();
  }

  setFrictionMode(value: FrictionMode): Promise<void> {
    this.params.frictionMode = value;
    return this.rebuild();
  }

  setView(view: ViewKey): Promise<void> {
    this.params.view = view;
    return this.rebuild();
  }

  /** Generic setter used by the __ECON__ hook (AC8 setParam). */
  setParam(name: string, value: number | boolean): Promise<void> {
    switch (name) {
      case "transportCost":
        return this.setTransportCost(Number(value));
      case "comparativeAdvantageGap":
        return this.setComparativeAdvantageGap(Number(value));
      case "tradeEnabled":
        return this.setTradeEnabled(Boolean(value));
      case "frictionMode":
        // numeric/string tolerated; map known modes by index for the hook.
        return this.setFrictionMode(asFrictionMode(value));
      default:
        return Promise.resolve();
    }
  }

  dispose(): void {
    this.driver?.dispose();
    this.driver = null;
  }

  /** Rebuild the driver from the current parameters and notify the renderer. */
  private async rebuild(): Promise<void> {
    const cfg = configFor(this.params);
    const next = await createDriver(cfg, { backend: this.opts.backend, scale: this.opts.scale });
    this.driver?.dispose();
    this.driver = next;
    this.opts.onRebuild?.(next);
  }
}

function clamp01(x: number): number {
  if (Number.isNaN(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

const FRICTION_BY_INDEX: FrictionMode[] = ["market", "barter", "money", "none"];
function asFrictionMode(v: number | boolean): FrictionMode {
  if (typeof v === "number") return FRICTION_BY_INDEX[Math.max(0, Math.min(3, Math.round(v)))];
  return v ? "money" : "barter";
}
