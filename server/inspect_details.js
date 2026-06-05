const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");

const htmlAfter = fs.readFileSync(path.join(__dirname, "profile_after_click.html"), "utf8");
const $ = cheerio.load(htmlAfter);

console.log("=== DETAILED SEARCH FOR CONTACT INFO ===");

// 1. Search for tel: and mailto: links
const telLinks = [];
$("a[href^='tel:']").each((i, el) => {
  telLinks.push($(el).attr("href"));
});
console.log("tel: links:", telLinks);

const mailtoLinks = [];
$("a[href^='mailto:']").each((i, el) => {
  mailtoLinks.push($(el).attr("href"));
});
console.log("mailto: links:", mailtoLinks);

// 2. Search for external website links
const externalLinks = [];
$("a").each((i, el) => {
  const href = $(el).attr("href") || "";
  const text = $(el).text().trim();
  if (href.startsWith("http") && !href.includes("realestateindia.com") && !href.includes("facebook.com") && !href.includes("twitter.com") && !href.includes("linkedin.com") && !href.includes("youtube.com") && !href.includes("instagram.com")) {
    externalLinks.push({ text, href });
  }
});
console.log("External website links:", externalLinks);

// 3. Search for Agent/Owner Name, Business Name, and Address
// Let's inspect the page header or card
console.log("Business Name (H1):", $("h1").first().text().trim());

// Look for address
// Let's search for divs/spans with address/location classes
const addressEl = $(".company-info, .address, .loc, .location, [class*='address']");
addressEl.each((i, el) => {
  console.log(`Address element candidate [${el.tagName} class="${$(el).attr("class")}"]:`, $(el).text().trim().replace(/\s+/g, " "));
});

// Let's find agent name
const agentNameEl = $("[class*='agent']").filter((i, el) => {
  const txt = $(el).text().trim();
  return txt.includes("Name") || txt.includes("Contact Person") || txt.includes("Agent") || txt.includes("Owner");
});
agentNameEl.each((i, el) => {
  console.log(`Agent element candidate [${el.tagName} class="${$(el).attr("class")}"]:`, $(el).text().trim().replace(/\s+/g, " "));
});

// 4. Look inside all script tags for any contact details (e.g. phone, email, agent name)
console.log("\nSearching script tags...");
$("script").each((i, el) => {
  const content = $(el).html();
  if (content && (content.includes("76207") || content.includes("phone") || content.includes("email") || content.includes("mobile") || content.includes("contact"))) {
    console.log(`Script tag ${i} has potential content (length: ${content.length}):`);
    // Print snippet of script tag containing keywords
    const lines = content.split("\n");
    lines.forEach((line, lineIdx) => {
      if (line.includes("76207") || line.includes("phone") || line.includes("email") || line.includes("mobile") || line.includes("contact_person") || line.includes("contactPerson")) {
        console.log(`  Line ${lineIdx + 1}: ${line.trim().slice(0, 150)}`);
      }
    });
  }
});
