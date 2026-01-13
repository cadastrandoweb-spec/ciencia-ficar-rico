import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = Number(process.env.API_PORT || process.env.PORT || 3001);

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.status(200).json({ ok: true });
});

app.post('/api/create-payment', async (req, res) => {
  const { user, items, paymentMethod } = req.body ?? {};

  if (!user?.email || !Array.isArray(items) || items.length === 0) {
    res.status(400).json({ success: false, error: 'Invalid payload' });
    return;
  }

  res.status(200).json({
    success: true,
    preferenceId: 'pref_local_123',
    paymentUrl: 'https://example.com/checkout',
    received: { user, items, paymentMethod }
  });
});

app.post('/api/gemini/generate', async (req, res) => {
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
  } catch (e) {
    res.status(500).json({ error: 'Gemini request failed' });
  }
});

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
