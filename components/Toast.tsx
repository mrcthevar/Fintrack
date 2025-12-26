import React, { useEffect } from 'react';
import { Notification } from '../types';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

interface ToastContainerProps {
  notifications: Notification[];
  removeNotification: (id: string) => void;
}

const Toast: React.FC<{ notification: Notification; onDismiss: (id: string) => void }> = ({ notification, onDismiss }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(notification.id);
    }, 3000);
    return () => clearTimeout(timer);
  }, [notification.id, onDismiss]);

  const icons = {
    success: <CheckCircle size={20} className="text-green-500" />,
    error: <AlertCircle size={20} className="text-red-500" />,
    info: <Info size={20} className="text-blue-500" />
  };

  const bgColors = {
    success: 'bg-white border-green-100',
    error: 'bg-white border-red-100',
    info: 'bg-white border-blue-100'
  };

  return (
    <div className={`flex items-center gap-3 p-4 rounded-xl shadow-lg border animate-in slide-in-from-bottom-5 duration-300 ${bgColors[notification.type]} min-w-[300px]`}>
      {icons[notification.type]}
      <p className="text-sm font-medium text-gray-800 flex-1">{notification.message}</p>
      <button onClick={() => onDismiss(notification.id)} className="text-gray-400 hover:text-gray-600">
        <X size={16} />
      </button>
    </div>
  );
};

const ToastContainer: React.FC<ToastContainerProps> = ({ notifications, removeNotification }) => {
  return (
    <div className="fixed bottom-4 right-4 z-[100] space-y-2 flex flex-col items-end pointer-events-none">
      {notifications.map(n => (
        <div key={n.id} className="pointer-events-auto">
          <Toast notification={n} onDismiss={removeNotification} />
        </div>
      ))}
    </div>
  );
};

export default ToastContainer;