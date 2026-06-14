// Hash routes / views (AC9, AC11). Each route maps to a view key the app renders. The ledger and
// content panels reference these exact paths, and the e2e ledger/journey walks navigate them.
import type { ViewKey } from "./economies";

export interface RouteDef {
  path: string;
  /** nav label */
  label: string;
  /** economy view this route drives (landing reuses specialization). */
  view: ViewKey;
  /** true for the landing page. */
  landing?: boolean;
}

export const ROUTES: readonly RouteDef[] = [
  { path: "/", label: "Overview", view: "specialization", landing: true },
  { path: "/specialization", label: "Specialization", view: "specialization" },
  { path: "/prices", label: "Prices → p*", view: "prices" },
  { path: "/money", label: "Money", view: "money" },
  { path: "/inequality", label: "Inequality", view: "inequality" },
  { path: "/gravity", label: "Trade gravity", view: "gravity" },
  { path: "/ledger", label: "Ledger", view: "specialization" },
];

export function currentPath(): string {
  const h = window.location.hash.replace(/^#/, "");
  return h === "" ? "/" : h;
}

export function routeFor(path: string): RouteDef {
  return ROUTES.find((r) => r.path === path) ?? ROUTES[0];
}

export function navigate(path: string): void {
  window.location.hash = path;
}

export function onRouteChange(cb: (path: string) => void): void {
  window.addEventListener("hashchange", () => cb(currentPath()));
}
