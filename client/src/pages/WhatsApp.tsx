import { Phone, MessageSquare, Users, Send } from 'lucide-react';

export function WhatsAppPage() {
  return (
    <div>
      <div className="mb-8 animate-fade-up">
        <h1 className="text-2xl font-bold mb-1" style={{ fontFamily: 'var(--font-display)' }}>WhatsApp Bot</h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Clasificación y cotización vía WhatsApp</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Conversaciones', value: '—', icon: MessageSquare, color: 'var(--cyan)' },
          { label: 'Usuarios', value: '—', icon: Users, color: '#25D366' },
          { label: 'Mensajes hoy', value: '—', icon: Send, color: 'var(--emerald)' },
        ].map((stat, i) => (
          <div key={stat.label} className={`glass rounded-2xl p-5 flex items-center gap-4 animate-fade-up delay-${(i+1)*100}`}>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: `${stat.color}12` }}>
              <stat.icon size={20} style={{ color: stat.color }} />
            </div>
            <div>
              <p className="text-3xl font-bold" style={{ fontFamily: 'var(--font-mono)' }}>{stat.value}</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="glass rounded-2xl p-12 text-center animate-fade-up delay-300">
        <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-5" style={{ background: 'rgba(37,211,102,0.1)' }}>
          <Phone size={32} style={{ color: '#25D366' }} />
        </div>
        <h2 className="text-lg font-bold mb-2" style={{ fontFamily: 'var(--font-display)' }}>Bot WhatsApp Activo</h2>
        <p className="text-sm mb-6 max-w-md mx-auto" style={{ color: 'var(--text-muted)' }}>
          Los clientes pueden clasificar y cotizar productos enviando un mensaje al número configurado. Las respuestas se procesan automáticamente con IA.
        </p>
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs" style={{ background: 'rgba(37,211,102,0.1)', color: '#25D366', fontFamily: 'var(--font-mono)' }}>
          <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#25D366' }} />
          Webhook conectado
        </div>
      </div>
    </div>
  );
}
