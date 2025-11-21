import React from 'react';

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'danger' | 'ghost';
}

export const Button: React.FC<Props> = ({ children, variant = 'primary', className = '', ...props }) => {
  const baseClasses = "px-4 py-2 border border-quiet-dim uppercase text-sm tracking-widest transition-all duration-200 font-bold";
  
  const variants = {
    primary: "hover:bg-quiet-green hover:text-quiet-bg border-quiet-green text-quiet-green",
    danger: "hover:bg-quiet-alert hover:text-white border-quiet-alert text-quiet-alert",
    ghost: "hover:border-quiet-text border-transparent text-quiet-dim hover:text-quiet-text"
  };

  return (
    <button 
      className={`${baseClasses} ${variants[variant]} ${className} disabled:opacity-50 disabled:cursor-not-allowed`}
      {...props}
    >
      {children}
    </button>
  );
};
