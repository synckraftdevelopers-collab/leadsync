const getAllLeads = require("./getAllLeads");

async function getPractoLeads(category, city) {
  console.log(`[PractoScraper] Fetching Practo leads for category: "${category}", city: "${city}"`);
  try {
    const rawLeads = await getAllLeads(category, city);
    return rawLeads.map(lead => ({
      businessName: lead.businessName || "Unknown Practitioner",
      phone: lead.phone || "",
      address: lead.address || "",
      website: lead.website || "",
      source: "practo"
    }));
  } catch (error) {
    console.error("[PractoScraper] Error getting leads:", error.message);
    return [];
  }
}

module.exports = getPractoLeads;
