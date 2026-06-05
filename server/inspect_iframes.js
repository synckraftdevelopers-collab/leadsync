const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");

const htmlAfter = fs.readFileSync(path.join(__dirname, "profile_after_click.html"), "utf8");
const $ = cheerio.load(htmlAfter);

console.log("=== IFRAME SEARCH ===");
$("iframe").each((i, el) => {
  console.log(`Iframe ${i}:`);
  console.log(`  src: ${$(el).attr("src")}`);
  console.log(`  id: ${$(el).attr("id")}`);
  console.log(`  class: ${$(el).attr("class")}`);
});
console.log("=====================");
