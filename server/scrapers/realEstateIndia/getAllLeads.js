const getListings = require("./getListings");
const getProfile = require("./getProfile");

async function getAllLeads(city) {
  console.log(`[RealEstateIndia] Starting getAllLeads for city: ${city}`);
  const listings = await getListings(city);
  console.log(`[RealEstateIndia] Found ${listings.length} listings. Processing top 20...`);

  const leads = [];

  for (const listing of listings.slice(0, 20)) {
    try {
      const lead = await getProfile(listing.profileUrl);
      leads.push(lead);
    } catch (error) {
      console.error(`[RealEstateIndia] Error processing profile ${listing.profileUrl}:`, error.message);
    }
  }

  return leads;
}

module.exports = getAllLeads;
