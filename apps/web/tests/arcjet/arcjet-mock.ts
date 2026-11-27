import { vi } from "vitest";

// Stands in for @arcjet/next: records how clients are built and what each
// protect() call sends, and answers with the decision a test sets.

export type Rule = { type: string; [option: string]: unknown };
export type ProtectCall = {
  request: Request;
  props: Record<string, unknown>;
  rules: Rule[];
};

export const built: Record<string, unknown>[] = [];
export const calls: ProtectCall[] = [];
export const decide = vi.fn<(call: ProtectCall) => Promise<unknown>>();

function instance(rules: Rule[]) {
  return {
    withRule: (rule: Rule[]) => instance([...rules, ...rule]),
    protect: (request: Request, props: Record<string, unknown>) => {
      const call = { request, props, rules };
      calls.push(call);
      return decide(call);
    },
  };
}

export default function arcjet(options: Record<string, unknown>) {
  built.push(options);
  return instance([...(options.rules as Rule[])]);
}

export const fixedWindow = (o: object): Rule[] => [
  { type: "fixedWindow", ...o },
];
export const detectPromptInjection = (o: object): Rule[] => [
  { type: "detectPromptInjection", ...o },
];
export const createRemoteClient = (o: object) => ({ remoteClient: o });

type ReasonKind = "RATE_LIMIT" | "PROMPT_INJECTION" | "ERROR" | "OTHER";

function reason(kind: ReasonKind, message = "") {
  return {
    message,
    isRateLimit: () => kind === "RATE_LIMIT",
    isPromptInjection: () => kind === "PROMPT_INJECTION",
    isError: () => kind === "ERROR",
  };
}

/** Fake ArcjetDecision objects. */
export const decision = {
  allow: () => ({
    isErrored: () => false,
    isDenied: () => false,
    reason: reason("OTHER"),
  }),
  deny: (kind: ReasonKind) => ({
    isErrored: () => false,
    isDenied: () => true,
    reason: reason(kind, kind === "ERROR" ? "rule failed" : ""),
  }),
  errored: (message: string) => ({
    isErrored: () => true,
    isDenied: () => false,
    reason: reason("ERROR", message),
  }),
};
