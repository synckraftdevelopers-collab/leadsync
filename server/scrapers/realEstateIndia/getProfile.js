const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
const extractLeads = require("../extractLeads");

async function getProfile(url) {
  console.log(`[RealEstateIndia] Scraping profile: ${url}`);
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    // Set timeout to 30s
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    
    // Brief sleep to allow dynamic scripts to load
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const html = await page.content();
    const $ = cheerio.load(html);

    let businessName = "";
    let ownerName = "";
    let address = "";
    let city = "";
    let website = "";

    // 1. Extract from JSON-LD schema
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const data = JSON.parse($(el).html());
        if (data["@type"] === "LocalBusiness") {
          businessName = data.name || businessName;
          if (data.address) {
            address = data.address.streetAddress || address;
            city = data.address.addressRegion || data.address.addressLocality || city;
          }
        }
      } catch (e) {
        // Ignore JSON parsing errors
      }
    });

    // Fallback for business name
    if (!businessName) {
      businessName = $("h1").text().trim();
    }

    // 2. Extract from "More information" section
    let infoSection = null;
    $(".page_heading").each((_, el) => {
      if ($(el).text().includes("More information")) {
        infoSection = el;
      }
    });

    if (infoSection) {
      const ul = $(infoSection).nextAll("ul").first();
      if (ul.length > 0) {
        ul.find("li").each((_, li) => {
          const liText = $(li).text().trim();
          const htmlContent = $(li).html();

          // Check for owner name (has user icon class)
          if (htmlContent.includes("fa-user-circle-o")) {
            ownerName = liText;
          }
          // Check for website (has fa-globe icon class)
          else if (htmlContent.includes("fa-globe")) {
            const href = $(li).find("a").attr("href");
            if (href) website = href;
          }
          // Check for address if not populated (has map marker)
          else if (htmlContent.includes("icon-map-marker") || htmlContent.includes("map-marker")) {
            if (!address) address = liText;
          }
        });
      }
    }

    // Fallback website link extraction if not in list
    if (!website) {
      $("a").each((_, el) => {
        const href = $(el).attr("href");
        if (href && !href.includes("realestateindia.com") && !href.includes("javascript") && !href.includes("facebook") && !href.includes("twitter") && !href.includes("youtube") && !href.includes("instagram") && href.startsWith("http")) {
          website = href;
          return false; // Break loop
        }
      });
    }

    // Clean up city
    if (!city && address) {
      // Try to parse city from address (e.g. "Nagpur")
      const lowerAddr = address.toLowerCase();
      if (lowerAddr.includes("nagpur")) city = "Nagpur";
      else if (lowerAddr.includes("mumbai")) city = "Mumbai";
      else if (lowerAddr.includes("pune")) city = "Pune";
      else if (lowerAddr.includes("delhi")) city = "Delhi";
      else if (lowerAddr.includes("noida")) city = "Noida";
      else if (lowerAddr.includes("gurgaon")) city = "Gurgaon";
      else if (lowerAddr.includes("bangalore")) city = "Bangalore";
    }

    let email = "";
    let phone = "";

    // 3. If website is found, run domain extractor to get unmasked phone and email
    if (website && website.startsWith("http")) {
      console.log(`[RealEstateIndia] Crawling agent website: ${website}`);
      try {
        const crawlResult = await extractLeads(website);
        if (crawlResult.emails && crawlResult.emails.length > 0) {
          email = crawlResult.emails[0];
        }
        if (crawlResult.phones && crawlResult.phones.length > 0) {
          phone = crawlResult.phones[0];
        }
      } catch (crawlErr) {
        console.error(`[RealEstateIndia] Domain extraction failed for ${website}:`, crawlErr.message);
      }
    }

    // Fallback regex scan of profile HTML if email/phone are still empty
    if (!email) {
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/g;
      const emails = html.match(emailRegex) || [];
      const cleanEmails = [...new Set(emails)].filter(e => !e.includes("w3.org") && !e.includes("schema.org") && !e.includes("example.com"));
      if (cleanEmails.length > 0) email = cleanEmails[0];
    }

    if (!phone) {
      // Extract unmasked phones if written in description text
      const phoneRegex = /(\+91[\-\s]?)?[0]?(91)?[6789]\d{9}/g;
      const phones = html.match(phoneRegex) || [];
      const cleanPhones = [...new Set(phones)].filter(p => !p.includes("8929175327")); // Exclude support number
      if (cleanPhones.length > 0) phone = cleanPhones[0];
    }

    return {
      businessName: businessName || "Unknown Business",
      ownerName: ownerName || null,
      email: email || null,
      phone: phone || null,
      website: website || null,
      address: address || null,
      city: city || null,
      source: "RealEstateIndia"
    };

  } catch (error) {
    console.error(`[RealEstateIndia] Error scraping profile ${url}:`, error.message);
    return {
      businessName: "Unknown Business",
      ownerName: null,
      email: null,
      phone: null,
      website: null,
      address: null,
      city: null,
      source: "RealEstateIndia"
    };
  } finally {
    await browser.close();
  }
}

module.exports = getProfile;
