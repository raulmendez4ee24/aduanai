/**
 * Cumplimiento (Ola 3): absorbido por la vista Defensa (/defensa), que reúne
 * Cumplimiento + Auditoría por operación/clasificación con certificado de
 * integridad. Esta ruta se conserva solo como redirección.
 */
import { Navigate } from 'react-router-dom'

export function CumplimientoPage() {
  return <Navigate to="/defensa" replace />
}
