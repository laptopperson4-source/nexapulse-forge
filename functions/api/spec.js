// Cloudflare Pages Function — POST /api/spec
// Turns a plain-English description into a rig-ready 3D part-hierarchy JSON using Groq.
//
// Setup (dashboard only, no CLI):
// 1. Cloudflare dashboard > Workers & Pages > select this project > Settings > Environment variables
// 2. Add variable > Name: GROQ_API_KEY > Value: your gsk_... key > toggle "Encrypt" > Save
// 3. Redeploy the project for the variable to take effect
//
// Model fallback: Groq's free tier gives each model its own separate rate-limit bucket
// (RPM/RPD), so if one model is rate-limited or returns a truncated/incomplete response,
// this tries the next model immediately rather than failing or waiting.

const MODEL_CANDIDATES = [
  'llama-3.3-70b-versatile',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'llama-3.1-8b-instant',
  'gemma2-9b-it',
  'llama-3.1-70b-versatile',
  'mixtral-8x7b-32768'
];

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

function validateSpec(spec) {
  if (!spec || !Array.isArray(spec.parts) || spec.parts.length === 0) {
    return 'response had no parts array';
  }
  return null;
}

// Tries each model in order. Moves to the next one on a rate limit, any other HTTP
// error, malformed JSON, or a response that fails validate() — e.g. cut off mid-generation.
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

    const { result, modelUsed } = await generateWithFallback(key, prompt, 4096, 0.6, validateSpec);
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
