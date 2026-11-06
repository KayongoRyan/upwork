"use client";

import { motion, useReducedMotion } from "framer-motion";

export default function AdminTemplate({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0 : 0.22, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
