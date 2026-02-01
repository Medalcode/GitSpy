// Relative path for same-origin requests
const API_BASE = '/api';

export async function fetchKanban(owner, repo) {
  const url = `${API_BASE}/repos/${owner}/${repo}/kanban`
  const res = await fetch(url)
  if (!res.ok) {
    let msg = 'Error desconocido al cargar el Kanban';
    
    // Intentar leer el mensaje de error del backend
    let errorDetail = 'Error desconocido';
    try {
      const errJson = await res.json();
      errorDetail = (errJson.error && errJson.error.message) || errJson.error || JSON.stringify(errJson);
    } catch {
       // fallback si no es JSON
      errorDetail = res.statusText;
    }

    if (res.status === 401) msg = `Acceso denegado (401): ${errorDetail}`;
    else if (res.status === 403) msg = `Prohibido (403): ${errorDetail}`;
    else if (res.status === 404) msg = 'No encontrado (404): Bitacora.md o repositorio inexistente';
    else if (res.status === 429) msg = 'Límite de peticiones excedido (Intenta más tarde)';
    else if (res.status >= 500) msg = `Error del servidor (${res.status}): ${errorDetail}`;

    throw new Error(msg);
  }
  const json = await res.json()
  // The backend is authoritative; frontend does not interpret rules
  return json
}
