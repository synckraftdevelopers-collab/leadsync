const Groq = require("groq-sdk");

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

async function groqQueryParser(query) {
  const prompt = `
Extract the following from the lead search query:
1. category: A broad business category (e.g., healthcare, marketing, real estate, education, construction, manufacturing, retail).
2. subCategory: A singular, specific profession, service, or business type (e.g., dentist, digital marketing agency, school, solar panel supplier, hospital, architect, gym).
3. city: The name of the city mentioned.
4. state: The name of the state mentioned (or null if not found/inferred).
5. country: The country mentioned (or null if not found/inferred, e.g. "India" if cities like Mumbai, Pune, Nagpur, Bangalore are mentioned).
6. businessIntent: A brief description of what the user is looking to do (e.g. "find solar panel suppliers", "discover digital marketing agencies").
7. industry: The general industry sector (e.g., healthcare, marketing, construction, energy, technology).
8. relatedKeywords: An array of up to 4 search terms or synonym keywords (e.g. ["solar panels", "solar energy solutions", "photovoltaic panels"]).

Return ONLY valid JSON.
Do not include any markdown or markdown code blocks in your response.

Examples:
Query: "Need dentists in Pune"
Output: {
  "category": "healthcare",
  "subCategory": "dentist",
  "city": "Pune",
  "state": "Maharashtra",
  "country": "India",
  "businessIntent": "find dental practitioners and clinics",
  "industry": "healthcare",
  "relatedKeywords": ["dentists", "dental clinic", "teeth care", "orthodontist"]
}

Query: "Find solar panel suppliers in Nagpur"
Output: {
  "category": "energy",
  "subCategory": "solar panel supplier",
  "city": "Nagpur",
  "state": "Maharashtra",
  "country": "India",
  "businessIntent": "find solar panel suppliers and distributors",
  "industry": "energy",
  "relatedKeywords": ["solar panels", "solar energy", "solar dealers", "photovoltaic"]
}

Query:
${query}
`;

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

  const startIdx = content.indexOf('{');
  const endIdx = content.lastIndexOf('}');
  if (startIdx !== -1 && endIdx !== -1) {
    content = content.substring(startIdx, endIdx + 1);
  }

  try {
    return JSON.parse(content);
  } catch (err) {
    console.error("[GroqQueryParser] Failed to parse JSON, returning fallback structure:", content);
    return {
      category: "general",
      subCategory: query,
      city: "Mumbai",
      state: null,
      country: "India",
      businessIntent: `find ${query}`,
      industry: "general",
      relatedKeywords: [query]
    };
  }
}

module.exports = groqQueryParser;

