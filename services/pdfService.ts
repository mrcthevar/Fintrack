import * as pdfjsLibModule from 'pdfjs-dist';
import { read, utils } from 'xlsx';
import { Transaction, TransactionType, Category, PaymentMethod } from '../types.ts';

// Handle ESM/CJS interop for pdfjs-dist
const pdfjsLib = (pdfjsLibModule as any).default || pdfjsLibModule;

// Configure worker using a reliable CDN
if (pdfjsLib.GlobalWorkerOptions) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
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
        throw new Error('Unsupported file format. Please upload PDF, Excel, or CSV.');
    }
  } catch (error: any) {
    console.error('File Parse Error:', error);
    if (error.name === 'PasswordException' || error.message?.includes('password')) {
        throw new Error('Password protected files are not supported. Please remove the password and try again.');
    }
    throw new Error(error.message || 'Failed to read file');
  }
};

const parsePdf = async (file: File): Promise<Transaction[]> => {
    const arrayBuffer = await file.arrayBuffer();
    try {
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        
        let fullText = '';

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const items: any[] = textContent.items;

            // Sort items by Y (descending) then X (ascending) to reconstruct lines accurately
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
                // Check for new line (if Y difference is significant)
                if (Math.abs(item.transform[5] - currentY) > 5) {
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
    } catch (e: any) {
        if (e.name === 'PasswordException') {
            throw new Error('Password protected PDF');
        }
        throw e;
    }
}

const parseSpreadsheet = async (file: File): Promise<Transaction[]> => {
    const arrayBuffer = await file.arrayBuffer();
    let workbook;
    try {
        workbook = read(arrayBuffer, { type: 'array', cellDates: true });
    } catch (e) {
        throw new Error("Could not parse Excel/CSV file. Ensure it is not corrupted.");
    }

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
        
        if (score > bestScore && score >= 2) { 
            bestScore = score;
            headerRowIndex = i;
            headers = row;
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

const scoreHeaderRow = (row: string[]): number => {
    let score = 0;
    const joined = row.join(' ');
    
    // Keywords to look for
    if (row.includes('date') || row.includes('txn date') || joined.includes('value date')) score += 1;
    if (joined.includes('description') || joined.includes('narration') || joined.includes('particulars') || joined.includes('remarks')) score += 1;
    if (joined.includes('debit') || joined.includes('withdrawal') || joined.includes('dr')) score += 1;
    if (joined.includes('credit') || joined.includes('deposit') || joined.includes('cr')) score += 1;
    if (joined.includes('balance') || joined.includes('bal')) score += 0.5;
    if (row.includes('amount') || row.includes('amt') || row.includes('withdrawal amt.') || row.includes('deposit amt.')) score += 1;
    
    return score;
};

// Logic for extracting from recognized Excel table structures
const extractFromStructuredRows = (rows: any[][], headers: string[]): Transaction[] => {
    const transactions: Transaction[] = [];
    
    // Helper to find index fuzzy with normalization (removes spaces/dots)
    const findIdx = (keywords: string[]) => headers.findIndex(h => {
        const normalizedHeader = h.replace(/[^a-z0-9]/g, '');
        return keywords.some(k => normalizedHeader.includes(k.replace(/[^a-z0-9]/g, '')));
    });

    // Detect Column Indices
    const idx = {
        date: findIdx(['date', 'txndate']),
        desc: findIdx(['narration', 'description', 'particulars', 'remarks', 'details', 'txn description']),
        amt: findIdx(['amount', 'amt', 'txn amount']), // Single column amount
        type: findIdx(['type', 'drcr', 'dr/cr']), 
        debit: findIdx(['withdrawal', 'debit', 'dr']),
        credit: findIdx(['deposit', 'credit', 'cr']),
    };

    rows.forEach((row, rowIndex) => {
        try {
            if (idx.date === -1) return;

            const dateRaw = row[idx.date];
            if (!dateRaw) return;

            const dateObj = parseAnyDate(dateRaw);
            if (!dateObj || isNaN(dateObj.getTime())) return;

            let amount = 0;
            let type = TransactionType.EXPENSE; // Default

            // Logic 2A: Split Debit/Credit Columns (HDFC, SBI, ICICI)
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
            // Logic 2B: Single Amount Column + Type Column (Kotak/Others)
            else if (idx.amt !== -1 && idx.type !== -1) {
                amount = parseAmount(row[idx.amt]);
                const typeStr = row[idx.type]?.toString().toLowerCase() || '';
                if (typeStr.includes('cr') || typeStr.includes('income') || typeStr.includes('dep')) {
                    type = TransactionType.INCOME;
                } else {
                    type = TransactionType.EXPENSE;
                }
            }
            // Logic 2C: Single Amount Column (Negative = Expense, Positive = Income, or Text indicators)
            else if (idx.amt !== -1) {
                const rawAmt = row[idx.amt];
                amount = parseAmount(rawAmt);
                
                // Check for Cr/Dr text in the amount cell itself
                if (typeof rawAmt === 'string') {
                    if (rawAmt.toLowerCase().includes('cr')) type = TransactionType.INCOME;
                    else if (rawAmt.toLowerCase().includes('dr')) type = TransactionType.EXPENSE;
                }
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
  
  // Regex to match dates: 
  // Supports: 29/10/2024, 29-10-2024, 29-Oct-2024, 2024-10-29
  const dateRegex = /\b(\d{1,2}[-/.](?:\d{1,2}|[A-Za-z]{3})[-/.]\d{2,4}|\d{4}[-/.]\d{1,2}[-/.]\d{1,2})\b/;
  
  // Regex to match amounts (e.g. 1,234.50 or 1234.50 or 1234)
  const amountRegex = /\b(?:[1-9]\d{0,2}(?:,\d{3})*|0)(?:\.\d{1,2})?\b/g;

  // Filter out year numbers that might look like amounts (2023, 2024, 2025)
  // if they appear isolated.
  const isYear = (val: number) => val >= 1990 && val <= 2030;

  for (let i = 0; i < lines.length; i++) {
    const cleanLine = lines[i].trim();
    if (!cleanLine) continue;

    // 1. Find Date - Critical anchor point
    const dateMatch = cleanLine.match(dateRegex);
    if (!dateMatch) continue;

    const dateObj = parseAnyDate(dateMatch[0]);
    if (!dateObj) continue;

    // 2. Remove date from line to avoid parsing day/year as amount
    let lineWithoutDate = cleanLine.replace(dateMatch[0], ' ');

    // 3. Find all potential numbers
    const amounts = [...lineWithoutDate.matchAll(amountRegex)]
        .map(m => ({ val: parseFloat(m[0].replace(/,/g, '')), str: m[0], index: m.index }));

    if (amounts.length === 0) continue;

    // 4. Advanced Amount Selection Logic
    const candidates = amounts.filter((a, idx) => {
        if (a.val === 0) return false;
        // If it's an integer
        if (!a.str.includes('.') && isYear(a.val)) return false; 
        return true;
    });

    if (candidates.length === 0) continue;

    let amount = 0;
    let type = TransactionType.EXPENSE;
    let selectedCandidateStr = '';
    
    // Heuristic: Balance is often the *last* number. 
    // Heuristic: Transaction amount is often *before* the balance.
    let chosenIndex = -1;

    if (candidates.length === 1) {
        amount = candidates[0].val;
        selectedCandidateStr = candidates[0].str;
        chosenIndex = 0;
    } else {
        // Assume last is balance, pick second to last
        chosenIndex = candidates.length - 2; 
        if (chosenIndex < 0) chosenIndex = 0; // Fallback
        amount = candidates[chosenIndex].val;
        selectedCandidateStr = candidates[chosenIndex].str;
    }

    // 5. Determine Type (Expense vs Income)
    const lowerLine = cleanLine.toLowerCase();
    
    // Proximity Check: Is there a "Dr" or "Cr" token NEAR the chosen amount?
    // We look at the substring surrounding the amount.
    if (selectedCandidateStr && amounts[chosenIndex]) {
        // Get absolute index in original string
        const matchIndex = lineWithoutDate.indexOf(selectedCandidateStr); 
        // Look ahead 15 chars for Dr/Cr indicators
        const suffix = lineWithoutDate.substring(matchIndex + selectedCandidateStr.length, matchIndex + selectedCandidateStr.length + 20).toLowerCase();
        
        if (suffix.includes('dr')) type = TransactionType.EXPENSE;
        else if (suffix.includes('cr')) type = TransactionType.INCOME;
        else {
            // Fallback: Global line check
            if (lowerLine.includes('credit') || lowerLine.includes('deposit')) type = TransactionType.INCOME;
            else if (lowerLine.includes('debit') || lowerLine.includes('withdrawal')) type = TransactionType.EXPENSE;
        }
    }

    // 6. Clean Description
    // Remove all numbers found in candidates from description
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

    // String Date Parsing
    if (typeof val === 'string') {
        // Normalize separators
        let str = val.replace(/,/g, '').trim();
        
        // Match DD-MMM-YYYY or DD/MM/YYYY
        let d = new Date(str);
        if (!isNaN(d.getTime())) return d;

        // Manual Parsing for Indian Formats
        const parts = str.split(/[-/.\s]/);
        if (parts.length >= 3) {
            let day, month, year;
            
            // Detect if first part is Year (YYYY-MM-DD)
            if (parts[0].length === 4) {
                year = parseInt(parts[0]);
                month = isNaN(parseInt(parts[1])) ? getMonthIndex(parts[1]) : parseInt(parts[1]) - 1;
                day = parseInt(parts[2]);
            } else {
                // DD-MM-YYYY or DD-MMM-YYYY
                day = parseInt(parts[0]);
                month = isNaN(parseInt(parts[1])) ? getMonthIndex(parts[1]) : parseInt(parts[1]) - 1;
                
                let yStr = parts[2];
                if (yStr.length === 2) year = 2000 + parseInt(yStr);
                else year = parseInt(yStr);
            }

            if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
                 d = new Date(year, month, day);
                 d.setHours(12); // Avoid timezone shifts
                 return d;
            }
        }
    }
    return null;
}

const getMonthIndex = (mon: string): number => {
    const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    return monthNames.indexOf(mon.toLowerCase().substring(0, 3));
}

const cleanDescription = (desc: string): string => {
    return desc
        .replace(/\b(cr|dr|credit|debit|withdrawal|deposit|chq|no|ref|txn|id)\b/gi, '') // Remove keywords
        .replace(/[0-9]+\.[0-9]+/g, '') // Remove leftover floats
        .replace(/\s+/g, ' ') // Collapse spaces
        .replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '') // Trim symbols
        .trim() || "Transaction";
}

const detectCategory = (text: string): Category => {
    const lower = text.toLowerCase();
    
    // Categorization Rules
    if (lower.includes('swiggy') || lower.includes('zomato') || lower.includes('restaurant') || lower.includes('cafe') || lower.includes('food') || lower.includes('domino') || lower.includes('pizza') || lower.includes('burger')) return Category.FOOD;
    if (lower.includes('uber') || lower.includes('ola') || lower.includes('rapido') || lower.includes('metro') || lower.includes('rail') || lower.includes('train') || lower.includes('bus') || lower.includes('toll') || lower.includes('fastag')) return Category.TRANSPORT;
    if (lower.includes('petrol') || lower.includes('fuel') || lower.includes('pump') || lower.includes('hpcl') || lower.includes('bpcl') || lower.includes('ioc')) return Category.FUEL;
    if (lower.includes('netflix') || lower.includes('prime') || lower.includes('hotstar') || lower.includes('spotify') || lower.includes('movie') || lower.includes('cinema') || lower.includes('pvr') || lower.includes('inox') || lower.includes('subscription')) return Category.ENTERTAINMENT;
    if (lower.includes('rent') || lower.includes('maintenance') || lower.includes('society') || lower.includes('broker')) return Category.HOUSING;
    if (lower.includes('jio') || lower.includes('airtel') || lower.includes('vi ') || lower.includes('bsnl') || lower.includes('broadband') || lower.includes('wifi') || lower.includes('fiber')) return Category.BILLS;
    if (lower.includes('electricity') || lower.includes('water') || lower.includes('gas') || lower.includes('bescom') || lower.includes('tata power') || lower.includes('adani')) return Category.UTILITIES;
    if (lower.includes('salary') || lower.includes('bonus') || lower.includes('stipend') || lower.includes('credit interest')) return Category.SALARY;
    if (lower.includes('zerodha') || lower.includes('groww') || lower.includes('upstox') || lower.includes('sip') || lower.includes('mutual fund') || lower.includes('stock')) return Category.INVESTMENT;
    if (lower.includes('hospital') || lower.includes('pharmacy') || lower.includes('doctor') || lower.includes('med') || lower.includes('lab') || lower.includes('clinic') || lower.includes('1mg') || lower.includes('apollo')) return Category.HEALTH;
    if (lower.includes('mart') || lower.includes('store') || lower.includes('market') || lower.includes('amazon') || lower.includes('flipkart') || lower.includes('myntra') || lower.includes('shop') || lower.includes('retail')) return Category.SHOPPING;
    if (lower.includes('emi') || lower.includes('loan')) return Category.EMI;
    if (lower.includes('insurance') || lower.includes('lic') || lower.includes('policy') || lower.includes('premium')) return Category.INSURANCE;
    if (lower.includes('atm') || lower.includes('cash wdl')) return Category.ATM;
    if (lower.includes('transfer') || lower.includes('trf') || lower.includes('neft') || lower.includes('imps') || lower.includes('rtgs')) return Category.TRANSFER;
    if (lower.includes('charge') || lower.includes('fee') || lower.includes('penalty')) return Category.CHARGES;
    
    return Category.OTHER;
}

const detectPaymentMethod = (text: string): PaymentMethod => {
    const lower = text.toLowerCase();
    
    if (lower.includes('upi') || lower.includes('@') || lower.includes('gpay') || lower.includes('phonepe') || lower.includes('paytm') || lower.includes('bhim')) return PaymentMethod.UPI;
    if (lower.includes('atm') || lower.includes('cash') || lower.includes('wdl')) return PaymentMethod.CASH;
    if (lower.includes('neft')) return PaymentMethod.NEFT;
    if (lower.includes('imps')) return PaymentMethod.IMPS;
    if (lower.includes('rtgs')) return PaymentMethod.RTGS;
    if (lower.includes('chq') || lower.includes('cheque') || lower.includes('clearing')) return PaymentMethod.CHEQUE;
    if (lower.includes('pos') || lower.includes('card') || lower.includes('visa') || lower.includes('mastercard')) return PaymentMethod.CARD;
    
    return PaymentMethod.ONLINE;
}