const axios = require("axios");
const cheerio = require("cheerio");

async function scrapePage(url) {
  try {
    const { data } = await axios.get(url, {
      timeout: 5000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    return data;
  } catch (e) {
    return null;
  }
}

function extractDetails(html) {
  if (!html) return { emails: [], phones: [] };
  const $ = cheerio.load(html);
  const text = $("body").text();

  // Extract emails
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/g;
  const emails = text.match(emailRegex) || [];

  // Extract phone numbers (supporting international, local, and whatsapp numbers)
  const phoneRegex = /(\+91[\-\s]?)?[0]?(91)?[6789]\d{9}/g;
  const phones = text.match(phoneRegex) || [];

  return {
    emails: [...new Set(emails)],
    phones: [...new Set(phones)]
  };
}

async function extractLeads(url) {
  try {
    const homepageHtml = await scrapePage(url);
    if (!homepageHtml) {
      throw new Error("Could not fetch homepage");
    }

    const $ = cheerio.load(homepageHtml);

    // Extract Business Name
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
        const urlObj = new URL(url);
        businessName = urlObj.hostname.replace("www.", "");
      } catch (e) {
        businessName = "Unknown Business";
      }
    }

    // Extract details from homepage
    const homeDetails = extractDetails(homepageHtml);
    const emails = new Set(homeDetails.emails);
    const phones = new Set(homeDetails.phones);

    // Find contact/about page links
    const subpageUrls = new Set();
    const urlObj = new URL(url);
    const baseUrl = `${urlObj.protocol}//${urlObj.hostname}`;

    $("a").each((i, el) => {
      let href = $(el).attr("href");
      if (!href) return;

      href = href.trim();
      const text = $(el).text().trim().toLowerCase();

      const isContactPattern = /(contact|about|team)/i.test(href) || /(contact|about|team)/i.test(text);
      if (isContactPattern) {
        try {
          let absoluteUrl = href;
          if (href.startsWith("/")) {
            absoluteUrl = `${baseUrl}${href}`;
          } else if (!href.startsWith("http")) {
            absoluteUrl = `${baseUrl}/${href}`;
          }

          const subpageObj = new URL(absoluteUrl);
          // Ensure it belongs to the same domain to avoid scraping external sites
          if (subpageObj.hostname === urlObj.hostname) {
            subpageUrls.add(absoluteUrl);
          }
        } catch (e) {
          // Ignore malformed links
        }
      }
    });

    // Limit to top 3 subpages to avoid rate-limiting or performance issues
    const pagesToScrape = Array.from(subpageUrls).slice(0, 3);

    // Fetch all contact pages concurrently
    const subpageContents = await Promise.all(
      pagesToScrape.map((subUrl) => scrapePage(subUrl))
    );

    // Extract details from contact pages
    for (const html of subpageContents) {
      if (html) {
        const subDetails = extractDetails(html);
        subDetails.emails.forEach((email) => emails.add(email));
        subDetails.phones.forEach((phone) => phones.add(phone));
      }
    }

    const emailList = Array.from(emails);
    const phoneList = Array.from(phones);

    return {
      businessName,
      url,
      emails: emailList,
      phones: phoneList,
      status: emailList.length > 0 ? "Valid Lead" : "No Email"
    };
  } catch (error) {
    let businessName = "";
    try {
      const urlObj = new URL(url);
      businessName = urlObj.hostname.replace("www.", "");
    } catch (e) {
      businessName = "Unknown Business";
    }
    return {
      businessName,
      url,
      emails: [],
      phones: [],
      error: error.message,
      status: "Failed"
    };
  }
}

module.exports = extractLeads;
