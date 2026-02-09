import { useEffect, FC } from 'react';
import { CheckCircle, X } from 'lucide-react';

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
    <div className="fixed top-5 right-5 z-50 animate-fade-in-up">
      <div className="bg-white border border-green-100 shadow-xl rounded-xl p-4 flex items-center space-x-3 pr-10 relative">
        <div className="bg-green-100 p-1 rounded-full">
            <CheckCircle className="h-5 w-5 text-green-600" />
        </div>
        <div className="flex flex-col">
            <span className="font-bold text-gray-800 text-sm">Success</span>
            <span className="text-gray-500 text-xs">{message}</span>
        </div>
        <button onClick={onClose} className="absolute right-3 top-3 text-gray-400 hover:text-gray-600">
            <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
};