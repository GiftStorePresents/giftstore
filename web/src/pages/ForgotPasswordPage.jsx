import { useState } from "react";
import { api } from "../api";
import Alert from "../components/Alert";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setErr("");
    try {
      await api.auth.forgot(email.trim());
      setSent(true); // zawsze true (nawet jeśli mail nie istnieje)
    } catch (e) {
      setErr(e?.message || "Nie udało się wysłać linku resetu.");
    }
  }

  return (
    <div className="flex justify-center items-center min-h-[50vh] px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-white/80 backdrop-blur rounded-xl shadow-lg p-6">
        <h1 className="font-bold text-2xl mb-4 text-mainRed">Reset hasła</h1>

        {sent ? (
          <Alert type="success">
            Jeśli konto istnieje, wysłaliśmy link resetu hasła. Sprawdź skrzynkę.
            W trybie DEV link znajdziesz też w konsoli backendu.
          </Alert>
        ) : (
          <>
            {err && (
              <div className="mb-3">
                <Alert>{err}</Alert>
              </div>
            )}
            <label className="block text-sm font-semibold text-gray-700 mb-1" htmlFor="email">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              className="w-full p-2 rounded border mb-3 outline-none focus:ring-2 focus:ring-gold"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="np. jan@kowalski.pl"
              required
            />
            <button className="w-full rounded py-2 font-bold bg-mainRed text-white hover:bg-gold hover:text-mainRed transition">
              Wyślij link resetu
            </button>
          </>
        )}
      </form>
    </div>
  );
}
