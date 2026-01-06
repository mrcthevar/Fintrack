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
          // Check for new line
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

    // Get as array of arrays
    const rows: any[][] = utils.sheet_to_json(worksheet, { header: 1, raw: false, dateNF: 'yyyy-mm-dd' });
    
    // 1. Header Detection Strategy (Deep Scan 100 rows)
    let headerRowIndex = -1;
    let headers: string[] = [];
    let bestScore = 0;

    for (let i = 0; i < Math.min(rows.length, 100); i++) {
        const row = rows[i].map(c => c ? c.toString().toLowerCase().trim() : '');
        const score = scoreHeaderRow(row);
        
        if (score > bestScore && score >= 2) { // Threshold of 2 matches
            bestScore = score;
            headerRowIndex = i;
            headers = row;
        }
    }

    if (headerRowIndex !== -1) {
        console.log(`Found headers at row ${headerRowIndex}:`, headers);
        return extractFromStructuredRows(rows.slice(headerRowIndex + 1), headers);
    }

    // 2. Fallback to Text Extraction
    console.warn("No structured headers found, falling back to text parsing.");
    const fullText = rows
        .filter(row => row.length > 0)
        .map(row => row.join(' '))
        .join('\n');
    
    return extractTransactionsFromText(fullText);
}

const scoreHeaderRow = (row: string[]): number => {
    let score = 0;
    const joined = row.join(' ');
    
    // Keywords to look for
    if (row.includes('date') || row.includes('txn date')) score += 1;
    if (joined.includes('description') || joined.includes('narration') || joined.includes('particulars') || joined.includes('remarks')) score += 1;
    if (joined.includes('debit') || joined.includes('withdrawal') || joined.includes('dr')) score += 1;
    if (joined.includes('credit') || joined.includes('deposit') || joined.includes('cr')) score += 1;
    if (joined.includes('balance') || joined.includes('bal')) score += 0.5;
    if (row.includes('amount') || row.includes('amt')) score += 1;
    
    return score;
};

// Logic for extracting from recognized Excel table structures
const extractFromStructuredRows = (rows: any[][], headers: string[]): Transaction[] => {
    const transactions: Transaction[] = [];
    
    // Helper to find index fuzzy
    const findIdx = (keywords: string[]) => headers.findIndex(h => keywords.some(k => h.includes(k)));

    // Detect Column Indices
    const idx = {
        date: findIdx(['date', 'txn date']),
        month: findIdx(['month']),
        // Description
        desc: findIdx(['narration', 'description', 'particulars', 'remarks', 'details']),
        // Amounts
        amt: findIdx(['amount', 'amt']), // Single column amount
        type: findIdx(['type', 'dr/cr']), // Single column type
        debit: findIdx(['withdrawal', 'debit', 'dr']),
        credit: findIdx(['deposit', 'credit', 'cr']),
        // Metadata
        category: findIdx(['category']),
        payment: findIdx(['payment', 'mode']),
        ref: findIdx(['ref', 'chq', 'cheque'])
    };

    rows.forEach((row, rowIndex) => {
        try {
            // -- SCENARIO 1: Custom Sheet (Month + Date) --
            if (idx.month !== -1 && idx.date !== -1 && idx.amt !== -1) {
                const monthStr = row[idx.month]?.toString() || '';
                const dayStr = row[idx.date]?.toString() || '';
                
                // Try parsing "Oct'25" or similar
                const monthMatch = monthStr.match(/([a-zA-Z]{3})['\s-]*(\d{2,4})/);
                if (monthMatch && dayStr) {
                    const mName = monthMatch[1].toLowerCase();
                    let year = parseInt(monthMatch[2]);
                    if (year < 100) year += 2000;
                    
                    const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
                    const monthIndex = monthNames.indexOf(mName.substring(0,3));
                    
                    if (monthIndex !== -1) {
                        const dateObj = new Date(year, monthIndex, parseInt(dayStr));
                        
                        const amount = parseAmount(row[idx.amt]);
                        if (amount > 0) {
                            const desc = idx.desc !== -1 ? row[idx.desc]?.toString() : 'Expense';
                            const catRaw = idx.category !== -1 ? row[idx.category]?.toString() : '';
                            const payRaw = idx.payment !== -1 ? row[idx.payment]?.toString() : '';

                            transactions.push({
                                id: crypto.randomUUID(),
                                date: dateObj.toISOString(),
                                amount,
                                description: cleanDescription(desc || 'Expense'),
                                type: TransactionType.EXPENSE, // Default for this format usually
                                category: detectCategory(catRaw || desc || ''),
                                paymentMethod: detectPaymentMethod(payRaw || desc || '')
                            });
                        }
                    }
                }
                return; // processed
            }

            // -- SCENARIO 2: Bank Statement (Withdrawal/Deposit columns) --
            // Priority: Date must exist
            if (idx.date === -1) return;

            const dateRaw = row[idx.date];
            if (!dateRaw) return;

            const dateObj = parseAnyDate(dateRaw);
            if (!dateObj || isNaN(dateObj.getTime())) return;

            let amount = 0;
            let type = TransactionType.EXPENSE; // Default

            // Logic 2A: Split Debit/Credit Columns (Common in HDFC, SBI, ICICI)
            if (idx.debit !== -1 || idx.credit !== -1) {
                const debitVal = idx.debit !== -1 ? parseAmount(row[idx.debit]) : 0;
                const creditVal = idx.credit !== -1 ? parseAmount(row[idx.credit]) : 0;

                if (debitVal > 0) {
                    amount = debitVal;
                    type = TransactionType.EXPENSE;
                } else if (creditVal > 0) {
                    amount = creditVal;
                    type = TransactionType.INCOME;
                }
            } 
            // Logic 2B: Single Amount Column + Type Column
            else if (idx.amt !== -1 && idx.type !== -1) {
                amount = parseAmount(row[idx.amt]);
                const typeStr = row[idx.type]?.toString().toLowerCase() || '';
                if (typeStr.includes('cr') || typeStr.includes('credit')) type = TransactionType.INCOME;
            }
            // Logic 2C: Single Amount Column (Assume Expense unless negative?)
            else if (idx.amt !== -1) {
                const rawAmt = row[idx.amt];
                amount = parseAmount(rawAmt);
                // Check if string had negative sign or 'Cr'
                if (rawAmt && rawAmt.toString().toLowerCase().includes('cr')) type = TransactionType.INCOME;
            }

            if (amount > 0) {
                 const desc = idx.desc !== -1 ? (row[idx.desc]?.toString() || '') : 'Transaction';
                 
                 transactions.push({
                    id: crypto.randomUUID(),
                    date: dateObj.toISOString(),
                    amount,
                    description: cleanDescription(desc),
                    type,
                    category: detectCategory(desc),
                    paymentMethod: detectPaymentMethod(desc)
                });
            }

        } catch (e) {
            console.warn(`Row ${rowIndex} parse error`, e);
        }
    });

    return transactions;
}

// Improved Regex Extractor for PDF/Text Fallback
const extractTransactionsFromText = (text: string): Transaction[] => {
  const transactions: Transaction[] = [];
  const lines = text.split('\n');
  
  // 1. HEADER SCAN for PDFs (Deep scan first 100 lines)
  // We try to find where the table starts to avoid garbage at the top.
  let startIndex = 0;
  for (let i = 0; i < Math.min(lines.length, 100); i++) {
      const line = lines[i].toLowerCase();
      // Look for a header signature
      if (line.includes('date') && (line.includes('balance') || line.includes('withdrawal') || line.includes('deposit') || line.includes('debit'))) {
          startIndex = i + 1;
          console.log("PDF Table Header detected at line:", i);
          break;
      }
  }

  // Regex to match dates like 29/07/15, 2024-01-01, 01-Jan-2024
  const dateRegex = /\b(\d{1,2}[-/.](?:\d{1,2}|[A-Za-z]{3})[-/.]\d{2,4}|\d{4}[-/.]\d{1,2}[-/.]\d{1,2})\b/;
  
  // Regex to match currency-like numbers.
  const amountRegex = /\b(?:[1-9]\d{0,2}(?:,\d{3})*|0)(?:\.\d{1,2})?\b/g;

  for (let i = startIndex; i < lines.length; i++) {
    const cleanLine = lines[i].trim();
    if (!cleanLine) continue;

    // 1. Find Date
    const dateMatch = cleanLine.match(dateRegex);
    if (!dateMatch) continue;

    const dateObj = parseAnyDate(dateMatch[0]);
    if (!dateObj) continue;

    // 2. Remove date from line
    let lineWithoutDate = cleanLine.replace(dateMatch[0], ' ');

    // 3. Find all potential numbers
    const amounts = [...lineWithoutDate.matchAll(amountRegex)]
        .map(m => ({ val: parseFloat(m[0].replace(/,/g, '')), str: m[0] }));

    // 4. Heuristics to identify the Transaction Amount vs Balance vs Ref No
    
    const candidates = amounts.filter(a => {
        if (a.val === 0) return false;

        // If it's an integer
        if (!a.str.includes('.')) {
            // If it's 4 digits and looks like a recent year, likely garbage
            if (a.val >= 1990 && a.val <= 2030) return false;
        }
        return true;
    });

    if (candidates.length === 0) continue;

    let amount = 0;
    
    // Logic for HDFC / Standard Statement: [Ref, Amount, Balance] OR [Amount, Balance]
    
    if (candidates.length === 1) {
        amount = candidates[0].val;
    } else {
        // Assume Last number is Balance, usually.
        // We want the number BEFORE the balance.
        // UNLESS there is only [Ref, Amount].
        
        // Let's filter out "Ref-like" numbers from the candidates first.
        // Ref is usually a large Integer appearing FIRST.
        const nonRefCandidates = candidates.filter((c, idx) => {
             // If first number is integer > 1000 and there is a subsequent number with decimal, assume first is Ref.
             if (idx === 0 && !c.str.includes('.') && c.val > 1000 && candidates.length > 1) return false;
             return true;
        });

        if (nonRefCandidates.length === 0) {
            // Fallback
             amount = candidates[0].val;
        } else if (nonRefCandidates.length === 1) {
             amount = nonRefCandidates[0].val;
        } else {
            // We have 2+ non-ref numbers. (e.g. Withdrawal, Balance).
            // Usually the Transaction is the First of these.
            // Balance is the Last.
            amount = nonRefCandidates[0].val;
        }
    }

    // 5. Determine Type
    let type = TransactionType.EXPENSE;
    const lowerLine = cleanLine.toLowerCase();
    
    if (lowerLine.includes(' cr ') || lowerLine.includes('credit') || lowerLine.includes('deposit') || lowerLine.includes(' dep ')) {
        type = TransactionType.INCOME;
    } else if (lowerLine.includes(' dr ') || lowerLine.includes('debit') || lowerLine.includes('withdrawal')) {
        type = TransactionType.EXPENSE;
    }

    // 6. Clean Description
    let description = lineWithoutDate;
    candidates.forEach(a => {
        description = description.replace(a.str, '');
    });
    description = cleanDescription(description);

    transactions.push({
        id: crypto.randomUUID(),
        date: dateObj.toISOString(),
        amount,
        description,
        type,
        category: detectCategory(description),
        paymentMethod: detectPaymentMethod(description)
    });
  }

  return transactions;
};

// -- Helpers --

const parseAmount = (val: any): number => {
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
        const clean = val.replace(/[^0-9.-]/g, '');
        const f = parseFloat(clean);
        return isNaN(f) ? 0 : f;
    }
    return 0;
};

const parseAnyDate = (val: any): Date | null => {
    if (!val) return null;
    
    // Excel Serial Date (Number)
    if (typeof val === 'number') {
        const date = new Date((val - (25567 + 2)) * 86400 * 1000); 
        return date;
    }

    // String Date
    if (typeof val === 'string') {
        const parts = val.split(/[-/.\s]/);
        if (parts.length < 2) return new Date(val); 

        let day = 1, month = 0, year = new Date().getFullYear();

        if (parts[0].length === 4) {
            year = parseInt(parts[0]);
            month = parseInt(parts[1]) - 1;
            day = parseInt(parts[2]);
        } 
        else {
            day = parseInt(parts[0]);
            
            if (isNaN(parseInt(parts[1]))) {
                const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
                const mStr = parts[1].toLowerCase().substring(0, 3);
                month = monthNames.indexOf(mStr);
            } else {
                month = parseInt(parts[1]) - 1;
            }

            if (parts.length === 3) {
                const y = parts[2];
                year = y.length === 2 ? 2000 + parseInt(y) : parseInt(y);
            }
        }
        
        const d = new Date(year, month, day);
        d.setHours(12);
        return d;
    }
    
    return null;
}

const cleanDescription = (desc: string): string => {
    return desc
        .replace(/\b(cr|dr|credit|debit|withdrawal|deposit)\b/gi, '') // Remove keywords
        .replace(/[0-9]+\.[0-9]+/g, '') // Remove leftover floats
        .replace(/\s+/g, ' ') // Collapse spaces
        .replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '') // Trim symbols
        .trim() || "Transaction";
}

const detectCategory = (text: string): Category => {
    const lower = text.toLowerCase();
    if (lower.includes('swiggy') || lower.includes('zomato') || lower.includes('food') || lower.includes('restaurant') || lower.includes('cafe') || lower.includes('tea') || lower.includes('coffee') || lower.includes('burger') || lower.includes('pizza')) return Category.FOOD;
    if (lower.includes('uber') || lower.includes('ola') || lower.includes('fuel') || lower.includes('petrol') || lower.includes('pump') || lower.includes('parking') || lower.includes('toll') || lower.includes('metro') || lower.includes('train') || lower.includes('rail')) return Category.TRANSPORT;
    if (lower.includes('netflix') || lower.includes('prime') || lower.includes('movie') || lower.includes('cinema') || lower.includes('hotstar') || lower.includes('spotify') || lower.includes('youtube')) return Category.ENTERTAINMENT;
    if (lower.includes('rent') || lower.includes('maintenance') || lower.includes('society') || lower.includes('broker')) return Category.HOUSING;
    if (lower.includes('jio') || lower.includes('airtel') || lower.includes('vi ') || lower.includes('bill') || lower.includes('electricity') || lower.includes('water') || lower.includes('gas') || lower.includes('broadband') || lower.includes('recharge')) return Category.UTILITIES;
    if (lower.includes('salary') || lower.includes('bonus') || lower.includes('stipend')) return Category.SALARY;
    if (lower.includes('interest') || lower.includes('dividend') || lower.includes('zerodha') || lower.includes('groww') || lower.includes('sip')) return Category.INVESTMENT;
    if (lower.includes('hospital') || lower.includes('pharmacy') || lower.includes('doctor') || lower.includes('med') || lower.includes('lab') || lower.includes('clinic')) return Category.HEALTH;
    if (lower.includes('mart') || lower.includes('store') || lower.includes('market') || lower.includes('amazon') || lower.includes('flipkart') || lower.includes('myntra') || lower.includes('shop')) return Category.SHOPPING;
    return Category.OTHER;
}

const detectPaymentMethod = (text: string): PaymentMethod => {
    const lower = text.toLowerCase();
    if (lower.includes('upi') || lower.includes('@') || lower.includes('gpay') || lower.includes('phonepe') || lower.includes('paytm') || lower.includes('bhim')) return PaymentMethod.UPI;
    if (lower.includes('atm') || lower.includes('cash') || lower.includes('withdraw')) return PaymentMethod.CASH;
    return PaymentMethod.ONLINE;
}