import { CardPaymentData, OrderForm, PaymentMethod } from '../types';
import { MAIN_PRODUCT, UPSELL_PRODUCT } from '../constants';

// This simulates the behavior of the Node.js backend
export const processCheckout = async (
  formData: OrderForm,
  paymentMethod: PaymentMethod,
  hasUpsell: boolean,
  cardPaymentData?: (CardPaymentData & { 
    paymentMethodId?: string; 
    installments?: number; 
    issuerId?: string 
  })
): Promise<{ success: boolean; message: string; paymentId?: string; status?: string; statusDetail?: string; qrCode?: string; qrCodeBase64?: string; ticketUrl?: string }> => {

  const getCookie = (name: string) => {
    try {
      const cookies = typeof document !== 'undefined' ? document.cookie : '';
      const parts = cookies.split(';').map(p => p.trim());
      const prefix = `${name}=`;
      const found = parts.find(p => p.startsWith(prefix));
      if (!found) return undefined;
      return decodeURIComponent(found.slice(prefix.length));
    } catch {
      return undefined;
    }
  };

  const getFbClickData = () => {
    try {
      const url = typeof window !== 'undefined' ? window.location.href : undefined;
      const fbclid = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('fbclid') ?? undefined : undefined;
      const fbp = getCookie('_fbp');
      const existingFbc = getCookie('_fbc');
      const fbc = existingFbc || (fbclid ? `fb.1.${Math.floor(Date.now() / 1000)}.${fbclid}` : undefined);
      const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : undefined;
      return { url, fbclid, fbp, fbc, userAgent };
    } catch {
      return { url: undefined, fbclid: undefined, fbp: undefined, fbc: undefined, userAgent: undefined };
    }
  };

  const items = [
    { id: MAIN_PRODUCT.id, title: MAIN_PRODUCT.name, price: MAIN_PRODUCT.price },
    ...(hasUpsell ? [{ id: UPSELL_PRODUCT.id, title: UPSELL_PRODUCT.name, price: UPSELL_PRODUCT.price }] : [])
  ];

  const meta = getFbClickData();

  const resp = await fetch('/api/create-payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user: {
        name: formData.name,
        email: formData.email,
        phone: formData.phone.replace(/\D/g, ''),
        document: formData.document.replace(/\D/g, '')
      },
      items,
      paymentMethod,
      meta,
      card: paymentMethod === PaymentMethod.CREDIT_CARD ? cardPaymentData : undefined
    })
  });

  if (!resp.ok) {
    let details: any = null;
    try {
      details = await resp.json();
    } catch {
      // ignore
    }
    const msg = details?.error || details?.message || `Payment creation failed (${resp.status})`;
    throw new Error(msg);
  }

  const data = await resp.json();
  return {
    success: Boolean(data?.success),
    message: data?.success ? 'Pagamento iniciado com sucesso!' : 'Falha ao iniciar pagamento.',
    paymentId: data?.paymentId,
    status: data?.status,
    statusDetail: data?.statusDetail,
    qrCode: data?.qrCode,
    qrCodeBase64: data?.qrCodeBase64,
    ticketUrl: data?.ticketUrl
  };
};