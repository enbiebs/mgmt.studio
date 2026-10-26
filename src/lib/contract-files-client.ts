// The browser's side of keeping a copy of a contract (a PDF or Word file) with it: ask the server for a place to upload to, send the
// file straight there, ask the server to read it, open it later, and clean up a file nobody kept. The server routes under
// /api/contracts do the access checks; nothing here can reach a file the person may not see.

import type { ContractFile } from '@/types'

export const CONTRACT_FILE_TYPES = '.pdf,.docx,.rtf'
export const MAX_CONTRACT_FILE_BYTES = 20 * 1024 * 1024

export type ContractFileKind = 'pdf' | 'docx' | 'rtf'
const CONTENT_TYPE: Record<ContractFileKind, string> = {
  pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', rtf: 'application/rtf',
}

/** "pdf", "docx" or "rtf" from a file name, or null for anything else. */
export function contractFileKind(name: string): ContractFileKind | null {
  const ext = name.split('.').pop()?.toLowerCase()
  return ext === 'pdf' ? 'pdf' : ext === 'docx' ? 'docx' : ext === 'rtf' ? 'rtf' : null
}

/** A readable default label for a newly attached file. */
export const defaultFileLabel = (existing: readonly ContractFile[]) => (existing.length === 0 ? 'Contract' : `Version ${existing.length + 1}`)

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((json as { error?: string }).error ?? 'Something went wrong. Please try again.')
  return json as T
}

/** Uploads a contract file to private storage and returns where it went. */
export async function uploadContractFile(clientId: string, file: File): Promise<{ path: string }> {
  const kind = contractFileKind(file.name)
  if (!kind) throw new Error('Please choose a PDF, a Word (.docx) or an .rtf file.')
  if (file.size > MAX_CONTRACT_FILE_BYTES) throw new Error('That file is too large (20MB at most).')
  const { path, token } = await post<{ path: string; token: string }>('/api/contracts/upload-url', { clientId, kind })
  const { createClient } = await import('@/lib/supabase/client')
  // The storage bucket checks the type the upload SAYS it is; some browsers send nothing useful for Word or .rtf files, so say it plainly.
  const { error } = await createClient().storage.from('contracts').uploadToSignedUrl(path, token, file, { contentType: CONTENT_TYPE[kind] })
  if (error) throw new Error('The file could not be uploaded. Please try again.')
  return { path }
}

/** The link that opens a stored file (the server checks access, then forwards to a short-lived link). */
export const contractFileUrl = (clientId: string, contractId: string, path: string) =>
  `/api/contracts/file?clientId=${encodeURIComponent(clientId)}&contractId=${encodeURIComponent(contractId)}&path=${encodeURIComponent(path)}`

/** Removes stored files nobody keeps any more. Never throws: a file left behind is harmless, a failed clean-up must not block anything. */
export async function removeContractFiles(clientId: string, paths: string[]): Promise<void> {
  await Promise.all(paths.map(path =>
    fetch('/api/contracts/file', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, path }) }).catch(() => undefined)))
}
