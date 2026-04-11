import { useState } from 'react';
import { api } from '../lib/api';
import { ArrowRight } from 'lucide-react';

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
      const res = isRegister
        ? await api.register({ email, password, name, companyName })
        : await api.login(email, password);
      onLogin(res.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de conexión');
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '12px 16px',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-body)',
    fontSize: '14px',
    width: '100%',
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 grid-bg" style={{ background: 'var(--bg-deep)' }}>
      <div className="noise-overlay" />
      {/* Background glows */}
      <div className="fixed top-1/4 left-1/3 w-[500px] h-[500px] rounded-full blur-[150px]" style={{ background: 'rgba(6,182,212,0.06)' }} />
      <div className="fixed bottom-1/4 right-1/3 w-[400px] h-[400px] rounded-full blur-[120px]" style={{ background: 'rgba(129,140,248,0.04)' }} />

      <div className="w-full max-w-md relative z-10 animate-scale-in">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 glow-cyan" style={{ background: 'linear-gradient(135deg, var(--cyan), var(--cyan-dim))' }}>
            <span className="font-black text-xl" style={{ fontFamily: 'var(--font-display)', color: 'var(--bg-deep)' }}>A</span>
          </div>
          <h1 className="text-3xl font-bold mb-1" style={{ fontFamily: 'var(--font-display)' }}>
            <span style={{ color: 'var(--cyan)' }}>ADUANA</span>I
          </h1>
          <p className="text-xs tracking-[0.15em]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>COMMAND CENTER</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="glass rounded-2xl p-8 space-y-5">
          <h2 className="text-lg font-semibold" style={{ fontFamily: 'var(--font-display)' }}>
            {isRegister ? 'Crear cuenta' : 'Iniciar sesión'}
          </h2>

          {isRegister && (
            <>
              <div>
                <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>NOMBRE</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} required placeholder="Tu nombre" style={inputStyle}
                  onFocus={e => { e.target.style.borderColor = 'var(--cyan)'; e.target.style.boxShadow = '0 0 0 4px var(--cyan-glow)'; }}
                  onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }} />
              </div>
              <div>
                <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>EMPRESA</label>
                <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Nombre de tu empresa" style={inputStyle}
                  onFocus={e => { e.target.style.borderColor = 'var(--cyan)'; e.target.style.boxShadow = '0 0 0 4px var(--cyan-glow)'; }}
                  onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }} />
              </div>
            </>
          )}

          <div>
            <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>EMAIL</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="tu@empresa.com" style={inputStyle}
              onFocus={e => { e.target.style.borderColor = 'var(--cyan)'; e.target.style.boxShadow = '0 0 0 4px var(--cyan-glow)'; }}
              onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }} />
          </div>

          <div>
            <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>CONTRASEÑA</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" minLength={6} style={inputStyle}
              onFocus={e => { e.target.style.borderColor = 'var(--cyan)'; e.target.style.boxShadow = '0 0 0 4px var(--cyan-glow)'; }}
              onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }} />
          </div>

          {error && (
            <div className="text-sm rounded-xl px-4 py-3" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: 'var(--red)' }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full py-3.5 text-sm flex items-center justify-center gap-2 disabled:opacity-50">
            {loading ? (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="60" strokeDashoffset="20" /></svg>
            ) : (
              <>{isRegister ? 'Crear cuenta' : 'Entrar'}<ArrowRight size={15} /></>
            )}
          </button>

          <p className="text-center text-sm" style={{ color: 'var(--text-muted)' }}>
            {isRegister ? '¿Ya tienes cuenta?' : '¿No tienes cuenta?'}{' '}
            <button type="button" onClick={() => { setIsRegister(!isRegister); setError(''); }}
              className="font-medium" style={{ color: 'var(--cyan)' }}>
              {isRegister ? 'Inicia sesión' : 'Regístrate'}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
