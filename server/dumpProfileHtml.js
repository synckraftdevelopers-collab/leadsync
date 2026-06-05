const puppeteer = require("puppeteer");
const fs = require("fs");

(async () => {
  console.log("Loading agent profile page to inspect selectors...");
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    const url = "https://www.realestateindia.com/profile/hemant-realty-in-manewada-nagpur-3715649/";
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await new Promise(r => setTimeout(r, 4000));

    // Extract title, heading, and text elements to find where contact info is
    const pageData = await page.evaluate(() => {
      const data = {};
      
      // Page title
      data.title = document.title;
      
      // Select some headers
      data.h1 = Array.from(document.querySelectorAll("h1")).map(h => h.innerText?.trim());
      data.h2 = Array.from(document.querySelectorAll("h2")).map(h => h.innerText?.trim());
      
      // Let's get text around common contact labels like "Phone", "Mobile", "Email", "Address", "Contact Person"
      data.bodyTextSample = document.body.innerText?.slice(0, 3000);
      
      // Let's dump all text of elements with classes that might contain contact info
      const contactElements = Array.from(document.querySelectorAll("*")).filter(el => {
        const className = el.className;
        return typeof className === "string" && (
          className.includes("contact") || 
          className.includes("profile") || 
          className.includes("agent") || 
          className.includes("detail") ||
          className.includes("address") ||
          className.includes("info")
        );
      });
      
      data.classSnippets = contactElements.slice(0, 100).map(el => ({
        tagName: el.tagName,
        className: el.className,
        text: el.innerText?.trim()?.slice(0, 200)
      }));
      
      return data;
    });

    console.log("Page Title:", pageData.title);
    console.log("H1 Headers:", pageData.h1);
    console.log("H2 Headers:", pageData.h2);
    
    // Save to inspect
    fs.writeFileSync("server/profile_inspection.json", JSON.stringify(pageData, null, 2));
    console.log("Saved page data structure to server/profile_inspection.json");

  } catch (e) {
    console.error("Profile load failed:", e);
  } finally {
    await browser.close();
  }
})();
