import { upsertRepository, getRepositoryByFullName } from '../infra/db'

export async function saveRepositoryFromGitHub(repoData: any) {
  const fullName = repoData.full_name || `${repoData.owner?.login}/${repoData.name}`
  const owner = repoData.owner?.login || null
  return upsertRepository(fullName, owner, repoData)
}

export async function findRepository(fullName: string) {
  return getRepositoryByFullName(fullName)
}
