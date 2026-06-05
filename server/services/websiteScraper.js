const axios = require("axios");
const cheerio = require("cheerio");

/**
 * Generic Website Scraper
 * Works for any individual business website (companywebsite.com)
 * Extracts: Email, Phone, Contact Page, Business Name
 */

const REQUEST_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
};

/**
 * Fetch a page with axios (fast, no JS rendering)
 */
async function fetchPage(url) {
  try {
    const { data } = await axios.get(url, {
      timeout: 8000,
      headers: REQUEST_HEADERS,
      maxRedirects: 3
    });
    return data;
  } catch (e) {
    return null;
  }
}

/**
 * Extract emails from text
 */
function extractEmails(text) {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/g;
  const emails = text.match(emailRegex) || [];
  return [...new Set(emails)].filter(e =>
    !e.includes("example.com") &&
    !e.includes("domain.com") &&
    !e.includes("email.com") &&
    !e.includes("sentry") &&
    !e.includes("webpack") &&
    !e.includes("wixpress") &&
    !e.includes("placeholder")
  );
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
 * Find contact/about page URLs from the homepage
 */
function findContactPages($, baseUrl, hostname) {
  const contactUrls = new Set();

  $("a").each((i, el) => {
    let href = $(el).attr("href");
    if (!href) return;
    href = href.trim();
    const text = $(el).text().trim().toLowerCase();

    const isContact = /(contact|about|team|reach|get.?in.?touch)/i.test(href) ||
                      /(contact|about|team|reach|get.?in.?touch)/i.test(text);

    if (isContact) {
      try {
        let absoluteUrl = href;
        if (href.startsWith("/")) {
          absoluteUrl = `${baseUrl}${href}`;
        } else if (!href.startsWith("http")) {
          absoluteUrl = `${baseUrl}/${href}`;
        }

        const urlObj = new URL(absoluteUrl);
        if (urlObj.hostname === hostname) {
          contactUrls.add(absoluteUrl);
        }
      } catch (e) {
        // skip malformed links
      }
    }
  });

  return Array.from(contactUrls).slice(0, 3);
}

/**
 * Scrape a single business website for contact information
 * @param {string} url - The website URL
 * @returns {object} Lead data
 */
async function scrapeWebsite(url) {
  console.log(`[WebsiteScraper] Scraping website: ${url}`);

  try {
    const homepageHtml = await fetchPage(url);
    if (!homepageHtml) {
      throw new Error("Could not fetch homepage");
    }

    const $ = cheerio.load(homepageHtml);

    // Extract business name
    let businessName = "";
    const title = $("title").text().trim();
    if (title) {
      businessName = title.split(/[|–—-]/)[0].trim();
    }
    if (!businessName) {
      businessName = $("h1").first().text().trim();
    }
    if (!businessName) {
      try {
        businessName = new URL(url).hostname.replace("www.", "");
      } catch (e) {
        businessName = "Unknown Business";
      }
    }

    // Extract from homepage
    const bodyText = $("body").text();
    const allEmails = new Set(extractEmails(bodyText));
    const allPhones = new Set(extractPhones(bodyText));

    // Find and scrape contact pages
    const urlObj = new URL(url);
    const baseUrl = `${urlObj.protocol}//${urlObj.hostname}`;
    const contactPages = findContactPages($, baseUrl, urlObj.hostname);

    // Scrape contact pages concurrently
    const contactHtmls = await Promise.all(contactPages.map(p => fetchPage(p)));

    for (const html of contactHtmls) {
      if (html) {
        const $$ = cheerio.load(html);
        const contactText = $$("body").text();
        extractEmails(contactText).forEach(e => allEmails.add(e));
        extractPhones(contactText).forEach(p => allPhones.add(p));
      }
    }

    const emailList = Array.from(allEmails);
    const phoneList = Array.from(allPhones);

    const lead = {
      businessName,
      email: emailList[0] || "",
      phone: phoneList[0] || "",
      website: url,
      address: "",
      source: urlObj.hostname.replace("www.", ""),
      status: emailList.length > 0 ? "Valid Lead" : "No Email"
    };

    console.log(`[WebsiteScraper] ${businessName} → ${emailList.length} emails, ${phoneList.length} phones`);
    return lead;
  } catch (error) {
    let businessName = "";
    try {
      businessName = new URL(url).hostname.replace("www.", "");
    } catch (e) {
      businessName = "Unknown Business";
    }
    console.error(`[WebsiteScraper] Error scraping ${url}:`, error.message);
    return {
      businessName,
      email: "",
      phone: "",
      website: url,
      address: "",
      source: businessName,
      status: "Failed",
      error: error.message
    };
  }
}

module.exports = scrapeWebsite;
