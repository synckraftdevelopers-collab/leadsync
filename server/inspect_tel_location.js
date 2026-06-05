const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");

const htmlAfter = fs.readFileSync(path.join(__dirname, "profile_after_click.html"), "utf8");
const $ = cheerio.load(htmlAfter);

console.log("=== SCANNING FOR TEL LINKS AND THEIR PARENTS ===");
$("a[href^='tel:']").each((i, el) => {
  console.log(`tel link ${i}: href="${$(el).attr("href")}" text="${$(el).text().trim()}"`);
  console.log("Parent hierarchy:");
  let parent = $(el).parent();
  while (parent.length > 0 && parent[0].tagName !== "body") {
    console.log(`  - <${parent[0].tagName} class="${parent.attr("class") || ""}" id="${parent.attr("id") || ""}">`);
    parent = parent.parent();
  }
});
