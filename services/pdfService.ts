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
    } else if (file.name.match(/\.(xlsx|xls)$/) || file.type.includes('sheet') || file.type.includes('excel')) {
        return await parseExcel(file);
    } else {
        throw new Error('Unsupported file format. Please upload PDF or Excel.');
    }
  } catch (error) {
    console.error('File Parse Error:', error);
    throw new Error('Failed to read file');
  }
};

const parsePdf = async (file: File): Promise<Transaction[]> => {
    const arrayBuffer = await file.arrayBuffer();
    
    // pdfjsLib.getDocument returns a loading task, we need to await .promise
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      // item.str is the text content
      const pageText = textContent.items.map((item: any) => item.str).join(' ');
      fullText += pageText + '\n';
    }

    return extractTransactionsFromText(fullText);
}

const parseExcel = async (file: File): Promise<Transaction[]> => {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = read(arrayBuffer, { type: 'array' });
    
    // Assume the first sheet contains the data
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    // Convert sheet to array of arrays, forcing dates to be formatted as strings
    const rows: any[][] = utils.sheet_to_json(worksheet, { header: 1, raw: false, dateNF: 'dd-mm-yyyy' });

    // Join all rows into a single text block to reuse the regex extractor
    const fullText = rows.map(row => row.join(' ')).join('\n');
    
    return extractTransactionsFromText(fullText);
}

// Simple regex-based extraction for demonstration
// Matches patterns like: "12-05-2024 UPI/12345/Merchant 500.00 Cr"
const extractTransactionsFromText = (text: string): Transaction[] => {
  const transactions: Transaction[] = [];
  const lines = text.split('\n');
  
  // Basic Regex for Date (DD/MM or DD-MM or DD-MM-YYYY)
  const dateRegex = /(\d{2}[-/]\d{2}[-/]\d{4}|\d{2}[-/]\d{2})/;
  // Regex for Amount (looks for numbers with decimals)
  const amountRegex = /(\d{1,10}\.\d{2})/;

  lines.forEach(line => {
    // Heuristic: A line needs a date and an amount to be a transaction
    const dateMatch = line.match(dateRegex);
    const amountMatch = line.match(amountRegex);

    if (dateMatch && amountMatch) {
      const amountStr = amountMatch[0];
      const amount = parseFloat(amountStr);
      
      // Determine Type (Dr/Cr or -/+)
      let type = TransactionType.EXPENSE;
      if (line.toLowerCase().includes('cr') || line.toLowerCase().includes('credit') || line.includes('+')) {
        type = TransactionType.INCOME;
      }

      // Determine Category & Method (Simple Keyword Matching)
      let category = Category.OTHER;
      let method = PaymentMethod.ONLINE;
      const lowerLine = line.toLowerCase();

      if (lowerLine.includes('upi')) method = PaymentMethod.UPI;
      else if (lowerLine.includes('atm') || lowerLine.includes('cash')) method = PaymentMethod.CASH;

      if (lowerLine.includes('swiggy') || lowerLine.includes('zomato') || lowerLine.includes('food')) category = Category.FOOD;
      else if (lowerLine.includes('uber') || lowerLine.includes('ola') || lowerLine.includes('fuel')) category = Category.TRANSPORT;
      else if (lowerLine.includes('netflix') || lowerLine.includes('prime')) category = Category.ENTERTAINMENT;
      else if (lowerLine.includes('rent')) category = Category.HOUSING;
      else if (lowerLine.includes('salary')) {
          category = Category.SALARY;
          type = TransactionType.INCOME;
      }

      // Clean Description
      let description = line
        .replace(dateMatch[0], '')
        .replace(amountMatch[0], '')
        .replace(/cr|dr|credit|debit/i, '')
        .trim();
      
      if (description.length > 50) description = description.substring(0, 50) + '...';
      if (!description) description = "Unknown Transaction";

      // Parse Date
      let dateObj = new Date();
      const dateParts = dateMatch[0].split(/[-/]/);
      if (dateParts.length === 3) {
          // DD-MM-YYYY
          dateObj = new Date(`${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`);
      } else {
          // DD-MM (Assume current year)
          dateObj = new Date(`${new Date().getFullYear()}-${dateParts[1]}-${dateParts[0]}`);
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
  });

  return transactions;
};