const getListings = require("./getListings");
const getProfile = require("./getProfile");

async function getAllLeads(category, city) {
  console.log(`[IndiaMART] Starting getAllLeads for category: "${category}", city: "${city}"`);
  
  const listings = await getListings(category, city);
  console.log(`[IndiaMART] Found ${listings.length} listings. Scraping profiles (max 20)...`);

  const leads = [];

  for (const listing of listings.slice(0, 20)) {
    try {
      const lead = await getProfile(listing.profileUrl);
      
      // Fallback: If profile scraping returned generic name, keep the name from the listings page
      if ((!lead.businessName || lead.businessName === "Unknown Supplier") && listing.name) {
        lead.businessName = listing.name;
      }
      
      leads.push(lead);
    } catch (error) {
      console.error(`[IndiaMART] Error scraping profile ${listing.profileUrl}:`, error.message);
    }
  }

  console.log(`[IndiaMART] Finished scraping. Total leads gathered: ${leads.length}`);
  return leads;
}

module.exports = getAllLeads;
