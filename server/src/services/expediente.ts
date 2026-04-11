// Documentos requeridos por tipo de operación según Ley Aduanera 2026
const REQUIRED_DOCS: Record<string, { type: string; name: string; required: boolean }[]> = {
  IMPORT: [
    { type: 'pedimento', name: 'Pedimento de importación', required: true },
    { type: 'factura_comercial', name: 'Factura comercial', required: true },
    { type: 'conocimiento_embarque', name: 'Conocimiento de embarque (B/L o AWB)', required: true },
    { type: 'packing_list', name: 'Lista de empaque (Packing List)', required: true },
    { type: 'certificado_origen', name: 'Certificado de origen', required: false },
    { type: 'manifestacion_valor', name: 'Manifestación de valor', required: true },
    { type: 'documento_transporte', name: 'Documento de transporte', required: true },
    { type: 'padron_importadores', name: 'Constancia padrón de importadores', required: true },
    { type: 'encargo_conferido', name: 'Encargo conferido al agente aduanal', required: true },
    { type: 'nom_certificado', name: 'Certificado de cumplimiento NOM', required: false },
    { type: 'permiso_previo', name: 'Permiso previo de importación', required: false },
    { type: 'cuadro_liquidacion', name: 'Cuadro de liquidación', required: false },
    { type: 'hoja_calculo', name: 'Hoja de cálculo para determinación de contribuciones', required: false },
    { type: 'carta_porte', name: 'Carta porte', required: false },
  ],
  EXPORT: [
    { type: 'pedimento', name: 'Pedimento de exportación', required: true },
    { type: 'factura_comercial', name: 'Factura comercial', required: true },
    { type: 'conocimiento_embarque', name: 'Conocimiento de embarque (B/L o AWB)', required: true },
    { type: 'packing_list', name: 'Lista de empaque', required: true },
    { type: 'certificado_origen', name: 'Certificado de origen', required: false },
    { type: 'documento_transporte', name: 'Documento de transporte', required: true },
    { type: 'carta_porte', name: 'Carta porte', required: false },
  ],
  TRANSIT: [
    { type: 'pedimento_transito', name: 'Pedimento de tránsito', required: true },
    { type: 'factura_comercial', name: 'Factura comercial', required: true },
    { type: 'conocimiento_embarque', name: 'Conocimiento de embarque', required: true },
    { type: 'documento_transporte', name: 'Documento de transporte', required: true },
  ],
};

export function getRequiredDocuments(operationType: string): { type: string; name: string; required: boolean }[] {
  return REQUIRED_DOCS[operationType] || REQUIRED_DOCS.IMPORT;
}

export function calculateCompleteness(
  requiredDocs: { type: string; required: boolean }[],
  uploadedDocs: { type: string; status: string }[]
): number {
  const required = requiredDocs.filter(d => d.required);
  if (required.length === 0) return 100;

  const fulfilled = required.filter(req =>
    uploadedDocs.some(doc => doc.type === req.type && (doc.status === 'UPLOADED' || doc.status === 'VERIFIED'))
  );

  return Math.round((fulfilled.length / required.length) * 100);
}

export function getMissingDocuments(
  operationType: string,
  uploadedDocs: { type: string; status: string }[]
): { type: string; name: string; required: boolean }[] {
  const required = getRequiredDocuments(operationType);
  return required.filter(req =>
    !uploadedDocs.some(doc => doc.type === req.type && (doc.status === 'UPLOADED' || doc.status === 'VERIFIED'))
  );
}
