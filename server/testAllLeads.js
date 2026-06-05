const getAllLeads = require("./scrapers/realEstateIndia/getAllLeads");

(async () => {
  try {
    console.log("Starting test for getAllLeads('nagpur')...");
    // Running for Nagpur
    const leads = await getAllLeads("nagpur");
    console.log("\n=== Test Results (Leads Extracted) ===");
    console.log(JSON.stringify(leads, null, 2));
    process.exit(0);
  } catch (error) {
    console.error("Test failed:", error);
    process.exit(1);
  }
})();
