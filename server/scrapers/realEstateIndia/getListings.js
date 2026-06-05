const puppeteer = require("puppeteer");

async function getListings(city) {
  // Launch Puppeteer headlessly for sandbox reliability
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  try {
    const page = await browser.newPage();

    // Set user agent to avoid bot detection
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    const url = `https://www.realestateindia.com/agents-brokers-in-${city.toLowerCase()}.htm`;
    console.log(`[RealEstateIndia] Navigating to: ${url}`);

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });

    // Wait 3 seconds using promise instead of deprecated page.waitForTimeout
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const listings = await page.evaluate(() => {
      const links = [];
      document.querySelectorAll("a").forEach((link) => {
        const href = link.href;
        const rawText = link.innerText;
        const text = rawText ? rawText.replace(/\s+/g, " ").trim() : "";

        // Extract profile links
        if (href && href.includes("/profile/") && !href.includes("#") && text) {
          // Avoid duplicate links in the list
          const exists = links.some((l) => l.profileUrl === href);
          if (!exists) {
            links.push({
              name: text,
              profileUrl: href
            });
          }
        }
      });
      return links;
    });

    return listings;
  } catch (error) {
    console.error("Error in getListings scraper:", error);
    throw error;
  } finally {
    await browser.close();
  }
}

module.exports = getListings;
