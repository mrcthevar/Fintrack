import React, { useState, useEffect } from 'react';
import { generateStaticAdvice, analyzeFinances } from '../services/analysisService.ts';
import { Transaction } from '../types.ts';
import { BarChart3, Loader2, Sparkles, AlertCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface SmartAdvisorProps {
  transactions: Transaction[];
}

const SmartAdvisor: React.FC<SmartAdvisorProps> = ({ transactions }) => {
  const [report, setReport] = useState<string | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [localStats, setLocalStats] = useState<any>(null);

  useEffect(() => {
    // Calculate local stats instantly for sidebar
    setLocalStats(analyzeFinances(transactions));
    
    // Check if we should auto-load AI report (only if we have transactions)
    if (transactions.length > 0) {
        loadReport();
    }
  }, [transactions]);

  const loadReport = async () => {
    if (transactions.length === 0) return;
    setLoadingReport(true);
    setReport(null);
    try {
        // Use local static analysis instead of API
        const result = await generateStaticAdvice(transactions);
        setReport(result);
    } catch (error) {
        setReport("Unable to generate insights at this time.");
    } finally {
        setLoadingReport(false);
    }
  };

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-8rem)]">
      
      {/* Sidebar: Hard Stats */}
      <div className="lg:col-span-1 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col h-fit animate-in slide-in-from-left duration-300">
         <div className="p-6 bg-gradient-to-br from-indigo-600 to-purple-600 text-white">
             <div className="flex items-center gap-3 mb-2">
                 <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                     <BarChart3 size={24} className="text-white" />
                 </div>
                 <h2 className="text-xl font-bold">Quick Stats</h2>
             </div>
             <p className="text-indigo-100 text-sm">Overview of your financial health.</p>
         </div>

         <div className="p-6 space-y-6">
             {localStats && (
                 <>
                    <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Savings Rate</p>
                        <div className="flex items-end gap-2 mt-1">
                            <span className={`text-3xl font-bold ${parseFloat(localStats.savingsRate) > 20 ? 'text-green-600' : parseFloat(localStats.savingsRate) > 0 ? 'text-orange-500' : 'text-red-500'}`}>
                                {localStats.savingsRate}%
                            </span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2 mt-2">
                             <div className="h-full bg-indigo-600 rounded-full" style={{width: `${Math.max(0, Math.min(100, parseFloat(localStats.savingsRate)))}%`}}></div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100">
                        <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wide">Top Spend</p>
                            <p className="font-semibold text-gray-800 mt-1 truncate">{localStats.topCategory}</p>
                            <p className="text-xs text-gray-500">{formatCurrency(localStats.topCategoryAmount)}</p>
                        </div>
                         <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wide">Net Savings</p>
                            <p className={`font-semibold mt-1 ${localStats.savings >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {formatCurrency(localStats.savings)}
                            </p>
                        </div>
                    </div>
                 </>
             )}
         </div>
      </div>

      {/* Content Area: AI Analysis */}
      <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col h-full animate-in slide-in-from-right duration-300">
         <div className="flex-1 overflow-y-auto p-8 relative">
             <div className="mb-6 flex items-center justify-between">
                 <div className="flex items-center gap-2">
                    <Sparkles className="text-purple-600" size={24} />
                    <h3 className="text-2xl font-bold text-gray-800">Financial Insights</h3>
                 </div>
                 <button 
                    onClick={loadReport} 
                    disabled={loadingReport}
                    className="text-sm px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors disabled:opacity-50"
                 >
                    {loadingReport ? 'Analyzing...' : 'Refresh Analysis'}
                 </button>
             </div>

             {loadingReport ? (
                 <div className="flex flex-col items-center justify-center py-12 gap-4 text-gray-500">
                     <Loader2 className="animate-spin text-indigo-600" size={48} />
                     <p className="font-medium text-lg">Analyzing your transaction history...</p>
                 </div>
             ) : transactions.length === 0 ? (
                 <div className="flex flex-col items-center justify-center py-12 gap-4 text-gray-400">
                     <AlertCircle size={48} />
                     <p>Add some transactions to get personalized insights.</p>
                 </div>
             ) : (
                 <div className="prose prose-indigo max-w-none prose-headings:text-gray-800 prose-p:text-gray-600 prose-strong:text-indigo-700">
                    <ReactMarkdown>{report || ""}</ReactMarkdown>
                 </div>
             )}
         </div>
      </div>
    </div>
  );
};

export default SmartAdvisor;