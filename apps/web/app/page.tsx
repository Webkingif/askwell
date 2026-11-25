import { APP_NAME } from "@askwell/shared";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">{APP_NAME}</h1>
      <p className="text-lg text-zinc-600">
        AI support chat for any website. Coming soon.
      </p>
    </main>
  );
}
