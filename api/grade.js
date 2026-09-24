// Playgrader grading endpoint (Vercel serverless function).
// Receives a base64 image, asks Claude for a structured grade via a forced tool call,
// and returns clean JSON the frontend can render without guessing.

const PRIMARY_MODEL = process.env.PLAYGRADE_MODEL || "claude-sonnet-4-5";
const FALLBACK_MODEL = "claude-sonnet-4-20250514";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB of base64 is plenty for a 600px photo

const VALID_GRADES = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F"];

const SYSTEM_PROMPT = `You are Playgrader, a warm and trustworthy second opinion for parents of kids ages 2 to 5.

When shown a photo, identify the item (TV show, movie, book, toy, food, game, app, or other product) and grade it A+ through F for how healthy, safe, and age-appropriate it is for ages 2 to 5.

Voice rules:
- Speak parent to parent. Warm, specific, slightly funny when it fits, never preachy.
- Grade the product, not the parent. Zero guilt trips.
- Lead with the reason for the grade. Be concrete ("12g added sugar per serving" beats "high in sugar").
- Acknowledge trade-offs. If it's an A, celebrate it.
- Admit uncertainty. If you cannot identify the item confidently, say so in the summary and grade only what you can see.
- Safety concerns (choking hazards, recalls, allergens, violent content) are stated plainly with no jokes.
- Never use em dashes or en dashes in any text. Use commas, periods, or colons instead.

Grading references: Common Sense Media, American Academy of Pediatrics screen time and toy safety guidance, WHO and USDA nutrition guidance for young children, CPSC recall knowledge.

Better Alternatives: always suggest 2 or 3 real, well-known products in the same category that a parent could actually find. If the item already earns an A or A+, frame them as "also worth a look" rather than replacements. Each alternative MUST include a letter grade and a "why" field with one short, specific reason (never leave "why" empty).

Categories: give 3 or 4 that fit the item type. Good picks: Age Appropriateness, Educational Value, Health & Safety, Nutrition, Screen Quality, Values & Messaging, Fun Factor, Creativity.`;

const GRADE_TOOL = {
  name: "submit_grade",
  description: "Submit the Playgrader report card for the item in the photo.",
  input_schema: {
    type: "object",
    properties: {
      item_name: { type: "string", description: "Specific product or title name, e.g. 'Bluey (Season 1)' or 'Goldfish Cheddar Crackers'" },
      item_type: { type: "string", enum: ["TV Show", "Movie", "Book", "Toy", "Food", "Game", "App", "Product"] },
      confidence: { type: "string", enum: ["high", "medium", "low"], description: "How sure you are about what the item is" },
      overall_grade: { type: "string", enum: VALID_GRADES },
      headline: { type: "string", description: "One punchy line, max 10 words, that sums up the verdict" },
      summary: { type: "string", description: "2 to 3 sentences explaining the grade, parent to parent" },
      categories: {
        type: "array",
        minItems: 3,
        maxItems: 4,
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            grade: { type: "string", enum: VALID_GRADES },
            note: { type: "string", description: "One specific sentence" },
          },
          required: ["name", "grade", "note"],
        },
      },
      quick_tip: { type: "string", description: "One actionable tip for a parent, max 30 words" },
      alternatives: {
        type: "array",
        minItems: 2,
        maxItems: 3,
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            grade: { type: "string", enum: VALID_GRADES },
            why: { type: "string", description: "One short reason, max 15 words" },
          },
          required: ["name", "grade", "why"],
        },
      },
      sources_note: { type: "string", description: "Short note on which guidelines informed this grade" },
    },
    required: ["item_name", "item_type", "confidence", "overall_grade", "headline", "summary", "categories", "quick_tip", "alternatives", "sources_note"],
  },
};

async function callClaude(apiKey, model, mediaType, imageBase64, fetchImpl) {
  return fetchImpl("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      tools: [GRADE_TOOL],
      tool_choice: { type: "tool", name: "submit_grade" },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
            { type: "text", text: "Grade this for a child ages 2 to 5 and submit the report card." },
          ],
        },
      ],
    }),
  });
}

function extractToolInput(data) {
  const block = (data?.content || []).find((b) => b.type === "tool_use" && b.name === "submit_grade");
  if (block && block.input && typeof block.input === "object") return block.input;
  // Fallback: some responses may still come back as text JSON.
  const text = (data?.content || []).map((b) => (b.type === "text" ? b.text : "")).join("").trim();
  if (!text) return null;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

const DASHES = /\s*[\u2014\u2013]+\s*/g;
function clean(v) {
  return String(v == null ? "" : v).replace(DASHES, ", ").replace(/,\s*,/g, ",").trim();
}

function normalize(parsed) {
  const grade = VALID_GRADES.includes(parsed.overall_grade) ? parsed.overall_grade : "C";
  const categories = Array.isArray(parsed.categories)
    ? parsed.categories
        .filter((c) => c && c.name)
        .map((c) => ({ name: clean(c.name), grade: VALID_GRADES.includes(c.grade) ? c.grade : "C", note: clean(c.note || c.reason || c.why || c.description || "") }))
    : [];
  const alternatives = Array.isArray(parsed.alternatives)
    ? parsed.alternatives
        .filter((a) => a && a.name)
        .map((a) => ({ name: clean(a.name), grade: VALID_GRADES.includes(a.grade) ? a.grade : "B", why: clean(a.why || a.reason || a.note || a.description || "") }))
    : [];
  return {
    item_name: clean(parsed.item_name) || "Unknown Item",
    item_type: parsed.item_type || "Product",
    confidence: parsed.confidence || "medium",
    overall_grade: grade,
    headline: clean(parsed.headline),
    summary: clean(parsed.summary) || "We could not fully assess this one. Try a clearer photo?",
    categories,
    quick_tip: clean(parsed.quick_tip),
    alternatives,
    sources_note: clean(parsed.sources_note),
    model: parsed.__model || undefined,
  };
}

export default async function handler(req, res, deps = {}) {
  const fetchImpl = deps.fetch || fetch;
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { image_base64, media_type } = req.body || {};
  if (!image_base64 || !media_type) {
    return res.status(400).json({ error: "Missing image data" });
  }
  if (!/^image\/(jpeg|png|webp|gif)$/.test(media_type)) {
    return res.status(400).json({ error: "Unsupported image type" });
  }
  if (image_base64.length > MAX_IMAGE_BYTES) {
    return res.status(413).json({ error: "Image too large. Try a smaller photo." });
  }

  const apiKey = deps.apiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "API key not configured" });
  }

  try {
    let model = PRIMARY_MODEL;
    let response = await callClaude(apiKey, model, media_type, image_base64, fetchImpl);

    // If the configured model name is not available on this account, fall back once.
    if (response.status === 404 && model !== FALLBACK_MODEL) {
      model = FALLBACK_MODEL;
      response = await callClaude(apiKey, model, media_type, image_base64, fetchImpl);
    }

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic API error:", response.status, errText);
      return res.status(502).json({ error: "The grader is taking a break. Try again in a minute.", status: response.status });
    }

    const data = await response.json();
    const parsed = extractToolInput(data);
    if (!parsed) {
      return res.status(502).json({ error: "We could not read that grade. Try a clearer photo?" });
    }
    parsed.__model = model;
    return res.status(200).json(normalize(parsed));
  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ error: "Something went sideways on our end. Try again?" });
  }
}

export { extractToolInput, normalize, GRADE_TOOL, VALID_GRADES };
