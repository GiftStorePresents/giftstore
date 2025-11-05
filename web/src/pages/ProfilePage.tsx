// src/pages/ProfilePage.tsx
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Heart, ShoppingCart, User } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api, API_BASE } from "../api";
import { useTheme } from "../context/ThemeContext";

/* ===== CSRF ===== */
const CSRF_COOKIE_NAME = "csrf";
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
  const { theme } = useTheme(); // <- do dark/light

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

  // Zmiana e-maila (start)
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
            if (res.status === 400 && j?.error) msg = j.error;     // obecny e-mail
            else if (res.status === 409 && j?.error) msg = j.error; // e-mail zajęty
            else if (typeof j?.error === "string") msg = j.error;
            else if (typeof j?.message === "string") msg = j.message;
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

  /* ===== lokalne style z motywem ===== */
  const styles = (
    <style>{`
      .profile-page[data-theme="dark"] {
        --card-bg: #0f1524;
        --ink: #e9eef7;
        --muted: #9bb0c9;
        --border: rgba(255,255,255,0.12);
        --input-bg: #0b1220;
        --input-br: rgba(255,255,255,0.14);
        --input-ph: #8ea2bb;
      }
      .profile-page[data-theme="light"] {
        --card-bg: #ffffff;
        --ink: #0b1220;
        --muted: #6b7280;
        --border: rgba(20,23,28,0.12);
        --input-bg: #ffffff;
        --input-br: #d1d5db;
        --input-ph: #9ca3af;
      }

      .prof-card {
        background: var(--card-bg);
        color: var(--ink);
        border-color: #f5c542; /* gold */
      }
      .prof-muted { color: var(--muted); }
      .prof-input {
        background: var(--input-bg);
        color: var(--ink);
        border: 1px solid var(--input-br);
        border-radius: 0.75rem;
        height: 2.5rem;
        padding: 0 0.75rem;
        outline: none;
      }
      .prof-input::placeholder { color: var(--input-ph); }
      .prof-input:focus {
        border-color: #f5c542;
        box-shadow: 0 0 0 2px rgba(245, 197, 66, .45);
      }
      .prof-link { color: var(--ink); }
      .prof-link:hover { color: #f5c542; }
      .btn { border-radius: .75rem; font-weight: 700; padding: .5rem 1rem; }
      .btn-primary { background:#c7161f; color:#fff; }
      .btn-primary:hover { background:#f5c542; color:#8a0f0f; }
      .btn-dark { background:#111; color:#fff; }
      .btn-dark:hover { background:#000; }
      .btn-neutral { background:#fff; color:#1f2937; border:1px solid #d1d5db; }
      .btn-neutral:hover { background:#f8fafc; }
      .badge-ok {
        display:inline-block; font-size:12px; padding:.25rem .6rem;
        border-radius:999px; background:#e6f7ed; color:#116a38; border:1px solid #b7e3c7;
      }
      .badge-err {
        display:inline-block; font-size:12px; padding:.25rem .6rem;
        border-radius:999px; background:#ffe8ea; color:#a3122f; border:1px solid #ffc8cf;
      }
      .divider { border-color: var(--border); }
    `}</style>
  );

  return (
    <section
      className="profile-page mx-auto mt-10 max-w-3xl"
      data-theme={theme}
    >
      {styles}

      <div className="prof-card rounded-3xl border-2 shadow-xl p-8">
        {/* Nagłówek profilu */}
        <div className="mb-8 flex items-center gap-4">
          <span className="text-mainRed">
            <User size={36} />
          </span>
          <div>
            <div className="break-all text-2xl font-bold text-mainRed">{user.email}</div>
            <div className="prof-muted text-sm">Twój profil klienta</div>
          </div>
        </div>

        {/* Szybka nawigacja */}
        <div className="mb-10 flex flex-col gap-6 sm:flex-row">
          <Link to="/profile" className="prof-link flex items-center gap-2 font-bold">
            <User size={18} /> Dane i konto
          </Link>
          <Link to="/wishlist" className="prof-link flex items-center gap-2 font-bold">
            <Heart size={18} className="text-gold" /> Ulubione
          </Link>
          <Link to="/orders" className="prof-link flex items-center gap-2 font-bold">
            <ShoppingCart size={18} className="text-gold" /> Zamówienia
          </Link>
        </div>

        {/* Dane podstawowe */}
        <section className="mb-10">
          <h3 className="mb-3 text-lg font-bold text-gold">Dane profilu</h3>
          <form onSubmit={saveProfile} className="grid max-w-md gap-3">
            <label className="text-sm font-semibold" htmlFor="name">
              Imię / nazwa wyświetlana
            </label>
            <input
              id="name"
              className="prof-input w-full"
              placeholder="Twoje imię"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={savingProfile}
                className={`btn btn-primary ${savingProfile ? "opacity-60 cursor-not-allowed" : ""}`}
              >
                {savingProfile ? "Zapisuję…" : "Zapisz profil"}
              </button>
              {profileMsg && (
                <span className={/bł|nie udało/i.test(profileMsg) ? "badge-err" : "badge-ok"}>
                  {profileMsg}
                </span>
              )}
            </div>
          </form>
        </section>

        {/* Zmiana e-maila */}
        <section className="mb-10">
          <h3 className="mb-3 text-lg font-bold text-gold">Zmiana e-maila</h3>
          <p className="prof-muted mb-3 text-xs">
            Wyślemy link potwierdzający na nowy adres. Po potwierdzeniu nastąpi wylogowanie
            na wszystkich urządzeniach.
          </p>
          <form onSubmit={startChangeEmail} className="grid max-w-md gap-3">
            <label className="text-sm font-semibold" htmlFor="new-email">
              Nowy e-mail
            </label>
            <input
              id="new-email"
              type="email"
              className="prof-input w-full"
              placeholder="nowy@adres.pl"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              required
            />
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={emailBusy}
                className={`btn btn-primary ${emailBusy ? "opacity-60 cursor-not-allowed" : ""}`}
              >
                {emailBusy ? "Wysyłam link…" : "Wyślij link potwierdzający"}
              </button>
              {emailMsg && (
                <span className={/bł|nie udało/i.test(emailMsg) ? "badge-err" : "badge-ok"}>
                  {emailMsg}
                </span>
              )}
            </div>
          </form>
        </section>

        {/* Zmiana hasła */}
        <section className="mb-6">
          <h3 className="mb-3 text-lg font-bold text-gold">Zmiana hasła</h3>
          <p className="prof-muted mb-3 text-xs">
            Jeśli konto utworzono przez Google/Magic (bez hasła), pole „Obecne hasło” zostaw puste.
          </p>
          <form onSubmit={changePassword} className="grid max-w-md gap-3">
            <label className="text-sm font-semibold" htmlFor="current-password">
              Obecne hasło
            </label>
            <input
              id="current-password"
              type="password"
              className="prof-input w-full"
              placeholder="(zostaw puste, jeśli konto bez hasła)"
              value={curPwd}
              onChange={(e) => setCurPwd(e.target.value)}
            />

            <label className="text-sm font-semibold" htmlFor="new-password">
              Nowe hasło
            </label>
            <input
              id="new-password"
              type="password"
              minLength={6}
              required
              className="prof-input w-full"
              placeholder="min. 6 znaków"
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
            />

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={changingPwd}
                className={`btn btn-dark ${changingPwd ? "opacity-60 cursor-not-allowed" : ""}`}
              >
                {changingPwd ? "Zmieniam…" : "Zmień hasło"}
              </button>
              {pwdMsg && (
                <span className={/bł|nie udało/i.test(pwdMsg) ? "badge-err" : "badge-ok"}>
                  {pwdMsg}
                </span>
              )}
            </div>
          </form>
        </section>

        <hr className="divider my-8" />

        {/* Wylogowanie */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <button onClick={logout} className="btn btn-primary">
            Wyloguj się (to urządzenie)
          </button>

          <button
            onClick={logoutAllDevices}
            disabled={logoutAllBusy}
            className={`btn btn-neutral ${logoutAllBusy ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            {logoutAllBusy ? "Wylogowuję…" : "Wyloguj ze wszystkich urządzeń"}
          </button>
        </div>
        {logoutAllMsg && (
          <p
            className={`mt-3 text-sm ${
              /bł|nie udało/i.test(logoutAllMsg) ? "text-rose-500" : "text-emerald-600"
            }`}
          >
            {logoutAllMsg}
          </p>
        )}
      </div>
    </section>
  );
}