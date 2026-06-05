const getListings = require("./scraper/realEstateIndia/getListings");

(async () => {
  console.log("Starting RealEstateIndia Scraper Test...");
  try {
    const results = await getListings("nagpur");
    console.log("SUCCESS! Extracted Listings:");
    console.log(JSON.stringify(results, null, 2));
    console.log(`Total listings found: ${results.length}`);
  } catch (error) {
    console.error("Scraper test failed with error:", error);
  }
})();
