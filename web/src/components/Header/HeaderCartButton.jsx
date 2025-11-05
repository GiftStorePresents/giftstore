// src/components/header/HeaderCartButton.jsx
import { FaShoppingCart } from "react-icons/fa";
import { useCart } from "../../context/CartContext";
import { useRef, useEffect } from "react";

export default function HeaderCartButton({ onOpen }) {
  const { cart } = useCart();
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  const iconRef = useRef(null);

  // animacja „bounce” po dodaniu produktu
  useEffect(() => {
    const boop = () => {
      const el = iconRef.current;
      if (!el) return;
      el.classList.remove("animate-bounce");
      el.offsetWidth; // reflow
      el.classList.add("animate-bounce");
      setTimeout(() => el.classList.remove("animate-bounce"), 1000);
    };
    window.addEventListener("cart:add", boop);
    return () => window.removeEventListener("cart:add", boop);
  }, []);

  return (
    <button
      onClick={onOpen}
      className="relative hover:text-gold transition"
      aria-label="Koszyk"
    >
      <div ref={iconRef} className="relative">
        <FaShoppingCart size={24} />
        {count > 0 && (
          <span className="absolute -top-2 -right-3 bg-gold text-mainRed font-bold text-xs rounded-full px-1.5 py-0.5 shadow">
            {count}
          </span>
        )}
      </div>
    </button>
  );
}
