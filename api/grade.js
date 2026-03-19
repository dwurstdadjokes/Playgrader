export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { image_base64, media_type } = req.body;
  if (!image_base64 || !media_type) {
    return res.status(400).json({ error: "Missing image data" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "API key not configured" });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        system: `You are Playgrader. You grade kids' products for parents of children ages 2-5.

CRITICAL: You must respond with ONLY a JSON object. No markdown, no explanation, no text before or after. Just raw JSON.

When shown a photo:
1. Identify the item (TV show, movie, book, toy, food product, game, app, etc.)
2. Grade it A+ through F for suitability for ages 2-5
3. Provide 3-4 category scores relevant to the item type
4. Give a parent-friendly summary

Required JSON format:
{"item_name":"Name","item_type":"TV Show|Movie|Book|Toy|Food|Game|App|Product","overall_grade":"B+","summary":"2-3 sentences about why this grade","categories":[{"name":"Age Appropriateness","grade":"A","note":"Brief note"},{"name":"Educational Value","grade":"B","note":"Brief note"},{"name":"Health & Safety","grade":"A-","note":"Brief note"}],"quick_tip":"One actionable tip","sources_note":"Sources that informed this grade"}

Be honest but not alarmist. Use Common Sense Media, AAP, WHO, and nutritional guidelines as references. If you can identify the specific product/show, use your knowledge about it.`,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: media_type,
                  data: image_base64,
                },
              },
              {
                type: "text",
                text: "Grade this for ages 2-5. Return ONLY valid JSON, nothing else.",
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic API error:", response.status, errText);
      return res.status(502).json({ error: "AI service error", status: response.status });
    }

    const data = await response.json();
    const text = data.content?.map((b) => (b.type === "text" ? b.text : "")).join("");

    if (!text) {
      return res.status(502).json({ error: "Empty AI response" });
    }

    // Robust JSON extraction
    let parsed;
    const clean = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    try {
      parsed = JSON.parse(clean);
    } catch (e1) {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const fixed = jsonMatch[0]
            .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
            .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
            .replace(/,\s*}/g, "}")
            .replace(/,\s*]/g, "]")
            .replace(/\n/g, " ");
          parsed = JSON.parse(fixed);
        } catch (e2) {
          return res.status(502).json({ error: "Could not parse AI response", raw: text.substring(0, 200) });
        }
      } else {
        return res.status(502).json({ error: "No valid data in AI response", raw: text.substring(0, 200) });
      }
    }

    // Fill defaults
    if (!parsed.item_name) parsed.item_name = "Unknown Item";
    if (!parsed.item_type) parsed.item_type = "Product";
    if (!parsed.overall_grade) parsed.overall_grade = "C";
    if (!parsed.summary) parsed.summary = "Unable to fully assess this item.";
    if (!parsed.categories) parsed.categories = [];
    if (!parsed.quick_tip) parsed.quick_tip = "";
    if (!parsed.sources_note) parsed.sources_note = "";

    return res.status(200).json(parsed);
  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ error: "Server error: " + err.message });
  }
}
