// src/components/header/HeaderLogo.jsx
import { Link } from "react-router-dom";
import { FaGift } from "react-icons/fa";

export default function HeaderLogo() {
  return (
    <Link
      to="/"
      className="flex items-center gap-2 font-bold text-xl sm:text-2xl text-mainRed dark:text-gold hover:text-gold transition shrink-0"
    >
      <FaGift className="text-gold" size={26} />
      <span>Gift Store</span>
    </Link>
  );
}