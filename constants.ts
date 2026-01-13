import { Product } from './types';

export const MAIN_PRODUCT: Product = {
  id: 'curso-riqueza-001',
  name: 'Curso A Ciência de Ficar Rico',
  price: 47.00,
  // OBS: Substitua a URL abaixo pelo link direto da imagem que você enviou após hospedá-la
  image: '/logorico.png'
};

// Produto sem upsell para este checkout
export const UPSELL_PRODUCT: Product = {
  id: 'upsell-disabled',
  name: '',
  price: 0,
  image: ''
};

// API Endpoints (For the mock service)
export const API_URL = 'http://localhost:3000'; // Assuming local backend for dev