import { test, expect, type Page } from "@playwright/test";

// ── Booking form accessibility ───────────────────────────────────────────────
//
// Every assertion here corresponds to something that was actually broken, found
// by reading the computed accessibility tree on production rather than by
// eyeballing the markup:
//
//   • The phone field had NO accessible name at all. Its <label> carried no
//     htmlFor and PhoneInput's <input type="tel"> had no id — a screen reader
//     announced an unlabelled edit box in the middle of a booking form.
//   • "SELECT YOUR DATES" was a <label> naming nothing, because a <label> can
//     only name a form control and the calendar is a group of buttons.
//   • The country picker never announced that it opened a popup, or whether it
//     was open.
//   • Calendar days announced the bare ISO string ("2026-08-15") and exposed
//     their state — bookable, taken, chosen — through colour alone.
//   • No field declared its purpose, so nothing could autofill a booking.
//
// These are cheap to reintroduce and invisible in review, which is why they are
// asserted rather than described.

const BOOKING = "/browse/scooter";

async function bookingForm(page: Page) {
  await page.goto(BOOKING);
  const form = page.locator("form").filter({ has: page.locator("#bk-vehicle") }).first();
  await expect(form).toBeVisible();
  return form;
}

test.describe("booking form accessibility", () => {
  test("every control has an accessible name", async ({ page }) => {
    const form = await bookingForm(page);

    const unnamed = await form.evaluate((f: HTMLFormElement) =>
      [...f.querySelectorAll("input, select, textarea")]
        .filter((el) => {
          if (el.getAttribute("aria-label") || el.getAttribute("aria-labelledby")) return false;
          if (el.id && f.ownerDocument.querySelector(`label[for="${el.id}"]`)) return false;
          return !el.closest("label");
        })
        .map((el) => `${el.tagName.toLowerCase()}[${(el as HTMLInputElement).type ?? ""}]`),
    );

    expect(unnamed, "form controls with no accessible name").toEqual([]);
  });

  test("no label points at nothing", async ({ page }) => {
    const form = await bookingForm(page);

    const orphans = await form.evaluate((f: HTMLFormElement) =>
      [...f.querySelectorAll("label")]
        .filter((l) => {
          const target = l.getAttribute("for");
          if (target) return !f.ownerDocument.getElementById(target);
          return !l.querySelector("input, select, textarea");
        })
        .map((l) => (l.textContent ?? "").trim().slice(0, 40)),
    );

    expect(orphans, "labels naming no control").toEqual([]);
  });

  test("the contact fields declare their purpose for autofill", async ({ page }) => {
    const form = await bookingForm(page);

    await expect(form.locator("#bk-name")).toHaveAttribute("autocomplete", "name");
    await expect(form.locator("#bk-email")).toHaveAttribute("autocomplete", "email");
    await expect(form.locator("#bk-phone")).toHaveAttribute("autocomplete", "tel");
  });

  test("the phone field is named by its visible label", async ({ page }) => {
    const form = await bookingForm(page);

    const phone = form.locator("#bk-phone");
    await expect(phone).toHaveCount(1);
    // getByLabel resolves through the accessibility tree, so this passes only
    // if the association really works.
    await expect(form.getByLabel(/phone/i)).toBeVisible();
  });

  test("the date picker is an announced group, not an orphan label", async ({ page }) => {
    const form = await bookingForm(page);

    const group = form.locator('[role="group"][aria-labelledby]');
    await expect(group).toHaveCount(1);

    const labelId = await group.getAttribute("aria-labelledby");
    await expect(page.locator(`#${labelId}`)).toHaveText(/dates/i);
  });

  test("the country picker announces that it opens a popup, and its state", async ({ page }) => {
    const form = await bookingForm(page);

    const picker = form.locator('button[aria-label="Select country code"]');
    await expect(picker).toHaveAttribute("aria-haspopup", "listbox");
    await expect(picker).toHaveAttribute("aria-expanded", "false");

    await picker.click();
    await expect(picker).toHaveAttribute("aria-expanded", "true");
    // The search box inside is named too — a placeholder is not a name.
    await expect(form.getByLabel(/search country/i)).toBeVisible();
  });

  test("calendar days announce a readable date and their state", async ({ page }) => {
    const form = await bookingForm(page);

    const days = form.locator("button[aria-pressed]");
    await expect(days.first()).toBeVisible();

    // Not the bare ISO string: a real weekday and month name.
    const label = await days.first().getAttribute("aria-label");
    expect(label, "day label should be human readable").toMatch(
      /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\b/i,
    );
    expect(label, "day label should not be a bare ISO date").not.toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Choosing a range exposes selection through ARIA, not only through colour.
    const open = form.locator('button[aria-pressed="false"]:not([disabled])');
    await open.first().click();
    await expect(form.locator('button[aria-pressed="true"]')).not.toHaveCount(0);
  });
});
