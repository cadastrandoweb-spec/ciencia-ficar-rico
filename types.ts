export enum PaymentMethod {
  PIX = 'pix',
  CREDIT_CARD = 'credit_card'
}

export interface PixPaymentData {
  paymentId: string;
  qrCode?: string;
  qrCodeBase64?: string;
  ticketUrl?: string;
}

export interface CardPaymentData {
  token: string;
  bin: string;
  issuerId?: string;
  installments?: number;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  image: string;
}

export interface OrderForm {
  name: string;
  email: string;
  phone: string;
  document: string; // CPF or CNPJ
  zipCode: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
}

export interface PaymentState {
  method: PaymentMethod;
  isProcessing: boolean;
  isSuccess: boolean;
  error: string | null;
}