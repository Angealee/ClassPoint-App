import { supabase } from '@/lib/supabase'
import type { RedemptionKind, RewardCatalogItem } from '@/lib/types'

const COLS = 'id, label, points, kind, sort_order, archived_at'

interface CatalogRow {
  id: string
  label: string
  points: number
  kind: RedemptionKind
  sort_order: number
  archived_at: string | null
}

function mapItem(r: CatalogRow): RewardCatalogItem {
  return {
    id: r.id,
    label: r.label,
    points: r.points,
    kind: r.kind,
    sortOrder: r.sort_order,
    archivedAt: r.archived_at,
  }
}

export async function listCatalogItems(includeArchived = false): Promise<RewardCatalogItem[]> {
  let query = supabase.from('reward_catalog_items').select(COLS)
  if (!includeArchived) query = query.is('archived_at', null)
  const { data, error } = await query.order('sort_order').order('points')
  if (error) throw error
  return ((data ?? []) as CatalogRow[]).map(mapItem)
}

export async function createCatalogItem(input: {
  label: string
  points: number
  kind: RedemptionKind
}): Promise<RewardCatalogItem> {
  const { data, error } = await supabase
    .from('reward_catalog_items')
    .insert({
      label: input.label.trim(),
      points: input.points,
      kind: input.kind,
      sort_order: input.points,
    })
    .select(COLS)
    .single()
  if (error) throw error
  return mapItem(data as CatalogRow)
}

export async function updateCatalogItem(
  id: string,
  patch: { label?: string; points?: number; kind?: RedemptionKind },
): Promise<void> {
  const { error } = await supabase
    .from('reward_catalog_items')
    .update({
      ...(patch.label !== undefined ? { label: patch.label.trim() } : {}),
      ...(patch.points !== undefined ? { points: patch.points } : {}),
      ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
    })
    .eq('id', id)
  if (error) throw error
}

export async function setCatalogItemArchived(id: string, archived: boolean): Promise<void> {
  const { error } = await supabase
    .from('reward_catalog_items')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq('id', id)
  if (error) throw error
}
