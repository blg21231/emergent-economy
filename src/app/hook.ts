// window.__ECON__ testability hook (AC8, AC12). It exposes the LIVE rendered economy: getAggregates
// returns exactly the aggregates the on-screen charts render this frame (no separate hidden probe),
// and getAgentPriceInputs returns each agent's local price inputs straight off the driver (which
// are local-trade-history-derived only — AC12c). The setters round-trip through the same
// SimController the UI uses, so the e2e causality magnitudes are read from the real visuals.
import type { Aggregates, EconHook, ParamName } from "../sim/types";
import type { SimController } from "./controls";

export interface EconHookExtra {
  /** Active backend ("webgpu" | "cpu") — lets the e2e confirm the forced CPU fallback path. */
  backend(): string;
  /** Number of agents actually simulated. */
  agentCount(): number;
}

export type WindowEconHook = EconHook & EconHookExtra;

declare global {
  interface Window {
    __ECON__?: WindowEconHook;
  }
}

export function installHook(controller: SimController): WindowEconHook {
  const hook: WindowEconHook = {
    setPaused(paused: boolean): void {
      controller.setPaused(paused);
    },
    isPaused(): boolean {
      return controller.isPaused();
    },
    getAggregates(): Aggregates {
      return controller.aggregates();
    },
    setParam(name: ParamName, value: number | boolean): void {
      // fire-and-forget; the controller rebuilds the driver and the render loop rebinds.
      void controller.setParam(name, value);
    },
    getAgentPriceInputs(): number[][] {
      return controller.getDriver().agentPriceInputs();
    },
    ticks(): number {
      return controller.getDriver().ticks();
    },
    backend(): string {
      return controller.getDriver().backend;
    },
    agentCount(): number {
      return controller.getDriver().agentCount();
    },
  };
  window.__ECON__ = hook;
  return hook;
}
