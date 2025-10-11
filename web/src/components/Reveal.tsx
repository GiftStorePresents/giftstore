// src/components/Reveal.tsx
import { ReactNode } from "react";
import { motion } from "framer-motion";

interface RevealProps {
  children: ReactNode;
  delay?: number;
  y?: number;
  blur?: number;
  duration?: number;
  once?: boolean;
  amount?: number;
  className?: string;
}

export default function Reveal({
  children,
  delay = 0,
  y = 24,
  blur = 6,
  duration = 0.55,
  once = true,
  amount = 0.2,
  className = "",
}: RevealProps) {
  return (
    <motion.section
      className={className}
      initial={{ opacity: 0, y, filter: `blur(${blur}px)` }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once, amount }}
      transition={{ duration, ease: [0.36, 1.2, 0.58, 1], delay }}
    >
      {children}
    </motion.section>
  );
}
