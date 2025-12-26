import React from 'react';
import { Download, Upload, Trash2, Database, ShieldCheck, AlertTriangle, HardDrive } from 'lucide-react';
import { Transaction } from '../types.ts';

interface SettingsProps {
  transactionCount: number;
  onBackup: () => void;
  onRestore: () => void;
  onClearData: () => void;
}

const Settings: React.FC<SettingsProps> = ({ transactionCount, onBackup, onRestore, onClearData }) => {
  
  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-300">
      
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <div className="flex items-center gap-3 mb-4">
           <div className="p-2 bg-gray-100 rounded-lg text-gray-700">
              <Database size={24} />
           </div>
           <h2 className="text-xl font-bold text-gray-900">Data Management</h2>
        </div>
        <p className="text-gray-600">
            Manage your financial data. Fintrack uses your browser's local storage to keep your data safe and private on your device.
        </p>
      </div>

      {/* Persistence Info Card */}
      <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-2xl p-6 border border-indigo-100">
          <div className="flex items-start gap-4">
              <ShieldCheck size={32} className="text-indigo-600 mt-1" />
              <div>
                  <h3 className="font-bold text-indigo-900 text-lg mb-1">Is my data safe?</h3>
                  <p className="text-indigo-800/80 text-sm leading-relaxed">
                      Yes. Your data is automatically saved to <strong>Local Storage</strong>. 
                      You can safely close this tab or window. When you return, your <strong>{transactionCount} transactions</strong> will be right here.
                  </p>
                  <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-indigo-700 bg-indigo-100/50 w-fit px-3 py-1.5 rounded-full">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                      Auto-save Active
                  </div>
              </div>
          </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Backup & Restore */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col">
              <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <HardDrive size={18} /> Backup & Restore
              </h3>
              
              <div className="space-y-4 flex-1">
                  <div className="p-4 rounded-xl border border-gray-100 bg-gray-50 hover:bg-gray-100 transition-colors">
                      <p className="text-sm font-medium text-gray-900 mb-1">Export to File</p>
                      <p className="text-xs text-gray-500 mb-3">Download a JSON file containing all your transactions and settings. Save this to Google Drive for cloud backup.</p>
                      <button 
                        onClick={onBackup}
                        className="flex items-center gap-2 text-sm bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 hover:text-indigo-600 transition-all shadow-sm font-medium"
                      >
                          <Download size={16} /> Download Backup
                      </button>
                  </div>

                  <div className="p-4 rounded-xl border border-gray-100 bg-gray-50 hover:bg-gray-100 transition-colors">
                      <p className="text-sm font-medium text-gray-900 mb-1">Import from File</p>
                      <p className="text-xs text-gray-500 mb-3">Restore your data from a previously downloaded backup file.</p>
                      <button 
                        onClick={onRestore}
                        className="flex items-center gap-2 text-sm bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 hover:text-indigo-600 transition-all shadow-sm font-medium"
                      >
                          <Upload size={16} /> Restore Data
                      </button>
                  </div>
              </div>
          </div>

          {/* Danger Zone */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col">
              <h3 className="font-bold text-red-600 mb-4 flex items-center gap-2">
                  <AlertTriangle size={18} /> Danger Zone
              </h3>
              
              <div className="p-4 rounded-xl border border-red-100 bg-red-50 flex-1">
                  <p className="text-sm font-bold text-red-900 mb-1">Reset Application</p>
                  <p className="text-xs text-red-700/80 mb-4">
                      This will permanently delete all transactions and your profile from this browser. This action cannot be undone unless you have a backup.
                  </p>
                  <button 
                    onClick={() => {
                        if(window.confirm("Are you sure you want to delete all data? This cannot be undone.")) {
                            onClearData();
                        }
                    }}
                    className="w-full flex items-center justify-center gap-2 text-sm bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-all shadow-sm font-medium"
                  >
                      <Trash2 size={16} /> Delete All Data
                  </button>
              </div>
          </div>
      </div>
    </div>
  );
};

export default Settings;