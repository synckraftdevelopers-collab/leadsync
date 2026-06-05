const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");

const htmlAfter = fs.readFileSync(path.join(__dirname, "profile_after_click.html"), "utf8");
const $ = cheerio.load(htmlAfter);

console.log("=== SCANNING FOR ALL TEXT LINES CONTAINING KEYWORDS ===");

const keywords = ["owner", "agent", "name", "person", "address", "email", "website", "web", "phone", "mobile", "contact"];
const bodyText = $("body").text();
const lines = bodyText.split("\n");

lines.forEach((line, index) => {
  const trimmed = line.trim();
  if (trimmed.length > 0) {
    const lower = trimmed.toLowerCase();
    const matches = keywords.filter(kw => lower.includes(kw));
    if (matches.length > 0) {
      console.log(`Line ${index + 1} (matches: ${matches.join(", ")}): "${trimmed.slice(0, 150)}"`);
    }
  }
});
