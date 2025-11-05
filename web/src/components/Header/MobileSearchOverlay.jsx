// src/components/header/MobileSearchOverlay.jsx
import { X } from "lucide-react";
import SearchBar from "../SearchBar";

export default function MobileSearchOverlay({ open, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] bg-white/95 dark:bg-[var(--surface)] backdrop-blur-sm flex flex-col items-center justify-start p-4">
      <div className="flex w-full items-center gap-2 max-w-[600px] mt-4">
        <SearchBar />
        <button
          onClick={onClose}
          className="p-2 rounded-xl bg-mainRed text-white hover:bg-gold hover:text-mainRed transition"
        >
          <X size={20} />
        </button>
      </div>
    </div>
  );
}
