const getListings = require("./scrapers/justdial/getListings");
const getProfile = require("./scrapers/justdial/getProfile");
const getAllLeads = require("./scrapers/justdial/getAllLeads");

(async () => {
  try {
    console.log("=== STEP 1: Test getListings('restaurant', 'pune') ===");
    const listings = await getListings("restaurant", "pune");
    console.log("Found listings:", JSON.stringify(listings, null, 2));

    if (listings.length > 0) {
      const firstListing = listings[0];
      console.log(`\n=== STEP 2: Test getProfile() for: ${firstListing.name} ===`);
      const profile = await getProfile(firstListing.profileUrl);
      console.log("Scraped profile details:", JSON.stringify(profile, null, 2));
    } else {
      console.log("\n[WARNING] No listings returned. Skipping step 2 profile test.");
    }

    console.log("\n=== STEP 3: Test getAllLeads('restaurant', 'pune') (orchestrated flow) ===");
    const leads = await getAllLeads("restaurant", "pune");
    console.log(`Total leads returned by orchestrator: ${leads.length}`);
    console.log("Sample lead:", JSON.stringify(leads[0] || {}, null, 2));

    process.exit(0);
  } catch (error) {
    console.error("Test execution failed:", error);
    process.exit(1);
  }
})();
