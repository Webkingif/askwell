"use client";

import { useRouter } from "next/navigation";
import {
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { MAX_KNOWLEDGE_TITLE_LENGTH } from "@askwell/shared";
import { Button, Input, Spinner } from "../ui";
import { uploadFile, type UploadStage } from "./api";
import { ACCEPT, MAX_FILE_MB, checkFile, formatSize } from "./files";

const STAGE_LABELS: Record<UploadStage, string> = {
  preparing: "Preparing the upload…",
  uploading: "Uploading the file…",
  checking: "Checking the file…",
};

/** Strip the extension for a default title. */
const titleFromName = (name: string) =>
  name.replace(/\.[^.]+$/, "").slice(0, MAX_KNOWLEDGE_TITLE_LENGTH);

/** Pick a file → checks it here first → upload-url → PUT to Storage → finalize. */
export function UploadForm({
  projectId,
  onLimit,
}: {
  projectId: string;
  onLimit: (message: string) => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const fileId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [stage, setStage] = useState<UploadStage | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onPick(event: ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0] ?? null;
    setError(null);
    if (!picked) return setFile(null);
    const check = checkFile(picked);
    if (!check.ok) {
      setFile(null);
      event.target.value = "";
      return setError(check.message);
    }
    setFile(picked);
    if (title.trim() === "") setTitle(titleFromName(picked.name));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || stage) return;
    setError(null);
    const result = await uploadFile(projectId, title, file, setStage);
    setStage(null);
    if (result.ok) {
      setFile(null);
      setTitle("");
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
      return;
    }
    if (result.code === "plan_limit_reached") return onLimit(result.message);
    setError(result.message);
  }

  return (
    <form
      onSubmit={onSubmit}
      aria-label="Upload a file"
      className="flex flex-col gap-3"
    >
      <h2 className="text-base font-semibold text-fg">Upload a file</h2>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={fileId} className="text-sm font-medium text-fg">
          File
        </label>
        <input
          ref={inputRef}
          id={fileId}
          type="file"
          accept={ACCEPT}
          onChange={onPick}
          disabled={stage !== null}
          aria-describedby={`${fileId}-hint`}
          className="focus-ring w-full min-w-0 rounded-md text-sm text-fg file:mr-3 file:h-10 file:cursor-pointer file:rounded-md file:border-0 file:bg-subtle file:px-4 file:text-sm file:font-medium file:text-fg"
        />
        <p id={`${fileId}-hint`} className="text-xs text-muted">
          {file
            ? `${file.name} · ${formatSize(file.size)}`
            : `PDF, Markdown or TXT, up to ${MAX_FILE_MB} MB.`}
        </p>
      </div>
      <Input
        label="Title"
        name="file-title"
        placeholder="e.g. Returns policy"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={MAX_KNOWLEDGE_TITLE_LENGTH}
        required
        autoComplete="off"
        disabled={stage !== null}
      />
      {stage && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted">
          <Spinner size="sm" label={null} />
          {STAGE_LABELS[stage]}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
      <Button
        type="submit"
        loading={stage !== null}
        disabled={!file || title.trim() === ""}
        className="w-full sm:w-auto sm:self-start"
      >
        Upload file
      </Button>
    </form>
  );
}
