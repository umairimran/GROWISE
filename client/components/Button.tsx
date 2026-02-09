import { ButtonHTMLAttributes, FC } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export const Button: FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  className = '', 
  isLoading,
  disabled,
  ...props 
}) => {
  const baseStyles = "inline-flex items-center justify-center font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none rounded-lg active:scale-95";
  
  const variants = {
    // Primary: High Contrast Electric Blue (Works on Light & Dark)
    primary: "bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-500/30 border border-transparent focus:ring-blue-500 dark:bg-blue-600 dark:hover:bg-blue-500",
    
    // Secondary: High Contrast Outline (Dark border on light, Light border on dark)
    secondary: "bg-transparent border border-gray-900 text-gray-900 hover:bg-gray-100 focus:ring-gray-900 dark:border-gray-100 dark:text-gray-100 dark:hover:bg-gray-800",
    
    // Outline: Subtle Border (Gray)
    outline: "bg-transparent border border-gray-300 text-gray-700 hover:bg-gray-50 focus:ring-gray-200 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-zinc-800 dark:focus:ring-zinc-700",
    
    // Ghost: No Border, Background on Hover
    ghost: "bg-transparent text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus:ring-gray-200 dark:text-gray-400 dark:hover:bg-zinc-800 dark:hover:text-gray-100",
  };

  const sizes = {
    sm: "h-8 px-3 text-sm",
    md: "h-10 px-5 py-2",
    lg: "h-12 px-7 text-lg",
  };

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={isLoading || disabled}
      {...props}
    >
      {isLoading ? (
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      ) : null}
      {children}
    </button>
  );
};