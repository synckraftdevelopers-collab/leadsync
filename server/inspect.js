const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

(async () => {
  console.log("Launching Puppeteer...");
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    const urls = [
      "https://www.realestateindia.com/profile/hemant-realty-in-manewada-nagpur-3715649/",
      "https://www.realestateindia.com/profile/anand-real-estate-in-chatrapati-nagar-nagpur-500997/"
    ];

    let loaded = false;
    for (const url of urls) {
      console.log(`Navigating to ${url}...`);
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
        await new Promise(r => setTimeout(r, 4000));
        loaded = true;
        break;
      } catch (err) {
        console.error(`Failed to load ${url}:`, err.message);
        try {
          await page.screenshot({ path: path.join(__dirname, "error.png") });
          console.log("Saved error screenshot to server/error.png");
        } catch (e) {
          console.error("Failed to take screenshot:", e.message);
        }
      }
    }

    if (!loaded) {
      throw new Error("Could not load any profile URL");
    }

    console.log("Checking for VIEW CONTACT button...");
    const hasViewContact = await page.evaluate(() => {
      const btn = document.querySelector(".view-contact, a.view-contact, button.view-contact");
      return btn ? {
        tagName: btn.tagName,
        className: btn.className,
        text: btn.innerText?.trim(),
        href: btn.href || null
      } : null;
    });

    console.log("View Contact button:", hasViewContact);

    // Get HTML before click
    const htmlBefore = await page.content();
    fs.writeFileSync(path.join(__dirname, "profile_before_click.html"), htmlBefore);
    console.log("Saved profile_before_click.html");

    if (hasViewContact) {
      console.log("Clicking VIEW CONTACT button...");
      await page.evaluate(() => {
        const btn = document.querySelector(".view-contact, a.view-contact, button.view-contact");
        if (btn) {
          btn.click();
        }
      });
      console.log("Clicked! Waiting 5 seconds...");
      await new Promise(r => setTimeout(r, 5000));

      const htmlAfter = await page.content();
      fs.writeFileSync(path.join(__dirname, "profile_after_click.html"), htmlAfter);
      console.log("Saved profile_after_click.html");
    } else {
      console.log("No View Contact button found.");
    }

  } catch (error) {
    console.error("Error during inspection:", error);
  } finally {
    await browser.close();
    console.log("Browser closed.");
  }
})();
