// Cloudflare Pages Function — POST /api/layout
// Turns a plain-English place description into a small city-block layout (buildings, roads, props).
// Uses the same GROQ_API_KEY environment variable as functions/api/spec.js.
//
// Model fallback: same strategy as spec.js — each Groq model has its own free-tier rate
// limit bucket, so a rate-limited or truncated response falls through to the next model
// immediately instead of failing or waiting.

const MODEL_CANDIDATES = [
  'llama-3.3-70b-versatile',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'llama-3.1-8b-instant',
  'gemma2-9b-it',
  'llama-3.1-70b-versatile',
  'mixtral-8x7b-32768'
];

const SYSTEM_PROMPT = `You are an urban layout designer. Given a description of a place, output ONLY valid JSON (no markdown, no prose) describing a small city block / scene layout.

Schema:
{
  "name": "string",
  "groundSize": [width, depth],
  "buildings": [
    { "id":"string", "position":[x,z], "footprint":[w,d], "height":number, "rotationY":number, "color":"#hex", "textureKind":"brick|glass|concrete|metal|wood", "windowRows": integer, "lit": boolean }
  ],
  "roads": [ { "from":[x,z], "to":[x,z], "width": number } ],
  "props": [ { "kind":"tree|lamppost|car|bench|dumpster", "position":[x,z], "rotationY":number, "scale":number, "color":"#hex" } ]
}
Rules:
- groundSize should comfortably contain everything, typically 40-100 meters per side.
- 4 to 14 buildings, placed without overlapping, with sensible setback from roads.
- 1 to 6 road segments connecting the space logically (a street grid or a single main street).
- 6 to 20 props scattered believably (trees along sidewalks, lampposts along roads, parked cars near curbs).
- position/from/to coordinates are in meters on the ground plane (x,z), centered near [0,0].
- Output nothing but the JSON object.`;

function validateLayout(layout) {
  if (!layout || !Array.isArray(layout.buildings) || layout.buildings.length === 0) {
    return 'response had no buildings array';
  }
  return null;
}

async function generateWithFallback(apiKey, userPrompt, maxTokens, temperature, validate) {
  const attempts = [];
  for (const model of MODEL_CANDIDATES) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt }
          ],
          temperature,
          max_tokens: maxTokens,
          response_format: { type: 'json_object' }
        })
      });

      if (!res.ok) {
        const t = await res.text();
        attempts.push(`${model}: HTTP ${res.status} ${t.slice(0,80)}`);
        continue;
      }

      const data = await res.json();
      const finishReason = data.choices?.[0]?.finish_reason;
      let parsed;
      try {
        parsed = JSON.parse(data.choices[0].message.content);
      } catch (parseErr) {
        attempts.push(`${model}: malformed JSON, finish_reason=${finishReason}`);
        continue;
      }

      const validationError = validate(parsed);
      if (validationError) {
        attempts.push(`${model}: ${validationError}, finish_reason=${finishReason}`);
        continue;
      }

      return { result: parsed, modelUsed: model };
    } catch (err) {
      attempts.push(`${model}: ${err.message}`);
    }
  }
  throw new Error(`All models failed — ${attempts.join(' | ')}`);
}

export async function onRequestPost(context) {
  try {
    const { prompt } = await context.request.json();
    if (!prompt) {
      return new Response(JSON.stringify({ error: 'missing prompt' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const key = context.env.GROQ_API_KEY;
    if (!key) {
      return new Response(JSON.stringify({ error: 'GROQ_API_KEY is not set on this Pages project (Settings > Environment variables)' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { result, modelUsed } = await generateWithFallback(key, prompt, 4096, 0.7, validateLayout);
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json', 'X-Model-Used': modelUsed }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
