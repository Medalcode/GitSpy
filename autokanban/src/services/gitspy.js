const API_BASE = import.meta.env.VITE_GITSPY_BASE || 'http://localhost:3000'

export async function fetchKanban(owner, repo) {
  const url = `${API_BASE}/repos/${owner}/${repo}/kanban`
  const res = await fetch(url)
  if (!res.ok) {
    let msg = 'Error desconocido al cargar el Kanban';
    
    if (res.status === 401) msg = 'Repositorio privado o requiere autenticación';
    else if (res.status === 403) msg = 'Este repositorio no expone Kanban (Acceso denegado)';
    else if (res.status === 404) msg = 'No se encontró Bitacora.md o el repositorio no existe';
    else if (res.status === 429) msg = 'Excedido el límite de velocidad (Rate Limit)';
    else if (res.status >= 500) msg = 'Error interno del servidor GitSpy';

    throw new Error(`${msg} (${res.status})`);
  }
  const json = await res.json()
  // The backend is authoritative; frontend does not interpret rules
  return json
}
