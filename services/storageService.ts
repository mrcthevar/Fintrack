import { Transaction, UserProfile } from '../types.ts';

const STORAGE_KEY = 'fintrack_transactions_v1';
const PROFILE_KEY = 'fintrack_profile_v1';

export const getTransactions = (): Transaction[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      // Return empty array for new users instead of mock data
      return [];
    }
    return JSON.parse(stored);
  } catch (e) {
    console.error("Failed to load transactions", e);
    return [];
  }
};

export const saveTransactions = (transactions: Transaction[]): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
  } catch (e) {
    console.error("Failed to save transactions", e);
  }
};

export const getUserProfile = (): UserProfile | null => {
  try {
    const stored = localStorage.getItem(PROFILE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch (e) {
    console.error("Failed to load profile", e);
    return null;
  }
};

export const saveUserProfile = (profile: UserProfile): void => {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch (e) {
    console.error("Failed to save profile", e);
  }
};

export const addTransaction = (transaction: Transaction): Transaction[] => {
  const current = getTransactions();
  const updated = [transaction, ...current];
  saveTransactions(updated);
  return updated;
};

export const deleteTransaction = (id: string): Transaction[] => {
  const current = getTransactions();
  const updated = current.filter(t => t.id !== id);
  saveTransactions(updated);
  return updated;
};

// Data Backup Utilities
export const exportData = async (): Promise<void> => {
  const transactions = getTransactions();
  const profile = getUserProfile();
  const data = { transactions, profile };
  const jsonString = JSON.stringify(data, null, 2);
  const fileName = `fintrack_backup_${new Date().toISOString().split('T')[0]}.json`;

  try {
    // Attempt to use the File System Access API (Desktop Chrome/Edge/Opera)
    // @ts-ignore - window.showSaveFilePicker is not yet in all TS definitions
    if (typeof window.showSaveFilePicker === 'function') {
      // @ts-ignore
      const handle = await window.showSaveFilePicker({
        suggestedName: fileName,
        types: [{
          description: 'Fintrack Data',
          accept: { 'application/json': ['.json'] },
        }],
      });
      const writable = await handle.createWritable();
      await writable.write(jsonString);
      await writable.close();
      return;
    }
  } catch (err: any) {
    // If user cancels the save dialog, we stop.
    if (err.name === 'AbortError') {
       throw err; 
    }
    // For other errors, we fall through to the legacy download method
    console.warn("File System Access API failed, falling back to download:", err);
  }

  // Fallback: Standard Download (Mobile / Firefox / Safari)
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const importData = (file: File): Promise<{ transactions: Transaction[], profile?: UserProfile }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        let transactions: Transaction[] = [];
        let profile: UserProfile | undefined;

        if (Array.isArray(json)) {
          // Legacy format support
          transactions = json;
        } else if (json.transactions && Array.isArray(json.transactions)) {
          // New format
          transactions = json.transactions;
          profile = json.profile;
        } else {
          reject("Invalid file format: content is not an array or valid backup");
          return;
        }
        
        saveTransactions(transactions);
        if (profile) saveUserProfile(profile);

        resolve({ transactions, profile });
      } catch (err) {
        reject("Failed to parse JSON file");
      }
    };
    reader.readAsText(file);
  });
};