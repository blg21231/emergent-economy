// Validation-anchor overlays for the renderer (AC9 "validated against …"). The APP path may use
// the analytic solver to draw the ruler the model is checked against — this does NOT breach the
// firewall (AC12), which forbids only the agent DECISION cores (production/exchange/money) from
// importing walras. Here we solve the Walrasian p* of the prices economy purely to draw a
// reference line the visitor can watch the emergent prices converge onto.
import { economy } from "../sim/economy";
import { clearingPrice } from "../sim/walras";
import type { EconomyConfig } from "../sim/types";

/** Clearing price vector p* (good 0 = 1) for a config's fundamentals. */
export function walrasianStar(config: EconomyConfig): Float64Array {
  // For a flow economy the fundamentals the market clears each tick are the endowment flow, so
  // solve the clearing problem on a state whose inventory IS that recurring supply.
  const state = economy.create(config);
  if (config.endowmentFlow) {
    for (let i = 0; i < state.agents.length; i++) {
      state.agents[i].inventory = Float64Array.from(config.endowmentFlow[i]);
    }
  }
  return clearingPrice(state, { maxIter: 50000, tol: 1e-9 }).prices;
}
