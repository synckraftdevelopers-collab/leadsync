const puppeteer = require("puppeteer-extra");
const browserConfig = require("../../config/browser");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());

async function getListings(category, city) {
  console.log(`[IndiaMART] Harvesting listings for category: "${category}" in city: "${city}"`);
  
  const browser = await puppeteer.launch(browserConfig);

  const listings = [];
  const seenUrls = new Set();

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    );

    // 1. Query DuckDuckGo site search to discover categories and direct profiles
    const searchQuery = `site:indiamart.com ${city} ${category}`;
    const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchQuery)}`;
    console.log(`[IndiaMART] Navigating to DDG site search: ${ddgUrl}`);

    await page.goto(ddgUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForSelector("a.result__a", { timeout: 10000 }).catch(() => {});

    const ddgLinks = await page.evaluate(() => {
      const links = [];
      document.querySelectorAll("a.result__a").forEach(a => {
        const href = a.href;
        let text = a.innerText || "";
        
        // Clean text name
        text = text.replace(/\s*-\s*IndiaMART$/i, "");
        text = text.replace(/,\s*[^,]+,\s*[^,]+\s*$/i, "");
        text = text.trim();
        
        if (href) {
          links.push({ href, text });
        }
      });
      return links;
    });

    console.log(`[IndiaMART] DDG search returned ${ddgLinks.length} raw results.`);

    const directoryUrls = [];

    // Parse DDG links to identify direct profiles and directories
    for (const link of ddgLinks) {
      let cleanUrl = "";
      if (link.href.includes("uddg=")) {
        try {
          const match = link.href.match(/[?&]uddg=([^&]+)/);
          if (match) cleanUrl = decodeURIComponent(match[1]);
        } catch (e) {
          // Ignore
        }
      } else {
        cleanUrl = link.href;
      }

      if (!cleanUrl) continue;
      
      // Remove query parameters/hash
      cleanUrl = cleanUrl.split("?")[0].split("#")[0];

      // Validate if it is a company profile page vs a category directory page
      const isCompanyUrl = cleanUrl.startsWith("https://www.indiamart.com/") && 
                           !cleanUrl.includes("dir.indiamart.com") && 
                           !cleanUrl.includes("buyer.indiamart.com") && 
                           !cleanUrl.includes("help.indiamart.com") && 
                           !cleanUrl.includes("seller.indiamart.com") && 
                           !cleanUrl.includes("corporate.indiamart.com") && 
                           !cleanUrl.includes("/proddetail/") && 
                           cleanUrl.length > "https://www.indiamart.com/".length + 2;

      const isDirectoryUrl = cleanUrl.includes("dir.indiamart.com");

      if (isCompanyUrl) {
        if (!seenUrls.has(cleanUrl)) {
          seenUrls.add(cleanUrl);
          listings.push({ name: link.text, profileUrl: cleanUrl });
        }
      } else if (isDirectoryUrl) {
        directoryUrls.push(cleanUrl);
      }
    }

    console.log(`[IndiaMART] Discovered ${listings.length} direct profiles & ${directoryUrls.length} directories.`);

    // 2. Scrape category directory pages to extract more direct profiles (up to top 2 directories)
    for (const dirUrl of directoryUrls.slice(0, 2)) {
      try {
        console.log(`[IndiaMART] Scraping directory page: ${dirUrl}`);
        await page.goto(dirUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
        await new Promise((resolve) => setTimeout(resolve, 5000));

        const dirListings = await page.evaluate(() => {
          const results = [];
          // Target classes used in IndiaMART directory pages
          document.querySelectorAll("a").forEach(a => {
            const href = a.href;
            const text = a.innerText?.replace(/\s+/g, " ").trim() || "";
            const className = a.className || "";
            
            const isCompanyUrl = href && 
                                 href.startsWith("https://www.indiamart.com/") && 
                                 !href.includes("dir.indiamart.com") && 
                                 !href.includes("buyer.indiamart.com") && 
                                 !href.includes("help.indiamart.com") && 
                                 !href.includes("seller.indiamart.com") && 
                                 !href.includes("corporate.indiamart.com") && 
                                 !href.includes("/proddetail/") && 
                                 href.length > "https://www.indiamart.com/".length + 2;

            const hasSellerClass = className.includes("seller") || className.includes("company-name");

            if (isCompanyUrl && (hasSellerClass || text.length > 2)) {
              results.push({ href, text });
            }
          });
          return results;
        });

        console.log(`[IndiaMART] Directory page yielded ${dirListings.length} suppliers.`);
        
        for (const item of dirListings) {
          const cleanUrl = item.href.split("?")[0].split("#")[0];
          if (!seenUrls.has(cleanUrl)) {
            seenUrls.add(cleanUrl);
            listings.push({ name: item.text, profileUrl: cleanUrl });
          }
        }
      } catch (dirErr) {
        console.error(`[IndiaMART] Failed to scrape directory page ${dirUrl}:`, dirErr.message);
      }
    }

  } catch (err) {
    console.error("[IndiaMART] Error harvesting listings:", err.message);
  } finally {
    await browser.close();
  }

  console.log(`[IndiaMART] Total harvested listings count: ${listings.length}`);
  return listings;
}

module.exports = getListings;
