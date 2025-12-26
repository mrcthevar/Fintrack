import React, { useMemo, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';
import { Transaction, TransactionType, PaymentMethod, UserProfile } from '../types';
import { TrendingDown, TrendingUp, IndianRupee, ArrowUpRight, ArrowDownRight, Smartphone, Banknote, CreditCard, Calendar, Target } from 'lucide-react';

interface DashboardProps {
  transactions: Transaction[];
  userProfile: UserProfile | null;
}

const COLORS = ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#3b82f6', '#14b8a6'];

type TimeRange = 'THIS_MONTH' | 'LAST_MONTH' | 'THIS_QUARTER' | 'THIS_YEAR' | 'ALL_TIME';

const Dashboard: React.FC<DashboardProps> = ({ transactions, userProfile }) => {
  const [timeRange, setTimeRange] = useState<TimeRange>('THIS_MONTH');

  // Filter Transactions based on Time Range
  const filteredTransactions = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    return transactions.filter(t => {
      const tDate = new Date(t.date);
      const tMonth = tDate.getMonth();
      const tYear = tDate.getFullYear();

      switch (timeRange) {
        case 'THIS_MONTH':
          return tMonth === currentMonth && tYear === currentYear;
        case 'LAST_MONTH':
          const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          return tMonth === lastMonthDate.getMonth() && tYear === lastMonthDate.getFullYear();
        case 'THIS_QUARTER':
          const currentQuarter = Math.floor(currentMonth / 3);
          const tQuarter = Math.floor(tMonth / 3);
          return tQuarter === currentQuarter && tYear === currentYear;
        case 'THIS_YEAR':
          return tYear === currentYear;
        case 'ALL_TIME':
        default:
          return true;
      }
    });
  }, [transactions, timeRange]);
  
  // Calculate Stats for the Cards
  const stats = useMemo(() => {
    let income = 0;
    let expense = 0;
    const categoryMap: Record<string, number> = {};
    const methodMap: Record<string, number> = {
        [PaymentMethod.UPI]: 0,
        [PaymentMethod.CASH]: 0,
        [PaymentMethod.ONLINE]: 0
    };

    filteredTransactions.forEach(t => {
      if (t.type === TransactionType.INCOME) {
        income += t.amount;
      } else {
        expense += t.amount;
        categoryMap[t.category] = (categoryMap[t.category] || 0) + t.amount;
        
        // Track payment method for expenses
        const method = t.paymentMethod || PaymentMethod.ONLINE; // default fallback
        methodMap[method] = (methodMap[method] || 0) + t.amount;
      }
    });

    const categoryData = Object.keys(categoryMap).map(key => ({
      name: key,
      value: categoryMap[key]
    })).sort((a, b) => b.value - a.value);

    return { income, expense, balance: income - expense, categoryData, methodMap };
  }, [filteredTransactions]);

  // Calculate Monthly Trends (Always based on last 12 months history, ignoring filter)
  const trendsData = useMemo(() => {
    const data: Record<string, { name: string, income: number, expense: number, dateObj: Date }> = {};
    const now = new Date();
    
    // Initialize last 6 months
    for(let i=5; i>=0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        const monthName = d.toLocaleString('default', { month: 'short' });
        data[key] = { name: monthName, income: 0, expense: 0, dateObj: d };
    }

    transactions.forEach(t => {
        const d = new Date(t.date);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        if (data[key]) {
            if (t.type === TransactionType.INCOME) data[key].income += t.amount;
            else data[key].expense += t.amount;
        }
    });

    return Object.values(data).sort((a,b) => a.dateObj.getTime() - b.dateObj.getTime());
  }, [transactions]);

  // Recent List based on Filtered Data
  const recentTransactions = [...filteredTransactions]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* Time Range Filter */}
      <div className="flex justify-between items-center bg-white p-3 rounded-xl shadow-sm border border-gray-100">
         <div className="flex items-center gap-2 text-gray-700 font-medium">
             <Calendar size={18} className="text-indigo-600" />
             <span>Period:</span>
         </div>
         <select 
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as TimeRange)}
            className="bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2 outline-none"
         >
             <option value="THIS_MONTH">This Month</option>
             <option value="LAST_MONTH">Last Month</option>
             <option value="THIS_QUARTER">This Quarter</option>
             <option value="THIS_YEAR">This Year</option>
             <option value="ALL_TIME">All Time</option>
         </select>
      </div>

      {/* Top Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-500">Net Balance</p>
              <h3 className="text-3xl font-bold text-gray-900 mt-2">{formatCurrency(stats.balance)}</h3>
            </div>
            <div className="p-3 bg-indigo-50 rounded-xl text-indigo-600">
              <IndianRupee size={24} />
            </div>
          </div>
          <div className="mt-4 flex items-center text-sm">
            <span className="text-gray-400 capitalize">{timeRange.replace('_', ' ').toLowerCase()}</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-500">Income</p>
              <h3 className="text-2xl font-bold text-gray-900 mt-2">{formatCurrency(stats.income)}</h3>
            </div>
            <div className="p-3 bg-green-50 rounded-xl text-green-600">
              <TrendingUp size={24} />
            </div>
          </div>
          <div className="mt-4 flex items-center text-sm text-green-600 font-medium">
            <ArrowUpRight size={16} className="mr-1" />
            <span>Inflow</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-500">Expenses</p>
              <h3 className="text-2xl font-bold text-gray-900 mt-2">{formatCurrency(stats.expense)}</h3>
            </div>
            <div className="p-3 bg-red-50 rounded-xl text-red-600">
              <TrendingDown size={24} />
            </div>
          </div>
           <div className="mt-4 flex items-center text-sm text-red-600 font-medium">
            <ArrowDownRight size={16} className="mr-1" />
            <span>Outflow</span>
          </div>
        </div>
      </div>

      {/* Budget Progress (Visible only for THIS_MONTH) */}
      {userProfile && userProfile.monthlyBudget > 0 && timeRange === 'THIS_MONTH' && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-end mb-2">
            <div>
               <div className="flex items-center gap-2 text-gray-700 font-bold mb-1">
                 <Target size={20} className="text-indigo-600"/>
                 <h3>Monthly Budget</h3>
               </div>
               <p className="text-sm text-gray-500">
                 Spent <span className="font-semibold text-gray-900">{formatCurrency(stats.expense)}</span> of <span className="font-semibold text-gray-900">{formatCurrency(userProfile.monthlyBudget)}</span>
               </p>
            </div>
            <span className={`text-xl font-bold ${stats.expense > userProfile.monthlyBudget ? 'text-red-600' : 'text-gray-900'}`}>
              {((stats.expense / userProfile.monthlyBudget) * 100).toFixed(0)}%
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
             <div 
               className={`h-full rounded-full transition-all duration-500 ${
                 stats.expense > userProfile.monthlyBudget ? 'bg-red-500' : 
                 stats.expense > userProfile.monthlyBudget * 0.85 ? 'bg-orange-500' : 'bg-green-500'
               }`}
               style={{ width: `${Math.min((stats.expense / userProfile.monthlyBudget) * 100, 100)}%` }}
             ></div>
          </div>
        </div>
      )}

      {/* Financial Trends Chart */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 h-96">
          <h3 className="text-lg font-bold text-gray-800 mb-4">Financial Trends (Month on Month)</h3>
          <div className="w-full h-full pb-10">
              <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trendsData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 12}} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 12}} tickFormatter={(value) => `₹${value/1000}k`} />
                      <Tooltip 
                          formatter={(value: number) => formatCurrency(value)}
                          contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                      />
                      <Legend iconType="circle" wrapperStyle={{paddingTop: '20px'}} />
                      <Bar dataKey="income" name="Income" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={50} />
                      <Bar dataKey="expense" name="Expense" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={50} />
                  </BarChart>
              </ResponsiveContainer>
          </div>
      </div>

      {/* Payment Method Stats Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-5 rounded-2xl border border-orange-200">
             <div className="flex items-center gap-3 mb-2">
                 <div className="p-2 bg-orange-200 rounded-lg text-orange-700">
                     <Smartphone size={20} />
                 </div>
                 <span className="font-semibold text-orange-900">UPI Spend</span>
             </div>
             <p className="text-xl font-bold text-gray-900">{formatCurrency(stats.methodMap[PaymentMethod.UPI])}</p>
          </div>

          <div className="bg-gradient-to-br from-green-50 to-green-100 p-5 rounded-2xl border border-green-200">
             <div className="flex items-center gap-3 mb-2">
                 <div className="p-2 bg-green-200 rounded-lg text-green-700">
                     <Banknote size={20} />
                 </div>
                 <span className="font-semibold text-green-900">Cash Spend</span>
             </div>
             <p className="text-xl font-bold text-gray-900">{formatCurrency(stats.methodMap[PaymentMethod.CASH])}</p>
          </div>

          <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-5 rounded-2xl border border-blue-200">
             <div className="flex items-center gap-3 mb-2">
                 <div className="p-2 bg-blue-200 rounded-lg text-blue-700">
                     <CreditCard size={20} />
                 </div>
                 <span className="font-semibold text-blue-900">Online Spend</span>
             </div>
             <p className="text-xl font-bold text-gray-900">{formatCurrency(stats.methodMap[PaymentMethod.ONLINE])}</p>
          </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Spending Breakdown */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 h-96 flex flex-col">
          <h3 className="text-lg font-bold text-gray-800 mb-4">Category Breakdown</h3>
          <div className="flex-1 w-full min-h-0">
             {stats.categoryData.length > 0 ? (
               <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    fill="#8884d8"
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {stats.categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                </PieChart>
               </ResponsiveContainer>
             ) : (
               <div className="h-full flex items-center justify-center text-gray-400">No data for selected period</div>
             )}
          </div>
          <div className="flex flex-wrap gap-2 mt-4 justify-center">
            {stats.categoryData.slice(0, 6).map((entry, index) => (
              <div key={entry.name} className="flex items-center text-xs text-gray-600">
                <span className="w-2 h-2 rounded-full mr-1" style={{ backgroundColor: COLORS[index % COLORS.length] }}></span>
                {entry.name}
              </div>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 h-96 overflow-y-auto">
          <h3 className="text-lg font-bold text-gray-800 mb-4">Recent Activity</h3>
          <div className="space-y-4">
            {recentTransactions.map(t => (
              <div key={t.id} className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${t.type === TransactionType.INCOME ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                    {t.type === TransactionType.INCOME ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{t.description}</p>
                    <p className="text-xs text-gray-500">
                        {new Date(t.date).toLocaleDateString()} • {t.category} 
                        {t.paymentMethod && <span className="ml-1 inline-block bg-gray-100 px-1.5 rounded text-[10px] text-gray-600">{t.paymentMethod}</span>}
                    </p>
                  </div>
                </div>
                <span className={`font-bold ${t.type === TransactionType.INCOME ? 'text-green-600' : 'text-gray-900'}`}>
                  {t.type === TransactionType.INCOME ? '+' : '-'}{formatCurrency(t.amount)}
                </span>
              </div>
            ))}
            {recentTransactions.length === 0 && (
              <p className="text-center text-gray-400 mt-10">No transactions in this period.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;