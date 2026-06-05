const getListings = require("./getListings");
const getProfile = require("./getProfile");

async function getAllLeads(category, city) {
  console.log(`[Practo] Starting getAllLeads for category: "${category}", city: "${city}"`);
  
  const listings = await getListings(category, city);
  console.log(`[Practo] Found ${listings.length} listings. Scraping profiles (max 20)...`);

  const leads = [];

  for (const listing of listings.slice(0, 20)) {
    try {
      const lead = await getProfile(listing.profileUrl);
      
      // Fallback: If profile name failed, keep name from listings page
      if ((!lead.businessName || lead.businessName === "Unknown Practitioner") && listing.name) {
        lead.businessName = listing.name;
      }
      
      leads.push(lead);
    } catch (error) {
      console.error(`[Practo] Error scraping profile ${listing.profileUrl}:`, error.message);
    }
  }

  console.log(`[Practo] Finished scraping. Total leads gathered: ${leads.length}`);
  return leads;
}

module.exports = getAllLeads;
