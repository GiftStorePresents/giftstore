// src/context/WishlistContext.js
import { createContext, useContext, useState, useEffect } from "react";

// Pobiera z localStorage przy starcie
const getInitialWishlist = () => {
  try {
    const data = localStorage.getItem("wishlist");
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

const WishlistContext = createContext();

export function WishlistProvider({ children }) {
  const [wishlist, setWishlist] = useState(getInitialWishlist);

  // Zachowuje do localStorage
  useEffect(() => {
    try {
      localStorage.setItem("wishlist", JSON.stringify(wishlist));
    } catch {
      // no-op
    }
  }, [wishlist]);

  // Dodaj/usuń z listy życzeń + metryki
  function toggleWishlist(product) {
    setWishlist((prev) => {
      const exists = prev.find((p) => p.slug === product.slug);
      if (exists) {
        // Aktualizacja metryk: usunięcie
        try {
          const key = "metrics:wishlist_remove";
          const stats = JSON.parse(localStorage.getItem(key) || "{}");
          stats[product.slug] = (stats[product.slug] || 0) + 1;
          localStorage.setItem(key, JSON.stringify(stats));
        } catch {
          // no-op
        }
        return prev.filter((p) => p.slug !== product.slug);
      } else {
        // Aktualizacja metryk: dodanie
        try {
          const key = "metrics:wishlist_add";
          const stats = JSON.parse(localStorage.getItem(key) || "{}");
          stats[product.slug] = (stats[product.slug] || 0) + 1;
          localStorage.setItem(key, JSON.stringify(stats));
        } catch {
          // no-op
        }
        return [...prev, product];
      }
    });
  }

  function isInWishlist(slug) {
    return wishlist.some((p) => p.slug === slug);
  }

  function clearWishlist() {
    setWishlist([]);
  }

  return (
    <WishlistContext.Provider
      value={{
        wishlist,
        toggleWishlist,
        isInWishlist,
        clearWishlist,
      }}
    >
      {children}
    </WishlistContext.Provider>
  );
}

export function useWishlist() {
  return useContext(WishlistContext);
}
