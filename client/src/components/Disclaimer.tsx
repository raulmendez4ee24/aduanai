/**
 * Disclaimer legal reusable para reportes y exports.
 * Renderiza en pie de página de PDFs, vistas exportables, etc.
 */
export function Disclaimer({ hash }: { hash?: string }) {
  return (
    <p className="text-[10px] text-slate-400 leading-snug border-t border-slate-200 pt-2 mt-3">
      Este documento es generado por ADUANAI con inteligencia artificial. La responsabilidad
      legal de la operación corresponde al importador y su agente aduanal conforme al Art. 54
      de la Ley Aduanera.
      {hash && <> Reporte verificable con hash <span className="font-mono">{hash}</span>.</>}
    </p>
  )
}

export const DISCLAIMER_TEXT = `Este documento es generado por ADUANAI con inteligencia artificial. La responsabilidad legal de la operación corresponde al importador y su agente aduanal conforme al Art. 54 de la Ley Aduanera.`
