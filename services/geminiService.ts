// This service has been deprecated. 
// The application now uses local static analysis in services/analysisService.ts
// and does not require the Gemini API.

export const parseNaturalLanguageTransaction = async (input: string) => {
    console.warn("Natural language parsing is disabled in offline mode.");
    return null;
};

export const generateFinancialAdvice = async (transactions: any[]) => {
    console.warn("AI generation is disabled. Using static analysis instead.");
    return "AI features are disabled.";
};