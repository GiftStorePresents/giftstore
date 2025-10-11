// src/pages/ProfilePage.tsx
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Heart, ShoppingCart, User } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api, API_BASE } from "../api";

// Nazwa CSRF cookie MUSI zgadzać się z backendem (src/middleware/csrf.ts)
const CSRF_COOKIE_NAME = "csrf";

// Prosty helper do pobierania wartości ciasteczka
function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${name.replace(/([.*+?^${}()|[\\]\\\\])/g, "\\$1")}=([^;]*)`)
  );
  return match ? decodeURIComponent(match[1]) : null;
}

export default function ProfilePage() {
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);

  // Profil (imię / nazwa wyświetlana)
  const [name, setName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState("");

  // Zmiana hasła
  const [curPwd, setCurPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [changingPwd, setChangingPwd] = useState(false);
  const [pwdMsg, setPwdMsg] = useState("");

  // Zmiana e‑maila (start)
  const [newEmail, setNewEmail] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState("");

  // Logout-all
  const [logoutAllBusy, setLogoutAllBusy] = useState(false);
  const [logoutAllMsg, setLogoutAllMsg] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const me = await api.auth.me();
        if (!me.authenticated || !me.user) {
          navigate("/login");
          return;
        }
        const prof = await api.auth.profile.get(); // { user }
        setUser(prof.user);
        setName(prof.user.name ?? "");
      } catch {
        navigate("/login");
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate, setUser]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileMsg("");
    setSavingProfile(true);
    try {
      const res = await api.auth.profile.update({ name: name.trim() || null });
      setUser(res.user);
      setProfileMsg("Zapisano zmiany profilu.");
    } catch (e: any) {
      setProfileMsg(e?.message || "Nie udało się zapisać profilu.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwdMsg("");
    setChangingPwd(true);
    try {
      await api.auth.changePassword(curPwd || null, newPwd);
      setCurPwd("");
      setNewPwd("");
      setPwdMsg("Hasło zostało zmienione.");
    } catch (e: any) {
      setPwdMsg(e?.message || "Nie udało się zmienić hasła.");
    } finally {
      setChangingPwd(false);
    }
  }

  async function startChangeEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailMsg("");
    setEmailBusy(true);
    try {
      const csrf = getCookie(CSRF_COOKIE_NAME) ?? "";
      const res = await fetch(`${API_BASE}/api/auth/change-email/start`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
        },
        body: JSON.stringify({ newEmail: newEmail.trim() }),
      });

      if (!res.ok) {
        let msg = "Nie udało się zainicjować zmiany e-maila.";
        try {
          const ct = res.headers.get("content-type") || "";
          if (ct.includes("application/json")) {
            const j = await res.json();
            if (res.status === 400 && j?.error) {
              // ✅ to jest Twój obecny email
              msg = j.error;
            } else if (res.status === 409 && j?.error) {
              // ✅ email zajęty
              msg = j.error;
            } else if (typeof j?.error === "string") {
              msg = j.error;
            } else if (typeof j?.message === "string") {
              msg = j.message;
            }
          } else {
            const t = await res.text();
            if (t) msg = t;
          }
        } catch {}
        throw new Error(msg);
      }

      setEmailMsg("Wysłaliśmy link potwierdzający na nowy e-mail. Sprawdź skrzynkę.");
    } catch (err: any) {
      setEmailMsg(err?.message || "Błąd podczas inicjowania zmiany e-maila.");
    } finally {
      setEmailBusy(false);
    }
  }

  async function logoutAllDevices() {
    setLogoutAllMsg("");
    setLogoutAllBusy(true);
    try {
      const csrf = getCookie(CSRF_COOKIE_NAME);
      const res = await fetch(`${API_BASE}/api/auth/logout-all`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(csrf ? { "X-CSRF-Token": csrf } : {}),
        },
      });

      if (!res.ok) {
        let msg = "Nie udało się wylogować ze wszystkich urządzeń.";
        try {
          const ct = res.headers.get("content-type") || "";
          if (ct.includes("application/json")) {
            const j = await res.json();
            if (typeof j?.error === "string") msg = j.error;
            else if (typeof j?.message === "string") msg = j.message;
          } else {
            const t = await res.text();
            if (t) msg = t;
          }
        } catch {}
        throw new Error(msg);
      }

      // Sukces: backend wyczyścił cookie w tej przeglądarce + unieważnił wszystkie JWT
      setLogoutAllMsg("Wylogowano ze wszystkich urządzeń.");
      setUser(null);
      navigate("/login");
    } catch (e: any) {
      setLogoutAllMsg(e?.message || "Błąd podczas wylogowywania.");
    } finally {
      setLogoutAllBusy(false);
    }
  }

  if (loading) return <div className="p-8 text-center">Ładowanie…</div>;
  if (!user) return null;

  return (
    <div className="bg-white rounded-3xl shadow-xl p-8 max-w-3xl mx-auto mt-10 border-2 border-gold">
      {/* Nagłówek profilu */}
      <div className="flex items-center gap-4 mb-8">
        <span className="text-mainRed">
          <User size={36} />
        </span>
        <div>
          <div className="text-2xl font-bold text-mainRed break-all">{user.email}</div>
          <div className="text-gray-500 text-sm">Twój profil klienta</div>
        </div>
      </div>

      {/* Szybka nawigacja */}
      <div className="flex flex-col sm:flex-row gap-6 mb-10">
        <Link to="/profile" className="font-bold hover:text-gold flex items-center gap-2">
          <span>
            <User size={18} />
          </span>{" "}
          Dane i konto
        </Link>
        <Link to="/wishlist" className="font-bold hover:text-gold flex items-center gap-2">
          <span className="text-gold">
            <Heart size={18} />
          </span>{" "}
          Ulubione
        </Link>
        <Link to="/orders" className="font-bold hover:text-gold flex items-center gap-2">
          <span className="text-gold">
            <ShoppingCart size={18} />
          </span>{" "}
          Zamówienia
        </Link>
      </div>

      {/* Dane podstawowe */}
      <section className="mb-10">
        <h3 className="font-bold text-gold text-lg mb-3">Dane profilu</h3>
        <form onSubmit={saveProfile} className="grid gap-3 max-w-md">
          <label className="text-sm font-semibold text-gray-700" htmlFor="name">
            Imię / nazwa wyświetlana
          </label>
          <input
            id="name"
            className="w-full p-2 rounded border outline-none focus:ring-2 focus:ring-gold"
            placeholder="Twoje imię"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            type="submit"
            disabled={savingProfile}
            className={`w-fit rounded px-4 py-2 font-bold transition ${
              savingProfile
                ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                : "bg-mainRed text-white hover:bg-gold hover:text-mainRed"
            }`}
          >
            {savingProfile ? "Zapisuję…" : "Zapisz profil"}
          </button>
          {profileMsg && <p className="text-sm mt-1">{profileMsg}</p>}
        </form>
      </section>

      {/* Zmiana e‑maila */}
      <section className="mb-10">
        <h3 className="font-bold text-gold text-lg mb-3">Zmiana e‑maila</h3>
        <p className="text-xs text-gray-600 mb-3">
          Wyślemy link potwierdzający na nowy adres. Po potwierdzeniu nastąpi wylogowanie na wszystkich urządzeniach.
        </p>
        <form onSubmit={startChangeEmail} className="grid gap-3 max-w-md">
          <label className="text-sm font-semibold text-gray-700" htmlFor="new-email">
            Nowy e‑mail
          </label>
          <input
            id="new-email"
            type="email"
            className="w-full p-2 rounded border outline-none focus:ring-2 focus:ring-gold"
            placeholder="nowy@adres.pl"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            required
          />
          <button
            type="submit"
            disabled={emailBusy}
            className={`w-fit rounded px-4 py-2 font-bold transition ${
              emailBusy
                ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                : "bg-mainRed text-white hover:bg-gold hover:text-mainRed"
            }`}
          >
            {emailBusy ? "Wysyłam link…" : "Wyślij link potwierdzający"}
          </button>
          {emailMsg && <p className="text-sm mt-1">{emailMsg}</p>}
        </form>
      </section>

      {/* Zmiana hasła */}
      <section className="mb-6">
        <h3 className="font-bold text-gold text-lg mb-3">Zmiana hasła</h3>
        <p className="text-xs text-gray-600 mb-3">
          Jeśli konto utworzono przez Google/Magic (bez hasła), pole „Obecne hasło” zostaw puste.
        </p>
        <form onSubmit={changePassword} className="grid gap-3 max-w-md">
          <label className="text-sm font-semibold text-gray-700" htmlFor="current-password">
            Obecne hasło
          </label>
          <input
            id="current-password"
            type="password"
            className="w-full p-2 rounded border outline-none focus:ring-2 focus:ring-gold"
            placeholder="(zostaw puste, jeśli konto bez hasła)"
            value={curPwd}
            onChange={(e) => setCurPwd(e.target.value)}
          />

          <label className="text-sm font-semibold text-gray-700" htmlFor="new-password">
            Nowe hasło
          </label>
          <input
            id="new-password"
            type="password"
            minLength={6}
            required
            className="w-full p-2 rounded border outline-none focus:ring-2 focus:ring-gold"
            placeholder="min. 6 znaków"
            value={newPwd}
            onChange={(e) => setNewPwd(e.target.value)}
          />

          <button
            type="submit"
            disabled={changingPwd}
            className={`w-fit rounded px-4 py-2 font-bold transition ${
              changingPwd ? "bg-gray-300 text-gray-600" : "bg-black text-white hover:bg-gray-900"
            }`}
          >
            {changingPwd ? "Zmieniam…" : "Zmień hasło"}
          </button>
          {pwdMsg && <p className="text-sm mt-1">{pwdMsg}</p>}
        </form>
      </section>

      <hr className="my-8" />

      {/* Wylogowanie */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <button
          onClick={logout}
          className="bg-mainRed text-white px-6 py-2 rounded-xl font-bold hover:bg-gold hover:text-mainRed transition"
        >
          Wyloguj się (to urządzenie)
        </button>

        <button
          onClick={logoutAllDevices}
          disabled={logoutAllBusy}
          className={`px-6 py-2 rounded-xl font-bold border transition ${
            logoutAllBusy
              ? "bg-gray-300 text-gray-600 cursor-not-allowed"
              : "bg-white text-gray-800 border-gray-300 hover:bg-gray-50"
          }`}
        >
          {logoutAllBusy ? "Wylogowuję…" : "Wyloguj ze wszystkich urządzeń"}
        </button>
      </div>
      {logoutAllMsg && <p className="text-sm mt-3">{logoutAllMsg}</p>}
    </div>
  );
}
