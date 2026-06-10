const puppeteer = require("puppeteer-extra");
const browserConfig = require("../../config/browser");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());

async function getProfile(url) {
  console.log(`[IndiaMART] Scraping profile: ${url}`);
  
  const browser = await puppeteer.launch(browserConfig);

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    );

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Extract static details first
    const staticDetails = await page.evaluate(() => {
      // 1. Business Name
      let businessName = "";
      const h1 = document.querySelector("h1");
      if (h1) {
        businessName = h1.innerText.trim();
      } else {
        const nameEl = document.querySelector(".company-name, .fn, .first-title");
        if (nameEl) businessName = nameEl.innerText.trim();
      }

      // 2. Address
      let address = "";
      const addrEl = document.querySelector(".footer__address-block, .footer__address-text, .footer__address, address");
      if (addrEl) address = addrEl.innerText.trim();

      // 3. Website
      let website = "";
      const anchors = Array.from(document.querySelectorAll("a"));
      const extLink = anchors.find(a => {
        const href = a.getAttribute("href") || "";
        return href.startsWith("http") && 
               !href.includes("indiamart.com") && 
               !href.includes("facebook") && 
               !href.includes("twitter") && 
               !href.includes("linkedin") && 
               !href.includes("youtube") && 
               !href.includes("instagram");
      });
      if (extLink) website = extLink.getAttribute("href");

      return { businessName, address, website };
    });

    // 4. Click the Call Now button to reveal phone number
    console.log("[IndiaMART] Clicking phone reveal button...");
    const clicked = await page.evaluate(() => {
      const btn = document.querySelector(".phone-reveal-btn, .footer-phone-btn, button.btn-view-mobile, button.phone-reveal-btn");
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });

    let phone = "";

    if (clicked) {
      // Wait 3 seconds for the contact popup to load and render
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Extract the revealed phone number using regex on the updated body text
      const bodyText = await page.evaluate(() => document.body.innerText);
      
      // Look for standard 10-digit or 11-digit Indian numbers
      // IndiaMART local direct dial numbers also start with 080 or other area codes
      const phoneRegex = /(\+91[\-\s]?)?[0]?(91)?[6789]\d{9}|080\d{8}/g;
      const matches = bodyText.match(phoneRegex) || [];
      
      // Filter out support/customer care number "09696969696" or "9696969696"
      const cleanPhones = [...new Set(matches)].filter(num => {
        const clean = num.replace(/[^0-9]/g, "");
        return !clean.includes("9696969696");
      });

      if (cleanPhones.length > 0) {
        phone = cleanPhones[0].trim();
        console.log(`[IndiaMART] Successfully revealed phone: ${phone}`);
      } else {
        console.log("[IndiaMART] Reveal button clicked but no phone matched.");
      }
    } else {
      console.log("[IndiaMART] No phone reveal button found on profile page.");
    }

    return {
      businessName: staticDetails.businessName || "Unknown Supplier",
      phone: phone || "",
      address: staticDetails.address || "",
      website: staticDetails.website || "",
      source: "IndiaMART"
    };

  } catch (error) {
    console.error(`[IndiaMART] Error scraping profile ${url}:`, error.message);
    return {
      businessName: "Unknown Supplier",
      phone: "",
      address: "",
      website: "",
      source: "IndiaMART"
    };
  } finally {
    await browser.close();
  }
}

module.exports = getProfile;
