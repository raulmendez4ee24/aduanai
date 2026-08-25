import { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import { motion } from 'framer-motion'
import { useTotalFractions } from '../hooks/useTotalFractions'

interface AuthLayoutProps {
  children: ReactNode
  title: string
  subtitle?: string
}

const FEATURES = [
  '8,183 fracciones arancelarias oficiales de la TIGIE',
  'Clasificación arancelaria con IA en segundos',
  'Cumplimiento fiscal y regulatorio automatizado',
]

export function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
  const { formatted } = useTotalFractions()
  return (
    <div className="min-h-screen flex" style={{ fontFamily: "'Outfit', sans-serif" }}>
      {/* Left panel — form */}
      <div className="flex-1 lg:w-[55%] flex items-center justify-center px-6 py-12 bg-white">
        <motion.div
          className="w-full max-w-md"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Mobile logo */}
          <Link to="/" className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-8 h-8 rounded-lg bg-[#1a1a1a] flex items-center justify-center">
              <span className="text-white text-[10px] font-bold">AI</span>
            </div>
            <span className="text-lg font-bold text-[#1a1a1a]">ADUANAI</span>
          </Link>

          <h1 className="text-[28px] font-bold text-[#1a1a1a] tracking-tight mb-2">{title}</h1>
          {subtitle && (
            <p className="text-[14px] text-[#999] mb-8">{subtitle}</p>
          )}

          {children}
        </motion.div>
      </div>

      {/* Right panel — brand */}
      <div className="hidden lg:flex lg:w-[45%] relative overflow-hidden bg-gradient-to-br from-emerald-600 to-emerald-800">
        {/* Dot pattern */}
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)',
            backgroundSize: '24px 24px',
          }}
        />
        {/* Decorative circles */}
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-white/5" />
        <div className="absolute -bottom-32 -left-16 w-80 h-80 rounded-full bg-white/5" />
        <div className="absolute top-1/2 -right-12 w-48 h-48 rounded-full bg-white/5" />

        <motion.div
          className="relative z-10 flex flex-col justify-center px-12 xl:px-16"
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <Link to="/" className="flex items-center gap-2.5 mb-12">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
              <span className="text-white text-[13px] font-bold">AI</span>
            </div>
            <span className="text-2xl font-bold text-white tracking-tight">ADUANAI</span>
          </Link>

          <h2 className="text-[clamp(1.6rem,2.5vw,2.2rem)] font-bold text-white leading-[1.2] tracking-tight mb-8">
            La plataforma de comercio exterior más inteligente de México
          </h2>

          <div className="space-y-4">
            {FEATURES.map((text, i) => (
              <motion.div
                key={i}
                className="flex items-start gap-3"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + i * 0.1, duration: 0.5 }}
              >
                <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                </div>
                <span className="text-[15px] text-white/90 leading-snug">{text.replace('8,183', formatted)}</span>
              </motion.div>
            ))}
          </div>

          <div className="mt-12 pt-8 border-t border-white/20">
            <p className="text-white/50 text-xs">Basado en fuentes oficiales (DOF · SAT · T-MEC) · Formatos alineados al Anexo 22</p>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
