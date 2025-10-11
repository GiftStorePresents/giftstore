import { useEffect } from "react";

export default function Toast({ message, onClose, duration = 2500 }) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [message, duration, onClose]);

  if (!message) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: "60px",                 // Odległość od góry (możesz zmienić na 80px, jeśli chcesz niżej)
        left: "50%",                 // Wyśrodkowanie
        transform: "translateX(-50%)",
        zIndex: 9999,                // Zawsze na wierzchu
      }}
      className="bg-gold text-mainRed font-bold px-8 py-3 rounded-2xl shadow-xl animate-toast"
    >
      {message}
    </div>
  );
}
