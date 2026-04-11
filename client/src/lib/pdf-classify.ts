import type { ClassificationResult } from './api';

export function generateClassificationPDF(result: ClassificationResult, inputDescription: string) {
  const now = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
  const confColor = result.confidence >= 80 ? '#16a34a' : result.confidence >= 60 ? '#ca8a04' : '#dc2626';

  const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; background: white; padding: 40px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #C9A84C; padding-bottom: 20px; margin-bottom: 30px; }
  .logo { font-size: 28px; font-weight: 800; }
  .logo span { color: #C9A84C; }
  .subtitle { font-size: 11px; color: #888; margin-top: 4px; }
  .date { font-size: 12px; color: #666; text-align: right; }
  .ref { font-size: 11px; color: #999; }
  h2 { font-size: 16px; font-weight: 700; color: #0A1628; margin-bottom: 12px; border-left: 3px solid #C9A84C; padding-left: 12px; margin-top: 24px; }
  .fraction-box { background: #f8f9fa; border: 2px solid #C9A84C; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
  .fraction-code { font-size: 32px; font-weight: 800; font-family: monospace; color: #0A1628; }
  .fraction-desc { font-size: 14px; color: #444; margin-top: 8px; }
  .confidence { display: inline-block; font-size: 24px; font-weight: 700; color: ${confColor}; float: right; }
  .conf-label { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }
  .input-desc { background: #f0f4f8; border-radius: 6px; padding: 12px; font-size: 13px; color: #555; margin-bottom: 20px; font-style: italic; }
  .gri-list { list-style: none; padding: 0; }
  .gri-list li { font-size: 12px; color: #444; padding: 4px 0; border-bottom: 1px solid #f0f0f0; }
  .tariff-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
  .tariff-item { background: #f8f9fa; border-radius: 6px; padding: 10px; text-align: center; }
  .tariff-label { font-size: 10px; color: #888; text-transform: uppercase; }
  .tariff-value { font-size: 18px; font-weight: 700; color: #0A1628; }
  .tariff-pref { color: #16a34a; }
  .tag { display: inline-block; font-size: 11px; padding: 3px 8px; border-radius: 4px; margin: 2px; }
  .tag-yellow { background: #fef9c3; color: #854d0e; }
  .tag-blue { background: #dbeafe; color: #1e40af; }
  .tag-red { background: #fecaca; color: #991b1b; }
  .explanation { background: #f8f9fa; border-radius: 6px; padding: 16px; font-size: 13px; color: #444; line-height: 1.6; margin-bottom: 16px; }
  .alt-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 20px; }
  .alt-table th { text-align: left; padding: 6px 8px; border-bottom: 2px solid #eee; color: #888; font-size: 10px; text-transform: uppercase; }
  .alt-table td { padding: 6px 8px; border-bottom: 1px solid #f0f0f0; }
  .disclaimer { background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 12px; font-size: 10px; color: #92400e; margin-top: 24px; }
  .footer { margin-top: 30px; padding-top: 12px; border-top: 1px solid #eee; font-size: 10px; color: #999; text-align: center; }
  @media print { body { padding: 20px; } }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo"><span>ADUANA</span>I</div>
      <div class="subtitle">Clasificación Arancelaria con IA</div>
    </div>
    <div>
      <div class="date">${now}</div>
      <div class="ref">Ref: CLA-${Date.now().toString(36).toUpperCase()}</div>
    </div>
  </div>

  <div class="input-desc">Producto: "${inputDescription}"</div>

  <div class="fraction-box">
    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
      <div>
        <div class="fraction-code">${result.fraction.code}</div>
        <div class="fraction-desc">${result.fraction.description}</div>
        <div style="font-size: 12px; color: #888; margin-top: 6px;">
          Capítulo ${result.fraction.chapter} — Sección ${result.fraction.section}
          ${result.nico ? ` — NICO: ${result.nico}` : ''}
        </div>
      </div>
      <div style="text-align: right;">
        <div class="conf-label">Confianza</div>
        <div class="confidence">${result.confidence}%</div>
      </div>
    </div>
  </div>

  <h2>Aranceles</h2>
  <div class="tariff-grid">
    <div class="tariff-item">
      <div class="tariff-label">NMF</div>
      <div class="tariff-value">${result.tariffs.nmf}%</div>
    </div>
    ${Object.entries(result.tariffs.preferential).map(([treaty, rate]) => `
    <div class="tariff-item">
      <div class="tariff-label">${treaty}</div>
      <div class="tariff-value tariff-pref">${rate}%</div>
    </div>`).join('')}
  </div>

  <h2>Reglas Generales Interpretativas</h2>
  <ul class="gri-list">
    ${result.griApplied.map(g => `<li>${g}</li>`).join('')}
  </ul>

  <h2>Regulaciones</h2>
  <div style="margin-bottom: 16px;">
    ${result.regulations.rrna.length > 0 ? `
      <div style="margin-bottom: 8px;"><strong style="font-size: 11px; color: #888;">RRNA:</strong>
      ${result.regulations.rrna.map(r => `<span class="tag tag-yellow">${r}</span>`).join('')}</div>` : ''}
    ${result.regulations.noms.length > 0 ? `
      <div style="margin-bottom: 8px;"><strong style="font-size: 11px; color: #888;">NOMs:</strong>
      ${result.regulations.noms.map(n => `<span class="tag tag-blue">${n}</span>`).join('')}</div>` : ''}
    ${result.regulations.sectoralRegistry ? `<span class="tag tag-red">Requiere padrón sectorial</span>` : ''}
    ${!result.regulations.rrna.length && !result.regulations.noms.length && !result.regulations.sectoralRegistry ? '<span style="font-size: 12px; color: #888;">Sin regulaciones adicionales</span>' : ''}
  </div>

  <h2>Explicación</h2>
  <div class="explanation">${result.explanation.technical}</div>

  ${result.alternatives.length > 0 ? `
  <h2>Fracciones Alternativas</h2>
  <table class="alt-table">
    <thead><tr><th>Fracción</th><th>Descripción</th><th>Confianza</th><th>Razón</th></tr></thead>
    <tbody>
      ${result.alternatives.map(a => `
      <tr>
        <td style="font-family: monospace; font-weight: 600;">${a.code}</td>
        <td>${a.description}</td>
        <td>${a.confidence}%</td>
        <td style="font-size: 11px; color: #666;">${a.reason}</td>
      </tr>`).join('')}
    </tbody>
  </table>` : ''}

  <div class="disclaimer">
    ⚖️ ${result.disclaimer}
  </div>

  <div class="footer">
    <p style="color: #C9A84C; margin-bottom: 4px;">ADUANAI — Comercio Exterior con Inteligencia Artificial</p>
    <p>Este documento es generado automáticamente y tiene carácter informativo.</p>
  </div>
</body>
</html>`;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onload = () => printWindow.print();
  }
}
