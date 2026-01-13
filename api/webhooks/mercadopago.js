import crypto from 'crypto';

async function sendMetaPurchaseEvent({
  paymentId,
  user,
  items,
  value,
  currency,
  eventSourceUrl,
  meta,
  clientUserAgent,
  clientIpAddress
}) {
  const pixelId = process.env.META_PIXEL_ID;
  const accessToken = process.env.META_ACCESS_TOKEN;

  if (!pixelId || !accessToken) return { skipped: true, reason: 'missing_meta_env' };

  const normalize = (v) => String(v || '').trim().toLowerCase();
  const digitsOnly = (v) => String(v || '').replace(/\D/g, '');
  const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');
  const hashIfPresent = (v) => {
    const s = normalize(v);
    if (!s) return undefined;
    return sha256(s);
  };

  const userData = {
    em: hashIfPresent(user?.email),
    ph: (() => {
      const p = digitsOnly(user?.phone);
      return p ? sha256(p) : undefined;
    })(),
    external_id: (() => {
      const doc = digitsOnly(user?.document);
      return doc ? sha256(doc) : undefined;
    })(),
    fbp: meta?.fbp ? String(meta.fbp) : undefined,
    fbc: meta?.fbc ? String(meta.fbc) : undefined
  };

  Object.keys(userData).forEach((k) => {
    if (userData[k] == null) delete userData[k];
  });

  const payload = {
    data: [
      {
        event_name: 'Purchase',
        event_time: Math.floor(Date.now() / 1000),
        event_id: paymentId ? String(paymentId) : undefined,
        action_source: 'website',
        event_source_url: eventSourceUrl,
        client_user_agent: clientUserAgent ? String(clientUserAgent) : undefined,
        client_ip_address: clientIpAddress ? String(clientIpAddress) : undefined,
        user_data: userData,
        custom_data: {
          currency,
          value: Number(value),
          contents: Array.isArray(items)
            ? items.map((it) => ({
                id: String(it?.id ?? ''),
                quantity: 1,
                item_price: Number(it?.price || 0)
              }))
            : undefined
        }
      }
    ]
  };

  if (process.env.META_TEST_EVENT_CODE) {
    payload.test_event_code = process.env.META_TEST_EVENT_CODE;
  }

  const url = `https://graph.facebook.com/v20.0/${encodeURIComponent(String(pixelId))}/events?access_token=${encodeURIComponent(String(accessToken))}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, data };
}

function getClientIp(req) {
  const candidates = [
    req.headers['x-vercel-forwarded-for'],
    req.headers['x-forwarded-for'],
    req.headers['x-real-ip']
  ];

  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) {
      return c.split(',')[0].trim();
    }
  }

  return req.socket?.remoteAddress;
}

async function callMemboxWebhook({ customer, productName, orderBumpId }) {
  const url = process.env.MEMBOX_WEBHOOK_URL;
  const credential = process.env.MEMBOX_WEBHOOK_CREDENTIAL;

  if (!url || !credential) {
    throw new Error('Missing MEMBOX_WEBHOOK_URL or MEMBOX_WEBHOOK_CREDENTIAL');
  }

  const payload = {
    type: 'insert',
    customer: {
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      document: customer.document
    },
    product: {
      name: productName
    },
    order_bumps: [{ id: orderBumpId }],
    credential
  };

  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const text = await r.text();
  if (!r.ok) {
    throw new Error(`Membox webhook failed: ${r.status} ${text}`);
  }

  return text;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).send('Method not allowed');
    return;
  }

  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    res.status(500).json({ error: 'Missing MP_ACCESS_TOKEN' });
    return;
  }

  // Mercado Pago geralmente envia: { action, api_version, data: { id }, date_created, id, live_mode, type, user_id }
  const paymentId = req.body?.data?.id ?? req.body?.data?.payment_id ?? req.query?.id;

  if (!paymentId) {
    res.status(200).json({ ok: true, ignored: true });
    return;
  }

  try {
    const r = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(String(paymentId))}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const payment = await r.json();

    if (!r.ok) {
      res.status(200).json({ ok: true, mp_error: payment });
      return;
    }

    if (payment?.status !== 'approved') {
      res.status(200).json({ ok: true, status: payment?.status });
      return;
    }

    const customer = {
      name: payment?.metadata?.customer_name,
      email: payment?.metadata?.customer_email,
      phone: payment?.metadata?.customer_phone,
      document: payment?.metadata?.customer_document
    };

    const meta = {
      fbp: payment?.metadata?.meta_fbp,
      fbc: payment?.metadata?.meta_fbc,
      fbclid: payment?.metadata?.meta_fbclid,
      url: payment?.metadata?.meta_url,
      userAgent: payment?.metadata?.meta_ua
    };

    try {
      const mpItems = payment?.metadata?.items;
      const items = Array.isArray(mpItems) ? mpItems : undefined;
      const value = Number(payment?.transaction_amount ?? payment?.metadata?.transaction_amount);

      if (Number.isFinite(value) && value > 0) {
        await sendMetaPurchaseEvent({
          paymentId: payment?.id,
          user: customer,
          items,
          value: Number(value.toFixed(2)),
          currency: 'BRL',
          eventSourceUrl: process.env.PUBLIC_SITE_URL,
          meta,
          clientUserAgent: meta?.userAgent,
          clientIpAddress: getClientIp(req)
        });
      }
    } catch {
      // ignore
    }

    // Campos obrigatórios no payload do Membox
    if (!customer.name || !customer.email || !customer.phone || !customer.document) {
      res.status(200).json({ ok: true, status: 'approved', membox_skipped: 'missing_customer_metadata' });
      return;
    }

    const productName = process.env.MEMBOX_PRODUCT_NAME || 'Mestres do Tráfego';
    const orderBumpId = process.env.MEMBOX_ORDER_BUMP_ID || 'main-prod-001';

    const memboxResult = await callMemboxWebhook({ customer, productName, orderBumpId });

    res.status(200).json({ ok: true, status: 'approved', membox: 'sent', memboxResult });
  } catch (e) {
    res.status(200).json({ ok: true, error: String(e?.message || e) });
  }
}
