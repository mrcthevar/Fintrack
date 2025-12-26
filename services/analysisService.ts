import { Transaction, TransactionType } from '../types';

export const analyzeFinances = (transactions: Transaction[]) => {
  const totalIncome = transactions.filter(t => t.type === TransactionType.INCOME).reduce((acc, t) => acc + t.amount, 0);
  const totalExpense = transactions.filter(t => t.type === TransactionType.EXPENSE).reduce((acc, t) => acc + t.amount, 0);
  const savings = totalIncome - totalExpense;
  const savingsRate = totalIncome > 0 ? (savings / totalIncome) * 100 : 0;

  // Find top category
  const categoryMap: Record<string, number> = {};
  transactions.filter(t => t.type === TransactionType.EXPENSE).forEach(t => {
      categoryMap[t.category] = (categoryMap[t.category] || 0) + t.amount;
  });
  const topCategoryEntry = Object.entries(categoryMap).sort((a,b) => b[1] - a[1])[0];

  return {
    totalIncome,
    totalExpense,
    savings,
    savingsRate: savingsRate.toFixed(1),
    topCategory: topCategoryEntry ? topCategoryEntry[0] : 'None',
    topCategoryAmount: topCategoryEntry ? topCategoryEntry[1] : 0
  };
};

export const generateStaticAdvice = async (transactions: Transaction[]): Promise<string> => {
    // Simulate async to keep component logic similar
    return new Promise((resolve) => {
        setTimeout(() => {
            const stats = analyzeFinances(transactions);
            const format = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n);
            
            let advice = `### Monthly Financial Snapshot\n\n`;
            advice += `**Total Income:** ${format(stats.totalIncome)}\n`;
            advice += `**Total Expenses:** ${format(stats.totalExpense)}\n`;
            advice += `**Net Savings:** ${format(stats.savings)}\n\n`;

            advice += `### Analysis\n`;
            if (stats.savings > 0) {
                advice += `You have successfully saved **${stats.savingsRate}%** of your income this month. This is a healthy financial habit. Consider allocating these funds towards an emergency fund or investments.\n\n`;
            } else {
                advice += `Your expenses exceeded your income by **${format(Math.abs(stats.savings))}**. Review your discretionary spending to avoid debt accumulation.\n\n`;
            }

            if (stats.topCategory !== 'None') {
                advice += `### Top Spending Category\n`;
                advice += `You spent **${format(stats.topCategoryAmount)}** on **${stats.topCategory}**. `;
                
                if (stats.topCategory.includes('Food')) {
                    advice += `Ordering in or dining out frequently can add up. Cooking at home could save significantly.`;
                } else if (stats.topCategory.includes('Shopping')) {
                    advice += `Consider a "cool-off" period before making non-essential purchases.`;
                } else if (stats.topCategory.includes('Transport')) {
                    advice += `Look into carpooling or public transport options if applicable.`;
                } else {
                    advice += `Ensure this aligns with your monthly budget goals.`;
                }
                advice += `\n`;
            }

            resolve(advice);
        }, 800); // Small delay for UX
    });
}