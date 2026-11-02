import { test, expect } from "@playwright/test";
test.skip(!process.env.NEXT_PUBLIC_SUPABASE_URL, 'Browser tests require configured Supabase Google authentication.');
import { networkInterfaces } from "node:os";
test("HTTP LAN supports guest sessions, room actions and invitations", async ({
  page,
  baseURL,
}) => {
  const address = Object.values(networkInterfaces())
    .flat()
    .find(
      (a) =>
        a?.family === "IPv4" &&
        !a.internal &&
        !a.address.startsWith("169.254."),
    )?.address;
  test.skip(!address, "No LAN interface available");
  const url = new URL(baseURL!);
  url.hostname = address!;
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url.href);
  expect(await page.evaluate(() => isSecureContext)).toBe(false);
  expect(await page.evaluate(() => typeof crypto.randomUUID)).toBe("undefined");
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
  await page.getByLabel("Your table name").fill("LAN guest");
  await page.getByRole("button", { name: "Create a private table" }).click();
  await expect(
    page.getByRole("heading", { name: "Good company incoming." }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Copy invite/ }).click();
  await expect(page.getByLabel("Invitation link")).toHaveValue(
    new RegExp(address!.replaceAll(".", "\\.")),
  );
  await page.getByRole("button", { name: "+ Add a bot" }).click();
  await expect(page.locator(".seat")).toHaveCount(1);
  const token = await page.evaluate(() =>
    localStorage.getItem("thulla-session"),
  );
  await page.reload();
  await expect(page.locator(".seat")).toHaveCount(1);
  expect(
    await page.evaluate(() => localStorage.getItem("thulla-session")),
  ).toBe(token);
  expect(errors).toEqual([]);
});
test("PWA assets and offline fallback", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const manifest = await (
    await page.request.get("/manifest.webmanifest")
  ).json();
  expect(manifest.display).toBe("standalone");
  expect((await page.request.get("/icon-512.png")).ok()).toBe(true);
  await context.setOffline(true);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your seat is still yours." }),
  ).toBeVisible();
  await context.setOffline(false);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: /Your people/ }),
  ).toBeVisible();
});
for (const width of [320, 375, 390, 430, 768, 1280])
  test(`mobile foundation fits ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /Your people/ }),
    ).toBeVisible();
    await expect(page.getByText("Connected", { exact: true })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByLabel("Your table name").fill("A very long guest name");
    await page.getByRole("button", { name: "Create a private table" }).click();
    await expect(
      page.getByRole("heading", { name: "Good company incoming." }),
    ).toBeVisible();
    for (let i = 0; i < 7; i++) {
      await page.getByRole("button", { name: "+ Add a bot" }).click();
      await expect(page.locator(".seat")).toHaveCount(i + 1);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "I’m ready" }).click();
    await page.getByRole("button", { name: "Deal the cards" }).click();
    await expect(page.locator(".hand .card")).not.toHaveCount(0);
    await expect(page.locator('.circle-table')).toBeVisible();
    await expect(page.locator('.hidden-hand')).toHaveCount(7);
    expect(await page.locator('.seat .card').count()).toBe(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width === 390)
      await page.screenshot({
        path: "test-results/mobile-game.png",
        fullPage: true,
      });
  });
test("select then play, reconnect and modal", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
  await page.getByLabel("Your table name").fill("Tester");
  await page.getByRole("button", { name: "Create a private table" }).click();
  for (let i = 0; i < 2; i++) {
    await page.getByRole("button", { name: "+ Add a bot" }).click();
    await expect(page.locator(".seat")).toHaveCount(i + 1);
  }
  await page.getByRole("button", { name: "I’m ready" }).click();
  await page.getByRole("button", { name: "Deal the cards" }).click();
  await expect(page.getByRole("heading", { name: "Your move." })).toBeVisible({
    timeout: 15000,
  });
  const before = await page.locator(".hand .card").count();
  await page.locator(".hand .card:not([disabled])").first().click();
  await expect(page.getByRole("button", { name: "Play card" })).toBeEnabled();
  await page.getByRole("button", { name: "Play card" }).click();
  await expect(page.locator(".hand .card")).toHaveCount(before - 1);
  await page.reload();
  await expect(page.locator(".table")).toBeVisible();
  await expect(page.locator(".hand .card")).not.toHaveCount(0);
  await page.getByRole("button", { name: "How to play" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close rules" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
});
