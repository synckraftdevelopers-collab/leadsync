const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());

async function getListings(category, city) {
  const cleanCity = city.toLowerCase().trim();
  console.log(`[Practo] Harvesting listings for category: "${category}" in city: "${cleanCity}"`);
  
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.platform === "win32"
      ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
      : (process.env.CHROME_PATH || undefined),
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const listings = [];
  const seenUrls = new Set();

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    );

    // 1. Query DuckDuckGo site search to discover profiles and lists
    const searchQuery = `site:practo.com/${cleanCity} ${category}`;
    const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchQuery)}`;
    console.log(`[Practo] Navigating to DDG site search: ${ddgUrl}`);

    await page.goto(ddgUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForSelector("a.result__a", { timeout: 10000 }).catch(() => {});

    const ddgLinks = await page.evaluate(() => {
      const links = [];
      document.querySelectorAll("a.result__a").forEach(a => {
        const href = a.href;
        let text = a.innerText || "";
        
        // Clean text name
        text = text.replace(/\s*-\s*Book Appointment.*$/i, "");
        text = text.replace(/\s*-\s*Practo$/i, "");
        text = text.trim();
        
        if (href) {
          links.push({ href, text });
        }
      });
      return links;
    });

    console.log(`[Practo] DDG search returned ${ddgLinks.length} raw results.`);

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

      // Validate if it is a doctor/clinic profile page vs a category list page
      const isDoctorOrClinic = cleanUrl.includes(`/${cleanCity}/doctor/`) || 
                               cleanUrl.includes(`/${cleanCity}/clinic/`);

      const isDirectoryUrl = !isDoctorOrClinic && 
                              cleanUrl.startsWith(`https://www.practo.com/${cleanCity}/`) && 
                              cleanUrl.length > `https://www.practo.com/${cleanCity}/`.length;

      if (isDoctorOrClinic) {
        if (!seenUrls.has(cleanUrl)) {
          seenUrls.add(cleanUrl);
          listings.push({ name: link.text, profileUrl: cleanUrl });
        }
      } else if (isDirectoryUrl) {
        directoryUrls.push(cleanUrl);
      }
    }

    console.log(`[Practo] Discovered ${listings.length} direct profiles & ${directoryUrls.length} directories.`);

    // 2. Scrape category directory pages to extract more direct profiles (up to top 2 directories)
    for (const dirUrl of directoryUrls.slice(0, 2)) {
      try {
        console.log(`[Practo] Scraping directory page: ${dirUrl}`);
        await page.goto(dirUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
        await new Promise((resolve) => setTimeout(resolve, 5000));

        const dirListings = await page.evaluate((cleanCity) => {
          const results = [];
          document.querySelectorAll("a").forEach(a => {
            const href = a.href;
            const text = a.innerText?.replace(/\s+/g, " ").trim() || "";
            
            const isDoctorOrClinic = href && (href.includes(`/${cleanCity}/doctor/`) || href.includes(`/${cleanCity}/clinic/`));

            if (isDoctorOrClinic && text.length > 2) {
              results.push({ href, text });
            }
          });
          return results;
        }, cleanCity);

        console.log(`[Practo] Directory page yielded ${dirListings.length} doctor/clinic links.`);
        
        for (const item of dirListings) {
          const cleanUrl = item.href.split("?")[0].split("#")[0];
          if (!seenUrls.has(cleanUrl)) {
            seenUrls.add(cleanUrl);
            listings.push({ name: item.text, profileUrl: cleanUrl });
          }
        }
      } catch (dirErr) {
        console.error(`[Practo] Failed to scrape directory page ${dirUrl}:`, dirErr.message);
      }
    }

  } catch (err) {
    console.error("[Practo] Error harvesting listings:", err.message);
  } finally {
    await browser.close();
  }

  console.log(`[Practo] Total harvested listings count: ${listings.length}`);
  return listings;
}

module.exports = getListings;
