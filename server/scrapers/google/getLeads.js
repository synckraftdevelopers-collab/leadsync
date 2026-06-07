const searchBusinesses = require("../searchBusinesses");
const extractLeads = require("../extractLeads");

async function getGoogleLeads(category, city) {
  console.log(`[GoogleScraper] Searching for "${category}" in "${city}"...`);
  try {
    const urls = await searchBusinesses(category, city);
    console.log(`[GoogleScraper] Found ${urls.length} business websites. Scraping details...`);

    const leads = [];
    for (const url of urls) {
      try {
        console.log(`[GoogleScraper] Scraping website: ${url}`);
        const lead = await extractLeads(url);
        leads.push({
          businessName: lead.businessName || "Unknown Business",
          phone: lead.phones && lead.phones.length > 0 ? lead.phones[0] : "",
          email: lead.emails && lead.emails.length > 0 ? lead.emails[0] : "",
          website: lead.url || url,
          source: "google"
        });
      } catch (err) {
        console.error(`[GoogleScraper] Failed to extract from ${url}:`, err.message);
      }
    }

    return leads;
  } catch (error) {
    console.error("[GoogleScraper] Error getting leads:", error.message);
    return [];
  }
}

module.exports = getGoogleLeads;
