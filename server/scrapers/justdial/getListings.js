const puppeteer = require("d:/my_pro/synckraft/LeadSync/leadsync/node_modules/puppeteer-extra");
const StealthPlugin = require("d:/my_pro/synckraft/LeadSync/leadsync/node_modules/puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());

async function getListings(category, city) {
  const categoryClean = category.toLowerCase().trim().replace(/\s+/g, "-");
  const cityClean = city.toLowerCase().trim();
  
  // Format category to be plural if it is not (JustDial commonly uses plurals)
  let categoryPlural = categoryClean;
  if (!categoryClean.endsWith("s") && !categoryClean.endsWith("es")) {
    if (categoryClean.endsWith("y")) {
      categoryPlural = categoryClean.slice(0, -1) + "ies";
    } else {
      categoryPlural = categoryClean + "s";
    }
  }

  const jdUrl = `https://t.justdial.com/${cityClean}/${categoryPlural}`;
  console.log(`[JustDial] Navigating to listings: ${jdUrl}`);

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
    await page.setUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1"
    );

    // Navigate to JustDial mobile search page
    await page.goto(jdUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    
    // Wait for page load settle (up to 8 seconds)
    await new Promise((resolve) => setTimeout(resolve, 8000));

    const content = await page.content();
    const isOffline = content.toLowerCase().includes("you are offline") || content.length < 50000;

    let listings = [];

    if (!isOffline) {
      console.log(`[JustDial] Direct mobile page loaded successfully. Extracting listings...`);
      listings = await page.evaluate(() => {
        const results = [];
        // Match mobile list elements
        const cards = document.querySelectorAll(".resultlist__li, .resultlist");
        cards.forEach((card) => {
          const nameEl = card.querySelector(".resultlist--nametxt");
          if (!nameEl) return;
          const name = nameEl.innerText.trim();
          
          // Find anchor tag for profile URL
          const anchor = card.querySelector("a");
          let href = anchor ? anchor.getAttribute("href") : "";
          if (href && !href.startsWith("http")) {
            // Strip out search params to make a clean relative/absolute URL
            const cleanHref = href.split("?")[0];
            href = `https://t.justdial.com${cleanHref}`;
          }

          if (name && href && !results.some(r => r.profileUrl === href)) {
            results.push({ name, profileUrl: href });
          }
        });
        return results;
      });
    }

    // Fallback to DuckDuckGo site search if blocked or zero listings found
    if (listings.length === 0) {
      console.log(`[JustDial] Direct page returned empty/blocked. Falling back to DuckDuckGo site search...`);
      
      const searchQuery = `site:justdial.com ${city} ${category}`;
      const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchQuery)}`;
      
      await page.goto(ddgUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForSelector("a.result__a", { timeout: 10000 }).catch(() => {});

      listings = await page.evaluate(() => {
        const results = [];
        document.querySelectorAll("a.result__a").forEach((a) => {
          const href = a.href;
          let text = a.innerText || "";
          
          // Clean business name
          text = text.replace(/,\s*[^,]+,\s*[^,]+\s*-\s*Justdial$/i, "");
          text = text.replace(/\s*-\s*Justdial$/i, "");
          text = text.trim();

          if (href) {
            let cleanUrl = "";
            if (href.includes("uddg=")) {
              try {
                const match = href.match(/[?&]uddg=([^&]+)/);
                if (match) {
                  cleanUrl = decodeURIComponent(match[1]);
                }
              } catch (e) {
                // Ignore decoding errors
              }
            } else if (href.includes("justdial.com/")) {
              cleanUrl = href;
            }

            if (cleanUrl) {
              // Standardise to mobile subdomain and strip query params
              cleanUrl = cleanUrl.replace("www.justdial.com", "t.justdial.com").split("?")[0].split("#")[0];
              
              // Validate that the URL points to an actual business profile page, not a category/list page
              const isProfile = cleanUrl.includes("020PXX") || 
                                cleanUrl.includes("/detail/") || 
                                (cleanUrl.split("/").filter(Boolean).length >= 3 && 
                                 !cleanUrl.includes("/nct-") && 
                                 !cleanUrl.toLowerCase().includes("collection") && 
                                 !cleanUrl.toLowerCase().endsWith("/restaurants") && 
                                 !cleanUrl.toLowerCase().endsWith("/gyms") && 
                                 !cleanUrl.toLowerCase().endsWith("/salons"));

              if (isProfile && text && !results.some(r => r.profileUrl === cleanUrl)) {
                results.push({ name: text, profileUrl: cleanUrl });
              }
            }
          }
        });
        return results;
      });
    }

    console.log(`[JustDial] Extracted ${listings.length} listings.`);
    return listings;

  } catch (error) {
    console.error("[JustDial] Error in getListings scraper:", error.message);
    return [];
  } finally {
    await browser.close();
  }
}

module.exports = getListings;
