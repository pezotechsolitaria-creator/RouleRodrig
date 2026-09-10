import { test, expect, type Page } from "@playwright/test";

// ── THE TITLE SAID Rs 1,999 AND THE PAGE SAID Rs 1,899 ──────────────────────
//
// On 2026-09-09 I hardcoded "from Rs 1,999/day" into the car page's title,
// having checked it against the fleet that same day. By the next morning the
// owner had repriced the Suzuki Swift to Rs 1,899 — and the title still said
// 1,999 while the body paragraph, which derives from the fleet, correctly said
// 1,899. The page contradicted itself and the half Google shows was the wrong
// half, over-quoting every searcher by Rs 100.
//
// A price a human types in one place and a machine derives in another WILL
// drift. Here it took a day.
//
// So this asserts the thing that actually matters: the number in the <title>
// is the number on the page. Not that the title contains "a price" — that
// passed the whole time it was wrong.

const RENTAL_PAGES = ["/browse/car", "/browse/scooter"] as const;

/** Every "Rs 1,899" / "Rs 1899" in a string, as plain numbers. */
function rupees(text: string): number[] {
  return [...text.matchAll(/Rs\s?([0-9][0-9,]*)/g)].map((m) =>
    Number(m[1].replace(/,/g, "")),
  );
}

async function bodyText(page: Page): Promise<string> {
  const main = page.locator("main").first();
  const t = (await main.count())
    ? await main.innerText()
    : await page.locator("body").innerText();
  return t.replace(/\s+/g, " ");
}

test.use({ viewport: { width: 393, height: 852 } });

for (const path of RENTAL_PAGES) {
  test(`${path}: the price in the title is the cheapest price on the page`, async ({
    page,
  }) => {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);

    const title = await page.title();
    const inTitle = rupees(title);
    expect(inTitle.length, `no price in the title: "${title}"`).toBeGreaterThan(0);

    const onPage = rupees(await bodyText(page));
    expect(onPage.length, `${path} shows no prices at all`).toBeGreaterThan(0);

    const cheapest = Math.min(...onPage);
    expect(
      inTitle[0],
      `title says Rs ${inTitle[0]} but the cheapest car on the page is Rs ${cheapest}`,
    ).toBe(cheapest);
  });

  test(`${path}: the meta description agrees with the title`, async ({ page }) => {
    // They are generated together and shown together. One quoting a different
    // number from the other is the same bug wearing a different hat.
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);

    const title = await page.title();
    const desc =
      (await page
        .locator('meta[name="description"]')
        .getAttribute("content")) ?? "";

    const t = rupees(title);
    const d = rupees(desc);
    expect(d.length, `no price in the meta description: "${desc}"`).toBeGreaterThan(0);
    expect(d[0], `title Rs ${t[0]} vs description Rs ${d[0]}`).toBe(t[0]);
  });

  test(`${path}: the title still fits a search result`, async ({ page }) => {
    // Google truncates around 60 characters. A title carrying a live price can
    // grow when the owner reprices, so this is checked rather than assumed.
    await page.goto(path, { waitUntil: "domcontentloaded" });
    const title = await page.title();
    expect(title.length, `"${title}" is ${title.length} chars`).toBeLessThanOrEqual(65);

    const desc =
      (await page
        .locator('meta[name="description"]')
        .getAttribute("content")) ?? "";
    expect(desc.length, `description is ${desc.length} chars`).toBeLessThanOrEqual(160);
  });
}
