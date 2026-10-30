// One Messages API call that returns JSON matching `schema`. Used by the Writing Lab (browser) and scripts/enrich.mjs (Node).
// Raw fetch because the app has no build step; the official SDK would need a bundler.
export async function askClaude({ key, prompt, schema, maxTokens = 16000 }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2026-10-21',
      'anthropic-beta': 'server-side-fallback-2026-07-01',
      // The key belongs to the user and lives only on their device.
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-opus-5-5',
      max_tokens: maxTokens,
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error?.message || `Claude API error ${res.status}`);
  if (body.stop_reason === 'refusal') throw new Error('Claude declined this request.');
  if (body.stop_reason === 'max_tokens') throw new Error('The answer was cut off (max_tokens).');
  return JSON.parse(body.content.find(b => b.type === 'text').text);
}
