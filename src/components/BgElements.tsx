'use client';
import { motion } from "framer-motion";

const floatingAnimation = (delay: number) => ({
  animate: { y: [0, -20, 0] as number[] },
  transition: {
    duration: 5,
    repeat: Infinity,
    ease: "easeInOut" as const,
    delay,
  },
});

const BgElements = () => {
  return (
    <div className="pointer-events-none">

      {/* ── MOBILE: top row (above card) ── */}
      <div className="flex md:hidden absolute top-[-30] left-0 right-0 justify-between px-5 z-0">
        <motion.img
          src="/backgroundElements/Olives.png"
          className="w-45"
          {...floatingAnimation(0)}
        />
        <motion.img
          src="/backgroundElements/Pepper.png"
          className="w-45"
          {...floatingAnimation(0.5)}
        />
      </div>

      {/* ── MOBILE: bottom row (below card) ── */}
      <div className="flex md:hidden absolute bottom-[-80] left-0 right-0 justify-between px-2 z-0">
        <motion.img
          src="/backgroundElements/Mint.png"
          className="w-45"
          {...floatingAnimation(1)}
        />
        <motion.img
          src="/backgroundElements/Tomatoes.png"
          className="w-45"
          {...floatingAnimation(1.5)}
        />
      </div>

      {/* ── DESKTOP: left side ── */}
      <div className="hidden md:flex absolute left-3 lg:left-5 top-1/6 -translate-y-1/6 flex-col gap-5 lg:gap-9 z-0">
        <motion.img
          src="/backgroundElements/Olives.png"
          className="w-36 lg:w-52 xl:w-72"
          {...floatingAnimation(0)}
        />
        <motion.img
          src="/backgroundElements/Mint.png"
          className="w-36 lg:w-52 xl:w-72"
          {...floatingAnimation(1)}
        />
      </div>

      {/* ── DESKTOP: right side ── */}
      <div className="hidden md:flex absolute right-3 lg:right-5 top-1/6 -translate-y-1/6 flex-col gap-5 lg:gap-9 z-0">
        <motion.img
          src="/backgroundElements/Pepper.png"
          className="w-36 lg:w-52 xl:w-72"
          {...floatingAnimation(0.5)}
        />
        <motion.img
          src="/backgroundElements/Tomatoes.png"
          className="w-32 lg:w-48 xl:w-68"
          {...floatingAnimation(1.5)}
        />
      </div>

    </div>
  );
};

export default BgElements;