import { useEffect, useState } from "react";

/**
 * InstallPWAButton
 * - Pokazuje się tylko, gdy przeglądarka wyemituje `beforeinstallprompt`
 * - variant="link" => link tekstowy; variant="button" => pełny przycisk
 */
export default function InstallPWAButton({
  className = "",
  label = "Zainstaluj aplikację",
  variant = "link",
}) {
  const [deferred, setDeferred] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onBeforeInstall = (e) => {
      e.preventDefault(); // ukryj natywny banner
      setDeferred(e);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  if (!visible) return null;

  const handleClick = async () => {
    try {
      await deferred?.prompt();
      await deferred?.userChoice;
    } finally {
      setDeferred(null);
      setVisible(false);
    }
  };

  if (variant === "link") {
    return (
      <button
        type="button"
        onClick={handleClick}
        className={`bg-transparent p-0 m-0 border-0 underline underline-offset-4 text-inherit ${className}`}
        title={label}
      >
        {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`px-3 py-2 rounded-xl border-2 font-semibold ${className}`}
      title={label}
      aria-label={label}
    >
      {label}
    </button>
  );
}
