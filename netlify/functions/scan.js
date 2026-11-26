export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "GEMINI_API_KEY is not set in Netlify." }) };
  }

  try {
    const { base64, mimeType, currentYear } = JSON.parse(event.body || "{}");
    const promptText = `You are reading a photo of a teen driver's supervised practice log sheet (printed or handwritten).
Extract every driving session row visible in the image.
Rules:
- Format "date" strictly as YYYY-MM-DD. If the year is omitted on the sheet, assume ${currentYear || new Date().getFullYear()}.
- Convert duration into integer "hours" and integer "minutes" (e.g. 1.5 hrs -> hours: 1, minutes: 30; 45 mins -> hours: 0, minutes: 45).
- Set "type" to "night" if the row indicates night driving (e.g., Night column, N, PM after dark, or night hours > 0), otherwise "day". If a single row splits day hours and night hours into separate columns, emit two separate objects (one "day" and one "night").
- Ignore blank rows or total summary rows at the bottom.`;

    const payload = {
      contents: [{
        role: "user",
        parts: [
          { text: promptText },
          { inlineData: { mimeType, data: base64 } }
        ]
      }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              date: { type: "STRING" },
              hours: { type: "INTEGER" },
              minutes: { type: "INTEGER" },
              type: { type: "STRING", enum: ["day", "night"] }
            },
            required: ["date", "hours", "minutes", "type"]
          }
        }
      }
    };

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }
    );

    const data = await res.json();
    if (!res.ok) {
      return { statusCode: res.status, body: JSON.stringify({ error: data?.error?.message || "Gemini API error" }) };
    }

    const rawText = data?.candidates??.[0]?.content?.parts?.[0]?.text || "[]";
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessions: JSON.parse(rawText) })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}
