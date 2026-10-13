"use client";

import dynamic from "next/dynamic";

// The chat reads localStorage (session id, system prompt), so it renders in the browser only.
const Chat = dynamic(() => import("./Chat"), {
  ssr: false,
  loading: () => (
    <div className="mx-auto flex h-dvh max-w-3xl items-center justify-center text-sm text-muted" role="status">
      Loading chat…
    </div>
  ),
});

export default function ChatLoader() {
  return <Chat />;
}
