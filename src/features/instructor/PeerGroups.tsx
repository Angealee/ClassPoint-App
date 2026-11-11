import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Sheet } from '@/components/ui/Sheet'
import { Avatar } from '@/components/ui/Avatar'
import { Chip } from '@/components/ui/Chip'
import { PersonRow } from '@/components/ui/PersonRow'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { ClipboardIcon, PencilIcon, PlusIcon, TrashIcon, UsersIcon } from '@/components/ui/icons'
import {
  archivePeerGroup,
  createPeerGroup,
  getSectionGroups,
  listRosterBasics,
  renamePeerGroup,
  setPeerGroupMembers,
} from '@/lib/api'
import { PEER_GROUP_NAME_MAX, type PeerGroup, type RosterPerson } from '@/lib/types'
import { errorText } from '@/lib/errors'
import { useInstructor } from './InstructorLayout'
import { PeerShuffleSheet } from './PeerShuffleSheet'

export function PeerGroups({ embedded = false }: { embedded?: boolean } = {}) {
  const { sections, selectedSectionId, setSelectedSectionId } = useInstructor()
  const { toast } = useToast()

  const [groups, setGroups] = useState<PeerGroup[]>([])
  const [roster, setRoster] = useState<RosterPerson[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [composerOpen, setComposerOpen] = useState(false)
  const [editing, setEditing] = useState<PeerGroup | null>(null)
  const [membersFor, setMembersFor] = useState<PeerGroup | null>(null)
  const [archiving, setArchiving] = useState<PeerGroup | null>(null)
  const [archiveBusy, setArchiveBusy] = useState(false)
  const [showUnassigned, setShowUnassigned] = useState(false)
  const [shuffleOpen, setShuffleOpen] = useState(false)

  const sectionId = selectedSectionId
  const sectionName = sections.find((s) => s.id === sectionId)?.name ?? 'this section'

  const load = useCallback(async () => {
    if (!sectionId) return
    setLoading(true)
    setLoadError(null)
    try {
      const [g, r] = await Promise.all([getSectionGroups(sectionId), listRosterBasics(sectionId)])
      setGroups(g)
      setRoster(r)
    } catch (e) {
      setLoadError(errorText(e, "Couldn't load the groups for this section."))
    } finally {
      setLoading(false)
    }
  }, [sectionId])

  useEffect(() => {
    void load()
  }, [load])

  const groupOf = useMemo(() => {
    const map = new Map<string, PeerGroup>()
    for (const g of groups) for (const m of g.members) map.set(m.id, g)
    return map
  }, [groups])

  const unassigned = useMemo(
    () => roster.filter((p) => !groupOf.has(p.id)),
    [roster, groupOf],
  )

  async function onArchive() {
    if (!archiving) return
    setArchiveBusy(true)
    try {
      await archivePeerGroup(archiving.id)
      toast(`Archived ${archiving.name}.`, 'success')
      setArchiving(null)
      await load()
    } catch (e) {
      toast(errorText(e, "Couldn't archive that group."), 'error')
    } finally {
      setArchiveBusy(false)
    }
  }

  return (
    <div className={embedded ? 'w-full' : 'mx-auto w-full max-w-2xl'}>
      {!embedded && (
        <PageHeader
          title="Peer groups"
          subtitle="Teams inside a section. Reused by every peer evaluation you run."
          fallback="/teach"
        />
      )}

      <div className="space-y-4">
        <Select
          label="Section"
          value={sectionId}
          onChange={(e) => setSelectedSectionId(e.target.value)}
        >
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
        ) : loadError ? (
          <ErrorState
            onRetry={() => void load()}
            detail="Nothing was changed — this is just the connection."
          >
            {loadError}
          </ErrorState>
        ) : (
          <>
            {unassigned.length > 0 && (
              <UnassignedCard
                people={unassigned}
                open={showUnassigned}
                onToggle={() => setShowUnassigned((v) => !v)}
              />
            )}

            <SectionLabel
              action={
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={roster.length < 2}
                    onClick={() => setShuffleOpen(true)}
                  >
                    Shuffle
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    icon={<PlusIcon className="h-4 w-4" />}
                    onClick={() => {
                      setEditing(null)
                      setComposerOpen(true)
                    }}
                  >
                    New group
                  </Button>
                </div>
              }
            >
              {groups.length === 0
                ? 'Groups'
                : `${groups.length} group${groups.length === 1 ? '' : 's'}`}
            </SectionLabel>

            {groups.length === 0 ? (
              <EmptyState
                icon={<ClipboardIcon />}
                description={`Everyone in ${sectionName} is unassigned until you make one.`}
                action={
                  roster.length >= 2 ? (
                    // The fastest start for a whole class: one draw, adjust after.
                    <Button onClick={() => setShuffleOpen(true)}>Shuffle into groups</Button>
                  ) : undefined
                }
              >
                No groups in this section yet.
              </EmptyState>
            ) : (
              <div className="space-y-3">
                {groups.map((g) => (
                  <GroupCard
                    key={g.id}
                    group={g}
                    onRename={() => {
                      setEditing(g)
                      setComposerOpen(true)
                    }}
                    onMembers={() => setMembersFor(g)}
                    onArchive={() => setArchiving(g)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <PeerShuffleSheet
        open={shuffleOpen}
        sectionId={sectionId}
        sectionName={sectionName}
        roster={roster}
        groups={groups}
        unassigned={unassigned}
        onClose={() => setShuffleOpen(false)}
        onSaved={() => {
          setShuffleOpen(false)
          void load()
        }}
      />

      <GroupComposer
        open={composerOpen}
        group={editing}
        sectionId={sectionId}
        onClose={() => setComposerOpen(false)}
        onSaved={() => {
          setComposerOpen(false)
          void load()
        }}
      />

      <MemberSheet
        group={membersFor}
        roster={roster}
        groupOf={groupOf}
        onClose={() => setMembersFor(null)}
        onSaved={() => {
          setMembersFor(null)
          void load()
        }}
      />

      <ConfirmDialog
        open={archiving !== null}
        title={`Archive ${archiving?.name ?? 'this group'}?`}
        message="Its members go back to being unassigned, and the group stops appearing when you build an evaluation."
        detail={
          'Past evaluations that used this group keep their results. The name becomes free to use again.'
        }
        variant="danger"
        confirmLabel="Archive group"
        busy={archiveBusy}
        onConfirm={() => void onArchive()}
        onClose={() => setArchiving(null)}
      />
    </div>
  )
}

function UnassignedCard({
  people,
  open,
  onToggle,
}: {
  people: RosterPerson[]
  open: boolean
  onToggle: () => void
}) {
  return (
    <Card pad="tight">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 text-left"
        aria-expanded={open}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warn-solid/10 text-warn">
          <UsersIcon className="h-4.5 w-4.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">
            {people.length} student{people.length === 1 ? ' is' : 's are'} not on a team
          </span>
          <span className="block text-xs text-muted">
            That is fine — a group evaluation simply skips them.
          </span>
        </span>
        <span className="shrink-0 text-xs font-medium text-muted">{open ? 'Hide' : 'Show'}</span>
      </button>

      {open && (
        <ul className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-3">
          {people.map((p) => (
            <li key={p.id}>
              <Chip tone="neutral">{p.fullName}</Chip>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function GroupCard({
  group,
  onRename,
  onMembers,
  onArchive,
}: {
  group: PeerGroup
  onRename: () => void
  onMembers: () => void
  onArchive: () => void
}) {
  return (
    <Card>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">{group.name}</h3>
          <p className="mt-0.5 text-xs text-muted">
            {group.memberCount === 0
              ? 'No members yet'
              : `${group.memberCount} member${group.memberCount === 1 ? '' : 's'}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <IconButton
            label={`Rename ${group.name}`}
            variant="outline"
            size="sm"
            onClick={onRename}
            icon={<PencilIcon className="h-4 w-4" />}
          />
          <IconButton
            label={`Archive ${group.name}`}
            variant="danger"
            size="sm"
            onClick={onArchive}
            icon={<TrashIcon className="h-4 w-4" />}
          />
        </div>
      </div>

      {group.members.length > 0 && (
        <ul className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          {group.members.map((m) => (
            <li key={m.id} className="flex items-center gap-1.5">
              <Avatar name={m.displayName} url={m.avatarUrl} className="h-6 w-6 shrink-0" />
              <span className="text-xs text-muted">{m.displayName}</span>
            </li>
          ))}
        </ul>
      )}

      <Button variant="outline" size="sm" className="mt-3 w-full" onClick={onMembers}>
        {group.memberCount === 0 ? 'Add members' : 'Edit members'}
      </Button>
    </Card>
  )
}

function GroupComposer({
  open,
  group,
  sectionId,
  onClose,
  onSaved,
}: {
  open: boolean
  group: PeerGroup | null
  sectionId: string
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) setName(group?.name ?? '')
  }, [open, group])

  const trimmed = name.trim()
  const tooLong = trimmed.length > PEER_GROUP_NAME_MAX
  const canSave = trimmed.length > 0 && !tooLong

  async function save() {
    if (!canSave) return
    setBusy(true)
    try {
      if (group) {
        await renamePeerGroup(group.id, trimmed)
        toast('Group renamed.', 'success')
      } else {
        await createPeerGroup(sectionId, trimmed)
        toast(`Created ${trimmed}.`, 'success')
      }
      onSaved()
    } catch (e) {
      toast(errorText(e, "Couldn't save that group."), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={group ? 'Rename group' : 'New group'}>
      <div className="space-y-4">
        <Input
          label="Group name"
          value={name}
          maxLength={PEER_GROUP_NAME_MAX + 10}
          placeholder="e.g. Team Alpha"
          hint="Students see this name when they evaluate their teammates."
          error={tooLong ? `${PEER_GROUP_NAME_MAX} characters at most.` : undefined}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canSave) void save()
          }}
        />
        <Button className="w-full" loading={busy} disabled={!canSave} onClick={() => void save()}>
          {group ? 'Save name' : 'Create group'}
        </Button>
      </div>
    </Sheet>
  )
}

function MemberSheet({
  group,
  roster,
  groupOf,
  onClose,
  onSaved,
}: {
  group: PeerGroup | null
  roster: RosterPerson[]
  groupOf: Map<string, PeerGroup>
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (group) setPicked(new Set(group.members.map((m) => m.id)))
  }, [group])

  const moving = useMemo(() => {
    if (!group) return []
    return roster.filter((p) => {
      const current = groupOf.get(p.id)
      return picked.has(p.id) && current !== undefined && current.id !== group.id
    })
  }, [roster, groupOf, picked, group])

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function save() {
    if (!group) return
    setBusy(true)
    try {
      await setPeerGroupMembers(group.id, [...picked])
      toast(`${group.name} updated.`, 'success')
      onSaved()
    } catch (e) {
      toast(errorText(e, "Couldn't save those members."), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={group !== null} onClose={onClose} title={group ? group.name : 'Members'}>
      {roster.length === 0 ? (
        <EmptyState>This section has no active students.</EmptyState>
      ) : (
        <div className="space-y-4">
          <ul className="divide-y divide-line">
            {roster.map((p) => {
              const current = groupOf.get(p.id)
              const elsewhere = current !== undefined && current.id !== group?.id
              const checked = picked.has(p.id)
              return (
                <li key={p.id}>
                  <label className="flex cursor-pointer items-center gap-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(p.id)}
                      className="h-4.5 w-4.5 shrink-0 rounded accent-[var(--color-accent-solid)]"
                    />
                    <PersonRow
                      className="min-w-0 flex-1"
                      size="sm"
                      name={p.fullName}
                      avatarUrl={p.avatarUrl}
                      meta={p.displayName !== p.fullName ? p.displayName : undefined}
                      trailing={
                        elsewhere ? (
                          <Chip tone={checked ? 'warn' : 'neutral'}>{current.name}</Chip>
                        ) : undefined
                      }
                    />
                  </label>
                </li>
              )
            })}
          </ul>

          <div className="space-y-2">
            <p className="text-xs text-muted">
              {picked.size} selected
              {moving.length > 0 && (
                <>
                  {' · '}
                  <span className="font-semibold text-warn">
                    {moving.length} will move here from another team
                  </span>
                </>
              )}
            </p>
            <Button className="w-full" loading={busy} onClick={() => void save()}>
              Save members
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  )
}
