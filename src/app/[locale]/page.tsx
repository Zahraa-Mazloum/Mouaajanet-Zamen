// src/app/[locale]/page.tsx
import FadeIn from "@/components/animations/FadeIn"
export default function HomePage() {

  return (
    <main className="relative min-h-screen">

      <div className="relative z-10 flex flex-col items-center justify-center min-h-[80vh] text-center px-4">
    <FadeIn delay={0.2} y={100}>
        <h1 style={{ color: 'var(--mainheading)' }} className="text-4xl md:text-6xl font-bold mb-4">
          معجنات زمان
        </h1>
        <p style={{ color: 'var(--mutedtext)' }} className="text-lg md:text-xl">
          Mouaajanet Zamen
        </p>
        </FadeIn>  

</div>
     
    </main>
  )
}