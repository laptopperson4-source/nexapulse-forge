// Cloudflare Pages Function — POST /api/layout
// Turns a plain-English place description into a small city-block layout (buildings, roads, props).
// Uses the same GROQ_API_KEY environment variable as functions/api/spec.js — no extra setup needed
// if you've already configured that one.

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

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 4096,
        response_format: { type: 'json_object' }
      })
    });

    if (!groqRes.ok) {
      const t = await groqRes.text();
      return new Response(JSON.stringify({ error: `Groq error ${groqRes.status}: ${t.slice(0,200)}` }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const data = await groqRes.json();
    const finishReason = data.choices?.[0]?.finish_reason;
    let layout;
    try {
      layout = JSON.parse(data.choices[0].message.content);
    } catch (parseErr) {
      return new Response(JSON.stringify({ error: `Groq returned malformed JSON (finish_reason: ${finishReason}): ${parseErr.message}` }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (!layout || !Array.isArray(layout.buildings) || layout.buildings.length === 0) {
      return new Response(JSON.stringify({ error: `Groq returned a layout with no buildings (finish_reason: ${finishReason}) — try again or simplify the description` }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response(JSON.stringify(layout), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
