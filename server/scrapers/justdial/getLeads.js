const getAllLeads = require("./getAllLeads");

async function getJustDialLeads(category, city) {
  console.log(`[JustDialScraper] Fetching JustDial leads for category: "${category}", city: "${city}"`);
  try {
    const rawLeads = await getAllLeads(category, city);
    return rawLeads.map(lead => ({
      businessName: lead.businessName || "Unknown Business",
      phone: lead.phone || "",
      address: lead.address || "",
      website: lead.website || "",
      source: "justdial"
    }));
  } catch (error) {
    console.error("[JustDialScraper] Error getting leads:", error.message);
    return [];
  }
}

module.exports = getJustDialLeads;
