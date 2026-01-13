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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    res.status(500).json({ success: false, error: 'Missing MP_ACCESS_TOKEN' });
    return;
  }

  const { user, items, paymentMethod, card, meta } = req.body ?? {};

  if (!user?.email || !Array.isArray(items) || items.length === 0) {
    res.status(400).json({ success: false, error: 'Invalid payload' });
    return;
  }

  if (paymentMethod !== 'pix' && paymentMethod !== 'credit_card') {
    res.status(400).json({ success: false, error: 'Invalid payment method' });
    return;
  }

  if (paymentMethod === 'credit_card') {
    if (!card?.token || !card?.paymentMethodId) {
      res.status(400).json({ success: false, error: 'Missing card token or payment method' });
      return;
    }
  }

  const total = items.reduce((acc, it) => acc + Number(it?.price || 0), 0);
  if (!Number.isFinite(total) || total <= 0) {
    res.status(400).json({ success: false, error: 'Invalid items total' });
    return;
  }

  const siteUrl = process.env.PUBLIC_SITE_URL;
  const notificationUrl = siteUrl ? `${siteUrl.replace(/\/$/, '')}/api/webhooks/mercadopago` : undefined;
  const eventSourceUrl = meta?.url ? String(meta.url) : siteUrl;

  const basePayload = {
    transaction_amount: Number(total.toFixed(2)),
    description: items.map(i => i?.title).filter(Boolean).join(' + ').slice(0, 240) || 'Compra',
    payer: {
      email: user.email
    },
    notification_url: notificationUrl,
    metadata: {
      customer_name: user?.name,
      customer_email: user?.email,
      customer_phone: user?.phone,
      customer_document: user?.document,
      meta_fbp: meta?.fbp ? String(meta.fbp) : undefined,
      meta_fbc: meta?.fbc ? String(meta.fbc) : undefined,
      meta_fbclid: meta?.fbclid ? String(meta.fbclid) : undefined,
      meta_url: meta?.url ? String(meta.url) : undefined,
      meta_ua: meta?.userAgent ? String(meta.userAgent) : undefined,
      items
    }
  };

  const payload =
    paymentMethod === 'pix'
      ? {
          ...basePayload,
          payment_method_id: 'pix'
        }
      : {
          ...basePayload,
          token: card?.token,
          installments: Number(card?.installments || 1),
          payment_method_id: card?.paymentMethodId,
          issuer_id: card?.issuerId,
          payer: {
            ...basePayload.payer,
            identification: {
              type: 'CPF',
              number: String(user?.document || '')
            }
          }
        };

  try {
    const idempotencyKey = crypto.randomUUID();
    const r = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idempotencyKey
      },
      body: JSON.stringify(payload)
    });

    const data = await r.json();

    if (!r.ok) {
      const causeText = Array.isArray(data?.cause)
        ? data.cause
            .map(c => {
              const code = c?.code ? String(c.code) : '';
              const desc = c?.description ? String(c.description) : '';
              const detail = c?.detail ? String(c.detail) : '';
              return [code, desc, detail].filter(Boolean).join(' - ');
            })
            .filter(Boolean)
            .join(' | ')
        : '';

      const mpMessage =
        data?.message ||
        data?.error ||
        data?.status ||
        (causeText ? `Mercado Pago: ${causeText}` : null) ||
        'Mercado Pago error';

      res.status(r.status).json({ success: false, error: String(mpMessage), details: data });
      return;
    }

    const tx = data?.point_of_interaction?.transaction_data;

    if (paymentMethod === 'credit_card' && data?.status === 'approved') {
      try {
        await sendMetaPurchaseEvent({
          paymentId: data?.id,
          user,
          items,
          value: Number(total.toFixed(2)),
          currency: 'BRL',
          eventSourceUrl,
          meta,
          clientUserAgent: meta?.userAgent || req.headers['user-agent'],
          clientIpAddress: getClientIp(req)
        });
      } catch {
        // ignore
      }
    }

    res.status(200).json({
      success: true,
      paymentId: data?.id,
      status: data?.status,
      statusDetail: data?.status_detail,
      qrCode: tx?.qr_code,
      qrCodeBase64: tx?.qr_code_base64,
      ticketUrl: tx?.ticket_url,
      received: { user, items, paymentMethod }
    });
  } catch {
    res.status(500).json({ success: false, error: 'Payment creation failed' });
  }
}
