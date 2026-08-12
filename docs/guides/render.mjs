// Render the operator guides to PDF with the Chromium that Playwright already
// ships. No new dependency, and the same engine the site is tested in.
//
// Deliberately NOT screenshots of the live admin: a real order card carries a
// customer's name, phone number and delivery address, and a PDF gets forwarded.
// Each screen is drawn from the real component code instead.
import { chromium } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const DOCS = [
  ["restaurant-guide.html", "Roule-Rodrigues-Restaurant-Guide.pdf"],
  ["marketplace-guide.html", "Roule-Rodrigues-Marketplace-Guide.pdf"],
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [src, out] of DOCS) {
  await page.goto(pathToFileURL(resolve("docs/guides", src)).href, { waitUntil: "load" });
  await page.pdf({
    path: resolve("docs/guides", out),
    format: "A4",
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: "<div></div>",
    footerTemplate:
      '<div style="width:100%;font-size:8pt;color:#767b84;padding:0 14mm;font-family:Segoe UI,sans-serif;">' +
      '<span style="float:left">Roulé Rodrigues</span>' +
      '<span style="float:right">Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>',
    margin: { top: "16mm", bottom: "18mm", left: "14mm", right: "14mm" },
  });
  console.log("wrote", out);
}
await browser.close();
