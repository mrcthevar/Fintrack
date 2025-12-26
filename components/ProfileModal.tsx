import React, { useState, useEffect } from 'react';
import { X, User, Target, IndianRupee, Upload, FileJson, RefreshCw } from 'lucide-react';
import { UserProfile, Transaction } from '../types';
import { importData } from '../services/storageService';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (profile: UserProfile) => void;
  onRestoreData?: (data: { transactions: Transaction[], profile?: UserProfile }) => void;
  initialProfile: UserProfile | null;
  isForceOpen?: boolean;
}

const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose, onSave, onRestoreData, initialProfile, isForceOpen = false }) => {
  const [name, setName] = useState('');
  const [budget, setBudget] = useState('');
  const [activeTab, setActiveTab] = useState<'create' | 'restore'>('create');
  const [isRestoring, setIsRestoring] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (initialProfile) {
      setName(initialProfile.name);
      setBudget(initialProfile.monthlyBudget.toString());
      setActiveTab('create');
    } else {
      // Reset fields if opening for new profile
      setName('');
      setBudget('');
      // Default to create, but user can switch
      setActiveTab('create');
    }
  }, [initialProfile, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    
    onSave({
      name: name.trim(),
      monthlyBudget: budget ? parseFloat(budget) : 0
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setIsRestoring(true);
      setErrorMsg('');

      try {
          const result = await importData(file);
          if (onRestoreData) {
              onRestoreData(result);
          }
      } catch (err) {
          setErrorMsg("Invalid backup file. Please try again.");
      } finally {
          setIsRestoring(false);
      }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold text-gray-800">
            {initialProfile ? 'Edit Profile' : 'Welcome to Fintrack'}
          </h2>
          {!isForceOpen && (
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
              <X size={20} />
            </button>
          )}
        </div>

        {/* Tab Switcher (Only show during onboarding) */}
        {!initialProfile && isForceOpen && (
            <div className="flex p-2 bg-gray-50 border-b border-gray-100">
                <button 
                    type="button"
                    onClick={() => setActiveTab('create')}
                    className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2 ${activeTab === 'create' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                   <User size={16} /> New Profile
                </button>
                <button 
                    type="button"
                    onClick={() => setActiveTab('restore')}
                    className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2 ${activeTab === 'restore' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                   <RefreshCw size={16} /> Restore Data
                </button>
            </div>
        )}
        
        {activeTab === 'create' ? (
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
               {!initialProfile && (
                 <div className="text-center pb-2 animate-in fade-in duration-300">
                     <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-3 border border-indigo-100">
                         <User size={32} />
                     </div>
                     <p className="text-gray-600 text-sm px-4">Let's get to know you. Enter your name to create your personal workspace.</p>
                 </div>
              )}

              <div className="animate-in fade-in slide-in-from-left-2 duration-300">
                <label className="block text-sm font-medium text-gray-700 mb-1">Your Name</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                    <User size={18} />
                  </span>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow"
                    placeholder="Enter your name"
                    autoFocus={!initialProfile && activeTab === 'create'}
                  />
                </div>
              </div>

              {!isForceOpen && (
                  <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Budget Target</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                        <IndianRupee size={18} />
                      </span>
                      <input
                        type="number"
                        min="0"
                        value={budget}
                        onChange={(e) => setBudget(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow"
                        placeholder="e.g. 25000"
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Set a monthly spending limit to track your financial health.
                    </p>
                  </div>
              )}

              <button
                type="submit"
                className="w-full py-2.5 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 mt-2 shadow-lg shadow-indigo-100"
              >
                <Target size={18} />
                {initialProfile ? 'Update Profile' : 'Get Started'}
              </button>
            </form>
        ) : (
            <div className="p-6 space-y-5 animate-in fade-in slide-in-from-right-2 duration-300 text-center">
                 <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-3 border border-blue-100">
                     <FileJson size={32} />
                 </div>
                 
                 <div>
                     <h3 className="font-semibold text-gray-900">Lost your data?</h3>
                     <p className="text-sm text-gray-500 mt-1 px-4">
                        If you cleared your cookies, you can restore your session by uploading a previous backup file (.json).
                     </p>
                 </div>

                 <label className="block w-full cursor-pointer group">
                    <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 hover:bg-gray-50 hover:border-indigo-400 transition-all flex flex-col items-center gap-2">
                        <Upload size={24} className="text-gray-400 group-hover:text-indigo-600" />
                        <span className="text-sm font-medium text-gray-600 group-hover:text-indigo-600">Click to upload backup</span>
                    </div>
                    <input 
                        type="file" 
                        accept=".json" 
                        className="hidden" 
                        onChange={handleFileUpload}
                        disabled={isRestoring}
                    />
                 </label>

                 {errorMsg && (
                     <p className="text-xs text-red-500 bg-red-50 py-2 rounded-lg">{errorMsg}</p>
                 )}
                 
                 {isRestoring && (
                     <p className="text-sm text-indigo-600 animate-pulse font-medium">Restoring data...</p>
                 )}
            </div>
        )}
      </div>
    </div>
  );
};

export default ProfileModal;