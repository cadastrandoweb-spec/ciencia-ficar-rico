export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    res.status(500).json({ error: 'Missing MP_ACCESS_TOKEN' });
    return;
  }

  const id = req.query?.id;
  if (!id) {
    res.status(400).json({ error: 'Missing id' });
    return;
  }

  try {
    const r = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(String(id))}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    const data = await r.json();

    if (!r.ok) {
      res.status(r.status).json(data);
      return;
    }

    res.status(200).json({
      id: data?.id,
      status: data?.status,
      status_detail: data?.status_detail
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch payment status' });
  }
}
