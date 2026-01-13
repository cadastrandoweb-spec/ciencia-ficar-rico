import React, { useState, useEffect, useRef } from 'react';
import { CreditCard, QrCode, AlertCircle, Lock, MapPin } from 'lucide-react';
import { CardPaymentData, PaymentMethod, OrderForm, PixPaymentData } from '../types';
import { Input } from './ui/Input';
import { MAIN_PRODUCT } from '../constants';

interface CheckoutFormProps {
  formData: OrderForm;
  setFormData: React.Dispatch<React.SetStateAction<OrderForm>>;
  paymentMethod: PaymentMethod;
  setPaymentMethod: (method: PaymentMethod) => void;
  upsellSelected: boolean;
  setUpsellSelected: (selected: boolean) => void;
  onSubmit: (cardPaymentData?: (CardPaymentData & { paymentMethodId?: string })) => Promise<void>;
  isProcessing: boolean;
  errors: Partial<Record<keyof OrderForm, string>>;
  pixPayment: PixPaymentData | null;
}

export const CheckoutForm: React.FC<CheckoutFormProps> = ({
  formData,
  setFormData,
  paymentMethod,
  setPaymentMethod,
  upsellSelected,
  setUpsellSelected,
  onSubmit,
  isProcessing,
  errors,
  pixPayment
}) => {
  const [loadingCep, setLoadingCep] = useState(false);
  const [pixStatus, setPixStatus] = useState<string | null>(null);
  const [pixChecking, setPixChecking] = useState(false);
  const [cardholderName, setCardholderName] = useState('');
  const [mpReady, setMpReady] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [cardBin, setCardBin] = useState<string>('');
  const [cardPaymentMethodId, setCardPaymentMethodId] = useState<string>('');
  const [cardIssuerId, setCardIssuerId] = useState<string>('');
  const [cardIssuers, setCardIssuers] = useState<Array<{ id: string; name?: string }> | null>(null);
  const [cardTokenizing, setCardTokenizing] = useState(false);
  const [cardInstallmentOptions, setCardInstallmentOptions] = useState<
    Array<{ installments: number; installmentAmount: number; totalAmount: number; message?: string }>
  >([]);
  const [cardInstallments, setCardInstallments] = useState<number>(1);
  const [cardInstallmentsLoading, setCardInstallmentsLoading] = useState(false);
  const [cardInstallmentsUnavailable, setCardInstallmentsUnavailable] = useState(false);
  const [cardInstallmentsDebug, setCardInstallmentsDebug] = useState<string>('');

  const mpRef = useRef<any>(null);
  const mpFieldsRef = useRef<any>(null);
  const pixPurchaseTrackedRef = useRef(false);

  const totalAmount = MAIN_PRODUCT.price;

  const trackFbEvent = (eventName: string, params?: Record<string, any>) => {
    const fbq = (window as any)?.fbq;
    if (typeof fbq !== 'function') return;
    try {
      fbq('track', eventName, params);
    } catch {
      // ignore
    }
  };

  const formatBRL = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleCepBlur = async (e: React.FocusEvent<HTMLInputElement>) => {
    const cep = e.target.value.replace(/\D/g, '');
    if (cep.length === 8) {
      setLoadingCep(true);
      try {
        const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await response.json();
        if (!data.erro) {
          setFormData(prev => ({
            ...prev,
            street: data.logradouro,
            neighborhood: data.bairro,
            city: data.localidade,
            state: data.uf,
          }));
        } else {
          // Handle CEP not found if needed
        }
      } catch (error) {
        console.error("Erro ao buscar CEP:", error);
      } finally {
        setLoadingCep(false);
      }
    }
  };

  const hasErrors = Object.keys(errors).length > 0;

  const copyPixCode = async () => {
    if (!pixPayment?.qrCode) return;
    try {
      await navigator.clipboard.writeText(pixPayment.qrCode);
    } catch {
      // ignore
    }
  };

  const checkPixStatus = async () => {
    if (!pixPayment?.paymentId) return;
    setPixChecking(true);
    try {
      const r = await fetch(`/api/payment-status?id=${encodeURIComponent(pixPayment.paymentId)}`);
      const data = await r.json();
      const status = data?.status;
      setPixStatus(status || null);
      if (status === 'approved') {
        if (!pixPurchaseTrackedRef.current) {
          pixPurchaseTrackedRef.current = true;
          try {
            const fbq = (window as any)?.fbq;
            const params = {
              value: Number(totalAmount.toFixed(2)),
              currency: 'BRL'
            };
            const eventId = pixPayment?.paymentId ? String(pixPayment.paymentId) : undefined;
            if (typeof fbq === 'function') {
              fbq('track', 'Purchase', params, eventId ? { eventID: eventId } : undefined);
            } else {
              trackFbEvent('Purchase', params);
            }
          } catch {
            // ignore
          }
        }
        window.setTimeout(() => {
          window.location.href = 'https://www.xandr.com.br/obrigado-rico';
        }, 800);
      }
    } catch {
      // ignore
    } finally {
      setPixChecking(false);
    }
  };

  useEffect(() => {
    if (!pixPayment?.paymentId) return;
    if (paymentMethod !== PaymentMethod.PIX) return;
    if (pixStatus === 'approved') return;

    const interval = window.setInterval(() => {
      void checkPixStatus();
    }, 4000);

    return () => {
      window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pixPayment?.paymentId, paymentMethod]);

  const refreshInstallments = async (args: {
    bin: string;
    amount: number;
    paymentMethodId?: string;
  }) => {
    const publicKey = import.meta.env.VITE_MP_PUBLIC_KEY?.trim();
    const MercadoPagoCtor = (window as any).MercadoPago;

    if (!publicKey || !MercadoPagoCtor) {
      setCardInstallmentsUnavailable(true);
      setCardInstallmentsDebug('DEBUG[v2-installments]: SDK/PK ausente');
      return;
    }
    if (!args.bin || String(args.bin).length < 6) {
      setCardInstallmentsUnavailable(false);
      setCardInstallmentsDebug('DEBUG[v2-installments]: BIN incompleto');
      return;
    }

    const normalizedAmountNumber = Number(args.amount);
    if (!Number.isFinite(normalizedAmountNumber) || normalizedAmountNumber <= 0) {
      setCardInstallmentsUnavailable(true);
      setCardInstallmentsDebug(`DEBUG[v2-installments]: amount inválido (${String(args.amount)})`);
      return;
    }

    const normalizedAmount = normalizedAmountNumber.toFixed(2);

    setCardInstallmentsLoading(true);
    setCardInstallmentsUnavailable(false);
    setCardInstallmentsDebug(`DEBUG[v2-installments]: bin=${String(args.bin)} amount=${normalizedAmount}`);

    try {
      const mp = new MercadoPagoCtor(publicKey, { locale: 'pt-BR' });
      const instResp = await mp.getInstallments({
        amount: normalizedAmount,
        bin: args.bin,
        paymentMethodId: args.paymentMethodId,
        locale: 'pt-BR'
      });

      try {
        setCardInstallmentsDebug(JSON.stringify(instResp));
      } catch {
        setCardInstallmentsDebug('DEBUG[v2-installments]: resposta não serializável');
      }

      const instArr = Array.isArray(instResp) ? instResp : instResp?.results;
      const payerCosts = instArr?.[0]?.payer_costs;
      if (Array.isArray(payerCosts) && payerCosts.length > 0) {
        const mapped = payerCosts
          .filter((pc: any) => Number(pc?.installments) >= 1)
          .map((pc: any) => ({
            installments: Number(pc?.installments),
            installmentAmount: Number(pc?.installment_amount),
            totalAmount: Number(pc?.total_amount),
            message: pc?.recommended_message ? String(pc.recommended_message) : undefined
          }))
          .filter((x: any) => Number.isFinite(x.installments) && x.installments <= 12);

        setCardInstallmentOptions(mapped);
        setCardInstallmentsUnavailable(mapped.length === 0);
        if (!mapped.some(m => m.installments === cardInstallments)) {
          setCardInstallments(mapped?.[0]?.installments || 1);
        }
      } else {
        setCardInstallmentOptions([]);
        setCardInstallments(1);
        setCardInstallmentsUnavailable(true);
      }
    } catch (e: any) {
      setCardInstallmentOptions([]);
      setCardInstallments(1);
      setCardInstallmentsUnavailable(true);
      const safeString = () => {
        try {
          if (typeof e === 'string') return e;
        } catch {
          // ignore
        }
        try {
          return String(e);
        } catch {
          return 'unknown_error';
        }
      };

      const ownKeys = (() => {
        try {
          return Reflect.ownKeys(e ?? {}).map(k => String(k));
        } catch {
          return [];
        }
      })();

      const ownProps: Record<string, any> = {};
      for (const k of ownKeys) {
        try {
          // @ts-ignore
          ownProps[k] = (e as any)[k];
        } catch {
          ownProps[k] = '[unreadable]';
        }
      }

      const details: any = {
        name: (e as any)?.name,
        message: (e as any)?.message,
        status: (e as any)?.status,
        error: (e as any)?.error,
        cause: (e as any)?.cause,
        data: (e as any)?.data,
        stack: (e as any)?.stack,
        asString: safeString(),
        ownKeys,
        ownProps
      };

      const replacer = (_key: string, value: any) => {
        if (typeof value === 'function') return '[function]';
        if (value instanceof Error) {
          return { name: value.name, message: value.message, stack: value.stack };
        }
        return value;
      };

      let rendered = '';
      try {
        rendered = JSON.stringify(details, replacer);
      } catch {
        rendered = safeString();
      }

      setCardInstallmentsDebug(`DEBUG[v2-installments]: erro ${rendered}`);
    } finally {
      setCardInstallmentsLoading(false);
    }
  };

  useEffect(() => {
    if (paymentMethod !== PaymentMethod.CREDIT_CARD) return;
    if (!cardBin || String(cardBin).length < 6 || !cardPaymentMethodId) return;
    void refreshInstallments({
      bin: cardBin,
      amount: totalAmount,
      paymentMethodId: cardPaymentMethodId
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentMethod, cardBin, cardPaymentMethodId, cardIssuerId, totalAmount]);

  useEffect(() => {
    if (paymentMethod !== PaymentMethod.CREDIT_CARD) return;

    console.log('DEBUG: Inicializando Mercado Pago para cartão de crédito...');
    
    try {
      const publicKey = import.meta.env.VITE_MP_PUBLIC_KEY?.trim();
      console.log('DEBUG: Chave pública:', publicKey ? 'OK' : 'MISSING');
      
      if (!publicKey) {
        console.error('DEBUG: Chave pública do Mercado Pago não configurada');
        setCardError('Chave pública do Mercado Pago não configurada.');
        return;
      }

      const MercadoPagoCtor = (window as any).MercadoPago;
      console.log('DEBUG: MercadoPago SDK:', MercadoPagoCtor ? 'OK' : 'MISSING');
      
      if (!MercadoPagoCtor) {
        console.error('DEBUG: SDK do Mercado Pago não carregou');
        setCardError('SDK do Mercado Pago não carregou. Recarregue a página.');
        return;
      }

      setCardError(null);

      console.log('DEBUG: Criando instância do Mercado Pago...');
      const mp = new MercadoPagoCtor(publicKey, { locale: 'pt-BR' });
      mpRef.current = mp;
      const fields = mp.fields;
      mpFieldsRef.current = fields;

      console.log('DEBUG: Criando campos do cartão...');
      const cardNumberField = fields.create('cardNumber', { placeholder: 'Número do cartão', primary: true });
      const securityCodeField = fields.create('securityCode', { placeholder: 'CVV' });
      const expirationMonthField = fields.create('expirationMonth', { placeholder: 'MM' });
      const expirationYearField = fields.create('expirationYear', { placeholder: 'AA' });

      console.log('DEBUG: Montando campos no DOM...');
      cardNumberField.mount('mp-card-number');
      securityCodeField.mount('mp-security-code');
      expirationMonthField.mount('mp-expiration-month');
      expirationYearField.mount('mp-expiration-year');

      console.log('DEBUG: Campos montados com sucesso');
      setMpReady(true);

      const onBinChange = async (e: any) => {
        const bin = e?.bin;
        console.log('DEBUG: BIN alterado:', bin);
        setCardBin(bin || '');
        if (!bin || String(bin).length < 6) {
          setCardPaymentMethodId('');
          setCardIssuerId('');
          setCardIssuers(null);
          setCardInstallmentOptions([]);
          setCardInstallments(1);
          setCardInstallmentsUnavailable(false);
          return;
        }
        try {
          const pm = await mp.getPaymentMethods({ bin });
          const pmId = pm?.results?.[0]?.id;
          setCardPaymentMethodId(pmId || '');

          const issuersResp = await mp.getIssuers({ paymentMethodId: pmId, bin });
          const issuers = Array.isArray(issuersResp) ? issuersResp : issuersResp?.results;
          if (Array.isArray(issuers) && issuers.length > 0) {
            setCardIssuers(issuers.map((i: any) => ({ id: String(i?.id), name: i?.name ? String(i.name) : undefined })));
            setCardIssuerId(String(issuers[0]?.id || ''));
          } else {
            setCardIssuerId('');
            setCardIssuers(null);
          }

          await refreshInstallments({
            bin,
            amount: totalAmount,
            paymentMethodId: pmId
          });
        } catch {
          setCardPaymentMethodId('');
          setCardIssuerId('');
          setCardIssuers(null);
          setCardInstallmentOptions([]);
          setCardInstallments(1);
          setCardInstallmentsUnavailable(true);
        }
      };

      cardNumberField.on('binChange', onBinChange);

      return () => {
        console.log('DEBUG: Limpando campos do Mercado Pago...');
        setMpReady(false);
        mpRef.current = null;
        mpFieldsRef.current = null;
        setCardBin('');
        setCardPaymentMethodId('');
        setCardIssuerId('');
        setCardIssuers(null);
        setCardInstallmentOptions([]);
        setCardInstallments(1);
        setCardInstallmentsUnavailable(false);
        setCardInstallmentsLoading(false);
        setCardInstallmentsDebug('');
        try {
          cardNumberField.unmount();
          securityCodeField.unmount();
          expirationMonthField.unmount();
          expirationYearField.unmount();
        } catch {
          // ignore
        }
      };
    } catch (error) {
      console.error('DEBUG: Erro geral ao inicializar Mercado Pago:', error);
      setCardError('Erro ao inicializar pagamento com cartão. Tente recarregar a página.');
      setMpReady(false);
    }
  }, [paymentMethod]);

  const submitCreditCard = async () => {
    const publicKey = import.meta.env.VITE_MP_PUBLIC_KEY?.trim();
    const MercadoPagoCtor = (window as any).MercadoPago;
    if (!publicKey || !MercadoPagoCtor) {
      setCardError('Cartão indisponível no momento.');
      return;
    }

    if (!cardholderName.trim()) {
      setCardError('Informe o nome do titular do cartão.');
      return;
    }

    const cleanDoc = formData.document.replace(/\D/g, '');
    if (cleanDoc.length !== 11) {
      setCardError('Para cartão, informe um CPF válido.');
      return;
    }

    if (!mpReady) {
      setCardError('Carregando campos do cartão...');
      return;
    }

    if (!cardPaymentMethodId) {
      setCardError('Não foi possível identificar o cartão.');
      return;
    }

    setCardError(null);
    setCardTokenizing(true);
    try {
      const fields = mpFieldsRef.current;
      if (!fields) {
        setCardError('Carregando campos do cartão...');
        return;
      }

      const tokenResp = await fields.createCardToken({
        cardholderName: cardholderName.trim(),
        identificationType: 'CPF',
        identificationNumber: cleanDoc
      });

      const token = tokenResp?.id;
      if (!token) {
        setCardError('Não foi possível tokenizar o cartão.');
        return;
      }

      await onSubmit({
        token,
        bin: cardBin,
        issuerId: cardIssuerId || undefined,
        installments: cardInstallments,
        paymentMethodId: cardPaymentMethodId
      });
    } catch (e: any) {
      const ownKeys = (() => {
        try {
          return Reflect.ownKeys(e ?? {}).map(k => String(k));
        } catch {
          return [];
        }
      })();
      const ownProps: Record<string, any> = {};
      for (const k of ownKeys) {
        try {
          // @ts-ignore
          ownProps[k] = (e as any)[k];
        } catch {
          ownProps[k] = '[unreadable]';
        }
      }
      const details: any = {
        name: (e as any)?.name,
        message: (e as any)?.message,
        status: (e as any)?.status,
        error: (e as any)?.error,
        cause: (e as any)?.cause,
        data: (e as any)?.data,
        ownKeys,
        ownProps
      };
      let rendered = '';
      try {
        rendered = JSON.stringify(details);
      } catch {
        try {
          rendered = JSON.stringify(e, Object.getOwnPropertyNames(e));
        } catch {
          rendered = 'unknown_error';
        }
      }
      setCardError(`Erro ao processar cartão: ${rendered}`);
    } finally {
      setCardTokenizing(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-6 md:p-8">
      
      {/* SECTION 1: USER DATA */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-slate-800 mb-6 flex items-center">
          OS SEUS DADOS
        </h2>
        
        <div className="space-y-5">
          <Input 
            label="Nome e sobrenome" 
            name="name" 
            required 
            value={formData.name}
            onChange={handleInputChange}
            placeholder="Digite seu nome completo"
            error={!!errors.name}
            errorMessage={errors.name}
          />
          
          <Input 
            label="E-mail" 
            name="email" 
            type="email" 
            required 
            value={formData.email}
            onChange={handleInputChange}
            placeholder="seu@email.com"
            error={!!errors.email}
            errorMessage={errors.email}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="relative">
              <label className="block text-sm font-medium text-slate-600 mb-1">
                Celular <span className="text-brand-600">*</span>
              </label>
              <div className="flex border-b-2 border-slate-200 focus-within:border-brand-600 transition-colors">
                 <div className="flex items-center pr-2 border-r border-slate-200">
                    {/* Simple flag representation */}
                    <span role="img" aria-label="Brasil" className="text-lg mr-1">🇧🇷</span>
                    <span className="text-slate-500 text-sm">+55</span>
                 </div>
                 <input 
                    name="phone"
                    className="w-full bg-transparent py-2 pl-3 text-slate-800 focus:outline-none placeholder-slate-400"
                    placeholder="(00) 00000-0000"
                    value={formData.phone}
                    onChange={handleInputChange}
                 />
              </div>
               {errors.phone && <p className="mt-1 text-xs text-red-500">{errors.phone}</p>}
            </div>

            <Input 
              label="CPF / CNPJ" 
              name="document" 
              required 
              value={formData.document}
              onChange={handleInputChange}
              placeholder="000.000.000-00"
              error={!!errors.document}
              errorMessage={errors.document}
            />
          </div>
        </div>
      </div>

      {/* SECTION 2: ADDRESS */}
      <div className="mb-8 border-t border-slate-100 pt-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-6 flex items-center gap-2">
           <MapPin size={20} className="text-brand-600" />
           ENDEREÇO
        </h2>
        
        <div className="space-y-5">
           <div className="w-full md:w-1/2">
             <Input 
               label="CEP" 
               name="zipCode" 
               required 
               value={formData.zipCode}
               onChange={handleInputChange}
               onBlur={handleCepBlur}
               placeholder="00000-000"
               error={!!errors.zipCode}
               errorMessage={errors.zipCode}
             />
             {loadingCep && <p className="text-xs text-brand-600 mt-1">Buscando endereço...</p>}
           </div>

           {/* Address Fields - displayed only if CEP has value (or always, but auto-filled) */}
           <div className="grid grid-cols-1 md:grid-cols-12 gap-5 animate-fadeIn">
              <div className="md:col-span-8">
                 <Input 
                   label="Endereço" 
                   name="street" 
                   required 
                   value={formData.street}
                   onChange={handleInputChange}
                   placeholder="Rua, Avenida, etc."
                   error={!!errors.street}
                   errorMessage={errors.street}
                 />
              </div>
              <div className="md:col-span-4">
                 <Input 
                   label="Número" 
                   name="number" 
                   required 
                   value={formData.number}
                   onChange={handleInputChange}
                   placeholder="123"
                   error={!!errors.number}
                   errorMessage={errors.number}
                 />
              </div>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Input 
                label="Complemento" 
                name="complement" 
                value={formData.complement}
                onChange={handleInputChange}
                placeholder="Apto, Bloco, etc. (Opcional)"
              />
              <Input 
                label="Bairro" 
                name="neighborhood" 
                required 
                value={formData.neighborhood}
                onChange={handleInputChange}
                placeholder="Bairro"
                error={!!errors.neighborhood}
                errorMessage={errors.neighborhood}
              />
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Input 
                label="Cidade" 
                name="city" 
                required 
                value={formData.city}
                onChange={handleInputChange}
                placeholder="Cidade"
                error={!!errors.city}
                errorMessage={errors.city}
              />
              <Input 
                label="Estado" 
                name="state" 
                required 
                value={formData.state}
                onChange={handleInputChange}
                placeholder="UF"
                error={!!errors.state}
                errorMessage={errors.state}
              />
           </div>
        </div>
      </div>

      {/* SECTION 3: PAYMENT METHOD */}
      <div className="mb-8 border-t border-slate-100 pt-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">
          MÉTODO DE PAGAMENTO
        </h2>

        <div className="space-y-4">
          {/* PIX Option */}
          <div 
            onClick={() => setPaymentMethod(PaymentMethod.PIX)}
            className={`cursor-pointer rounded-lg p-0 transition-all duration-200 ${paymentMethod === PaymentMethod.PIX ? '' : 'opacity-70 hover:opacity-100'}`}
          >
            <div className="flex items-center space-x-3 mb-2">
               <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${paymentMethod === PaymentMethod.PIX ? 'border-brand-600' : 'border-slate-300'}`}>
                  {paymentMethod === PaymentMethod.PIX && <div className="w-2.5 h-2.5 rounded-full bg-brand-600" />}
               </div>
               <div className="flex items-center space-x-2 text-brand-600 font-bold">
                 <QrCode size={20} />
                 <span>PIX</span>
               </div>
            </div>

            {paymentMethod === PaymentMethod.PIX && (
              <div className="ml-8 border border-slate-200 rounded-lg p-4 bg-slate-50 text-sm text-slate-600">
                <div className="flex items-start space-x-2 mb-2 text-brand-600 font-semibold">
                  <AlertCircle size={16} className="mt-0.5" />
                  <span>ATENÇÃO A ESTES DETALHES:</span>
                </div>
                <ul className="list-disc pl-5 space-y-1 text-slate-500 text-xs">
                  <li>Somente à vista;</li>
                  <li>O(s) produto(s) será(ão) liberado(s) somente após recebermos a confirmação de pagamento;</li>
                  <li>Fique atento(a) à data de vencimento. Após a expiração, será necessário refazer seu pedido.</li>
                </ul>

                {pixPayment?.paymentId && (
                  <div className="mt-4 border-t border-slate-200 pt-4">
                    <div className="text-xs text-slate-500 mb-2">
                      Após o pagamento, confirmamos automaticamente (pode levar alguns segundos).
                    </div>
                    {pixPayment.qrCodeBase64 && (
                      <div className="flex justify-center">
                        <img
                          src={`data:image/png;base64,${pixPayment.qrCodeBase64}`}
                          alt="QR Code PIX"
                          width={220}
                          height={220}
                          loading="eager"
                          decoding="async"
                          className="rounded-md bg-white p-2"
                        />
                      </div>
                    )}

                    {pixPayment.qrCode && (
                      <div className="mt-3">
                        <div className="text-xs text-slate-500 mb-2">PIX Copia e Cola</div>
                        <textarea
                          readOnly
                          value={pixPayment.qrCode}
                          className="w-full text-xs p-2 rounded-md border border-slate-200 bg-white text-slate-700"
                          rows={3}
                        />
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={copyPixCode}
                            className="px-3 py-2 rounded-md bg-brand-500 text-white text-xs font-semibold hover:bg-brand-600 transition-colors"
                          >
                            Copiar código
                          </button>
                          <button
                            type="button"
                            onClick={checkPixStatus}
                            disabled={pixChecking}
                            className="px-3 py-2 rounded-md border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-100 transition-colors disabled:opacity-60"
                          >
                            {pixChecking ? 'Verificando...' : 'Já paguei'}
                          </button>
                        </div>
                        {pixStatus && (
                          <div className="mt-2 text-xs text-slate-500">Status: {pixStatus}</div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Credit Card Option */}
          <div 
            onClick={() => {
              try {
                console.log('DEBUG: Selecionando cartão de crédito...');
                setPaymentMethod(PaymentMethod.CREDIT_CARD);
              } catch (error) {
                console.error('DEBUG: Erro ao selecionar cartão de crédito:', error);
                setCardError('Erro ao selecionar cartão de crédito. Tente novamente.');
              }
            }}
            className={`cursor-pointer flex items-center space-x-3 ${paymentMethod === PaymentMethod.CREDIT_CARD ? '' : 'opacity-70 hover:opacity-100'}`}
          >
             <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${paymentMethod === PaymentMethod.CREDIT_CARD ? 'border-brand-600' : 'border-slate-300'}`}>
                  {paymentMethod === PaymentMethod.CREDIT_CARD && <div className="w-2.5 h-2.5 rounded-full bg-brand-600" />}
             </div>
             <div className="flex items-center space-x-2 text-slate-700 font-medium">
               <CreditCard size={20} />
               <span>Cartão de Crédito</span>
             </div>
          </div>

          {paymentMethod === PaymentMethod.CREDIT_CARD && (
            <div className="ml-8 border border-slate-200 rounded-lg p-4 bg-slate-50 text-sm text-slate-600">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">
                    Nome do titular <span className="text-brand-600">*</span>
                  </label>
                  <input
                    value={cardholderName}
                    onChange={(e) => setCardholderName(e.target.value)}
                    className="w-full bg-transparent py-2 text-slate-800 focus:outline-none placeholder-slate-400 border-b-2 border-slate-200 focus:border-brand-600 transition-colors"
                    placeholder="Como no cartão"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">
                    Número do cartão <span className="text-brand-600">*</span>
                  </label>
                  <div id="mp-card-number" className="bg-white rounded-md border border-slate-200 px-3 h-11 flex items-center overflow-hidden" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">
                      Validade (MM) <span className="text-brand-600">*</span>
                    </label>
                    <div id="mp-expiration-month" className="bg-white rounded-md border border-slate-200 px-3 h-11 flex items-center overflow-hidden" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">
                      Validade (AA) <span className="text-brand-600">*</span>
                    </label>
                    <div id="mp-expiration-year" className="bg-white rounded-md border border-slate-200 px-3 h-11 flex items-center overflow-hidden" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">
                      CVV <span className="text-brand-600">*</span>
                    </label>
                    <div id="mp-security-code" className="bg-white rounded-md border border-slate-200 px-3 h-11 flex items-center overflow-hidden" />
                  </div>
                </div>

                {Array.isArray(cardIssuers) && cardIssuers.length > 1 && (
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">
                      Banco (Emissor) <span className="text-brand-600">*</span>
                    </label>
                    <select
                      value={cardIssuerId}
                      onChange={(e) => setCardIssuerId(e.target.value)}
                      className="w-full bg-white rounded-md border border-slate-200 p-3 text-slate-800"
                    >
                      {cardIssuers.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name ? i.name : i.id}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {Array.isArray(cardInstallmentOptions) && cardInstallmentOptions.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">
                      Parcelamento <span className="text-brand-600">*</span>
                    </label>
                    <select
                      value={String(cardInstallments)}
                      onChange={(e) => setCardInstallments(Number(e.target.value || 1))}
                      className="w-full bg-white rounded-md border border-slate-200 p-3 text-slate-800"
                    >
                      {cardInstallmentOptions
                        .slice()
                        .sort((a, b) => a.installments - b.installments)
                        .map((opt) => (
                          <option key={opt.installments} value={String(opt.installments)}>
                            {opt.message
                              ? opt.message
                              : `${opt.installments}x de ${formatBRL(opt.installmentAmount)} (total ${formatBRL(opt.totalAmount)})`}
                          </option>
                        ))}
                    </select>
                    {cardInstallments > 1 && (
                      <div className="mt-1 text-xs text-slate-500">
                        Total: {formatBRL(
                          cardInstallmentOptions.find((o) => o.installments === cardInstallments)?.totalAmount ||
                            totalAmount
                        )}
                      </div>
                    )}
                  </div>
                )}
                {cardInstallmentsLoading && (
                  <div className="text-xs text-slate-500">Carregando opções de parcelamento...</div>
                )}
                {!cardInstallmentsLoading && cardInstallmentsUnavailable && cardBin && cardBin.length >= 6 && (
                  <div className="text-xs text-slate-500">
                    Parcelamento à vista disponível para este cartão.
                  </div>
                )}
                {cardError && (
                  <div className="text-xs text-red-500">{cardError}</div>
                )}

                <button
                  type="button"
                  onClick={submitCreditCard}
                  disabled={isProcessing || cardTokenizing}
                  className="px-3 py-2 rounded-md bg-brand-500 text-white text-xs font-semibold hover:bg-brand-600 transition-colors disabled:opacity-60"
                >
                  {isProcessing || cardTokenizing ? 'Processando...' : 'Pagar com cartão'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* SUBMIT */}
      <div>
        {hasErrors && (
          <div className="mb-4 bg-red-100 text-red-600 text-sm py-2 px-3 rounded-md text-center font-medium">
            *Existem campos inválidos ou não preenchidos
          </div>
        )}
        
        <button
          onClick={paymentMethod === PaymentMethod.CREDIT_CARD ? submitCreditCard : () => {
            void onSubmit();
          }}
          disabled={isProcessing}
          className={`
            w-full py-4 rounded-lg shadow-lg text-white font-bold text-lg uppercase tracking-wide
            flex items-center justify-center space-x-2
            transition-all duration-200
            ${isProcessing 
              ? 'bg-slate-400 cursor-not-allowed' 
              : 'bg-brand-500 hover:bg-brand-600 hover:shadow-xl hover:-translate-y-0.5'
            }
          `}
        >
          {isProcessing ? (
             <span>Processando...</span>
          ) : (
             <>
               <Lock size={20} />
               <span>Comprar Agora</span>
             </>
          )}
        </button>
        
        <p className="mt-4 text-center text-xs text-slate-400 italic">
          Ao seguir para o processo de pagamento declaro estar de acordo com os{' '}
          <a
            href="https://docs.google.com/document/d/e/2PACX-1vSMUB6hV_SVU3KWbtfQYsPsWw4MXwA6152SwnQsUOCnraB-2CD1uktECgUEO7OGN97hCKGJKzz0Hzip/pub"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-slate-500"
          >
            termos de uso
          </a>
          .
        </p>
      </div>

    </div>
  );
};