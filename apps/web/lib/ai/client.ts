import "server-only";
import { GoogleGenAI } from "@google/genai";
import { readGeminiEnv } from "./env";

/** A Gemini API client. Reads GEMINI_API_KEY on each call. */
export function createGeminiClient(): GoogleGenAI {
  const { GEMINI_API_KEY } = readGeminiEnv();
  return new GoogleGenAI({ apiKey: GEMINI_API_KEY });
}
