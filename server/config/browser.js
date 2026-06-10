const os = require("os");

const browserConfig = {
  headless: true,
  executablePath: os.platform() === "win32" ? undefined : "/usr/bin/chromium-browser",
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox"
  ]
};

module.exports = browserConfig;
