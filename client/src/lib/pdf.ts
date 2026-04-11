import type { QuoteResult } from './api';

export function generateQuotePDF(quote: QuoteResult) {
  const fmt = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`;
  const fmtUSD = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD`;
  const now = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });

  const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; background: white; padding: 40px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #C9A84C; padding-bottom: 20px; margin-bottom: 30px; }
  .logo { font-size: 28px; font-weight: 800; letter-spacing: -0.5px; }
  .logo span { color: #C9A84C; }
  .subtitle { font-size: 11px; color: #888; margin-top: 4px; }
  .date { font-size: 12px; color: #666; text-align: right; }
  .ref { font-size: 11px; color: #999; }
  h2 { font-size: 16px; font-weight: 700; color: #0A1628; margin-bottom: 16px; border-left: 3px solid #C9A84C; padding-left: 12px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 30px; }
  .info-item { background: #f8f9fa; border-radius: 6px; padding: 12px; }
  .info-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #888; margin-bottom: 4px; }
  .info-value { font-size: 14px; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #888; padding: 8px 12px; border-bottom: 2px solid #eee; }
  td { padding: 10px 12px; border-bottom: 1px solid #f0f0f0; font-size: 13px; }
  td:last-child { text-align: right; font-weight: 500; }
  .total-row td { border-top: 2px solid #C9A84C; font-weight: 700; font-size: 15px; background: #fdfbf5; }
  .pref { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin-bottom: 30px; }
  .pref-title { font-size: 12px; font-weight: 700; color: #16a34a; margin-bottom: 8px; }
  .pref-item { font-size: 12px; color: #333; margin: 4px 0; }
  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #eee; font-size: 10px; color: #999; text-align: center; }
  @media print { body { padding: 20px; } }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo"><span>ADUANA</span>I</div>
      <div class="subtitle">Cotización de Importación</div>
    </div>
    <div>
      <div class="date">${now}</div>
      <div class="ref">Ref: COT-${Date.now().toString(36).toUpperCase()}</div>
    </div>
  </div>

  <div class="info-grid">
    <div class="info-item">
      <div class="info-label">Fracción Arancelaria</div>
      <div class="info-value" style="font-family: monospace;">${quote.fraction}</div>
    </div>
    <div class="info-item">
      <div class="info-label">País de Origen</div>
      <div class="info-value">${quote.origin}</div>
    </div>
    <div class="info-item">
      <div class="info-label">Incoterm</div>
      <div class="info-value">${quote.currency === 'MXN' ? 'MXN' : quote.currency}</div>
    </div>
    <div class="info-item">
      <div class="info-label">Tipo de Cambio</div>
      <div class="info-value">$${quote.exchangeRate.toFixed(2)} MXN/USD</div>
    </div>
  </div>

  <h2>Valor en Aduana</h2>
  <div class="info-grid" style="margin-bottom: 30px;">
    <div class="info-item">
      <div class="info-label">Valor Original</div>
      <div class="info-value">${fmtUSD(quote.customsValue)}</div>
    </div>
    <div class="info-item">
      <div class="info-label">Valor en MXN</div>
      <div class="info-value">${fmt(quote.valueMXN)}</div>
    </div>
  </div>

  <h2>Desglose de Impuestos</h2>
  <table>
    <thead>
      <tr>
        <th>Concepto</th>
        <th>Tasa</th>
        <th style="text-align: right;">Monto</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>IGI (Impuesto General de Importación)</td>
        <td>${quote.breakdown.igi.rate}%</td>
        <td>${fmt(quote.breakdown.igi.amount)}</td>
      </tr>
      <tr>
        <td>DTA (Derecho de Trámite Aduanero)</td>
        <td>${quote.breakdown.dta.rate}%</td>
        <td>${fmt(quote.breakdown.dta.amount)}</td>
      </tr>
      <tr>
        <td>IVA</td>
        <td>${quote.breakdown.iva.rate}%</td>
        <td>${fmt(quote.breakdown.iva.amount)}</td>
      </tr>
      ${quote.breakdown.ieps ? `
      <tr>
        <td>IEPS</td>
        <td>${quote.breakdown.ieps.rate}%</td>
        <td>${fmt(quote.breakdown.ieps.amount)}</td>
      </tr>` : ''}
      <tr>
        <td>Prevalidación</td>
        <td>—</td>
        <td>${fmt(quote.breakdown.prevalidation)}</td>
      </tr>
      <tr>
        <td><strong>Total Impuestos</strong></td>
        <td></td>
        <td><strong>${fmt(quote.totalTaxes)}</strong></td>
      </tr>
      <tr class="total-row">
        <td>TOTAL LANDED COST</td>
        <td></td>
        <td>${fmt(quote.totalLandedCost)}</td>
      </tr>
    </tbody>
  </table>

  ${quote.preferential && quote.preferential.length > 0 ? `
  <div class="pref">
    <div class="pref-title">Preferencias Arancelarias Disponibles</div>
    ${quote.preferential.map(p => `
      <div class="pref-item">
        <strong>${p.treaty}</strong> — IGI preferencial: ${p.igi}%
        (Ahorro estimado: ${fmt(p.savings * quote.valueMXN)})
      </div>
    `).join('')}
  </div>` : ''}

  <div class="footer">
    <p>Esta cotización es orientativa y no constituye un compromiso de pago de impuestos.</p>
    <p>Los montos finales pueden variar según el tipo de cambio vigente y la determinación de la autoridad aduanera.</p>
    <p style="margin-top: 8px; color: #C9A84C;">ADUANAI — Comercio Exterior con Inteligencia Artificial</p>
  </div>
</body>
</html>`;

  // Abrir en nueva ventana para imprimir/guardar como PDF
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onload = () => printWindow.print();
  }
}
