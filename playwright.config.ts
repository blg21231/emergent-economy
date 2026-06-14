import { defineConfig, devices } from "@playwright/test";

const SMOKE_URL = process.env.SMOKE_URL;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: SMOKE_URL ?? "http://localhost:4173",
    trace: "off",
    // Real GPU in headless so WebGL/WebGPU paths and fps gates aren't bottlenecked by SwiftShader.
    launchOptions: {
      args: [
        "--enable-gpu",
        "--ignore-gpu-blocklist",
        "--use-gl=angle",
        "--use-angle=gl-egl",
        "--enable-unsafe-webgpu",
      ],
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // When smoking prod, don't boot a local server.
  webServer: SMOKE_URL
    ? undefined
    : {
        command: "npm run build && npm run preview",
        url: "http://localhost:4173",
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
      },
});
