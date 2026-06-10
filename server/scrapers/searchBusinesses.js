const puppeteer = require("puppeteer");
const browserConfig = require("../config/browser");
const blockedDomains = require("../utils/blacklist");

async function searchBusinesses(category, location) {
  // Launch Puppeteer headlessly for reliability in background/server tasks
  const browser = await puppeteer.launch(browserConfig);

  try {
    const page = await browser.newPage();
    
    // Set a modern user agent
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    const searchQuery = `${category} in ${location}`;

    // Navigate to DuckDuckGo HTML search page (bypasses Google's CAPTCHA block on shared IPs)
    await page.goto(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchQuery)}`,
      {
        waitUntil: "domcontentloaded"
      }
    );

    // Wait for search results anchor links
    await page.waitForSelector("a.result__a");

    // Extract search result links
    const rawLinks = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll("a.result__a"));
      return anchors.map((a) => a.href);
    });

    const parsedLinks = [];
    for (const href of rawLinks) {
      if (!href) continue;

      let targetUrl = href;

      // Extract the actual destination URL from the DuckDuckGo redirect query parameters
      if (href.includes("uddg=")) {
        try {
          const urlObj = new URL(href);
          const uddg = urlObj.searchParams.get("uddg");
          if (uddg) {
            targetUrl = uddg;
          }
        } catch (e) {
          // Fallback if URL parsing fails
        }
      }

      // Filter out internal/ad DuckDuckGo links, search engine domains, or blacklisted domains
      const isBlacklisted = blockedDomains.some((domain) => targetUrl.toLowerCase().includes(domain));
      if (
        targetUrl.startsWith("http") &&
        !targetUrl.includes("duckduckgo.com") &&
        !targetUrl.includes("google.com") &&
        !isBlacklisted
      ) {
        parsedLinks.push(targetUrl);
      }
    }

    return parsedLinks.slice(0, 5);
  } catch (error) {
    console.error("Error in searchBusinesses:", error);
    throw error;
  } finally {
    await browser.close();
  }
}

module.exports = searchBusinesses;
