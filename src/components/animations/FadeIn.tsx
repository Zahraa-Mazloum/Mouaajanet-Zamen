"use client"

import { motion } from "framer-motion"
import { fadeInUp } from "@/lib/animationVariants"

type FadeInProps = {
  children: React.ReactNode
  className?: string
  delay: number
  y : number        

}

export default function FadeIn({
  children,
  className,
  delay = 0,
  y = 60
}: FadeInProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{
        opacity: 1,
        y: 0,
        transition: {
          duration: 0.6,
          delay,
          ease: "easeOut"
        }
      }}
      viewport={{ once: true }}
      className={className}
    >
      {children}
    </motion.div>
  )
}