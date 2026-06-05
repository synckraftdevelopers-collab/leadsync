const getListings = require("./scrapers/indiamart/getListings");
const getProfile = require("./scrapers/indiamart/getProfile");
const getAllLeads = require("./scrapers/indiamart/getAllLeads");

(async () => {
  try {
    console.log("=== STEP 1: Test getListings('machinery', 'pune') ===");
    const listings = await getListings("machinery", "pune");
    console.log("Found listings:", JSON.stringify(listings, null, 2));

    if (listings.length > 0) {
      const firstListing = listings[0];
      console.log(`\n=== STEP 2: Test getProfile() for: ${firstListing.name} ===`);
      console.log(`URL: ${firstListing.profileUrl}`);
      const profile = await getProfile(firstListing.profileUrl);
      console.log("Scraped profile details:", JSON.stringify(profile, null, 2));
    } else {
      console.log("\n[WARNING] No listings returned. Skipping step 2 profile test.");
    }

    console.log("\n=== STEP 3: Test getAllLeads('machinery', 'pune') (orchestrated flow) ===");
    const leads = await getAllLeads("machinery", "pune");
    console.log(`Total leads returned by orchestrator: ${leads.length}`);
    console.log("Sample lead:", JSON.stringify(leads[0] || {}, null, 2));

    process.exit(0);
  } catch (error) {
    console.error("Test execution failed:", error);
    process.exit(1);
  }
})();
