import * as pdfjsLibModule from 'pdfjs-dist';
import { read, utils } from 'xlsx';
import { Transaction, TransactionType, Category, PaymentMethod } from '../types.ts';

// Handle ESM/CJS interop for pdfjs-dist where default export might contain the library
const pdfjsLib = (pdfjsLibModule as any).default || pdfjsLibModule;

// Set worker source for PDF.js
// Ensure GlobalWorkerOptions exists before setting property
if (pdfjsLib.GlobalWorkerOptions) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
} else {
    console.warn('PDF.js GlobalWorkerOptions not found, PDF parsing might fail.');
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
        throw new Error('Unsupported file format. Please upload PDF, Excel (.xlsx), or CSV.');
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

      // Sort items by Y (descending) then X (ascending) to reconstruct lines
      // Note: PDF Y-coordinates usually start from bottom, so higher Y is top of page
      items.sort((a, b) => {
          const yDiff = b.transform[5] - a.transform[5];
          // Use a tolerance of 4 units to group items on the "same line"
          if (Math.abs(yDiff) > 4) return yDiff; 
          return a.transform[4] - b.transform[4];
      });

      let currentY = -99999;
      let pageLines: string[] = [];
      let currentLine: string[] = [];

      items.forEach((item) => {
          // Initialize Y for the first item
          if (currentY === -99999) currentY = item.transform[5];
          
          // Check if this item is on a new line (significant Y difference)
          if (Math.abs(item.transform[5] - currentY) > 4) {
              // Push the completed line
              if (currentLine.length > 0) pageLines.push(currentLine.join(' '));
              
              // Start new line
              currentLine = [];
              currentY = item.transform[5];
          }
          // Add item text to current line
          if (item.str.trim()) {
              currentLine.push(item.str);
          }
      });
      // Push the last line of the page
      if (currentLine.length > 0) pageLines.push(currentLine.join(' '));

      fullText += pageLines.join('\n') + '\n';
    }
    
    console.log("PDF Extracted Text:", fullText.substring(0, 500) + "..."); // Debugging

    return extractTransactionsFromText(fullText);
}

const parseSpreadsheet = async (file: File): Promise<Transaction[]> => {
    const arrayBuffer = await file.arrayBuffer();
    // xlsx.read handles XLS, XLSX, and CSV automatically
    const workbook = read(arrayBuffer, { type: 'array', cellDates: true });
    
    // Assume the first sheet contains the data
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    // Convert sheet to array of arrays
    // Use raw: false to get formatted strings for numbers (helpful for consistency)
    const rows: any[][] = utils.sheet_to_json(worksheet, { 
        header: 1, 
        raw: false, 
        dateNF: 'yyyy-mm-dd' // Normalize dates to ISO-like to help regex
    });

    // Join all rows into a single text block to reuse the regex extractor
    // Filter out empty rows
    const fullText = rows
        .filter(row => row.length > 0)
        .map(row => row.join(' '))
        .join('\n');
    
    console.log("Spreadsheet Extracted Text:", fullText.substring(0, 500) + "..."); // Debugging
    
    return extractTransactionsFromText(fullText);
}

// Improved extraction logic with better Regex support
const extractTransactionsFromText = (text: string): Transaction[] => {
  const transactions: Transaction[] = [];
  const lines = text.split('\n');
  
  // Date Regex: Matches DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, DD MMM YYYY
  const dateRegex = /\b(\d{1,2}[-/.](?:\d{1,2}|[A-Za-z]{3})[-/.]\d{2,4}|\d{4}[-/.]\d{1,2}[-/.]\d{1,2})\b/;
  
  // Amount Regex: Matches numbers with optional commas
  // UPDATED: Now supports integers (no decimal) or decimals. 
  // Looks for numbers that look like currency (1,000 or 1000.00 or 500)
  // Caution: Can match years if not careful, relying on date removal to prevent year matching.
  const amountRegex = /\b(?:[1-9]\d{0,2}(?:,\d{3})*|0)(?:\.\d{1,2})?\b/;

  lines.forEach(line => {
    const cleanLine = line.trim();
    if (!cleanLine) return;

    // 1. Find Date first
    const dateMatch = cleanLine.match(dateRegex);
    
    if (dateMatch) {
        // 2. Remove the date from the line so we don't accidentally match the year as an amount
        const lineWithoutDate = cleanLine.replace(dateMatch[0], ' ');
        
        // 3. Find Amount in the remaining text
        const amountMatch = lineWithoutDate.match(amountRegex);

        if (amountMatch) {
            const amountStr = amountMatch[0].replace(/,/g, '');
            const amount = parseFloat(amountStr);
            
            // Safety check: specific logic to ignore likely years if they are integers between 1990-2030
            // and didn't have a decimal.
            const isInteger = !amountStr.includes('.');
            if (isInteger && amount > 1990 && amount < 2030) {
               // Check if there is ANOTHER number on the line that looks like an amount?
               // For now, let's skip if it looks too much like a year and is an integer.
               // However, 2000 is a valid amount. 
               // Heuristic: If we found a date already, the year is gone. 
               // So this '2024' is likely a transaction amount or ID. 
               // We'll accept it for now.
            }

            // Determine Type
            let type = TransactionType.EXPENSE;
            const lowerLine = cleanLine.toLowerCase();
            
            if (lowerLine.includes('cr') || lowerLine.includes('credit') || lowerLine.includes('deposit') || cleanLine.includes('+')) {
                type = TransactionType.INCOME;
            } else if (lineWithoutDate.match(/\bdr\b/i) || lowerLine.includes('debit') || lowerLine.includes('withdrawal')) {
                type = TransactionType.EXPENSE;
            }

            // Determine Category & Method
            let category = Category.OTHER;
            let method = PaymentMethod.ONLINE;

            if (lowerLine.includes('upi')) method = PaymentMethod.UPI;
            else if (lowerLine.includes('atm') || lowerLine.includes('cash') || lowerLine.includes('withdrawal')) method = PaymentMethod.CASH;
            else if (lowerLine.includes('card') || lowerLine.includes('visa') || lowerLine.includes('mastercard')) method = PaymentMethod.ONLINE;

            if (lowerLine.includes('swiggy') || lowerLine.includes('zomato') || lowerLine.includes('food') || lowerLine.includes('restaurant') || lowerLine.includes('cafe')) category = Category.FOOD;
            else if (lowerLine.includes('uber') || lowerLine.includes('ola') || lowerLine.includes('fuel') || lowerLine.includes('petrol') || lowerLine.includes('parking')) category = Category.TRANSPORT;
            else if (lowerLine.includes('netflix') || lowerLine.includes('prime') || lowerLine.includes('movie') || lowerLine.includes('cinema')) category = Category.ENTERTAINMENT;
            else if (lowerLine.includes('rent') || lowerLine.includes('maintenance') || lowerLine.includes('house')) category = Category.HOUSING;
            else if (lowerLine.includes('jio') || lowerLine.includes('airtel') || lowerLine.includes('vodafone') || lowerLine.includes('bill') || lowerLine.includes('electricity') || lowerLine.includes('water')) category = Category.UTILITIES;
            else if (lowerLine.includes('salary')) {
                category = Category.SALARY;
                type = TransactionType.INCOME;
            } else if (lowerLine.includes('interest')) {
                category = Category.INVESTMENT;
                type = TransactionType.INCOME;
            } else if (lowerLine.includes('hospital') || lowerLine.includes('pharmacy') || lowerLine.includes('doctor') || lowerLine.includes('med')) category = Category.HEALTH;

            // Clean Description: Remove date, amount, and common keywords
            let description = lineWithoutDate
                .replace(amountMatch[0], '')
                .replace(/\b(cr|dr|credit|debit)\b/gi, '')
                .trim();
            
            // Remove leading/trailing non-alphanumeric chars
            description = description.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '');
            
            if (description.length > 50) description = description.substring(0, 50) + '...';
            if (!description) description = "Transfer/Payment";

            // Parse Date
            let dateObj = new Date();
            try {
                const dateStr = dateMatch[0];
                const parts = dateStr.split(/[-/.\s]/);
                
                // Handle YYYY-MM-DD
                if (parts[0].length === 4) {
                    dateObj = new Date(dateStr);
                } else if (parts.length >= 2) {
                    // Handle DD-MM-YYYY or DD MMM YYYY
                    let day = parseInt(parts[0]);
                    let month = 0;
                    let year = new Date().getFullYear();

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
                    
                    dateObj = new Date(year, month, day);
                }
                dateObj.setHours(12);
            } catch (e) {
                console.warn("Date parsing failed", e);
            }

            if (!isNaN(amount) && amount > 0) {
                transactions.push({
                id: crypto.randomUUID(),
                date: dateObj.toISOString(),
                amount,
                description,
                type,
                category,
                paymentMethod: method
                });
            }
        }
    }
  });

  return transactions;
};