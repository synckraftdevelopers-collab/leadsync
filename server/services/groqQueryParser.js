const Groq = require("groq-sdk");

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

async function groqQueryParser(query) {

  const prompt = `
Extract the following from the query:
1. category: A broad business category (e.g., healthcare, marketing, real estate, education, construction).
2. subCategory: A singular, specific profession or service (e.g., dentist, digital marketing agency, school).
3. city: The name of the city mentioned.

Return ONLY valid JSON.

Examples:
Query: "Need dentists in Pune"
Output: {
  "category": "healthcare",
  "subCategory": "dentist",
  "city": "Pune"
}

Query: "Find digital marketing agencies in Mumbai"
Output: {
  "category": "marketing",
  "subCategory": "digital marketing agency",
  "city": "Mumbai"
}

Query:
${query}
`;

  const response =
    await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0
    });

  let content =
    response.choices[0].message.content.trim();

  const startIdx = content.indexOf('{');
  const endIdx = content.lastIndexOf('}');
  if (startIdx !== -1 && endIdx !== -1) {
    content = content.substring(startIdx, endIdx + 1);
  }

  return JSON.parse(content);
}

module.exports = groqQueryParser;
