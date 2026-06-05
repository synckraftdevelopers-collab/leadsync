const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");

const htmlBefore = fs.readFileSync(path.join(__dirname, "profile_before_click.html"), "utf8");
const htmlAfter = fs.readFileSync(path.join(__dirname, "profile_after_click.html"), "utf8");

const $before = cheerio.load(htmlBefore);
const $after = cheerio.load(htmlAfter);

console.log("=== COMPARING BEFORE AND AFTER CLICK ===");

// 1. Let's see if there is any text change on the page related to phone or email.
// Specifically, let's search for matches of phone/email pattern.
const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const phoneRegex = /(?:\+?\d{1,3}[- ]?)?\(?\d{3}\)?[- ]?\d{3}[- ]?\d{4}/g;

console.log("Emails before click:", htmlBefore.match(emailRegex) || []);
console.log("Emails after click:", htmlAfter.match(emailRegex) || []);

console.log("Phones before click (samples):", (htmlBefore.match(phoneRegex) || []).slice(0, 10));
console.log("Phones after click (samples):", (htmlAfter.match(phoneRegex) || []).slice(0, 10));

// 2. Let's look for modal, dialog, popup, or class changes after the click.
// Let's find divs/elements that are visible/exist in $after but not in $before, or elements that have contact information.
// We can search for classes containing "phone", "email", "mobile", "contact", "agent", "owner", "person", "address", "website".
const interestingKeywords = ["phone", "email", "mobile", "contact", "agent", "owner", "person", "address", "website"];

console.log("\nSearching for element texts matching keywords in AFTER HTML:");
$after("*").each((i, el) => {
  const text = $after(el).text().trim();
  const className = $after(el).attr("class") || "";
  const idName = $after(el).attr("id") || "";
  
  if (text.length > 0 && text.length < 200) {
    const textLower = text.toLowerCase();
    const classLower = className.toLowerCase();
    const idLower = idName.toLowerCase();
    
    // Check if any interesting keyword is present in the class, id, or text (like "Mobile" or "Email")
    const matchesKeyword = interestingKeywords.some(kw => 
      classLower.includes(kw) || idLower.includes(kw) || 
      (textLower.includes(kw + ":") || textLower.includes(kw + " :")) ||
      (kw === "email" && textLower.includes("@"))
    );
    
    if (matchesKeyword) {
      // Check if it was already in the BEFORE html
      const beforeMatch = $before(el.tagName + (idName ? `#${idName}` : "") + (className ? `.${className.replace(/\s+/g, ".")}` : ""));
      const isNewText = beforeMatch.text().trim() !== text;
      
      console.log(`[${el.tagName.toUpperCase()}] Class: "${className}" ID: "${idName}" ${isNewText ? "[CHANGED/NEW]" : ""}`);
      console.log(`   Text: "${text.replace(/\s+/g, " ")}"`);
    }
  }
});
