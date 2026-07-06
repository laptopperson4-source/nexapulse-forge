// Cloudflare Pages Function — POST /api/spec
// Turns a plain-English description into a rig-ready 3D part-hierarchy JSON using Groq.
//
// Setup (dashboard only, no CLI):
// 1. Cloudflare dashboard > Workers & Pages > select this project > Settings > Environment variables
// 2. Add variable > Name: GROQ_API_KEY > Value: your gsk_... key > toggle "Encrypt" > Save
// 3. Redeploy the project (Deployments tab > Retry deployment) for the variable to take effect

const SYSTEM_PROMPT = `You are a 3D asset structure designer. Given a description, output ONLY valid JSON (no markdown, no prose) describing a rig-ready hierarchical 3D object made of primitive parts.

Schema:
{
  "name": "string",
  "category": "vehicle|weapon|character|building|prop",
  "parts": [
    {
      "id": "unique_string",
      "parent": "id_of_parent_part_or_null_for_root",
      "shape": "box|cylinder|sphere|cone|torus",
      "size": [x,y,z],
      "position": [x,y,z],
      "rotation": [x,y,z],
      "color": "#hex",
      "roughness": 0.0-1.0,
      "metalness": 0.0-1.0,
      "textureKind": "metal|wood|rust|fabric|smooth",
      "texturePrompt": "short description for AI texture generation, e.g. 'brushed steel with scratches'"
    }
  ]
}
Rules:
- 8 to 22 parts. Break the object into real functional/rig-relevant parts.
- Use a parent hierarchy so parts nest logically. Exactly one part has parent null (the root).
- position is relative to the parent's local space.
- Keep overall object roughly human/vehicle/weapon scaled in meters.
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
        temperature: 0.6,
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
    let spec;
    try {
      spec = JSON.parse(data.choices[0].message.content);
    } catch (parseErr) {
      return new Response(JSON.stringify({ error: `Groq returned malformed JSON (finish_reason: ${finishReason}): ${parseErr.message}` }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (!spec || !Array.isArray(spec.parts) || spec.parts.length === 0) {
      return new Response(JSON.stringify({ error: `Groq returned a spec with no parts (finish_reason: ${finishReason}) — try again or simplify the description` }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response(JSON.stringify(spec), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
