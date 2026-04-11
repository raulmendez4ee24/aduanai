import { useState } from 'react';
import { api } from '../lib/api';

export function LoginPage({ onLogin }: { onLogin: (token: string) => void }) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isRegister) {
        const res = await api.register({ email, password, name, companyName });
        onLogin(res.token);
      } else {
        const res = await api.login(email, password);
        onLogin(res.token);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de conexión');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0A1628] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2">
            <span className="text-[#C9A84C]">ADUANA</span>
            <span className="text-white">I</span>
          </h1>
          <p className="text-slate-400">Comercio Exterior con Inteligencia Artificial</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-[#0D1B2A] rounded-2xl border border-[#1B2D45] p-8 space-y-5">
          <h2 className="text-xl font-semibold text-white">
            {isRegister ? 'Crear cuenta' : 'Iniciar sesión'}
          </h2>

          {isRegister && (
            <>
              <div>
                <label className="block text-sm text-slate-400 mb-1.5">Nombre</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-[#1B2D45] border border-[#243656] rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-[#C9A84C] transition-colors"
                  placeholder="Tu nombre"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1.5">Empresa</label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full bg-[#1B2D45] border border-[#243656] rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-[#C9A84C] transition-colors"
                  placeholder="Nombre de tu empresa"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-sm text-slate-400 mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[#1B2D45] border border-[#243656] rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-[#C9A84C] transition-colors"
              placeholder="tu@empresa.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1.5">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#1B2D45] border border-[#243656] rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-[#C9A84C] transition-colors"
              placeholder="••••••••"
              required
              minLength={6}
            />
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#C9A84C] hover:bg-[#A68A3E] text-[#0A1628] font-semibold py-3 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'Cargando...' : isRegister ? 'Crear cuenta' : 'Entrar'}
          </button>

          <p className="text-center text-sm text-slate-500">
            {isRegister ? '¿Ya tienes cuenta?' : '¿No tienes cuenta?'}{' '}
            <button
              type="button"
              onClick={() => { setIsRegister(!isRegister); setError(''); }}
              className="text-[#C9A84C] hover:underline"
            >
              {isRegister ? 'Inicia sesión' : 'Regístrate'}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
