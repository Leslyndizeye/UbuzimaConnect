"use client";
import React, { useState, useRef, useEffect } from "react";

const HF_TOKEN = (import.meta as any).env?.VITE_HF_TOKEN || "";
const MODEL = "HuggingFaceH4/zephyr-7b-beta";

const SYSTEM_PROMPT = `You are a radiology assistant for Ubuzima Connect, an AI-powered chest X-ray diagnostic platform in Rwanda. You help radiologists understand diagnoses made by the AI system.

You ONLY answer questions about:
- Tuberculosis (TB): symptoms, X-ray findings, diagnosis, treatment guidelines
- Pneumonia: types, X-ray appearance, diagnosis, management
- Normal chest X-ray features and interpretation
- What AI confidence scores mean (e.g. "what does 87% TB mean?")
- When to refer patients urgently
- Differences between TB, pneumonia, and normal findings on X-ray
- Rwanda-specific clinical guidelines

If asked ANYTHING outside radiology and chest diagnostics, respond with:
"I'm specialized in chest X-ray diagnostics only. Please ask me about TB, pneumonia, or X-ray interpretation."

Keep answers concise, clinical, and practical. Use bullet points for clarity.`;

interface Message {
  id: number;
  role: "user" | "assistant";
  text: string;
  loading?: boolean;
}

const DARK_GREEN = "#1C5438";
const BRAND = "#86EFAC";

const SUGGESTIONS = [
  "What does 85% TB confidence mean?",
  "TB vs Pneumonia on X-ray?",
  "When to refer urgently?",
  "Normal chest X-ray features?",
];

async function askZephyr(userMessage: string, history: Message[]): Promise<string> {
  // Build conversation history for context
  const recentHistory = history.slice(-6); // last 3 exchanges
  let prompt = `<|system|>\n${SYSTEM_PROMPT}\n</s>\n`;

  for (const msg of recentHistory) {
    if (msg.role === "user") {
      prompt += `<|user|>\n${msg.text}\n</s>\n<|assistant|>\n`;
    } else if (!msg.loading) {
      prompt += `${msg.text}\n</s>\n`;
    }
  }
  prompt += `<|user|>\n${userMessage}\n</s>\n<|assistant|>\n`;

  const res = await fetch(
    `https://api-inference.huggingface.co/models/${MODEL}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HF_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_new_tokens: 400,
          temperature: 0.3,
          return_full_text: false,
          stop: ["</s>", "<|user|>", "<|system|>"],
        },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    // Model loading — common on free tier
    if (res.status === 503) {
      throw new Error("Model is warming up (this takes ~30 seconds on first use). Please try again.");
    }
    throw new Error(err.error || `API error ${res.status}`);
  }

  const data = await res.json();
  const raw: string = Array.isArray(data)
    ? data[0]?.generated_text || ""
    : data?.generated_text || "";

  // Clean up any trailing prompt artifacts
  return raw
    .replace(/<\|.*?\|>/g, "")
    .replace(/<\/s>/g, "")
    .trim() || "I couldn't generate a response. Please try again.";
}

export default function ChatbotWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 0,
      role: "assistant",
      text: "Hello! I'm your radiology assistant. Ask me anything about TB, pneumonia, chest X-ray interpretation, or AI confidence scores.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const idRef = useRef(1);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async (text: string) => {
    const msg = text.trim();
    if (!msg || loading) return;
    setInput("");
    setError("");

    const userMsg: Message = { id: idRef.current++, role: "user", text: msg };
    const loadingMsg: Message = { id: idRef.current++, role: "assistant", text: "", loading: true };

    setMessages((prev) => [...prev, userMsg, loadingMsg]);
    setLoading(true);

    try {
      const reply = await askZephyr(msg, [...messages, userMsg]);
      setMessages((prev) =>
        prev.map((m) => (m.loading ? { ...m, text: reply, loading: false } : m))
      );
    } catch (e: any) {
      setMessages((prev) => prev.filter((m) => !m.loading));
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  return (
    <>
      {/* ── Floating Button ── */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all hover:scale-110 active:scale-95"
        style={{
          backgroundColor: DARK_GREEN,
          boxShadow: `0 8px 32px ${DARK_GREEN}66`,
        }}
        title="Radiology Assistant"
      >
        {open ? (
          <svg width="20" height="20" fill="none" stroke="white" strokeWidth="2.5" viewBox="0 0 24 24">
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg width="22" height="22" fill="none" stroke="white" strokeWidth="1.75" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10h8l-2.93-2.93A9.96 9.96 0 0022 12C22 6.48 17.52 2 12 2z" strokeLinejoin="round" />
            <path d="M8 10h8M8 14h5" strokeLinecap="round" />
          </svg>
        )}
        {/* Pulse ring */}
        {!open && (
          <span
            className="absolute inset-0 rounded-full animate-ping opacity-20"
            style={{ backgroundColor: DARK_GREEN }}
          />
        )}
      </button>

      {/* ── Chat Panel ── */}
      {open && (
        <div
          className="fixed bottom-24 right-6 z-50 w-[380px] rounded-[28px] overflow-hidden flex flex-col"
          style={{
            height: 520,
            background: "#fff",
            boxShadow: "0 24px 80px rgba(0,0,0,0.18), 0 4px 20px rgba(0,0,0,0.08)",
            border: "1px solid #F1F5F9",
            animation: "popIn 0.28s cubic-bezier(.22,1,.36,1) both",
          }}
        >
          <style>{`
            @keyframes popIn { from{opacity:0;transform:scale(0.92) translateY(12px)} to{opacity:1;transform:scale(1) translateY(0)} }
            @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
            .dot-blink { animation: blink 1.4s ease-in-out infinite; }
            .dot-blink:nth-child(2) { animation-delay: 0.2s; }
            .dot-blink:nth-child(3) { animation-delay: 0.4s; }
            .msg-in { animation: msgIn 0.25s cubic-bezier(.22,1,.36,1) both; }
            @keyframes msgIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
          `}</style>

          {/* Header */}
          <div
            className="px-5 py-4 flex items-center gap-3 shrink-0"
            style={{ background: `linear-gradient(135deg, ${DARK_GREEN}, #267347)` }}
          >
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center shrink-0">
              <svg width="18" height="18" fill="none" stroke="white" strokeWidth="1.75" viewBox="0 0 24 24">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-sm leading-tight">Radiology Assistant</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-green-300" />
                <p className="text-white/70 text-[10px] font-medium">TB · Pneumonia · X-ray</p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors"
            >
              <svg width="12" height="12" fill="none" stroke="white" strokeWidth="2.5" viewBox="0 0 24 24">
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" style={{ backgroundColor: "#F8FAFC" }}>

            {/* Suggestion chips — only show when only 1 message (greeting) */}
            {messages.length === 1 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-[11px] font-semibold px-3 py-1.5 rounded-full border-2 transition-all hover:scale-105 active:scale-95"
                    style={{
                      borderColor: BRAND,
                      backgroundColor: "#F0FDF4",
                      color: DARK_GREEN,
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex msg-in ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "assistant" && (
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mr-2 mt-0.5"
                    style={{ backgroundColor: DARK_GREEN }}
                  >
                    <svg width="13" height="13" fill="none" stroke="white" strokeWidth="1.75" viewBox="0 0 24 24">
                      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                    </svg>
                  </div>
                )}
                <div
                  className="max-w-[78%] px-4 py-3 rounded-2xl text-[13px] leading-relaxed"
                  style={
                    msg.role === "user"
                      ? {
                          backgroundColor: DARK_GREEN,
                          color: "white",
                          borderBottomRightRadius: 6,
                          fontWeight: 500,
                        }
                      : {
                          backgroundColor: "white",
                          color: "#1E293B",
                          borderBottomLeftRadius: 6,
                          border: "1px solid #F1F5F9",
                          boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                        }
                  }
                >
                  {msg.loading ? (
                    <div className="flex items-center gap-1.5 py-1">
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className="w-2 h-2 rounded-full dot-blink"
                          style={{ backgroundColor: "#94A3B8" }}
                        />
                      ))}
                    </div>
                  ) : (
                    <span style={{ whiteSpace: "pre-wrap" }}>{msg.text}</span>
                  )}
                </div>
              </div>
            ))}

            {error && (
              <div className="flex justify-center">
                <div className="text-[11px] font-semibold px-4 py-2.5 rounded-2xl max-w-[90%] text-center"
                  style={{ backgroundColor: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA" }}>
                  ⚠ {error}
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="px-4 py-3 bg-white border-t border-slate-100 shrink-0">
            <div
              className="flex items-center gap-2 rounded-2xl px-4 py-2.5 transition-all"
              style={{
                border: `2px solid ${input ? BRAND : "#E2E8F0"}`,
                backgroundColor: "#F8FAFC",
              }}
            >
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Ask about TB, pneumonia, X-rays…"
                disabled={loading}
                className="flex-1 bg-transparent outline-none text-[13px] text-slate-800 placeholder:text-slate-400 font-medium"
              />
              <button
                onClick={() => send(input)}
                disabled={loading || !input.trim()}
                className="w-8 h-8 rounded-xl flex items-center justify-center transition-all disabled:opacity-40 hover:scale-110 active:scale-95"
                style={{ backgroundColor: DARK_GREEN }}
              >
                <svg width="14" height="14" fill="none" stroke="white" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path d="M22 2L11 13M22 2L15 22 11 13 2 9l20-7z" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
            <p className="text-[9px] text-slate-300 text-center mt-2 font-medium uppercase tracking-widest">
              Specialized in chest X-ray diagnostics
            </p>
          </div>
        </div>
      )}
    </>
  );
}