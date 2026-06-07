const Groq = require("groq-sdk");

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

/**
 * Validates a lead using Groq Llama 3.3 model to check if it's a real business/practitioner.
 * Returns confidence score and categorizes the industry.
 * 
 * @param {object} lead - The lead to validate
 * @returns {Promise<object>} - { validLead: boolean, confidence: number, industry: string }
 */
async function groqLeadValidator(lead) {
  const prompt = `
Validate if the following lead represents a real, legitimate business, clinic, practitioner, or organization.
Determine if the lead is valid, estimate a confidence score (0-100), and classify the industry (e.g. healthcare, marketing, real estate, education, manufacturing, wholesale, etc.).

Lead Details:
- Business Name: ${lead.businessName}
- Website: ${lead.website || "N/A"}
- Phone: ${lead.phone || "N/A"}
- Email: ${lead.email || "N/A"}
- Address: ${lead.address || "N/A"}
- Source: ${lead.source || "N/A"}

Rules:
- Return ONLY valid JSON.
- Do not include any markdown or code blocks in your response.
- Output schema:
{
  "validLead": boolean,
  "confidence": number,
  "industry": "healthcare" | "marketing" | "real estate" | "education" | "other" (lowercase string classification matching query domain)
}
`;

  try {
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0
    });

    let content = response.choices[0].message.content.trim();

    // Clean JSON markdown wrapper if present
    const startIdx = content.indexOf('{');
    const endIdx = content.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1) {
      content = content.substring(startIdx, endIdx + 1);
    }

    const parsed = JSON.parse(content);
    console.log(`[GroqLeadValidator] Validated "${lead.businessName}": Valid=${parsed.validLead}, Confidence=${parsed.confidence}%, Industry=${parsed.industry}`);
    return parsed;
  } catch (error) {
    console.error("[GroqLeadValidator] Error validating lead:", error.message);
    // Safe fallback defaults
    return {
      validLead: true,
      confidence: 50,
      industry: lead.category || "unknown"
    };
  }
}

module.exports = groqLeadValidator;
