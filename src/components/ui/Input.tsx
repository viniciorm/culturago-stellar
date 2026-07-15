import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  className = '',
  id,
  ...props
}) => {
  const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`;
  
  return (
    <div className="w-full flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-xs font-semibold text-stone-700 select-none">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`w-full px-3.5 py-2 text-sm bg-white border rounded-lg outline-none transition-all duration-200 
          placeholder:text-stone-400 focus:bg-[#FCFBF7]
          ${error 
            ? 'border-rose-400 focus:border-rose-500 focus:ring-1 focus:ring-rose-500' 
            : 'border-stone-200 focus:border-[#5C061E] focus:ring-1 focus:ring-[#5C061E]'
          } 
          disabled:bg-stone-50 disabled:text-stone-400 disabled:border-stone-150
          ${className}`}
        {...props}
      />
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </div>
  );
};
