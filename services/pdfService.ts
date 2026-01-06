import * as pdfjsLibModule from 'pdfjs-dist';
import { read, utils } from 'xlsx';
import { Transaction, TransactionType, Category, PaymentMethod } from '../types.ts';

// Handle ESM/CJS interop for pdfjs-dist
const pdfjsLib = (pdfjsLibModule as any).default || pdfjsLibModule;

if (pdfjsLib.GlobalWorkerOptions) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
}

export const parseBankStatement = async (file: File): Promise<Transaction[]> => {
  try {
    if (file.type === 'application/pdf') {
        return await parsePdf(file);
    } else if (
        file.name.match(/\.(xlsx|xls|csv)$/i) || 
        file.type.includes('sheet') || 
        file.type.includes('excel') || 
        file.type.includes('csv') ||
        file.type === 'text/csv'
    ) {
        return await parseSpreadsheet(file);
    } else {
        throw new Error('Unsupported file format.');
    }
  } catch (error) {
    console.error('File Parse Error:', error);
    throw new Error('Failed to read file');
  }
};

const parsePdf = async (file: File): Promise<Transaction[]> => {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const items: any[] = textContent.items;

      // Sort items by Y (descending) then X (ascending)
      items.sort((a, b) => {
          const yDiff = b.transform[5] - a.transform[5];
          if (Math.abs(yDiff) > 4) return yDiff; 
          return a.transform[4] - b.transform[4];
      });

      let currentY = -99999;
      let pageLines: string[] = [];
      let currentLine: string[] = [];

      items.forEach((item) => {
          if (currentY === -99999) currentY = item.transform[5];
          if (Math.abs(item.transform[5] - currentY) > 4) {
              if (currentLine.length > 0) pageLines.push(currentLine.join(' '));
              currentLine = [];
              currentY = item.transform[5];
          }
          if (item.str.trim()) {
              currentLine.push(item.str);
          }
      });
      if (currentLine.length > 0) pageLines.push(currentLine.join(' '));

      fullText += pageLines.join('\n') + '\n';
    }
    
    return extractTransactionsFromText(fullText);
}

const parseSpreadsheet = async (file: File): Promise<Transaction[]> => {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = read(arrayBuffer, { type: 'array', cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    // Get as array of arrays to inspect structure
    const rows: any[][] = utils.sheet_to_json(worksheet, { header: 1, raw: false, dateNF: 'yyyy-mm-dd' });
    
    // 1. Try to detect Structured Format (Header Row)
    // We look for a header row in the first 10 rows
    let headerRowIndex = -1;
    let headers: string[] = [];

    for (let i = 0; i < Math.min(rows.length, 10); i++) {
        const row = rows[i].map(c => c ? c.toString().toLowerCase().trim() : '');
        // Check for specific column signatures
        
        // Custom Format: "Month", "Date", "Amt"
        if (row.includes('month') && row.includes('date') && (row.includes('amt') || row.includes('amount'))) {
            headerRowIndex = i;
            headers = row;
            break;
        }
        
        // Bank Format: "Withdrawal", "Deposit", "Date"
        if (row.includes('date') && row.some(h => h.includes('withdrawal')) && row.some(h => h.includes('deposit'))) {
            headerRowIndex = i;
            headers = row;
            break;
        }
    }

    if (headerRowIndex !== -1) {
        return extractFromStructuredRows(rows.slice(headerRowIndex + 1), headers);
    }

    // 2. Fallback to Text Extraction
    const fullText = rows
        .filter(row => row.length > 0)
        .map(row => row.join(' '))
        .join('\n');
    
    return extractTransactionsFromText(fullText);
}

// Logic for extracting from recognized Excel table structures
const extractFromStructuredRows = (rows: any[][], headers: string[]): Transaction[] => {
    const transactions: Transaction[] = [];
    
    // Map header names to indices
    const idx = {
        month: headers.findIndex(h => h === 'month'),
        date: headers.findIndex(h => h === 'date'), // Day or Full Date
        desc: headers.findIndex(h => h.includes('description') || h.includes('narration') || h.includes('particulars')),
        amt: headers.findIndex(h => h === 'amt' || h === 'amount'),
        withdrawal: headers.findIndex(h => h.includes('withdrawal') || h.includes('debit')),
        deposit: headers.findIndex(h => h.includes('deposit') || h.includes('credit')),
        category: headers.findIndex(h => h.includes('category')),
        payment: headers.findIndex(h => h.includes('payment')),
    };

    rows.forEach(row => {
        try {
            // -- SCENARIO 1: Custom Sheet (Month + Date columns) --
            if (idx.month !== -1 && idx.date !== -1) {
                const monthStr = row[idx.month]?.toString() || ''; // e.g. "Oct'25"
                const dayStr = row[idx.date]?.toString() || '';     // e.g. "27"
                
                // Parse "Oct'25"
                const monthMatch = monthStr.match(/([a-zA-Z]{3})['\s-]*(\d{2,4})/);
                if (monthMatch && dayStr) {
                    const mName = monthMatch[1].toLowerCase();
                    let year = parseInt(monthMatch[2]);
                    if (year < 100) year += 2000;
                    
                    const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
                    const monthIndex = monthNames.indexOf(mName.substring(0,3));
                    
                    if (monthIndex !== -1) {
                        const dateObj = new Date(year, monthIndex, parseInt(dayStr));
                        dateObj.setHours(12);

                        const amount = parseFloat(row[idx.amt]?.toString().replace(/,/g, '') || '0');
                        if (amount > 0) {
                            const desc = row[idx.desc]?.toString() || 'Expense';
                            const categoryRaw = row[idx.category]?.toString() || '';
                            const paymentRaw = row[idx.payment]?.toString() || '';
                            
                            // Map Category
                            let cat = Category.OTHER;
                            // Simple mapping based on text
                            if (categoryRaw) {
                                const lowerCat = categoryRaw.toLowerCase();
                                if (lowerCat.includes('veg') || lowerCat.includes('food')) cat = Category.FOOD;
                                else if (lowerCat.includes('travel') || lowerCat.includes('fare')) cat = Category.TRANSPORT;
                                else if (lowerCat.includes('grocery')) cat = Category.FOOD;
                                else if (lowerCat.includes('shop')) cat = Category.SHOPPING;
                                else cat = Category.OTHER; // Or keep raw string if Type allows
                            }

                            // Map Payment
                            let method = PaymentMethod.ONLINE;
                            if (paymentRaw.toLowerCase().includes('ppe') || paymentRaw.toLowerCase().includes('upi')) method = PaymentMethod.UPI;
                            
                            // Default to Expense unless Category implies Income (like Salary)
                            // In this specific sheet, 'Amt' seems to be expenses mostly?
                            // Let's assume Expense by default for this format.
                            transactions.push({
                                id: crypto.randomUUID(),
                                date: dateObj.toISOString(),
                                amount,
                                description: desc,
                                type: TransactionType.EXPENSE, // Default
                                category: cat,
                                paymentMethod: method
                            });
                        }
                    }
                }
            }
            // -- SCENARIO 2: Bank Statement (Withdrawal / Deposit columns) --
            else if ((idx.withdrawal !== -1 || idx.deposit !== -1) && idx.date !== -1) {
                 // Date parsing
                 const dateRaw = row[idx.date]?.toString();
                 if (!dateRaw) return;
                 
                 const dateObj = parseDateString(dateRaw);
                 if (!dateObj) return;

                 const withdrawal = parseFloat(row[idx.withdrawal]?.toString().replace(/,/g, '') || '0');
                 const deposit = parseFloat(row[idx.deposit]?.toString().replace(/,/g, '') || '0');

                 let amount = 0;
                 let type = TransactionType.EXPENSE;

                 if (withdrawal > 0) {
                     amount = withdrawal;
                     type = TransactionType.EXPENSE;
                 } else if (deposit > 0) {
                     amount = deposit;
                     type = TransactionType.INCOME;
                 }

                 if (amount > 0) {
                     let desc = row[idx.desc]?.toString() || 'Transaction';
                     // Cleanup description
                     desc = desc.replace(/\s+/g, ' ').trim();
                     
                     transactions.push({
                        id: crypto.randomUUID(),
                        date: dateObj.toISOString(),
                        amount,
                        description: desc,
                        type,
                        category: detectCategory(desc),
                        paymentMethod: detectPaymentMethod(desc)
                    });
                 }
            }

        } catch (e) {
            console.warn("Row parse error", e);
        }
    });

    return transactions;
}

// Improved Regex Extractor for PDF/Text Fallback
const extractTransactionsFromText = (text: string): Transaction[] => {
  const transactions: Transaction[] = [];
  const lines = text.split('\n');
  
  // Regex to match dates like 29/07/15, 2024-01-01, 01-Jan-2024
  const dateRegex = /\b(\d{1,2}[-/.](?:\d{1,2}|[A-Za-z]{3})[-/.]\d{2,4}|\d{4}[-/.]\d{1,2}[-/.]\d{1,2})\b/;
  
  // Regex to match currency-like numbers.
  const amountRegex = /\b(?:[1-9]\d{0,2}(?:,\d{3})*|0)(?:\.\d{1,2})?\b/g;

  lines.forEach(line => {
    const cleanLine = line.trim();
    if (!cleanLine) return;

    // 1. Find Date
    const dateMatch = cleanLine.match(dateRegex);
    if (!dateMatch) return;

    const dateObj = parseDateString(dateMatch[0]);
    if (!dateObj) return;

    // 2. Remove date from line
    let lineWithoutDate = cleanLine.replace(dateMatch[0], ' ');

    // 3. Find all amounts
    const amounts = [...lineWithoutDate.matchAll(amountRegex)]
        .map(m => parseFloat(m[0].replace(/,/g, '')))
        .filter(n => !isNaN(n) && n > 0);

    // Filter out unlikely amounts (like years 2024, 2025 appearing as integers)
    // Only if it looks exactly like a year (integer 1990-2030) and we have other numbers
    const validAmounts = amounts.filter(a => {
        if (Number.isInteger(a) && a > 1990 && a < 2030) return false; 
        return true; 
    });

    if (validAmounts.length === 0) return;

    // 4. Logic for Multiple Amounts (Transaction Amt vs Balance)
    // Usually: [Withdrawal/Deposit] [Balance]
    // So the transaction amount is usually NOT the last one if there are >= 2 numbers.
    // If there is only 1 number, it's the transaction.
    // If there are 2 numbers, the first is transaction, second is balance.
    // If there are 3 numbers? (Withdrawal, Deposit, Balance) -> rare in one line unless parsed weirdly.
    
    const amount = validAmounts.length >= 2 ? validAmounts[0] : validAmounts[0];

    // 5. Determine Type
    let type = TransactionType.EXPENSE;
    const lowerLine = cleanLine.toLowerCase();
    
    // Explicit keywords
    if (lowerLine.includes(' cr ') || lowerLine.includes('credit') || lowerLine.includes('deposit') || lowerLine.includes(' dep ')) {
        type = TransactionType.INCOME;
    } 
    // If using structured columns logic (visual position), we can't do that easily in text.
    // We rely on keywords in narration for PDFs often.
    // e.g. "NEFT DR..." -> Expense. "CHQ DEP" -> Income.
    
    // Default to Expense unless proven otherwise, but if we found multiple numbers, 
    // and one is clearly a Credit keyword, switch.

    // 6. Clean Description
    // Remove all found amounts from the description text
    let description = lineWithoutDate;
    validAmounts.forEach(a => {
        // approximate match for regex replacement
        description = description.replace(new RegExp(a.toString().replace('.', '\\.') + '\\b'), '');
    });
    
    // Remove numeric formatting commas from description if leftovers
    description = description.replace(/\b\d{1,3},\d{3}\b/g, ''); 
    
    description = description
        .replace(/\b(cr|dr|credit|debit)\b/gi, '')
        .replace(/[0-9]+\.[0-9]+/g, '') // Remove float leftovers
        .replace(/\s+/g, ' ')
        .trim();
        
    description = description.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, ''); // Trim symbols
    if (description.length > 60) description = description.substring(0, 60).trim() + '...';
    if (!description) description = "Transaction";

    transactions.push({
        id: crypto.randomUUID(),
        date: dateObj.toISOString(),
        amount,
        description,
        type,
        category: detectCategory(description),
        paymentMethod: detectPaymentMethod(description)
    });
  });

  return transactions;
};

// -- Helpers --

const parseDateString = (dateStr: string): Date | null => {
    try {
        const parts = dateStr.split(/[-/.\s]/);
        if (parts.length < 2) return null;

        let day = 1, month = 0, year = new Date().getFullYear();

        // Detect format
        // Case: YYYY-MM-DD
        if (parts[0].length === 4) {
            year = parseInt(parts[0]);
            month = parseInt(parts[1]) - 1;
            day = parseInt(parts[2]);
        } 
        // Case: DD-MM-YYYY or MM/DD/YYYY? 
        // Assume DD-MM-YYYY for India/UK formats usually found in bank statements
        else {
            day = parseInt(parts[0]);
            
            // Month is text? (Jan, Feb)
            if (isNaN(parseInt(parts[1]))) {
                const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
                const mStr = parts[1].toLowerCase().substring(0, 3);
                month = monthNames.indexOf(mStr);
            } else {
                month = parseInt(parts[1]) - 1;
            }

            // Year
            if (parts.length === 3) {
                const y = parts[2];
                year = y.length === 2 ? 2000 + parseInt(y) : parseInt(y);
            }
        }
        
        const d = new Date(year, month, day);
        d.setHours(12);
        return d;
    } catch (e) {
        return null;
    }
}

const detectCategory = (text: string): Category => {
    const lower = text.toLowerCase();
    if (lower.includes('swiggy') || lower.includes('zomato') || lower.includes('food') || lower.includes('restaurant') || lower.includes('cafe') || lower.includes('tea') || lower.includes('coffee')) return Category.FOOD;
    if (lower.includes('uber') || lower.includes('ola') || lower.includes('fuel') || lower.includes('petrol') || lower.includes('pump') || lower.includes('parking') || lower.includes('toll')) return Category.TRANSPORT;
    if (lower.includes('netflix') || lower.includes('prime') || lower.includes('movie') || lower.includes('cinema') || lower.includes('hotstar')) return Category.ENTERTAINMENT;
    if (lower.includes('rent') || lower.includes('maintenance') || lower.includes('society')) return Category.HOUSING;
    if (lower.includes('jio') || lower.includes('airtel') || lower.includes('vi ') || lower.includes('bill') || lower.includes('electricity') || lower.includes('water') || lower.includes('gas') || lower.includes('broadband')) return Category.UTILITIES;
    if (lower.includes('salary')) return Category.SALARY;
    if (lower.includes('interest')) return Category.INVESTMENT;
    if (lower.includes('hospital') || lower.includes('pharmacy') || lower.includes('doctor') || lower.includes('med') || lower.includes('lab')) return Category.HEALTH;
    if (lower.includes('mart') || lower.includes('store') || lower.includes('market') || lower.includes('amazon') || lower.includes('flipkart')) return Category.SHOPPING;
    return Category.OTHER;
}

const detectPaymentMethod = (text: string): PaymentMethod => {
    const lower = text.toLowerCase();
    if (lower.includes('upi') || lower.includes('@') || lower.includes('gpay') || lower.includes('phonepe') || lower.includes('paytm')) return PaymentMethod.UPI;
    if (lower.includes('atm') || lower.includes('cash') || lower.includes('withdraw')) return PaymentMethod.CASH;
    return PaymentMethod.ONLINE;
}