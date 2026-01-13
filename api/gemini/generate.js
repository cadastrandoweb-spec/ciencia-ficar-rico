export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Missing GEMINI_API_KEY' });
    return;
  }

  const { model = 'gemini-1.5-flash', contents } = req.body ?? {};

  if (!Array.isArray(contents) || contents.length === 0) {
    res.status(400).json({ error: 'Invalid payload: expected { contents: [...] }' });
    return;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents })
    });

    const data = await r.json();

    if (!r.ok) {
      res.status(r.status).json(data);
      return;
    }

    res.status(200).json(data);
  } catch {
    res.status(500).json({ error: 'Gemini request failed' });
  }
}
