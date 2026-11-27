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
import { answerFromChunks, type Answer } from "../ai/answer";
import { embedQuery } from "../ai/embed";
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

/** What Phase 4's PostHog AI trace needs, kept in one place. */
export type ChatTrace = Pick<
  Answer,
  "model" | "inputTokens" | "outputTokens" | "latencyMs"
> & { projectId: string; chunks: number };

function recordTrace(trace: ChatTrace) {
  // TODO(Phase 4): send the PostHog AI trace (model, tokens, cost, latency,
  // project ID; project.md §6.6 step 7) once NEXT_PUBLIC_POSTHOG_KEY exists.
  void trace;
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
    // TODO(Phase 4): `message_blocked` PostHog event, reason protection.reason.
    return protection.reason === "injection"
      ? fail("message_blocked", "This message can't be answered.")
      : fail("rate_limited", "Too many messages. Try again in a minute.");
  }

  const db = createServiceClient();

  try {
    // 3. Resolve the project by public key only.
    const { data: project, error: projectError } = await db
      .from("projects")
      .select("id, accounts (plan)")
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
    const answer = await answerFromChunks(message, chunks ?? []);

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

    // 8. Trace (Phase 4).
    recordTrace({
      model: answer.model,
      inputTokens: answer.inputTokens,
      outputTokens: answer.outputTokens,
      latencyMs: answer.latencyMs,
      projectId: project.id,
      chunks: chunks?.length ?? 0,
    });

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
