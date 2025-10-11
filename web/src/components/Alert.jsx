export default function Alert({ type = "error", children }) {
  const colors =
    type === "success"
      ? "bg-green-50 text-green-800 border-green-300"
      : "bg-red-50 text-red-800 border-red-300";

  return (
    <div
      className={`border rounded-lg px-3 py-2 text-sm ${colors}`}
      role="alert"
      aria-live="polite"
    >
      {children}
    </div>
  );
}
