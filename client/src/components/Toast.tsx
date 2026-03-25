import { useEffect, FC } from "react";
import { CheckCircle2, X } from "lucide-react";
import { cn } from "./ui";

interface ToastProps {
  message: string;
  onClose: () => void;
}

export const Toast: FC<ToastProps> = ({ message, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed right-4 top-20 z-[80] animate-fade-in-up sm:right-6">
      <div className="app-panel flex min-w-[280px] max-w-sm items-start gap-3 p-4 pr-11">
        <div className="mt-0.5 rounded-full bg-success/12 p-1.5 text-success">
            <CheckCircle2 className="h-5 w-5" />
        </div>
        <div className="flex flex-col">
            <span className="text-sm font-semibold text-contrast">Success</span>
            <span className="text-sm text-muted-foreground">{message}</span>
        </div>
        <button
          onClick={onClose}
          className={cn(
            "absolute right-3 top-3 rounded-full p-1 text-muted-foreground transition-colors hover:bg-contrast/5 hover:text-contrast",
          )}
        >
            <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};
