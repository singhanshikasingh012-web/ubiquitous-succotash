"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

type Thread = {
  id: string;
  roomCode: string;
  askedBy: string;
  question: string;
  createdAt: string;
  answeredBy: string | null;
  answerText: string | null;
  answerType: string | null;
  attachmentName: string | null;
  attachmentType: string | null;
  attachmentData: string | null;
  answeredAt: string | null;
};

type AnswerDraft = {
  text: string;
  type: "text" | "photo" | "voice" | "note";
  attachmentName: string;
  attachmentType: string;
  attachmentData: string;
  attachmentSizeLabel: string;
};

const SIDE_OPTIONS = ["Anshika", "Aarav"] as const;
const SHARED_ROOM_CODE = "aaravevenings";

const defaultAnswerDraft = (): AnswerDraft => ({
  text: "",
  type: "text",
  attachmentName: "",
  attachmentType: "",
  attachmentData: "",
  attachmentSizeLabel: "",
});

function formatTimeSince(timestamp: string) {
  const created = new Date(timestamp).getTime();
  const diffMinutes = Math.max(1, Math.round((Date.now() - created) / 60000));

  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} h ago`;
  }

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

function formatAnswerLag(questionTime: string, answerTime: string | null) {
  if (!answerTime) {
    return "Waiting";
  }

  const questionDate = new Date(questionTime).getTime();
  const answerDate = new Date(answerTime).getTime();
  const days = Math.max(0, Math.round((answerDate - questionDate) / (1000 * 60 * 60 * 24)));

  if (days === 0) {
    return "Same day";
  }

  return `${days} day${days === 1 ? "" : "s"} later`;
}

async function fileToDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}

function MediaPreview({
  name,
  type,
  data,
}: {
  name?: string | null;
  type?: string | null;
  data?: string | null;
}) {
  if (!data || !type) {
    return null;
  }

  if (type.startsWith("image/")) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        alt={name ?? "attached image"}
        src={data}
        className="mt-4 w-full rounded-3xl border border-[rgba(77,106,109,0.18)] object-cover shadow-[0_14px_40px_rgba(77,106,109,0.12)]"
      />
    );
  }

  if (type.startsWith("audio/")) {
    return (
      <audio controls className="mt-4 w-full max-w-full">
        <source src={data} type={type} />
      </audio>
    );
  }

  if (type.startsWith("video/")) {
    return (
      <video controls className="mt-4 w-full max-w-full rounded-3xl border border-[rgba(77,106,109,0.18)]">
        <source src={data} type={type} />
      </video>
    );
  }

  return (
    <a
      className="mt-4 inline-flex w-fit max-w-full items-center rounded-full border border-[rgba(77,106,109,0.2)] bg-[#fffaf3] px-4 py-2 text-sm text-[#405558]"
      href={data}
      download={name ?? "attachment"}
    >
      Download attachment
    </a>
  );
}

export default function Home() {
  const [mySide, setMySide] = useState<(typeof SIDE_OPTIONS)[number] | "">("");
  const [question, setQuestion] = useState("");
  const [threads, setThreads] = useState<Thread[]>([]);
  const [drafts, setDrafts] = useState<Record<string, AnswerDraft>>({});
  const [loading, setLoading] = useState(false);
  const [savingQuestion, setSavingQuestion] = useState(false);
  const [recordingThreadId, setRecordingThreadId] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    const savedSide = window.localStorage.getItem("quiet-questions-side") ?? "";
    setMySide(savedSide === "Anshika" || savedSide === "Aarav" ? savedSide : "");
  }, []);

  useEffect(() => {
    if (recordingThreadId === null) {
      setRecordingSeconds(0);
      return;
    }

    const timer = window.setInterval(() => {
      setRecordingSeconds((current) => current + 1);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [recordingThreadId]);

  useEffect(() => {
    let active = true;

    const loadThreads = async () => {
      setLoading(true);

      try {
        const response = await fetch(`/api/threads?room=${encodeURIComponent(SHARED_ROOM_CODE)}`);
        const payload = (await response.json()) as { threads?: Thread[]; error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to load notes.");
        }

        if (active) {
          setThreads(payload.threads ?? []);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadThreads();
    const timer = window.setInterval(loadThreads, 15000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const answeredCount = useMemo(
    () => threads.filter((thread) => Boolean(thread.answerText || thread.attachmentData)).length,
    [threads],
  );

  const latestQuestion = useMemo(() => threads[0] ?? null, [threads]);

  async function createQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedQuestion = question.trim();
    if (!trimmedQuestion || !mySide) {
      return;
    }

    setSavingQuestion(true);

    try {
      const response = await fetch("/api/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "question",
          roomCode: SHARED_ROOM_CODE,
          askedBy: mySide,
          question: trimmedQuestion,
        }),
      });

      const payload = (await response.json()) as { thread?: Thread; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "The question could not be saved.");
      }

      if (payload.thread) {
        const savedThread = payload.thread;
        setThreads((current) => [savedThread, ...current]);
      }
      setQuestion("");
    } finally {
      setSavingQuestion(false);
    }
  }

  async function submitAnswer(threadId: string) {
    const draft = drafts[threadId] ?? defaultAnswerDraft();
    const text = draft.text.trim();

    if ((!text && !draft.attachmentData) || !mySide) {
      return;
    }

    try {
      const response = await fetch("/api/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "answer",
          roomCode: SHARED_ROOM_CODE,
          id: threadId,
          answeredBy: mySide,
          answerText: text,
          answerType: draft.type,
          attachmentName: draft.attachmentName || null,
          attachmentType: draft.attachmentType || null,
          attachmentData: draft.attachmentData || null,
        }),
      });

      const payload = (await response.json()) as { thread?: Thread; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "The answer could not be saved.");
      }

      if (payload.thread) {
        setThreads((current) =>
          current.map((thread) => (thread.id === threadId ? payload.thread ?? thread : thread)),
        );
      }
      setDrafts((current) => ({
        ...current,
        [threadId]: defaultAnswerDraft(),
      }));
    } catch {
      return;
    }
  }

  async function deleteQuestion(threadId: string) {
    if (!window.confirm("Delete this question and its answer?")) {
      return;
    }

    const response = await fetch(
      `/api/threads?id=${encodeURIComponent(threadId)}&kind=question&room=${encodeURIComponent(SHARED_ROOM_CODE)}`,
      { method: "DELETE" },
    );

    if (!response.ok) {
      return;
    }

    setThreads((current) => current.filter((thread) => thread.id !== threadId));
  }

  async function deleteAnswer(threadId: string) {
    if (!window.confirm("Remove just the answer?")) {
      return;
    }

    const response = await fetch(
      `/api/threads?id=${encodeURIComponent(threadId)}&kind=answer&room=${encodeURIComponent(SHARED_ROOM_CODE)}`,
      { method: "DELETE" },
    );

    if (!response.ok) {
      return;
    }

    const payload = (await response.json()) as { thread?: Thread };
    if (payload.thread) {
      setThreads((current) =>
        current.map((thread) => (thread.id === threadId ? payload.thread ?? thread : thread)),
      );
    }
  }

  async function handleAttachmentChange(threadId: string, file: File | null) {
    if (!file) {
      setDrafts((current) => ({
        ...current,
        [threadId]: defaultAnswerDraft(),
      }));
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      return;
    }

    const dataUrl = await fileToDataUrl(file);

    setDrafts((current) => ({
      ...current,
      [threadId]: {
        ...(current[threadId] ?? defaultAnswerDraft()),
        attachmentName: file.name,
        attachmentType: file.type,
        attachmentData: dataUrl,
        attachmentSizeLabel: `${(file.size / 1024 / 1024).toFixed(file.size < 1024 * 1024 ? 1 : 2)} MB`,
      },
    }));
  }

  async function startVoiceRecording(threadId: string) {
    if (recordingThreadId !== null || !navigator.mediaDevices?.getUserMedia) {
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result ?? ""));
          reader.readAsDataURL(blob);
        });

        setDrafts((current) => ({
          ...current,
          [threadId]: {
            ...(current[threadId] ?? defaultAnswerDraft()),
            type: "voice",
            attachmentName: "voice-note.webm",
            attachmentType: blob.type || "audio/webm",
            attachmentData: dataUrl,
            attachmentSizeLabel: `${(blob.size / 1024 / 1024).toFixed(blob.size < 1024 * 1024 ? 1 : 2)} MB`,
          },
        }));

        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        setRecordingThreadId(null);
      };

      streamRef.current = stream;
      recorderRef.current = recorder;
      setRecordingThreadId(threadId);
      recorder.start();
    } catch {
      return;
    }
  }

  function stopVoiceRecording() {
    recorderRef.current?.stop();
  }

  return (
    <main className="relative min-h-screen overflow-x-hidden px-3 py-4 sm:px-4 sm:py-5 lg:px-6 lg:py-6">
      <div className="absolute inset-0 grain" />
      <div className="relative z-10 mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-4">
        <header className="paper-surface w-full rounded-[1.5rem] p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-[#6e7e7b]">Private notes</p>
              <h1 className="display-font mt-2 text-4xl leading-none text-[#395156] sm:text-5xl">Quiet Notes</h1>
            </div>

            <div className="flex max-w-full flex-wrap items-center gap-2">
              {SIDE_OPTIONS.map((side) => (
                <button
                  key={side}
                  type="button"
                  onClick={() => {
                    setMySide(side);
                    window.localStorage.setItem("quiet-questions-side", side);
                  }}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                    mySide === side
                      ? "bg-[#4d6a6d] text-[#fffaf3]"
                      : "border border-[rgba(77,106,109,0.2)] bg-[#fffaf3] text-[#405558]"
                  }`}
                >
                  {side}
                </button>
              ))}
            </div>
          </div>
        </header>

        <section className="paper-surface w-full rounded-[1.5rem] p-4 sm:p-5">
          <form className="grid w-full min-w-0 gap-3" onSubmit={createQuestion}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs uppercase tracking-[0.3em] text-[#71827f]">New note</p>
              <span className="text-sm text-[#5f6f6f]">{mySide ? `Writing as ${mySide}` : "Pick a side first"}</span>
            </div>

            <textarea
              className="soft-input min-h-28 w-full rounded-[1.25rem] px-4 py-4 text-base leading-7"
              placeholder="What stayed with you today?"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
            />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="submit"
                disabled={savingQuestion || !question.trim() || !mySide}
                className="rounded-2xl bg-[#4d6a6d] px-5 py-3 text-sm font-semibold text-[#fffaf3] transition hover:bg-[#40585b] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingQuestion ? "Saving..." : "Add note"}
              </button>
              <div className="text-sm text-[#5f6f6f]">No names to type. Just post.</div>
            </div>
          </form>
        </section>

        <section className="paper-surface w-full rounded-[1.5rem] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[#71827f]">Conversation</p>
              <h2 className="display-font mt-1 text-3xl text-[#395156]">What’s here</h2>
            </div>
            <div className="text-right text-sm text-[#5f6f6f]">
              <div>{loading ? "Updating..." : `Updates every 15s`}</div>
              <div>{answeredCount} answered</div>
            </div>
          </div>

          <div className="mt-4 grid gap-4">
            {threads.length === 0 ? (
              <div className="rounded-[1.25rem] border border-dashed border-[rgba(77,106,109,0.22)] bg-[rgba(255,250,243,0.65)] p-5 text-sm leading-7 text-[#61716f]">
                Nothing here yet. Leave the first note.
              </div>
            ) : null}

            {threads.map((thread) => {
              const draft = drafts[thread.id] ?? defaultAnswerDraft();
              const isAnswered = Boolean(thread.answerText || thread.attachmentData);

              return (
                <article key={thread.id} className="paper-surface-strong w-full min-w-0 overflow-hidden rounded-[1.5rem] p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs uppercase tracking-[0.28em] text-[#71827f]">{thread.askedBy}</div>
                      <h3 className="mt-2 break-words text-xl leading-7 text-[#3f5659] sm:text-2xl sm:leading-8">
                        {thread.question}
                      </h3>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2 max-w-full">
                      <div className="rounded-full bg-[rgba(160,160,131,0.18)] px-3 py-1 text-xs font-medium text-[#5f6f6f]">
                        {formatTimeSince(thread.createdAt)}
                      </div>
                      <button
                        type="button"
                        className="rounded-full border border-[rgba(77,106,109,0.2)] bg-[#fffaf3] px-3 py-1 text-xs text-[#4d6a6d]"
                        onClick={() => {
                          void deleteQuestion(thread.id);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {isAnswered ? (
                    <div className="mt-4 rounded-[1.25rem] border border-[rgba(77,106,109,0.16)] bg-[#fffaf5] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-[#4d6a6d]">{thread.answeredBy}</div>
                        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-[#8b7f6b]">
                          <span>{formatAnswerLag(thread.createdAt, thread.answeredAt)}</span>
                          <button
                            type="button"
                            className="rounded-full border border-[rgba(77,106,109,0.2)] bg-[#fffaf3] px-3 py-1 text-[10px] tracking-[0.18em] text-[#4d6a6d]"
                            onClick={() => {
                              void deleteAnswer(thread.id);
                            }}
                          >
                            Remove answer
                          </button>
                        </div>
                      </div>

                      {thread.answerText ? (
                        <p className="mt-3 break-words whitespace-pre-wrap text-[15px] leading-7 text-[#455b5d]">
                          {thread.answerText}
                        </p>
                      ) : null}

                      <MediaPreview
                        name={thread.attachmentName}
                        type={thread.attachmentType}
                        data={thread.attachmentData}
                      />
                    </div>
                  ) : (
                    <div className="mt-4 rounded-[1.25rem] border border-[rgba(77,106,109,0.14)] bg-[#fffaf3] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-medium text-[#4d6a6d]">Reply here</div>
                        <button
                          type="button"
                          className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                            recordingThreadId === thread.id
                              ? "bg-[#4d6a6d] text-[#fffaf3]"
                              : "border border-[rgba(77,106,109,0.2)] bg-[#fffaf3] text-[#405558]"
                          }`}
                          onClick={() => {
                            if (recordingThreadId === thread.id) {
                              stopVoiceRecording();
                            } else {
                              void startVoiceRecording(thread.id);
                            }
                          }}
                        >
                          {recordingThreadId === thread.id ? `Stop ${recordingSeconds}s` : "Record voice note"}
                        </button>
                      </div>

                      <div className="mt-4 grid gap-4">
                        <textarea
                          className="soft-input min-h-24 rounded-[1.25rem] px-4 py-4 text-base leading-7"
                          placeholder="Write back when you want to."
                          value={draft.text}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [thread.id]: {
                                ...draft,
                                text: event.target.value,
                              },
                            }))
                          }
                        />

                        <div className="grid gap-2">
                          <label className="text-sm font-medium text-[#4d6a6d]" htmlFor={`attachment-${thread.id}`}>
                            Add a photo or video
                          </label>
                          <input
                            id={`attachment-${thread.id}`}
                            className="soft-input rounded-2xl px-4 py-3 text-sm"
                            type="file"
                            accept="image/*,video/*"
                            onChange={async (event) => {
                              await handleAttachmentChange(thread.id, event.target.files?.[0] ?? null);
                            }}
                          />
                          {draft.attachmentName ? (
                            <div className="break-words text-sm text-[#5f6f6f]">
                              Attached: {draft.attachmentName} {draft.attachmentSizeLabel ? `(${draft.attachmentSizeLabel})` : ""}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          className="rounded-2xl bg-[#4d6a6d] px-5 py-3 text-sm font-semibold text-[#fffaf3] transition hover:bg-[#40585b]"
                          onClick={() => {
                            void submitAnswer(thread.id);
                          }}
                        >
                          Send answer
                        </button>
                        <button
                          type="button"
                          className="rounded-2xl border border-[rgba(77,106,109,0.2)] bg-[#fffaf3] px-5 py-3 text-sm text-[#4d6a6d]"
                          onClick={() => {
                            setDrafts((current) => ({
                              ...current,
                              [thread.id]: defaultAnswerDraft(),
                            }));
                          }}
                        >
                          Clear draft
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
