import "server-only";
import {
  API_ERROR_STATUS,
  PLAN_LIMITS,
  apiError,
  planSchema,
  widgetChatRequestSchema,
  type ApiError,
  type ApiErrorCode,
  type WidgetChatResponse,
} from "@askwell/shared";
import { after } from "next/server";
import { answerFromChunks, type Answer } from "../ai/answer";
import { embedQuery } from "../ai/embed";
import { CHAT_MODEL } from "../ai/models";
import { trackAiGeneration } from "../analytics/ai";
import { track } from "../analytics/events";
import { protectWidgetRequest } from "../arcjet/protect";
import { createServiceClient } from "../supabase/service";

// POST /api/widget/chat, step by step (project.md §6.6). Each refusal returns
// before the next step, so a blocked or invalid message is never counted and
// never reaches the AI, and an over-quota message never reaches the AI.
//
// No owner is signed in (the widget runs on any website), so this uses the
// service client, scoped by hand to the one project the public key resolves
// to (§7, §9 Tenant leak). The plan is read from the owner's account, never
// from the request (§9 Plan bypass).
//
// Analytics (§6.11): every event goes to the project owner's Clerk ID with a
// projectId property, so it lands in the owner's funnel. Visitors never
// become PostHog persons, and no visitor or bot text is ever sent. Every send
// runs after the response and can't fail or slow the reply.

/** Chunks retrieved per question. */
export const MATCH_COUNT = 5;

export type ChatResult =
  | { status: 200; body: WidgetChatResponse }
  | { status: number; body: ApiError };

const fail = (code: ApiErrorCode, message: string): ChatResult => ({
  status: API_ERROR_STATUS[code],
  body: apiError(code, message),
});

const NOT_FOUND = () =>
  fail("not_found", "Unknown widget key or conversation.");
const INTERNAL = () => fail("internal_error", "Something went wrong.");

/** What the PostHog AI trace needs (§6.6 step 7), kept in one place. */
export type ChatTrace = Pick<
  Answer,
  "model" | "inputTokens" | "outputTokens" | "latencyMs"
> & {
  projectId: string;
  /** The project owner's Clerk ID: the event's distinct ID. */
  ownerId: string;
  /** The conversation, so a conversation's replies group into one trace. */
  conversationId: string;
  chunks: number;
  /** Set when the model call failed: a short name, never the error's text. */
  error?: string;
};

/** Runs `send` after the response. Analytics never fails the request. */
function later(send: () => void | Promise<void>): void {
  const run = async () => {
    try {
      await send();
    } catch (error) {
      console.warn("chat: analytics failed", error);
    }
  };
  try {
    after(run);
  } catch {
    // Outside a request scope (a script): run now, without waiting.
    void run();
  }
}

/** The `$ai_generation` event for one chat-model call (privacy mode: no text). */
function recordTrace(trace: ChatTrace): void {
  later(() =>
    trackAiGeneration(trace.ownerId, {
      model: trace.model,
      inputTokens: trace.inputTokens,
      outputTokens: trace.outputTokens,
      latencyMs: trace.latencyMs,
      projectId: trace.projectId,
      traceId: trace.conversationId,
      chunks: trace.chunks,
      error: trace.error,
    }),
  );
}

/** A model error as a short, text-free label: its class name and HTTP status. */
function errorLabel(err: unknown): string {
  if (!(err instanceof Error)) return "Error";
  const status = (err as { status?: unknown }).status;
  return typeof status === "number" ? `${err.name} ${status}` : err.name;
}

/**
 * `message_blocked` for the owner of the key's project. An unknown key sends
 * nothing. Looked up after the response, so a blocked message stays cheap.
 */
function recordBlocked(key: string, reason: "rate_limit" | "injection"): void {
  later(async () => {
    const { data: project, error } = await createServiceClient()
      .from("projects")
      .select("id, owner_id")
      .eq("public_key", key)
      .maybeSingle();
    if (error) throw dbError("blocked owner read", error);
    if (!project) return;
    track("message_blocked", project.owner_id, {
      projectId: project.id,
      reason,
    });
  });
}

/**
 * `first_chat`, once per project: when the conversation save_chat_turn just
 * created is the project's earliest one. Race-free: of two first
 * conversations at once, only one is the earliest.
 */
function recordFirstChat(
  projectId: string,
  ownerId: string,
  conversationId: string,
): void {
  later(async () => {
    const { data: first, error } = await createServiceClient()
      .from("conversations")
      .select("id")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw dbError("first conversation read", error);
    if (first?.id === conversationId) {
      track("first_chat", ownerId, { projectId });
    }
  });
}

export async function handleChat(request: Request): Promise<ChatResult> {
  // 1. Validate.
  const raw: unknown = await request.json().catch(() => undefined);
  const parsed = widgetChatRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("invalid_request", "Invalid chat request.");
  }
  const { key, visitorId, conversationId, message } = parsed.data;

  // 2. Protect: rate limit + prompt injection. Nothing counted yet.
  const protection = await protectWidgetRequest(request, {
    route: "chat",
    publicKey: key,
    message,
  });
  if (!protection.allowed) {
    recordBlocked(key, protection.reason);
    return protection.reason === "injection"
      ? fail("message_blocked", "This message can't be answered.")
      : fail("rate_limited", "Too many messages. Try again in a minute.");
  }

  const db = createServiceClient();

  try {
    // 3. Resolve the project by public key only.
    const { data: project, error: projectError } = await db
      .from("projects")
      .select("id, owner_id, accounts (plan)")
      .eq("public_key", key)
      .maybeSingle();
    if (projectError) throw dbError("project read", projectError);
    if (!project) return NOT_FOUND();

    // A given conversation must be this project's (and this visitor's),
    // checked before anything is counted.
    if (conversationId) {
      const { data: conversation, error } = await db
        .from("conversations")
        .select("id")
        .eq("id", conversationId)
        .eq("project_id", project.id)
        .eq("visitor_id", visitorId)
        .maybeSingle();
      if (error) throw dbError("conversation read", error);
      if (!conversation) return NOT_FOUND();
    }

    // 4. Count, before any AI call. No refund later.
    const plan = planSchema.catch("free").parse(project.accounts?.plan);
    const { data: counted, error: countError } = await db.rpc(
      "consume_message",
      {
        p_project_id: project.id,
        p_limit: PLAN_LIMITS[plan].messagesPerMonth,
      },
    );
    if (countError) throw dbError("consume_message", countError);
    if (!counted?.[0]?.allowed) {
      return fail(
        "quota_exceeded",
        "This assistant has reached its monthly message limit.",
      );
    }

    // 5. Retrieve: this project's top chunks of ready sources.
    const embedding = await embedQuery(message);
    const { data: chunks, error: matchError } = await db.rpc("match_chunks", {
      p_project_id: project.id,
      p_embedding: JSON.stringify(embedding),
      p_count: MATCH_COUNT,
    });
    if (matchError) throw dbError("match_chunks", matchError);

    // 6. Answer. No chunks → "I don't know" without a chat-model call.
    const started = performance.now();
    let answer: Answer;
    try {
      answer = await answerFromChunks(message, chunks ?? []);
    } catch (err) {
      // A failed model call is traced too ($ai_is_error).
      recordTrace({
        model: CHAT_MODEL,
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: Math.round(performance.now() - started),
        projectId: project.id,
        ownerId: project.owner_id,
        conversationId: conversationId ?? crypto.randomUUID(),
        chunks: chunks?.length ?? 0,
        error: errorLabel(err),
      });
      throw err;
    }

    // 7. Save both messages; creates the conversation on the first message.
    const { data: savedId, error: saveError } = await db.rpc("save_chat_turn", {
      p_project_id: project.id,
      p_visitor_id: visitorId,
      // Generated types say string; the function takes null for "new".
      p_conversation_id: (conversationId ?? null) as string,
      p_visitor_body: message,
      p_bot_body: answer.reply,
    });
    if (saveError) throw dbError("save_chat_turn", saveError);
    if (!savedId) throw new Error("chat: save_chat_turn returned no id");

    // 8. Trace: only a reply the chat model wrote ("I don't know" from no
    // chunks makes no model call, so there's no generation to trace).
    if ((chunks?.length ?? 0) > 0) {
      recordTrace({
        model: answer.model,
        inputTokens: answer.inputTokens,
        outputTokens: answer.outputTokens,
        latencyMs: answer.latencyMs,
        projectId: project.id,
        ownerId: project.owner_id,
        conversationId: savedId,
        chunks: chunks?.length ?? 0,
      });
    }
    // The project's very first conversation → first_chat (once per project).
    if (!conversationId) {
      recordFirstChat(project.id, project.owner_id, savedId);
    }

    return {
      status: 200,
      body: { conversationId: savedId, reply: answer.reply },
    };
  } catch (err) {
    // A model or database error after counting: the message stays counted.
    console.error(err);
    return INTERNAL();
  }
}

function dbError(step: string, error: { code?: string; message?: string }) {
  return new Error(`chat: ${step} failed (${error.code || "no code"})`, {
    cause: error,
  });
}
