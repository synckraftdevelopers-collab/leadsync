const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");

const htmlAfter = fs.readFileSync(path.join(__dirname, "profile_after_click.html"), "utf8");
const $ = cheerio.load(htmlAfter);

console.log("=== DETAILED CONTACT CARD SECTIONS ===");

// Print all elements containing "Contact" or "Agent" or "Owner" or "Name" or "Person"
$("*").each((i, el) => {
  const text = $(el).text().trim();
  const className = $(el).attr("class") || "";
  const idName = $(el).attr("id") || "";
  
  // Look for sections that seem like contact card
  if (className.includes("contact") || className.includes("member") || className.includes("owner") || idName.includes("contact")) {
    if (text.length > 0 && text.length < 500) {
      console.log(`\nCandidate Element: ${el.tagName} class="${className}" id="${idName}"`);
      console.log(`Text:\n${text}`);
    }
  }
});
