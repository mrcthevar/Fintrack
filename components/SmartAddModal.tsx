import React, { useState } from 'react';
import { X, IndianRupee, Upload, FileText, Loader2, PenTool, Download } from 'lucide-react';
import { Transaction, TransactionType, Category, PaymentMethod } from '../types.ts';
import { parseBankStatement } from '../services/pdfService.ts';

interface SmartAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (t: Transaction) => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const SmartAddModal: React.FC<SmartAddModalProps> = ({ isOpen, onClose, onAdd, showToast }) => {
  const [activeTab, setActiveTab] = useState<'manual' | 'file'>('manual');
  
  // Manual Form State
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<TransactionType>(TransactionType.EXPENSE);
  const [category, setCategory] = useState<string>(Category.OTHER);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.UPI);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  // File Upload State
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newTransaction: Transaction = {
      id: crypto.randomUUID(),
      description,
      amount: parseFloat(amount),
      type,
      category,
      paymentMethod,
      date: new Date(date).toISOString(),
    };
    onAdd(newTransaction);
    showToast("Transaction added successfully", "success");
    resetForm();
    onClose();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setIsProcessing(true);
      try {
          const transactions = await parseBankStatement(file);
          if (transactions.length === 0) {
              showToast("No valid transactions found. Ensure file has Date and Amount columns.", "info");
          } else {
              transactions.forEach(t => onAdd(t));
              showToast(`Imported ${transactions.length} transactions!`, "success");
              onClose();
          }
      } catch (error: any) {
          // Show the actual error message which might be "Password protected..." or "Unsupported format..."
          showToast(error.message || "Failed to parse statement. Please check file format.", "error");
      } finally {
          setIsProcessing(false);
          // Reset input
          e.target.value = '';
      }
  };

  const downloadSampleFile = () => {
      const headers = "Date,Description,Amount,Type,Category,Method\n";
      const rows = [
          "2024-03-01,Salary Credit,50000,Income,Salary,Online",
          "2024-03-05,Rent Payment,15000,Expense,Housing,Online",
          "2024-03-10,Grocery Store,2500.00,Expense,Food & Drink,UPI",
          "2024-03-12,Netflix,649,Expense,Entertainment,Card",
          "2024-03-15,Petrol Pump,2000,Expense,Transportation,Cash"
      ].join("\n");
      
      const csvContent = headers + rows;
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = "fintrack_sample_statement.csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  };

  const resetForm = () => {
    setDescription('');
    setAmount('');
    setType(TransactionType.EXPENSE);
    setCategory(Category.OTHER);
    setPaymentMethod(PaymentMethod.UPI);
    setActiveTab('manual');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold text-gray-800">Add Transaction</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex p-2 bg-gray-50 border-b border-gray-100">
            <button 
                onClick={() => setActiveTab('manual')}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2 ${activeTab === 'manual' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
               <PenTool size={14} /> Manual
            </button>
            <button 
                onClick={() => setActiveTab('file')}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2 ${activeTab === 'file' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
               <FileText size={14} /> Import Statement
            </button>
        </div>

        <div className="p-6">
            {activeTab === 'manual' && (
                <form onSubmit={handleSubmit} className="space-y-4 animate-in fade-in slide-in-from-left-4 duration-300">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Type</label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" checked={type === TransactionType.EXPENSE} onChange={() => setType(TransactionType.EXPENSE)} className="text-indigo-600 focus:ring-indigo-500" />
                        <span className="text-gray-700">Expense</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" checked={type === TransactionType.INCOME} onChange={() => setType(TransactionType.INCOME)} className="text-green-600 focus:ring-green-500" />
                        <span className="text-gray-700">Income</span>
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Amount (₹)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"><IndianRupee size={16}/></span>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Description</label>
                    <input
                      type="text"
                      required
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                      placeholder="Grocery shopping..."
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                     <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Category</label>
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                      >
                        {Object.values(Category).map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                     <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Payment Method</label>
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                      >
                        {Object.values(PaymentMethod).map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Date</label>
                      <input
                        type="date"
                        required
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                    </div>

                  <button
                    type="submit"
                    className="w-full py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-colors mt-2"
                  >
                    Save Transaction
                  </button>
                </form>
            )}

            {activeTab === 'file' && (
                <div className="flex flex-col items-center justify-center py-6 text-center space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                    {isProcessing ? (
                        <div className="flex flex-col items-center gap-3 text-indigo-600">
                             <Loader2 size={40} className="animate-spin" />
                             <p className="font-medium">Reading Statement...</p>
                             <p className="text-xs text-gray-400">Processing file on your device</p>
                        </div>
                    ) : (
                        <>
                            <div className="p-4 bg-indigo-50 rounded-full text-indigo-600 mb-2">
                                <FileText size={40} />
                            </div>
                            <div>
                                <h3 className="text-gray-900 font-semibold mb-1">Upload Bank Statement</h3>
                                <p className="text-xs text-gray-500 max-w-xs mx-auto">
                                    Upload a PDF, Excel, or CSV file. (For Google Sheets, download as .csv or .xlsx)
                                </p>
                            </div>
                            
                            <label className="cursor-pointer w-full">
                                <div className="w-full py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2">
                                    <Upload size={18} /> Select File
                                </div>
                                <input type="file" accept=".pdf, .xlsx, .xls, .csv" className="hidden" onChange={handleFileUpload} />
                            </label>

                            <button onClick={downloadSampleFile} className="text-xs text-indigo-600 font-medium flex items-center gap-1 hover:underline mt-2">
                                <Download size={12} /> Download Sample File
                            </button>
                            
                            <p className="text-[10px] text-gray-400 mt-2">
                                Supported formats: .pdf, .xlsx, .xls, .csv
                            </p>
                        </>
                    )}
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default SmartAddModal;