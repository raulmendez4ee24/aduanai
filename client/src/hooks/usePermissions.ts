import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { UserPermissions } from '../lib/api'

let cached: UserPermissions | null = null
let pending: Promise<UserPermissions | null> | null = null

async function fetchPerms(): Promise<UserPermissions | null> {
  try {
    const r = await api.permissionsMe()
    cached = r.data
    return r.data
  } catch { return null }
}

/**
 * Hook que devuelve los permisos del usuario actual con helpers `can`/`cannot`.
 *
 *   const { can, cannot, perms } = usePermissions()
 *   {can('classifier', 'approve') && <ApproveButton/>}
 *   <button disabled={cannot('payment', 'authorize')}>Autorizar</button>
 */
export function usePermissions() {
  const [perms, setPerms] = useState<UserPermissions | null>(cached)
  const [loading, setLoading] = useState(!cached)

  useEffect(() => {
    if (cached) return
    if (!pending) pending = fetchPerms()
    pending.then(p => {
      setPerms(p)
      setLoading(false)
      pending = null
    })
  }, [])

  function can(module: string, action: string): boolean {
    if (!perms) return false
    const features = perms.permissions.features as Record<string, boolean | undefined> | undefined
    if (features && features[action] === true) return true
    const m = perms.permissions.modules?.[module] as Record<string, boolean> | undefined
    return m?.[action] === true
  }
  function cannot(module: string, action: string): boolean { return !can(module, action) }

  function hasRole(code: string): boolean {
    return !!perms?.roles.some(r => r.code === code)
  }

  return { perms, loading, can, cannot, hasRole }
}

export function refreshPermissions(): Promise<UserPermissions | null> {
  cached = null
  pending = fetchPerms()
  return pending
}
