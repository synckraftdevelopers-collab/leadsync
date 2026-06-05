const getListings = require("./scrapers/practo/getListings");
const getProfile = require("./scrapers/practo/getProfile");
const getAllLeads = require("./scrapers/practo/getAllLeads");

async function runTests() {
  console.log("=== STEP 1: Test getListings('dentist', 'pune') ===");
  const listings = await getListings("dentist", "pune");
  console.log("Found listings:", JSON.stringify(listings, null, 2));

  if (listings.length > 0) {
    const testUrl = listings[0].profileUrl;
    console.log(`\n=== STEP 2: Test getProfile() for: ${listings[0].name} ===`);
    console.log(`URL: ${testUrl}`);
    const profile = await getProfile(testUrl);
    console.log("Scraped profile details:", JSON.stringify(profile, null, 2));
  } else {
    console.log("\n=== STEP 2 SKIPPED: No listings found to test getProfile ===");
  }

  console.log("\n=== STEP 3: Test getAllLeads('dentist', 'pune') (orchestrated flow, slicing top 2) ===");
  // Overriding top 2 for fast testing in test script
  const originalSlice = Array.prototype.slice;
  Array.prototype.slice = function(start, end) {
    if (this.length > 0 && start === 0 && end === 20) {
      console.log("[Test Hack] Slicing top 2 instead of 20 for speed...");
      return originalSlice.call(this, 0, 2);
    }
    return originalSlice.apply(this, arguments);
  };

  const leads = await getAllLeads("dentist", "pune");
  console.log("Total leads returned by orchestrator:", leads.length);
  console.log("Leads:", JSON.stringify(leads, null, 2));

  // Restore slice
  Array.prototype.slice = originalSlice;
}

runTests().catch(err => console.error("Test failed:", err));
