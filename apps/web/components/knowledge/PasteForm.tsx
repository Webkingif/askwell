"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import {
  MAX_KNOWLEDGE_TEXT_LENGTH,
  MAX_KNOWLEDGE_TITLE_LENGTH,
} from "@askwell/shared";
import { Button, Input, cx } from "../ui";
import { knowledgeApi } from "./api";

/** Title + text → POST /api/projects/:id/knowledge. */
export function PasteForm({
  projectId,
  onLimit,
}: {
  projectId: string;
  onLimit: (message: string) => void;
}) {
  const router = useRouter();
  const textId = useId();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    const result = await knowledgeApi.paste(projectId, title, text);
    setPending(false);
    if (result.ok) {
      setTitle("");
      setText("");
      router.refresh();
      return;
    }
    if (result.code === "plan_limit_reached") return onLimit(result.message);
    setError(result.message);
  }

  return (
    <form
      onSubmit={onSubmit}
      aria-label="Paste text"
      className="flex flex-col gap-3"
    >
      <h2 className="text-base font-semibold text-fg">Paste text</h2>
      <Input
        label="Title"
        name="title"
        placeholder="e.g. Opening hours"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={MAX_KNOWLEDGE_TITLE_LENGTH}
        required
        autoComplete="off"
      />
      <div className="flex flex-col gap-1.5">
        <label htmlFor={textId} className="text-sm font-medium text-fg">
          Text
        </label>
        <textarea
          id={textId}
          name="text"
          rows={6}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={MAX_KNOWLEDGE_TEXT_LENGTH}
          required
          placeholder="FAQs, policies, product details…"
          aria-describedby={`${textId}-count`}
          className={cx(
            "focus-ring w-full min-w-0 resize-y rounded-md border border-line bg-glass px-3 py-2 text-sm text-fg",
            "placeholder:text-muted backdrop-blur-glass transition-colors hover:border-muted",
          )}
        />
        <p id={`${textId}-count`} className="text-xs text-muted">
          {text.length.toLocaleString("en")} /{" "}
          {MAX_KNOWLEDGE_TEXT_LENGTH.toLocaleString("en")} characters
        </p>
      </div>
      {error && (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
      <Button
        type="submit"
        loading={pending}
        disabled={title.trim() === "" || text.trim() === ""}
        className="w-full sm:w-auto sm:self-start"
      >
        Add text
      </Button>
    </form>
  );
}
