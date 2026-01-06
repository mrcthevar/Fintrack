export enum TransactionType {
  INCOME = 'income',
  EXPENSE = 'expense',
}

export enum Category {
  FOOD = 'Food & Drink',
  HOUSING = 'Housing',
  TRANSPORT = 'Transportation',
  ENTERTAINMENT = 'Entertainment',
  SHOPPING = 'Shopping',
  UTILITIES = 'Utilities',
  HEALTH = 'Health',
  SALARY = 'Salary',
  INVESTMENT = 'Investment',
  EMI = 'EMI',
  INSURANCE = 'Insurance',
  CHARGES = 'Bank Charges',
  TRANSFER = 'Transfer',
  BILLS = 'Bills',
  FUEL = 'Fuel',
  ATM = 'ATM',
  OTHER = 'Other',
}

export enum PaymentMethod {
  UPI = 'UPI',
  CASH = 'Cash',
  ONLINE = 'Online',
  CARD = 'Card',
  ATM = 'ATM',
  NEFT = 'NEFT',
  IMPS = 'IMPS',
  RTGS = 'RTGS',
  CHEQUE = 'Cheque',
  OTHER = 'Other',
}

export interface Transaction {
  id: string;
  amount: number;
  description: string;
  category: Category | string;
  type: TransactionType;
  paymentMethod: PaymentMethod | string;
  date: string; // ISO String
}

export interface UserProfile {
  name: string;
  monthlyBudget: number;
  avatar?: string; 
}

export interface MonthlyStats {
  totalIncome: number;
  totalExpense: number;
  balance: number;
  categoryBreakdown: { name: string; value: number }[];
}

export interface Notification {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export type ViewState = 'dashboard' | 'transactions' | 'insights' | 'settings';