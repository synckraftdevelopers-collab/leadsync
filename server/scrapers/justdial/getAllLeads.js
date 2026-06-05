const getListings = require("./getListings");
const getProfile = require("./getProfile");

async function getAllLeads(category, city) {
  console.log(`[JustDial] Starting getAllLeads for category: "${category}", city: "${city}"`);
  
  const listings = await getListings(category, city);
  console.log(`[JustDial] Found ${listings.length} listings. Scraping profiles (max 20)...`);

  const leads = [];

  for (const listing of listings.slice(0, 20)) {
    try {
      const lead = await getProfile(listing.profileUrl);
      
      // Fallback: If profile scraping returned generic name, keep the name from the listings page
      if ((!lead.businessName || lead.businessName === "Unknown Business") && listing.name) {
        lead.businessName = listing.name;
      }
      
      leads.push(lead);
    } catch (error) {
      console.error(`[JustDial] Error scraping profile ${listing.profileUrl}:`, error.message);
    }
  }

  console.log(`[JustDial] Finished scraping. Total leads gathered: ${leads.length}`);
  return leads;
}

module.exports = getAllLeads;
