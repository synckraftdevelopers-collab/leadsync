const axios = require("axios");
const cheerio = require("cheerio");
const { validateAndFormatPhone, validateEmail } = require("../utils/validator");

/**
 * Generic Website Scraper
 * Works for any individual business website (companywebsite.com)
 * Extracts: Email, Phone, Contact Page, Business Name, WhatsApp, Social Links, Services, State
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
  return [...new Set(emails)]
    .map(e => validateEmail(e))
    .filter(Boolean);
}

/**
 * Extract phone numbers from text
 */
function extractPhones(text) {
  const phoneRegex = /(?:\+91[\-\s]?)?[0]?(91)?[6789]\d{9}/g;
  const phones = text.match(phoneRegex) || [];
  return [...new Set(phones)]
    .map(p => validateAndFormatPhone(p))
    .filter(Boolean);
}

/**
 * Extract social media profiles
 */
function extractSocialLinks($) {
  const social = {};
  $("a").each((i, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const lowerHref = href.toLowerCase();
    if (lowerHref.includes("facebook.com/") || lowerHref.includes("fb.com/")) social.facebook = href;
    if (lowerHref.includes("linkedin.com/")) social.linkedin = href;
    if (lowerHref.includes("twitter.com/") || lowerHref.includes("x.com/")) social.twitter = href;
    if (lowerHref.includes("instagram.com/")) social.instagram = href;
    if (lowerHref.includes("youtube.com/")) social.youtube = href;
  });
  return social;
}

/**
 * Extract WhatsApp contact info
 */
function extractWhatsApp($, text) {
  let whatsapp = "";
  $("a").each((i, el) => {
    const href = $(el).attr("href") || "";
    if (href.includes("wa.me") || href.includes("api.whatsapp.com") || href.includes("whatsapp.com")) {
      whatsapp = href;
    }
  });
  if (whatsapp) return whatsapp;

  // Search text patterns
  const waMatch = text.match(/(?:whatsapp|wa\.me|wa)\s*(?::|\-)?\s*([+91]?[0-9\-\s]{10,})/i);
  if (waMatch && waMatch[1]) {
    whatsapp = waMatch[1].replace(/[^0-9+]/g, "");
  }
  return whatsapp;
}

/**
 * Extract list of services
 */
function extractServices($, text) {
  const services = new Set();
  $("h1, h2, h3, h4, h5").each((i, el) => {
    const headerText = $(el).text().trim().toLowerCase();
    if (headerText.includes("service") || headerText.includes("expertise") || headerText.includes("what we do") || headerText.includes("our specialties")) {
      let parent = $(el).parent();
      parent.find("li, a, p").each((j, item) => {
        const itemText = $(item).text().trim();
        if (itemText.length > 2 && itemText.length < 50 && !itemText.toLowerCase().includes("more")) {
          services.add(itemText);
        }
      });
    }
  });

  if (services.size === 0) {
    $(".service, [class*='service'], [id*='service']").each((i, el) => {
      const itemText = $(el).text().trim();
      if (itemText.length > 5 && itemText.length < 100) {
        const cleanVal = itemText.split("\n")[0].trim();
        if (cleanVal.length > 2 && cleanVal.length < 50) services.add(cleanVal);
      }
    });
  }

  return Array.from(services).slice(0, 10);
}

/**
 * Extract Indian State name
 */
function extractState(text) {
  const states = [
    "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat",
    "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh",
    "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan",
    "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
    "Delhi", "Goa"
  ];
  for (const state of states) {
    const regex = new RegExp(`\\b${state}\\b`, "i");
    if (regex.test(text)) {
      return state;
    }
  }
  return "";
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
    const socialLinks = extractSocialLinks($);
    const whatsapp = extractWhatsApp($, bodyText);
    const services = extractServices($, bodyText);
    const state = extractState(bodyText);

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
      whatsapp: whatsapp || "",
      website: url,
      address: "",
      state: state || "",
      services: services || [],
      socialLinks: socialLinks || {},
      source: urlObj.hostname.replace("www.", ""),
      status: emailList.length > 0 ? "Valid Lead" : "No Email"
    };

    console.log(`[WebsiteScraper] ${businessName} → ${emailList.length} emails, ${phoneList.length} phones, WhatsApp: ${whatsapp ? "Yes" : "No"}`);
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
      whatsapp: "",
      website: url,
      address: "",
      state: "",
      services: [],
      socialLinks: {},
      source: businessName,
      status: "Failed",
      error: error.message
    };
  }
}

module.exports = scrapeWebsite;

