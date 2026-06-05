const puppeteer = require("d:/my_pro/synckraft/LeadSync/leadsync/node_modules/puppeteer-extra");
const StealthPlugin = require("d:/my_pro/synckraft/LeadSync/leadsync/node_modules/puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());

async function getProfile(url) {
  console.log(`[Practo] Scraping profile: ${url}`);
  
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  try {
    const page = await browser.newPage();
    
    // Set mobile viewport and user agent to force mobile layout
    await page.setViewport({
      width: 375,
      height: 667,
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2
    });
    await page.setUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1"
    );

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const details = await page.evaluate(() => {
      // 1. Business Name (Doctor Name or Clinic Name)
      let businessName = "";
      const h1 = document.querySelector("h1");
      if (h1) {
        businessName = h1.innerText.trim();
      }

      // 2. Owner Name (if businessName starts with Dr., then ownerName is the same)
      let ownerName = "";
      if (businessName.toLowerCase().startsWith("dr.")) {
        ownerName = businessName;
      }

      // 3. Address
      let address = "";
      // Try targeting address element or class
      const addrEl = document.querySelector("address, [data-qa-id='clinic-address'], .clinic-address");
      if (addrEl) {
        address = addrEl.innerText.trim();
      }

      if (!address) {
        // Find Get Directions link parent context
        const anchors = Array.from(document.querySelectorAll("a"));
        const directionsLink = anchors.find(a => a.innerText?.toLowerCase().includes("get directions"));
        if (directionsLink && directionsLink.parentElement) {
          address = directionsLink.parentElement.innerText.replace(/get directions/i, "").trim();
        }
      }

      // Clean up address "Address" prefix
      if (address) {
        address = address.replace(/^address/i, "").trim();
      }

      // 4. Website
      let website = "";
      const anchors = Array.from(document.querySelectorAll("a"));
      const extLink = anchors.find(a => {
        const href = a.getAttribute("href") || "";
        return href.startsWith("http") && 
               !href.includes("practo.com") && 
               !href.includes("facebook") && 
               !href.includes("twitter") && 
               !href.includes("linkedin") && 
               !href.includes("youtube") && 
               !href.includes("instagram") && 
               !href.includes("google.com");
      });
      if (extLink) website = extLink.getAttribute("href");

      // 5. Phone
      let phone = "";
      const telLinks = anchors
        .map(a => a.getAttribute("href") || "")
        .filter(href => href.startsWith("tel:"));
        
      if (telLinks.length > 0) {
        const rawPhone = telLinks[0].substring(4); // Remove "tel:"
        phone = rawPhone;
        // Format extension if present (e.g. +912071171335,,456)
        if (rawPhone.includes(",,")) {
          const parts = rawPhone.split(",,");
          phone = `${parts[0]} (Ext ${parts[1]})`;
        }
      }

      return { businessName, ownerName, address, website, phone };
    });

    return {
      businessName: details.businessName || "Unknown Practitioner",
      ownerName: details.ownerName || "",
      phone: details.phone || "",
      address: details.address || "",
      website: details.website || "",
      source: "Practo"
    };

  } catch (error) {
    console.error(`[Practo] Error scraping profile ${url}:`, error.message);
    return {
      businessName: "Unknown Practitioner",
      ownerName: "",
      phone: "",
      address: "",
      website: "",
      source: "Practo"
    };
  } finally {
    await browser.close();
  }
}

module.exports = getProfile;
