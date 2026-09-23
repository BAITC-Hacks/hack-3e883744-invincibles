import { api } from '../../shared/api/client'
export async function importedIds(file: File): Promise<string[]> {
  try {
    const data: unknown = JSON.parse(await file.text())
    return Array.isArray(data)
      ? data
          .map((item) =>
            item && typeof item === 'object' && 'employee_id' in item
              ? String(item.employee_id)
              : '',
          )
          .filter(Boolean)
      : []
  } catch {
    return []
  }
}
export async function existingIds(): Promise<Set<string>> {
  const first = await api.employees('', 0, 200)
  const ids = new Set(first.items.map((row) => row.employee_id))
  for (let offset = 200; offset < first.total; offset += 200) {
    const page = await api.employees('', offset, 200)
    page.items.forEach((row) => ids.add(row.employee_id))
  }
  return ids
}
