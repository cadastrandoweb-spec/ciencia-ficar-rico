import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: boolean;
  errorMessage?: string;
  icon?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({ 
  label, 
  error, 
  errorMessage, 
  icon, 
  className = '', 
  ...props 
}) => {
  return (
    <div className={`w-full ${className}`}>
      <label className="block text-sm font-medium text-slate-600 mb-1">
        {label} {props.required && <span className="text-brand-600">*</span>}
      </label>
      <div className="relative">
        {icon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            {icon}
          </div>
        )}
        <input
          className={`
            w-full transition-all duration-200 
            border-b-2 bg-transparent py-2 text-slate-800 placeholder-slate-400 focus:outline-none
            ${icon ? 'pl-10' : 'pl-0'}
            ${error 
              ? 'border-red-500 focus:border-red-600' 
              : 'border-slate-200 focus:border-brand-600'
            }
          `}
          {...props}
        />
      </div>
      {error && errorMessage && (
        <p className="mt-1 text-xs text-red-500">{errorMessage}</p>
      )}
    </div>
  );
};