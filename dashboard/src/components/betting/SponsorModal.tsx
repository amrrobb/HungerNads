"use client";

import { useState, useEffect, useCallback } from "react";
import type { AgentState } from "@/types";
import { CLASS_CONFIG } from "@/components/battle/mock-data";

interface SponsorModalProps {
  open: boolean;
  onClose: () => void;
  agents: AgentState[];
}

export default function SponsorModal({ open, onClose, agents }: SponsorModalProps) {
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const aliveAgents = agents.filter((a) => a.alive);

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setSelectedAgentId("");
      setAmount("");
      setMessage("");
      setError("");
      setSubmitting(false);
    }
  }, [open]);

  // Close on Escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose();
    },
    [open, onClose],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  function validate(): boolean {
    if (!selectedAgentId) {
      setError("Select a gladiator to sponsor");
      return false;
    }
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) {
      setError("Enter a valid amount");
      return false;
    }
    if (parsed < 1) {
      setError("Minimum sponsorship is 1 $HNADS");
      return false;
    }
    setError("");
    return true;
  }

  function handleSend() {
    if (!validate()) return;
    setSubmitting(true);
    // Mock submission
    setTimeout(() => {
      setSubmitting(false);
      onClose();
    }, 600);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md rounded-lg border border-colosseum-surface-light bg-colosseum-surface p-6 shadow-2xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 text-gray-600 transition-colors hover:text-white"
          aria-label="Close"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Header */}
        <h2 className="mb-1 text-lg font-bold tracking-wider text-gold">
          SPONSOR A GLADIATOR
        </h2>
        <p className="mb-5 text-xs text-gray-500">
          Send support to keep your champion alive. The crowd remembers.
        </p>

        {/* Agent select */}
        <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-600">
          Gladiator
        </label>
        <select
          value={selectedAgentId}
          onChange={(e) => {
            setSelectedAgentId(e.target.value);
            setError("");
          }}
          className="mb-4 w-full rounded border border-colosseum-surface-light bg-colosseum-bg px-3 py-2 text-sm text-white outline-none focus:border-gold transition-colors"
        >
          <option value="">-- select gladiator --</option>
          {aliveAgents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {CLASS_CONFIG[agent.class].emoji} {agent.name} ({agent.class})
            </option>
          ))}
        </select>

        {/* Amount */}
        <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-600">
          Amount ($HNADS)
        </label>
        <div className="relative mb-4">
          <input
            type="number"
            min="1"
            step="1"
            placeholder="0"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setError("");
            }}
            className="w-full rounded border border-colosseum-surface-light bg-colosseum-bg px-3 py-2 pr-16 text-sm text-white outline-none focus:border-gold transition-colors [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase tracking-wider text-gray-600">
            $HNADS
          </span>
        </div>

        {/* Message */}
        <label className="mb-1 block text-[10px] uppercase tracking-wider text-gray-600">
          Message (optional)
        </label>
        <textarea
          rows={2}
          maxLength={120}
          placeholder="From your loyal fan..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="mb-4 w-full resize-none rounded border border-colosseum-surface-light bg-colosseum-bg px-3 py-2 text-sm text-white outline-none focus:border-gold transition-colors"
        />

        {/* Error */}
        {error && (
          <p className="mb-3 text-xs text-blood">{error}</p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded border border-colosseum-surface-light py-2.5 text-sm font-bold uppercase tracking-wider text-gray-400 transition-colors hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={submitting}
            className="flex-1 rounded bg-gold py-2.5 text-sm font-bold uppercase tracking-wider text-colosseum-bg transition-all hover:bg-gold-light active:scale-[0.98] disabled:opacity-60"
          >
            {submitting ? "Sending..." : "Send Support"}
          </button>
        </div>
      </div>
    </div>
  );
}
