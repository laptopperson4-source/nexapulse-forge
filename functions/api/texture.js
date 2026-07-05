// Cloudflare Pages Function — POST /api/texture
// Generates a seamless material texture using Workers AI (FLUX.1-schnell).
//
// Setup (dashboard only, no CLI):
// 1. Cloudflare dashboard > Workers & Pages > select this project > Settings > Bindings
// 2. Add > Workers AI > Variable name: AI > Save
// 3. Redeploy the project (a new push, or "Retry deployment") for the binding to take effect

export async function onRequestPost(context) {
  try {
    const { prompt } = await context.request.json();
    if (!prompt) {
      return new Response(JSON.stringify({ error: 'missing prompt' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const styledPrompt = `seamless tileable material texture, ${prompt}, flat even studio lighting, no shadows, top-down view, photoreal surface detail, 4k`;

    const result = await context.env.AI.run('@cf/black-forest-labs/flux-1-schnell', {
      prompt: styledPrompt,
      steps: 6
    });

    // flux-1-schnell returns { image: <base64 jpeg> }
    const binaryString = atob(result.image);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);

    return new Response(bytes, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=86400'
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
