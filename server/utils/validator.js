/**
 * LeadSync Validator Utility
 */

/**
 * Phone Number Validation and Standardization
 * Accept only numbers that match valid country formats and correct digit length.
 * Standardizes to "+91 XXXXX XXXXX" for Indian numbers or standardized format.
 * Reject: WhatsApp API URLs, tel:, javascript:, tracking IDs, random numeric strings, page IDs.
 */
function validateAndFormatPhone(phoneStr) {
  if (!phoneStr) return null;
  let s = String(phoneStr).trim();
  
  // Reject junk patterns
  const lower = s.toLowerCase();
  if (
    lower.includes("wa.me") || 
    lower.includes("whatsapp") || 
    lower.includes("javascript:") || 
    lower.includes("tel:") || 
    lower.includes("tracking") || 
    lower.includes("page") ||
    lower.includes("click") ||
    lower.includes("button")
  ) {
    return null;
  }
  
  // Extract only numeric digits
  const digits = s.replace(/[^0-9]/g, "");
  if (digits.length < 10 || digits.length > 15) {
    return null; // Reject if digit length is invalid
  }
  
  // Format Indian phone numbers
  if (digits.length === 10) {
    return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  } else if (digits.length === 11 && digits.startsWith("0")) {
    return `+91 ${digits.slice(1, 6)} ${digits.slice(6)}`;
  } else if (digits.length === 12 && digits.startsWith("91")) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  } else if (digits.length === 13 && s.startsWith("+91")) {
    return `+91 ${digits.slice(3, 8)} ${digits.slice(8)}`;
  }
  
  // For other country codes, format as +<digits>
  return `+${digits}`;
}

/**
 * Email Validation
 * Accept only valid business/domain-matching emails.
 * Reject: example@example.com, test@test.com, no-reply, placeholder, webpack, sentry, etc.
 */
function validateEmail(emailStr) {
  if (!emailStr) return null;
  const e = String(emailStr).toLowerCase().trim();
  
  // Basic email regex
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(e)) return null;
  
  const domain = e.split("@")[1];
  const prefix = e.split("@")[0];
  
  // Rejected domain names
  const rejectDomains = [
    "example.com", "test.com", "domain.com", "email.com",
    "temp.com", "tempmail.com", "invalid.com", "sentry.io",
    "wixpress.com", "wix.com", "placeholder.com", "webpack.js"
  ];
  
  // Rejected prefixes/substrings
  const rejectPrefixes = [
    "no-reply", "noreply", "placeholder", "test", "example",
    "invalid", "sentry", "webpack", "click", "webmaster"
  ];
  
  if (rejectDomains.includes(domain)) return null;
  if (rejectPrefixes.some(p => prefix.startsWith(p) || e.includes(p))) return null;
  
  return e;
}

module.exports = {
  validateAndFormatPhone,
  validateEmail
};
