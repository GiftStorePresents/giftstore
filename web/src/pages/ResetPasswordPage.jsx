import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";
import Alert from "../components/Alert";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const params = new URLSearchParams(useLocation().search);
  const token = params.get("token") || "";

  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setErr("");
    if (!pw1 || pw1 !== pw2) {
      setErr("Hasła muszą być takie same.");
      return;
    }
    try {
      await api.auth.reset(token, pw1);
      setOk(true);
      setTimeout(() => navigate("/login"), 1500);
    } catch (e) {
      setErr(e?.message || "Nie udało się ustawić nowego hasła.");
    }
  }

  if (!token) {
    return (
      <div className="flex justify-center items-center min-h-[50vh] px-4">
        <div className="w-full max-w-sm"><Alert>Brak tokenu resetu.</Alert></div>
      </div>
    );
  }

  return (
    <div className="flex justify-center items-center min-h-[50vh] px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-white/80 backdrop-blur rounded-xl shadow-lg p-6">
        <h1 className="font-bold text-2xl mb-4 text-mainRed">Ustaw nowe hasło</h1>

        {ok && (
          <div className="mb-3">
            <Alert type="success">Hasło zmienione. Za chwilę przejdziesz do logowania…</Alert>
          </div>
        )}
        {err && (
          <div className="mb-3">
            <Alert>{err}</Alert>
          </div>
        )}

        <label className="block text-sm font-semibold text-gray-700 mb-1" htmlFor="pw1">
          Nowe hasło
        </label>
        <input
          id="pw1"
          type="password"
          className="w-full p-2 rounded border mb-3 outline-none focus:ring-2 focus:ring-gold"
          value={pw1}
          onChange={(e) => setPw1(e.target.value)}
          required
        />

        <label className="block text-sm font-semibold text-gray-700 mb-1" htmlFor="pw2">
          Powtórz hasło
        </label>
        <input
          id="pw2"
          type="password"
          className="w-full p-2 rounded border mb-4 outline-none focus:ring-2 focus:ring-gold"
          value={pw2}
          onChange={(e) => setPw2(e.target.value)}
          required
        />

        <button className="w-full rounded py-2 font-bold bg-mainRed text-white hover:bg-gold hover:text-mainRed transition">
          Zapisz nowe hasło
        </button>
      </form>
    </div>
  );
}
