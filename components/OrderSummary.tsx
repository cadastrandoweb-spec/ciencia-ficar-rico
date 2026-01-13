import React from 'react';
import { ShieldCheck, ShoppingCart } from 'lucide-react';
import { MAIN_PRODUCT } from '../constants';

interface OrderSummaryProps {
  upsellSelected: boolean;
}

export const OrderSummary: React.FC<OrderSummaryProps> = ({ upsellSelected }) => {
  const total = MAIN_PRODUCT.price;

  return (
    <div className="flex flex-col space-y-4">
      {/* Header */}
      <div className="flex items-center space-x-2 mb-2">
        <img
          src="/logo.png"
          alt="Mestres Do Tráfego"
          width={128}
          height={32}
          loading="eager"
          fetchPriority="high"
          decoding="async"
          className="h-8 w-auto"
        />
      </div>

      {/* Trust Badge */}
      <div className="bg-white rounded-lg py-3 px-4 shadow-sm border border-slate-100 flex items-center justify-center space-x-2 text-slate-600">
        <ShieldCheck size={18} className="text-green-600" />
        <span className="text-sm font-medium tracking-wide">COMPRA SEGURA</span>
      </div>

      {/* Product Image */}
      <div className="relative group -mt-2">
        <div className="aspect-[4/5] w-full max-w-[180px] mx-auto overflow-hidden rounded-xl bg-slate-200 shadow-md">
          <img 
            src={MAIN_PRODUCT.image} 
            alt={MAIN_PRODUCT.name}
            width={560}
            height={700}
            loading="eager"
            fetchPriority="high"
            decoding="async"
            className="h-full w-full object-cover object-center"
          />
        </div>
        <div className="mt-2 text-center">
          <h3 className="text-slate-800 font-medium">{MAIN_PRODUCT.name}</h3>
        </div>
      </div>

      {/* Pricing Summary */}
      <div className="bg-white rounded-lg p-4 shadow-sm border border-slate-100">
        <div className="flex justify-between items-center py-2 text-slate-500 text-sm border-b border-slate-100">
          <div className="flex items-center space-x-2">
            <ShoppingCart size={14} />
            <span>Produto</span>
          </div>
          <span>R$ {MAIN_PRODUCT.price.toFixed(2).replace('.', ',')}</span>
        </div>
        
        {upsellSelected && (
          <div className="flex justify-between items-center py-2 text-slate-500 text-sm border-b border-slate-100 animate-fadeIn">
            <div className="flex items-center space-x-2 text-brand-600">
              <span className="text-xs bg-brand-100 px-2 py-0.5 rounded-full">+ Upsell</span>
            </div>
            <span>R$ 0,00</span>
          </div>
        )}

        <div className="flex justify-between items-center pt-4">
          <span className="text-slate-600 font-medium">SUBTOTAL</span>
          <span className="text-xl font-bold text-slate-800">
            R$ {total.toFixed(2).replace('.', ',')}
          </span>
        </div>
      </div>
    </div>
  );
};