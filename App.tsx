import React, { useState, useEffect, useRef } from 'react';
import { ViewState, Transaction, UserProfile, Notification } from './types.ts';
import { getTransactions, addTransaction as addTxService, updateTransaction as updateTxService, deleteTransaction as delTxService, exportData, importData, getUserProfile, saveUserProfile, saveTransactions } from './services/storageService.ts';
import Dashboard from './components/Dashboard.tsx';
import TransactionList from './components/TransactionList.tsx';
import SmartAdvisor from './components/SmartAdvisor.tsx';
import SmartAddModal from './components/SmartAddModal.tsx';
import ProfileModal from './components/ProfileModal.tsx';
import ToastContainer from './components/Toast.tsx';
import SettingsView from './components/Settings.tsx';
import { LayoutDashboard, Receipt, LineChart, Plus, Wallet, Download, Upload, User, Settings, Save } from 'lucide-react';

const App: React.FC = () => {
  const [view, setView] = useState<ViewState>('dashboard');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTransactions(getTransactions());
    const profile = getUserProfile();
    setUserProfile(profile);
    
    // Force open profile modal if no profile exists
    if (!profile) {
        setIsProfileModalOpen(true);
    }
  }, []);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = crypto.randomUUID();
    setNotifications(prev => [...prev, { id, message, type }]);
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const handleAddTransaction = (t: Transaction) => {
    const updated = addTxService(t);
    setTransactions(updated);
  };
  
  const handleEditTransaction = (t: Transaction) => {
    setEditingTransaction(t);
    setIsAddModalOpen(true);
  };

  const handleUpdateTransaction = (t: Transaction) => {
    const updated = updateTxService(t);
    setTransactions(updated);
    setEditingTransaction(null);
  };

  const handleDeleteTransaction = (id: string) => {
    const updated = delTxService(id);
    setTransactions(updated);
    showToast("Transaction deleted", "info");
  };

  const handleSaveProfile = (profile: UserProfile) => {
      saveUserProfile(profile);
      setUserProfile(profile);
      setIsProfileModalOpen(false);
      showToast("Profile updated successfully", "success");
  };

  const handleBackup = async () => {
      try {
        await exportData();
        showToast("Data saved successfully!", "success");
      } catch (error: any) {
        if (error.name !== 'AbortError') {
            showToast("Failed to save data", "error");
        }
      }
  };

  const handleRestoreClick = () => {
      fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          try {
              const imported = await importData(file);
              setTransactions(imported.transactions);
              if (imported.profile) setUserProfile(imported.profile);
              showToast("Data restored successfully!", "success");
          } catch (error) {
              showToast("Failed to restore data. Check file format.", "error");
          }
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Handler for restoring data specifically from the Onboarding Modal
  const handleModalRestore = (data: { transactions: Transaction[], profile?: UserProfile }) => {
      setTransactions(data.transactions);
      if (data.profile) {
          setUserProfile(data.profile);
          setIsProfileModalOpen(false);
          showToast("Welcome back! Data restored successfully.", "success");
      } else {
          // If backup has transactions but no profile, keep modal open but let them create a name
          showToast("Transactions restored. Please create a profile.", "info");
      }
  };

  const handleClearData = () => {
      localStorage.clear();
      setTransactions([]);
      setUserProfile(null);
      showToast("All data wiped.", "error");
      setTimeout(() => window.location.reload(), 1500);
  };

  const NavItem = ({ id, icon: Icon, label }: { id: ViewState, icon: any, label: string }) => (
    <button
      onClick={() => setView(id)}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
        view === id 
        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' 
        : 'text-gray-500 hover:bg-indigo-50 hover:text-indigo-600'
      }`}
    >
      <Icon size={20} className={view === id ? 'text-white' : 'text-gray-400 group-hover:text-indigo-600'} />
      <span className="font-medium">{label}</span>
    </button>
  );

  return (
    <div className="flex min-h-screen bg-gray-50 text-gray-900 font-sans">
      <ToastContainer notifications={notifications} removeNotification={removeNotification} />

      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-100 hidden md:flex flex-col fixed inset-y-0 z-20">
        <div className="p-8 pb-4">
          <div className="flex items-center gap-3 text-indigo-600 mb-6 cursor-pointer" onClick={() => setView('dashboard')}>
            <div className="p-2 bg-indigo-100 rounded-lg">
              <Wallet size={24} />
            </div>
            <span className="text-xl font-bold tracking-tight">Fintrack</span>
          </div>

          {/* User Mini Profile */}
          <div 
            onClick={() => setIsProfileModalOpen(true)}
            className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100 cursor-pointer hover:bg-gray-100 transition-colors group"
          >
              <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-lg">
                  {userProfile ? userProfile.name.charAt(0).toUpperCase() : <User size={20} />}
              </div>
              <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                      {userProfile?.name || 'Create Profile'}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                      Budget: ₹{userProfile?.monthlyBudget || 0}
                  </p>
              </div>
              <Settings size={16} className="text-gray-400 group-hover:text-indigo-600" />
          </div>
        </div>

        <nav className="flex-1 px-4 space-y-2 mt-2">
          <NavItem id="dashboard" icon={LayoutDashboard} label="Dashboard" />
          <NavItem id="transactions" icon={Receipt} label="Transactions" />
          <NavItem id="insights" icon={LineChart} label="Insights" />
        </nav>

        <div className="p-4 border-t border-gray-50 space-y-2">
           <button onClick={handleBackup} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-gray-500 hover:bg-gray-50 hover:text-indigo-600 group">
               <Save size={20} className="text-gray-400 group-hover:text-indigo-600"/> 
               <span className="font-medium">Save Data</span>
           </button>
           
           <button onClick={() => setView('settings')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${view === 'settings' ? 'bg-indigo-50 text-indigo-600 font-medium' : 'text-gray-500 hover:bg-gray-50 hover:text-indigo-600'}`}>
               <Settings size={20} /> Settings
           </button>
           <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".json" className="hidden" />
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-white border-b border-gray-100 z-30 flex items-center justify-between px-4">
         <div className="flex items-center gap-2 text-indigo-600" onClick={() => setView('dashboard')}>
            <Wallet size={20} />
            <span className="font-bold">Fintrack</span>
         </div>
         <div className="flex items-center gap-2">
            <button onClick={handleBackup} className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center">
               <Save size={18} />
            </button>
            <button onClick={() => setView('settings')} className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center">
               <Settings size={18} />
            </button>
            <button onClick={() => setIsAddModalOpen(true)} className="p-2 bg-indigo-600 text-white rounded-full">
                <Plus size={20} />
            </button>
         </div>
      </div>
      
      {/* Mobile Bottom Nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-gray-100 z-30 flex justify-around items-center px-2">
        <button onClick={() => setView('dashboard')} className={`p-2 rounded-lg flex flex-col items-center ${view === 'dashboard' ? 'text-indigo-600' : 'text-gray-400'}`}>
           <LayoutDashboard size={20} />
           <span className="text-[10px] mt-1 font-medium">Home</span>
        </button>
        <button onClick={() => setView('transactions')} className={`p-2 rounded-lg flex flex-col items-center ${view === 'transactions' ? 'text-indigo-600' : 'text-gray-400'}`}>
           <Receipt size={20} />
           <span className="text-[10px] mt-1 font-medium">List</span>
        </button>
        <button onClick={() => setView('insights')} className={`p-2 rounded-lg flex flex-col items-center ${view === 'insights' ? 'text-indigo-600' : 'text-gray-400'}`}>
           <LineChart size={20} />
           <span className="text-[10px] mt-1 font-medium">Insights</span>
        </button>
      </div>

      {/* Main Content */}
      <main className="flex-1 md:ml-64 p-4 md:p-8 pt-20 md:pt-8 pb-20 md:pb-8 max-w-7xl mx-auto w-full">
        
        {/* Header Section */}
        <header className="flex justify-between items-center mb-8">
           <div>
             <h1 className="text-2xl font-bold text-gray-900 capitalize">{view === 'insights' ? 'Financial Insights' : view}</h1>
             <p className="text-sm text-gray-500 mt-1">Manage your personal finances efficiently.</p>
           </div>
           
           <div className="flex gap-2">
             <button 
               onClick={() => {
                   setEditingTransaction(null);
                   setIsAddModalOpen(true);
               }}
               className="hidden md:flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 font-medium"
             >
               <Plus size={20} />
               Add Transaction
             </button>
           </div>
        </header>

        {/* View Switch */}
        {view === 'dashboard' && <Dashboard transactions={transactions} userProfile={userProfile} />}
        {view === 'transactions' && <TransactionList transactions={transactions} onDelete={handleDeleteTransaction} onEdit={handleEditTransaction} />}
        {view === 'insights' && <SmartAdvisor transactions={transactions} />}
        {view === 'settings' && (
            <SettingsView 
                transactionCount={transactions.length} 
                onBackup={handleBackup} 
                onRestore={handleRestoreClick}
                onClearData={handleClearData}
            />
        )}

      </main>

      {/* Modals */}
      <SmartAddModal 
        isOpen={isAddModalOpen} 
        onClose={() => {
            setIsAddModalOpen(false);
            setTimeout(() => setEditingTransaction(null), 300);
        }} 
        onAdd={handleAddTransaction}
        onUpdate={handleUpdateTransaction}
        editingTransaction={editingTransaction}
        showToast={showToast}
      />
      
      <ProfileModal
         isOpen={isProfileModalOpen}
         onClose={() => setIsProfileModalOpen(false)}
         onSave={handleSaveProfile}
         onRestoreData={handleModalRestore}
         initialProfile={userProfile}
         isForceOpen={!userProfile}
      />
    </div>
  );
};

export default App;