const puppeteer = require("puppeteer");
const browserConfig = require("../config/browser");
const cheerio = require("cheerio");

/**
 * Generic Directory Scraper
 * Works for any directory listing site (JustDial, IndiaMART, Sulekha, etc.)
 * Extracts: Business Name, Phone, Address, Website from listing pages.
 */

/**
 * Fetch page HTML using Puppeteer (handles JS-rendered content)
 */
async function fetchWithPuppeteer(url) {
  const browser = await puppeteer.launch(browserConfig);

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    // Wait a bit for dynamic content
    await new Promise(r => setTimeout(r, 3000));
    const html = await page.content();
    return html;
  } finally {
    await browser.close();
  }
}

/**
 * Extract phone numbers from text
 */
function extractPhones(text) {
  const phoneRegex = /(\+91[\-\s]?)?[0]?(91)?[6789]\d{9}/g;
  const phones = text.match(phoneRegex) || [];
  return [...new Set(phones.map(p => p.replace(/\s+/g, "")))];
}

/**
 * Extract emails from text
 */
function extractEmails(text) {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/g;
  const emails = text.match(emailRegex) || [];
  // Filter out common non-business emails
  return [...new Set(emails)].filter(e =>
    !e.includes("example.com") &&
    !e.includes("domain.com") &&
    !e.includes("email.com") &&
    !e.includes("sentry") &&
    !e.includes("webpack")
  );
}

/**
 * Generic listing extractor - tries multiple common CSS patterns
 * used by directory sites to render business cards
 */
function extractListings(html, sourceUrl) {
  const $ = cheerio.load(html);
  const leads = [];

  // Common selectors used by directory sites for listing cards
  const cardSelectors = [
    ".result-card",
    ".listing-card",
    ".business-card",
    ".store-card",
    ".card",
    ".list-card",
    ".search-result",
    ".provider-card",
    ".doctor-card",
    ".product-card",
    "[class*='listing']",
    "[class*='result']",
    "[class*='card']"
  ];

  let cards = [];
  for (const selector of cardSelectors) {
    const found = $(selector);
    if (found.length > 2) { // need at least 3 to be real listings
      cards = found;
      console.log(`[DirectoryScraper] Found ${found.length} cards with selector: ${selector}`);
      break;
    }
  }

  // Fallback: treat each <article> or <li> with enough content as a card
  if (cards.length === 0) {
    cards = $("article, li").filter((i, el) => $(el).text().length > 50);
  }

  cards.each((i, el) => {
    const cardText = $(el).text();
    const phones = extractPhones(cardText);
    const emails = extractEmails(cardText);

    // Try to extract business name from common elements
    let businessName = "";
    const nameSelectors = ["h2", "h3", "h4", ".name", ".title", "[class*='name']", "[class*='title']", "a"];
    for (const ns of nameSelectors) {
      const nameEl = $(el).find(ns).first();
      if (nameEl && nameEl.text().trim().length > 2 && nameEl.text().trim().length < 100) {
        businessName = nameEl.text().trim();
        break;
      }
    }

    if (!businessName) return; // skip cards without a name

    // Try to extract address
    let address = "";
    const addrSelectors = [".address", "[class*='address']", "[class*='location']", ".loc"];
    for (const as of addrSelectors) {
      const addrEl = $(el).find(as).first();
      if (addrEl && addrEl.text().trim().length > 5) {
        address = addrEl.text().trim();
        break;
      }
    }

    // Try to extract website link
    let website = "";
    $(el).find("a").each((j, a) => {
      const href = $(a).attr("href") || "";
      if (href.startsWith("http") && !href.includes("justdial") && !href.includes("indiamart")) {
        website = href;
      }
    });

    leads.push({
      businessName,
      phone: phones[0] || "",
      email: emails[0] || "",
      address,
      website,
      source: new URL(sourceUrl).hostname.replace("www.", "")
    });
  });

  return leads;
}

/**
 * Main function: scrape a directory URL and return leads
 */
async function scrapeDirectory(url, maxLeads = 20) {
  console.log(`[DirectoryScraper] Scraping directory: ${url}`);

  try {
    const html = await fetchWithPuppeteer(url);
    if (!html) throw new Error("Empty HTML response");

    const leads = extractListings(html, url);
    console.log(`[DirectoryScraper] Extracted ${leads.length} leads from ${url}`);

    return leads.slice(0, maxLeads);
  } catch (error) {
    console.error(`[DirectoryScraper] Error scraping ${url}:`, error.message);
    return [];
  }
}

module.exports = scrapeDirectory;
