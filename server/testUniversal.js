const axios = require("axios");

async function testUniversal() {
  console.log("Testing Universal Lead Engine...\n");

  try {
    const response = await axios.post("http://localhost:3000/universal-leads", {
      query: "architects in Mumbai"
    }, {
      timeout: 120000
    });

    console.log("\n=== RESULTS ===");
    console.log("Success:", response.data.success);
    console.log("Parsed:", response.data.parsedData);
    console.log("Discovered URLs:", response.data.discoveredUrls?.length);
    console.log("Stats:", response.data.stats);
    console.log("Total Leads:", response.data.leads?.length);
    
    if (response.data.leads && response.data.leads.length > 0) {
      console.log("\n=== SAMPLE LEADS ===");
      response.data.leads.slice(0, 5).forEach((lead, i) => {
        console.log(`${i + 1}. ${lead.businessName} | ${lead.phone} | ${lead.email} | Source: ${lead.source}`);
      });
    }
  } catch (error) {
    console.error("Test failed:", error.response?.data || error.message);
  }
}

testUniversal();
