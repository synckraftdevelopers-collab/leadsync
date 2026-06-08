const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());

async function getProfile(url) {
  console.log(`[JustDial] Scraping profile: ${url}`);
  
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.platform === "win32"
      ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
      : (process.env.CHROME_PATH || undefined),
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
    await page.setUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1"
    );

    // Try loading the profile page
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const content = await page.content();
    const isBlocked = content.length < 5000 || content.toLowerCase().includes("you are offline");

    if (isBlocked) {
      console.log(`[JustDial] Direct profile load blocked. Using smart URL fallback...`);
      return parseUrlFallback(url);
    }

    const leadData = await page.evaluate(() => {
      // 1. Business Name
      let businessName = "";
      const h1 = document.querySelector("h1");
      if (h1) {
        businessName = h1.innerText.trim();
      } else {
        const nameEl = document.querySelector(".comp-name, .comp-name-txt, .fn, .first-title");
        if (nameEl) businessName = nameEl.innerText.trim();
      }

      // 2. Phone Number
      let phone = "";
      const telLink = document.querySelector('a[href^="tel:"]');
      if (telLink) {
        const href = telLink.getAttribute("href");
        phone = href.replace("tel:", "").replace(/[^0-9]/g, "").trim();
      }

      // 3. Address
      let address = "";
      const addrEl = document.querySelector(".comp-addr, .address, .addr, address, .location-text");
      if (addrEl) {
        address = addrEl.innerText.trim();
      } else {
        // Fallback to map link text
        const mapLink = document.querySelector('a[href*="maps"]');
        if (mapLink) address = mapLink.innerText.trim();
      }

      // 4. Website
      let website = "";
      const webLink = document.querySelector('a[href*="website"], a.website-link');
      if (webLink) {
        website = webLink.getAttribute("href");
      } else {
        // Search for external links
        const anchors = Array.from(document.querySelectorAll("a"));
        const extLink = anchors.find(a => {
          const href = a.getAttribute("href") || "";
          return href.startsWith("http") && !href.includes("justdial.com") && !href.includes("facebook") && !href.includes("twitter") && !href.includes("instagram");
        });
        if (extLink) website = extLink.getAttribute("href");
      }

      return {
        businessName: businessName || "Unknown Business",
        phone: phone || "",
        address: address || "",
        website: website || "",
        source: "JustDial"
      };
    });

    return leadData;

  } catch (error) {
    console.error(`[JustDial] Error scraping profile ${url}:`, error.message);
    return parseUrlFallback(url);
  } finally {
    await browser.close();
  }
}

// Fallback logic to extract clean details from the slug if page is blocked
function parseUrlFallback(url) {
  try {
    const urlObj = new URL(url);
    const parts = urlObj.pathname.split("/").filter(Boolean);
    if (parts.length >= 2) {
      const city = parts[0].replace(/-/g, " ");
      const slug = parts[1];
      
      const fullString = slug.replace(/-/g, " ");
      const landmarkKeywords = ["near", "opposite", "beside", "behind", "above", "below", "opp", "next-to", "in-front-of", "at"];
      
      let name = fullString;
      let address = `${city}, India`;
      
      const slugLower = slug.toLowerCase();
      let splitIndex = -1;
      for (const kw of landmarkKeywords) {
        const idx = slugLower.indexOf(`-${kw}-`);
        if (idx !== -1) {
          splitIndex = idx;
          break;
        }
      }
      
      if (splitIndex !== -1) {
        name = slug.substring(0, splitIndex).replace(/-/g, " ");
        address = slug.substring(splitIndex + 1).replace(/-/g, " ") + `, ${city}`;
      } else {
        const words = fullString.split(" ");
        if (words.length > 4) {
          name = words.slice(0, words.length - 2).join(" ");
          address = words.slice(words.length - 2).join(" ") + `, ${city}`;
        }
      }

      // Format casing to title case
      name = toTitleCase(name);
      address = toTitleCase(address);

      return {
        businessName: name,
        phone: "",
        address: address,
        website: "",
        source: "JustDial"
      };
    }
  } catch (e) {
    // Ignore fallback errors
  }
  return {
    businessName: "Unknown Business",
    phone: "",
    address: "",
    website: "",
    source: "JustDial"
  };
}

function toTitleCase(str) {
  return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
}

module.exports = getProfile;
