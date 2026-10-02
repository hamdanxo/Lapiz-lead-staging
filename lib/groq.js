// Free AI pre-fill via Groq. Only fills blanks; the person still reviews every field.

const SYSTEM = `You extract sales lead details for Lapiz Blue, a UAE construction chemicals distributor.
Messages may be in English, Hinglish or Arabic, and may be forwarded chats or email bodies.
Return ONLY a JSON object with these keys (use null when not stated, never guess):
company: customer company or site name
contact_name: person's name
phone: customer phone number
email: customer email
approx_qty: quantity with units exactly as written, e.g. "40 bags", "200 sqm"
salesman: name of a Lapiz Blue salesman if the message says who should handle it
customer_category: pick ONE from the allowed categories list, or null
products: array picked ONLY from the allowed products list (can be empty)
notes: one short line of what the customer wants`;

export async function parseLead(text, { categories = [], products = [], salesmen = [] } = {}) {
  if (!process.env.GROQ_API_KEY) return null;
  const user = `Allowed categories: ${JSON.stringify(categories)}
Allowed products: ${JSON.stringify(products)}
Lapiz Blue salesmen: ${JSON.stringify(salesmen)}

Message:
"""${String(text || '').slice(0, 6000)}"""`;

  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }],
    }),
  });
  if (!r.ok) throw new Error(`Groq ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  let out;
  try { out = JSON.parse(j.choices[0].message.content); } catch { return null; }

  // Never trust the model on picklists: keep only exact allowed values.
  if (out.customer_category && !categories.includes(out.customer_category)) out.customer_category = null;
  out.products = Array.isArray(out.products) ? out.products.filter((p) => products.includes(p)) : [];
  return out;
}
