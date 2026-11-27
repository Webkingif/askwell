import { vi } from "vitest";

// Stands in for @google/genai: no real API calls in tests.
export const embedContent = vi.fn();
export const generateContent = vi.fn();
export const constructed: { apiKey?: string }[] = [];

export class GoogleGenAI {
  models = { embedContent, generateContent };
  constructor(options: { apiKey?: string }) {
    constructed.push(options);
  }
}
