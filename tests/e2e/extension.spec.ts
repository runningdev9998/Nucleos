import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { CORRECT, KHAN_ERROR, mockKhanAcademy } from "./mock-khan";

const WRONG = { username: "nucleos-demo-wrong-user@example.invalid", password: "deliberately-wrong-password" };
const toast = (page: Page) => page.locator("#ka-auto-signin-toast");

function collectLogs(page: Page): string[] {
  const logs: string[] = [];
  page.on("console", (message) => logs.push(message.text()));
  return logs;
}

test("wrong credentials: shows Khan Academy's exact error in a toast and logs it", async ({ launch }) => {
  const context = await launch(WRONG);
  const khan = await mockKhanAcademy(context);
  const page = await context.newPage();
  const logs = collectLogs(page);

  await page.goto("https://www.khanacademy.org/login");

  await expect(toast(page)).toHaveAttribute("data-kind", "error");
  await expect(toast(page).getByTestId("toast-message")).toHaveText(KHAN_ERROR, { useInnerText: true });
  await expect.poll(() => logs.join("\n")).toContain(`Khan Academy said: "${KHAN_ERROR}"`);
  expect(khan.loginRequests).toEqual([WRONG]);
});

test("correct credentials: reports success only after the next page shows a signed-in user", async ({ launch }) => {
  const context = await launch(CORRECT);
  const khan = await mockKhanAcademy(context);
  const page = await context.newPage();
  const logs = collectLogs(page);

  await page.goto("https://www.khanacademy.org/login");

  await expect(page).toHaveURL("https://www.khanacademy.org/");
  await expect(toast(page)).toHaveAttribute("data-kind", "success");
  await expect(toast(page).getByTestId("toast-message")).toHaveText("Signed in as l***@example.com.");
  await expect.poll(() => logs.join("\n")).toContain("Signed in to Khan Academy as l***@example.com");
  expect(khan.loginRequests).toHaveLength(1);
});

test("accepted sign-in that does not show a signed-in page is not reported as success", async ({ launch }) => {
  const context = await launch(CORRECT);
  await mockKhanAcademy(context, { signedInAfterLogin: false });
  const page = await context.newPage();

  await page.goto("https://www.khanacademy.org/login");

  await expect(toast(page)).toHaveAttribute("data-kind", "info", { timeout: 20_000 });
  await expect(toast(page)).toContainText("outcome unknown");
});

test("tries once per visit: no retry on the same page, one new attempt after reloading", async ({ launch }) => {
  const context = await launch(WRONG);
  const khan = await mockKhanAcademy(context);
  const page = await context.newPage();

  await page.goto("https://www.khanacademy.org/login");
  await expect(toast(page)).toHaveAttribute("data-kind", "error");
  await page.waitForTimeout(2_000);
  expect(khan.loginRequests).toHaveLength(1);

  await page.reload();
  await expect(toast(page)).toHaveAttribute("data-kind", "error");
  await page.waitForTimeout(1_000);
  expect(khan.loginRequests).toHaveLength(2);
});

test("stops after three failures in a row to protect the account", async ({ launch }) => {
  const context = await launch(WRONG);
  const khan = await mockKhanAcademy(context);
  const page = await context.newPage();

  for (let visit = 1; visit <= 3; visit++) {
    await page.goto("https://www.khanacademy.org/login");
    await expect(toast(page)).toHaveAttribute("data-kind", "error");
  }
  await page.goto("https://www.khanacademy.org/login");
  await expect(toast(page)).toHaveAttribute("data-kind", "info");
  await expect(toast(page)).toContainText("failed in a row");
  expect(khan.loginRequests).toHaveLength(3);
});

test("does nothing on other Khan Academy pages", async ({ launch }) => {
  const context = await launch(WRONG);
  const khan = await mockKhanAcademy(context);
  const page = await context.newPage();

  await page.goto("https://www.khanacademy.org/math");
  await page.waitForTimeout(2_000);

  await expect(toast(page)).toHaveCount(0);
  expect(khan.loginRequests).toHaveLength(0);
});
