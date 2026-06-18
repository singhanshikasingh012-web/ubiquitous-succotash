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

const defaultAnswerDraft = (): AnswerDraft => ({
  text: "",
  type: "text",
  attachmentName: "",
  attachmentType: "",
  attachmentData: "",
  attachmentSizeLabel: "",
});

const SIDE_OPTIONS = ["Anshika", "Aarav"] as const;

function normalizeRoomCode(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

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
    return "Waiting for an answer";
  }

  const questionDate = new Date(questionTime).getTime();
  const answerDate = new Date(answerTime).getTime();
  const days = Math.max(0, Math.round((answerDate - questionDate) / (1000 * 60 * 60 * 24)));

  if (days === 0) {
    return "Answered the same day";
  }

  return `Answered ${days} day${days === 1 ? "" : "s"} later`;
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
      <audio controls className="mt-4 w-full">
        <source src={data} type={type} />
      </audio>
    );
  }

  if (type.startsWith("video/")) {
    return (
      <video controls className="mt-4 w-full rounded-3xl border border-[rgba(77,106,109,0.18)]">
        <source src={data} type={type} />
      </video>
    );
  }

  return (
    <a
      className="mt-4 inline-flex w-fit items-center rounded-full border border-[rgba(77,106,109,0.2)] bg-[#fffaf3] px-4 py-2 text-sm text-[#405558]"
      href={data}
      download={name ?? "attachment"}
    >
      Download attachment
    </a>
  );
}

export default function Home() {
  const [roomInput, setRoomInput] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [mySide, setMySide] = useState<(typeof SIDE_OPTIONS)[number] | "">("");
  const [question, setQuestion] = useState("");
  const [threads, setThreads] = useState<Thread[]>([]);
  const [drafts, setDrafts] = useState<Record<string, AnswerDraft>>({});
  const [loading, setLoading] = useState(false);
  const [savingQuestion, setSavingQuestion] = useState(false);
  const [recordingThreadId, setRecordingThreadId] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  useEffect(() => {
    const savedRoom = window.localStorage.getItem("quiet-questions-room") ?? "";
    const savedSide = window.localStorage.getItem("quiet-questions-side") ?? "";
    setRoomInput(savedRoom);
    setRoomCode(savedRoom);
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
    if (!roomCode) {
      return;
    }

    let active = true;

    const loadThreads = async () => {
      setLoading(true);

      try {
        const response = await fetch(`/api/threads?room=${encodeURIComponent(roomCode)}`);
        const payload = (await response.json()) as { threads?: Thread[]; error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to load the room.");
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
  }, [roomCode]);

  const answeredCount = useMemo(
    () => threads.filter((thread) => Boolean(thread.answerText || thread.attachmentData)).length,
    [threads],
  );

  const latestQuestion = useMemo(() => threads[0] ?? null, [threads]);

  async function submitRoomGate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedRoom = normalizeRoomCode(roomInput);
    const normalizedSide = mySide;

    if (!normalizedRoom || !normalizedSide) {
      return;
    }

    window.localStorage.setItem("quiet-questions-room", normalizedRoom);
    window.localStorage.setItem("quiet-questions-side", normalizedSide);
    setRoomCode(normalizedRoom);
  }

  async function createQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedQuestion = question.trim();
    if (!roomCode || !trimmedQuestion || !mySide) {
      return;
    }

    setSavingQuestion(true);

    try {
      const response = await fetch("/api/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "question",
          roomCode,
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
    if (!roomCode || (!text && !draft.attachmentData) || !mySide) {
      return;
    }

    try {
      const response = await fetch("/api/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "answer",
          roomCode,
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

  if (!roomCode) {
    return (
      <main className="relative flex min-h-screen items-center justify-center px-4 py-10">
        <div className="absolute inset-0 grain" />
        <div className="paper-surface relative z-10 w-full max-w-xl rounded-[2rem] p-8 sm:p-10">
          <div className="inline-flex rounded-full border border-[rgba(77,106,109,0.18)] bg-[#fffaf3] px-3 py-1 text-xs uppercase tracking-[0.28em] text-[#6f7f7c]">
            For Anshika and Aarav
          </div>
          <div className="display-font text-4xl leading-none text-[#405558] sm:text-5xl">
            Quiet Questions
          </div>
          <p className="mt-4 max-w-lg text-sm leading-7 text-[#5f6f6f] sm:text-base">
            A quiet place for you and Aarav to leave questions, come back later, and keep the small
            things that matter.
          </p>

          <form className="mt-8 grid gap-4" onSubmit={submitRoomGate}>
            <div className="grid gap-2">
              <label className="text-sm font-medium text-[#4d6a6d]" htmlFor="room-code">
                Room code
              </label>
              <input
                id="room-code"
                className="soft-input rounded-2xl px-4 py-3 text-base"
                placeholder="aarav-evenings"
                value={roomInput}
                onChange={(event) => setRoomInput(normalizeRoomCode(event.target.value))}
              />
            </div>
            <div className="grid gap-2">
              <div className="text-sm font-medium text-[#4d6a6d]">Choose your side</div>
              <div className="grid gap-3 sm:grid-cols-2">
                {SIDE_OPTIONS.map((side) => (
                  <button
                    key={side}
                    type="button"
                    onClick={() => setMySide(side)}
                    className={`rounded-2xl border px-4 py-3 text-left text-sm transition ${
                      mySide === side
                        ? "border-[#4d6a6d] bg-[#4d6a6d] text-[#fffaf3]"
                        : "border-[rgba(77,106,109,0.2)] bg-[#fffaf3] text-[#405558]"
                    }`}
                  >
                    {side}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="submit"
              disabled={!roomInput || !mySide}
              className="rounded-2xl bg-[#4d6a6d] px-5 py-3 text-sm font-semibold text-[#fffaf3] transition hover:translate-y-[-1px] hover:bg-[#40585b] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Enter the room
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="absolute inset-0 grain" />
      <div className="absolute left-[-6rem] top-[-4rem] h-64 w-64 rounded-full bg-[#c9ada1]/35 blur-3xl" />
      <div className="absolute right-[-5rem] top-24 h-72 w-72 rounded-full bg-[#a0a083]/25 blur-3xl" />
      <div className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-[#4d6a6d]/20 blur-3xl" />

      <div className="relative z-10 mx-auto grid w-full max-w-7xl gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="paper-surface rounded-[2rem] p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-[#6e7e7b]">{mySide || "Room"}</p>
              <p className="text-xs uppercase tracking-[0.35em] text-[#6e7e7b]">Private shared room</p>
              <h1 className="display-font mt-3 text-5xl leading-[0.9] text-[#395156] sm:text-6xl">
                Quiet notes.
                <br /> Warm room.
              </h1>
            </div>
            <div className="paper-surface-strong rounded-3xl px-4 py-3 text-right text-sm text-[#4d6a6d]">
              <div className="font-semibold">Room</div>
              <div className="mt-1 font-mono text-xs tracking-[0.2em]">{roomCode}</div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="paper-surface-strong rounded-[1.75rem] p-4">
              <div className="text-xs uppercase tracking-[0.25em] text-[#71827f]">Messages</div>
              <div className="mt-2 text-3xl font-semibold text-[#3f5659]">{threads.length}</div>
            </div>
            <div className="paper-surface-strong rounded-[1.75rem] p-4">
              <div className="text-xs uppercase tracking-[0.25em] text-[#71827f]">Answered</div>
              <div className="mt-2 text-3xl font-semibold text-[#3f5659]">{answeredCount}</div>
            </div>
            <div className="paper-surface-strong rounded-[1.75rem] p-4">
              <div className="text-xs uppercase tracking-[0.25em] text-[#71827f]">Latest</div>
              <div className="mt-2 text-sm leading-6 text-[#3f5659]">
                {latestQuestion ? latestQuestion.question : "Nothing yet. Be the first quiet note."}
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-3 rounded-[2rem] border border-[rgba(77,106,109,0.14)] bg-[#fffaf3] p-5 sm:grid-cols-3">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-[#71827f]">Start</div>
              <p className="mt-2 text-sm leading-6 text-[#455b5d]">Ask whatever’s on your mind.</p>
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-[#71827f]">Reply</div>
              <p className="mt-2 text-sm leading-6 text-[#455b5d]">Answer when you have the time.</p>
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-[#71827f]">Add</div>
              <p className="mt-2 text-sm leading-6 text-[#455b5d]">Drop in a photo or voice note if you want.</p>
            </div>
          </div>

          <form className="paper-surface-strong mt-6 rounded-[2rem] p-5 sm:p-6" onSubmit={createQuestion}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#71827f]">Ask a new question</p>
                <h2 className="display-font mt-1 text-3xl text-[#395156]">Leave a note</h2>
              </div>
            </div>

            <div className="mt-5 grid gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium text-[#4d6a6d]" htmlFor="question">
                  Question
                </label>
                <textarea
                  id="question"
                  className="soft-input min-h-32 rounded-[1.5rem] px-4 py-4 text-base leading-7"
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder="What stayed with you today?"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={savingQuestion || !question.trim()}
              className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-[#4d6a6d] px-5 py-3 text-sm font-semibold text-[#fffaf3] transition hover:translate-y-[-1px] hover:bg-[#40585b] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {savingQuestion ? "Saving..." : "Add note"}
            </button>
          </form>
        </section>

        <section className="paper-surface rounded-[2rem] p-6 sm:p-8">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[#71827f]">Timeline</p>
              <h2 className="display-font mt-1 text-4xl text-[#395156]">What’s in the room</h2>
            </div>
            <button
              type="button"
              className="rounded-full border border-[rgba(77,106,109,0.18)] bg-[#fffaf3] px-4 py-2 text-sm text-[#4d6a6d]"
              onClick={() => {
                setRoomCode("");
              }}
            >
              Switch room
            </button>
          </div>

          <div className="mt-4 rounded-3xl border border-[rgba(77,106,109,0.14)] bg-[#fffaf3] px-4 py-3 text-sm text-[#5f6f6f]">
            {loading ? "Checking for new notes..." : "Updates every 15 seconds."}
          </div>

          <div className="mt-5 grid gap-4">
            {threads.length === 0 ? (
              <div className="rounded-[1.75rem] border border-dashed border-[rgba(77,106,109,0.22)] bg-[rgba(255,250,243,0.65)] p-6 text-sm leading-7 text-[#61716f]">
                Nothing here yet. Leave the first note.
              </div>
            ) : null}

            {threads.map((thread) => {
              const draft = drafts[thread.id] ?? defaultAnswerDraft();
              const isAnswered = Boolean(thread.answerText || thread.attachmentData);

              return (
                <article key={thread.id} className="paper-surface-strong rounded-[1.9rem] p-5 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.28em] text-[#71827f]">Asked by {thread.askedBy}</div>
                      <h3 className="mt-2 text-2xl leading-8 text-[#3f5659]">{thread.question}</h3>
                    </div>
                    <div className="rounded-full bg-[rgba(160,160,131,0.18)] px-3 py-1 text-xs font-medium text-[#5f6f6f]">
                      {formatTimeSince(thread.createdAt)}
                    </div>
                  </div>

                  {isAnswered ? (
                    <div className="mt-4 rounded-[1.5rem] border border-[rgba(77,106,109,0.16)] bg-[#fffaf5] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-[#4d6a6d]">Answered by {thread.answeredBy}</div>
                        <div className="text-xs uppercase tracking-[0.22em] text-[#8b7f6b]">
                          {formatAnswerLag(thread.createdAt, thread.answeredAt)}
                        </div>
                      </div>
                      {thread.answerText ? (
                        <p className="mt-3 whitespace-pre-wrap text-[15px] leading-7 text-[#455b5d]">
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
                    <div className="mt-4 rounded-[1.5rem] border border-[rgba(77,106,109,0.14)] bg-[#fffaf3] p-4">
                      <div className="text-sm font-medium text-[#4d6a6d]">Reply here</div>
                      <div className="mt-4 grid gap-4">
                        <div className="grid gap-2 sm:grid-cols-2">
                          <select
                            className="soft-input rounded-2xl px-4 py-3 text-base"
                            value={draft.type}
                            onChange={(event) =>
                              setDrafts((current) => ({
                                ...current,
                                [thread.id]: {
                                  ...draft,
                                  type: event.target.value as AnswerDraft["type"],
                                },
                              }))
                            }
                          >
                            <option value="text">Text</option>
                            <option value="photo">Photo</option>
                            <option value="voice">Voice note</option>
                            <option value="note">Mixed</option>
                          </select>
                          <button
                            type="button"
                            className={`rounded-2xl px-4 py-3 text-sm font-medium transition ${
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
                            {recordingThreadId === thread.id
                              ? `Stop recording ${recordingSeconds}s`
                              : "Record voice note"}
                          </button>
                        </div>

                        <textarea
                          className="soft-input min-h-28 rounded-[1.5rem] px-4 py-4 text-base leading-7"
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
                            <div className="text-sm text-[#5f6f6f]">
                              Attached: {draft.attachmentName}{" "}
                              {draft.attachmentSizeLabel ? `(${draft.attachmentSizeLabel})` : ""}
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
                          onClick={() =>
                            setDrafts((current) => ({
                              ...current,
                              [thread.id]: defaultAnswerDraft(),
                            }))
                          }
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
