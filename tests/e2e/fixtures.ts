import { chromium, test as base, type BrowserContext } from "@playwright/test";
import { cpSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DIST = join(import.meta.dirname, "..", "..", "extension", "dist");

type Credentials = { username: string; password: string };

/** A Chromium profile with a fresh copy of the built extension, configured with the given credentials. */
export const test = base.extend<{ launch: (config: Credentials) => Promise<BrowserContext> }>({
  launch: async ({}, use) => {
    const contexts: BrowserContext[] = [];
    await use(async (config) => {
      const extensionDir = mkdtempSync(join(tmpdir(), "ka-ext-"));
      cpSync(DIST, extensionDir, { recursive: true });
      writeFileSync(join(extensionDir, "config.json"), JSON.stringify(config));

      const context = await chromium.launchPersistentContext("", {
        channel: "chromium",
        args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`],
      });
      if (context.serviceWorkers().length === 0) await context.waitForEvent("serviceworker");
      contexts.push(context);
      return context;
    });
    await Promise.all(contexts.map((context) => context.close()));
  },
});

export { expect } from "@playwright/test";
