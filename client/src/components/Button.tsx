import { ButtonHTMLAttributes, FC } from 'react';
import { LoaderCircle } from "lucide-react";
import { cn } from "./ui";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
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
  const baseStyles =
    "inline-flex items-center justify-center gap-2 rounded-2xl font-semibold tracking-[0.01em] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background disabled:pointer-events-none disabled:opacity-55 active:translate-y-px";
  
  const variants = {
    primary:
      "border border-transparent bg-primary text-white shadow-soft hover:bg-primary hover:shadow-halo",
    secondary:
      "border border-contrast/12 bg-contrast text-background hover:bg-contrast/90 dark:border-white/10 dark:bg-white dark:text-slate-900 dark:hover:bg-white/90",
    outline:
      "border border-border bg-surface/80 text-contrast hover:border-primary/40 hover:bg-primary/5",
    ghost:
      "border border-transparent bg-transparent text-muted-foreground hover:bg-contrast/5 hover:text-contrast dark:hover:bg-white/5",
    danger:
      "border border-danger/20 bg-danger/10 text-danger hover:bg-danger/16",
  };

  const sizes = {
    sm: "min-h-9 px-3.5 text-sm",
    md: "min-h-11 px-5 text-sm",
    lg: "min-h-12 px-6 text-base",
  };

  return (
    <button 
      className={cn(baseStyles, variants[variant], sizes[size], className)}
      disabled={isLoading || disabled}
      {...props}
    >
      {isLoading ? (
        <LoaderCircle className="h-4 w-4 animate-spin" />
      ) : null}
      {children}
    </button>
  );
};
