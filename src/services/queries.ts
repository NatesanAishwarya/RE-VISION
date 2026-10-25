export const parseQueries = (text: string): string[] =>
  [...new Set(text.split(",").map((q) => q.trim()).filter(Boolean))].slice(0, 8);
