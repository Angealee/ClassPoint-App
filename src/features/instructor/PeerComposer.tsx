import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Sheet } from '@/components/ui/Sheet'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Select } from '@/components/ui/Select'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { PlusIcon, TrashIcon } from '@/components/ui/icons'
import { createPeerEvaluation, getSectionGroups } from '@/lib/api'
import { SCALE_PRESETS, normalizeScale, scaleError } from '@/lib/peer-scale'
import { resolveGroupTargets, type SectionGroupState } from '@/lib/peer-audience'
import { errorText } from '@/lib/errors'
import {
  PEER_CRITERION_LABEL_MAX,
  PEER_INSTRUCTIONS_MAX,
  PEER_MAX_CRITERIA,
  PEER_TITLE_MAX,
  type PeerEvalScope,
  type PeerEvaluationTemplate,
  type PeerGroup,
  type PeerScaleOption,
} from '@/lib/types'
import { useInstructor } from './InstructorLayout'

interface DraftCriterion {
  key: string
  label: string
  scale: PeerScaleOption[]
}

interface SectionGroups extends SectionGroupState {
  groups: PeerGroup[]
}

let seq = 0
function newCriterion(): DraftCriterion {
  seq += 1
  return { key: `c${seq}`, label: '', scale: SCALE_PRESETS[0].scale }
}

export function PeerComposer({
  open,
  template = null,
  onClose,
  onCreated,
}: {
  open: boolean
  template?: PeerEvaluationTemplate | null
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const { sections, subjects, sectionSubjects } = useInstructor()
  const { toast } = useToast()

  const [subjectId, setSubjectId] = useState('')
  const [title, setTitle] = useState('')
  const [instructions, setInstructions] = useState('')
  const [scope, setScope] = useState<PeerEvalScope>('group')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [criteria, setCriteria] = useState<DraftCriterion[]>([newCriterion()])
  const [deadline, setDeadline] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)

  const [groupsBySection, setGroupsBySection] = useState<Record<string, SectionGroups>>({})
  const [unpicked, setUnpicked] = useState<Set<string>>(new Set())
  const requested = useRef<Set<string>>(new Set())
  const templateGroups = useRef<Set<string>>(new Set())
  const templateApplied = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!open) return
    requested.current = new Set()
    templateApplied.current = new Set()
    templateGroups.current = new Set(template?.groupIds ?? [])
    setGroupsBySection({})
    setUnpicked(new Set())
    setDeadline('')

    if (template) {
      setSubjectId(subjects.some((s) => s.id === template.subjectId) ? template.subjectId : '')
      setTitle(`${template.title.slice(0, PEER_TITLE_MAX - 7)} (copy)`)
      setInstructions(template.instructions)
      setScope(template.scope)
      setPicked(new Set(template.sectionIds))
      setCriteria(
        template.criteria.length > 0
          ? template.criteria.map((c) => ({ ...newCriterion(), label: c.label, scale: c.scale }))
          : [newCriterion()],
      )
    } else {
      setSubjectId(subjects[0]?.id ?? '')
      setTitle('')
      setInstructions('')
      setScope('group')
      setPicked(new Set())
      setCriteria([newCriterion()])
    }
  }, [open, subjects, template])

  const eligible = useMemo(
    () => sections.filter((s) => (sectionSubjects[s.id] ?? []).includes(subjectId)),
    [sections, sectionSubjects, subjectId],
  )

  useEffect(() => {
    setPicked((prev) => {
      const ok = new Set(eligible.map((s) => s.id))
      const next = new Set([...prev].filter((id) => ok.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [eligible])

  const criteriaError = useMemo(() => {
    for (const c of criteria) {
      if (c.label.trim().length === 0) return 'Every criterion needs a label.'
      if (c.label.trim().length > PEER_CRITERION_LABEL_MAX) {
        return `A criterion label is at most ${PEER_CRITERION_LABEL_MAX} characters.`
      }
      const err = scaleError(c.scale)
      if (err) return `${c.label.trim() || 'A criterion'}: ${err}`
    }
    return null
  }, [criteria])

  const loadGroups = useCallback(async (sectionId: string) => {
    setGroupsBySection((prev) => ({
      ...prev,
      [sectionId]: { status: 'loading', groups: prev[sectionId]?.groups ?? [] },
    }))
    try {
      const groups = await getSectionGroups(sectionId)
      setGroupsBySection((prev) => ({ ...prev, [sectionId]: { status: 'ready', groups } }))

      if (templateGroups.current.size > 0 && !templateApplied.current.has(sectionId)) {
        templateApplied.current.add(sectionId)
        const keep = templateGroups.current
        setUnpicked((prev) => {
          const next = new Set(prev)
          for (const g of groups) if (!keep.has(g.id)) next.add(g.id)
          return next
        })
      }
    } catch {
      setGroupsBySection((prev) => ({ ...prev, [sectionId]: { status: 'error', groups: [] } }))
    }
  }, [])

  useEffect(() => {
    if (!open || scope !== 'group') return
    for (const id of picked) {
      if (requested.current.has(id)) continue
      requested.current.add(id)
      void loadGroups(id)
    }
  }, [open, scope, picked, loadGroups])

  const pickedSectionIds = useMemo(
    () => eligible.filter((s) => picked.has(s.id)).map((s) => s.id),
    [eligible, picked],
  )

  const targets = useMemo(
    () =>
      resolveGroupTargets({
        scope,
        sectionIds: pickedSectionIds,
        groupsBySection,
        unpicked,
      }),
    [scope, pickedSectionIds, groupsBySection, unpicked],
  )
  const groupError = targets.error

  const chosenGroups = useMemo(() => {
    const ids = new Set(targets.groupIds ?? [])
    return pickedSectionIds.flatMap((id) =>
      (groupsBySection[id]?.groups ?? []).filter((g) => ids.has(g.id)),
    )
  }, [targets, pickedSectionIds, groupsBySection])

  function toggleGroup(groupId: string) {
    setUnpicked((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  function setSectionGroups(sectionId: string, ticked: boolean) {
    const ids = groupsBySection[sectionId]?.groups.map((g) => g.id) ?? []
    setUnpicked((prev) => {
      const next = new Set(prev)
      for (const id of ids) {
        if (ticked) next.delete(id)
        else next.add(id)
      }
      return next
    })
  }

  const canCreate =
    subjectId !== '' &&
    title.trim().length > 0 &&
    title.trim().length <= PEER_TITLE_MAX &&
    instructions.length <= PEER_INSTRUCTIONS_MAX &&
    picked.size > 0 &&
    criteria.length > 0 &&
    criteriaError === null &&
    groupError === null

  const pickedNames = eligible.filter((s) => picked.has(s.id)).map((s) => s.name)

  const groupLabel = (g: PeerGroup) => {
    if (pickedSectionIds.length < 2) return g.name
    const owner = pickedSectionIds.find((id) =>
      groupsBySection[id]?.groups.some((x) => x.id === g.id),
    )
    const name = eligible.find((s) => s.id === owner)?.name
    return name ? `${g.name} (${name})` : g.name
  }

  async function create() {
    setBusy(true)
    try {
      const id = await createPeerEvaluation({
        subjectId,
        title: title.trim(),
        instructions: instructions.trim(),
        scope,
        sectionIds: [...picked],
        groupIds: targets.groupIds,
        criteria: criteria.map((c) => ({
          label: c.label.trim(),
          scale: normalizeScale(c.scale),
        })),
        closesAt: deadline ? new Date(deadline).toISOString() : null,
      })
      toast('Evaluation opened.', 'success')
      setConfirm(false)
      onCreated(id)
    } catch (e) {
      toast(errorText(e, "Couldn't create that evaluation."), 'error')
      setConfirm(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={template ? 'Duplicate peer evaluation' : 'New peer evaluation'}
        variant="screen"
      >
        <div className="mx-auto w-full max-w-2xl space-y-4 pt-4">
          <div>
            <h1 className="font-display text-xl font-bold">
              {template ? 'Duplicate evaluation' : 'New peer evaluation'}
            </h1>
            {template && (
              <p className="mt-1 text-sm text-muted">
                Copied from the original. Check the title, sections and groups; the deadline
                starts empty.
              </p>
            )}
          </div>
          <Select
            label="Subject"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
          >
            <option value="">Pick a subject</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} · {s.name}
              </option>
            ))}
          </Select>

          <Input
            label="Title"
            value={title}
            placeholder="e.g. Group project 1"
            maxLength={PEER_TITLE_MAX + 10}
            error={title.length > PEER_TITLE_MAX ? `${PEER_TITLE_MAX} characters at most.` : undefined}
            onChange={(e) => setTitle(e.target.value)}
          />

          <Textarea
            label="Instructions (optional)"
            rows={3}
            value={instructions}
            placeholder="What you want them thinking about when they rate each other."
            hint={`${instructions.length} / ${PEER_INSTRUCTIONS_MAX}`}
            error={
              instructions.length > PEER_INSTRUCTIONS_MAX
                ? `${PEER_INSTRUCTIONS_MAX} characters at most.`
                : undefined
            }
            onChange={(e) => setInstructions(e.target.value)}
          />

          <div>
            <SectionLabel>Who rates whom</SectionLabel>
            <SegmentedControl
              label="Scope"
              value={scope}
              onChange={setScope}
              options={[
                { value: 'group', label: 'Within groups' },
                { value: 'section', label: 'Whole section' },
              ]}
            />
            <p className="mt-1.5 px-1 text-xs text-muted">
              {scope === 'group'
                ? 'Each student rates their own team. Anyone not on a team is skipped.'
                : 'Every student rates every classmate in the section. On a large section that is a lot of ratings.'}
            </p>
          </div>

          <div>
            <SectionLabel>Sections</SectionLabel>
            {subjectId === '' ? (
              <p className="px-1 text-xs text-muted">Pick a subject first.</p>
            ) : eligible.length === 0 ? (
              <p className="px-1 text-xs text-muted">
                No section is taking that subject yet. Assign it in Semesters first.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {eligible.map((s) => (
                  <li key={s.id}>
                    <label className="flex cursor-pointer items-center gap-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={picked.has(s.id)}
                        onChange={() =>
                          setPicked((prev) => {
                            const next = new Set(prev)
                            if (next.has(s.id)) next.delete(s.id)
                            else next.add(s.id)
                            return next
                          })
                        }
                        className="h-4.5 w-4.5 shrink-0 rounded accent-[var(--color-accent-solid)]"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm">{s.name}</span>
                    </label>

                    {scope === 'group' && picked.has(s.id) && (
                      <GroupPicker
                        state={groupsBySection[s.id]}
                        unpicked={unpicked}
                        onToggle={toggleGroup}
                        onSetAll={(ticked) => setSectionGroups(s.id, ticked)}
                        onRetry={() => void loadGroups(s.id)}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
            {groupError && <p className="mt-2 px-1 text-xs text-danger">{groupError}</p>}
          </div>

          <div>
            <SectionLabel
              action={
                <Button
                  size="sm"
                  variant="outline"
                  icon={<PlusIcon className="h-4 w-4" />}
                  disabled={criteria.length >= PEER_MAX_CRITERIA}
                  onClick={() => setCriteria((prev) => [...prev, newCriterion()])}
                >
                  Add
                </Button>
              }
            >
              Criteria
            </SectionLabel>

            <div className="space-y-3">
              {criteria.map((c, i) => (
                <CriterionEditor
                  key={c.key}
                  criterion={c}
                  canRemove={criteria.length > 1}
                  onChange={(next) =>
                    setCriteria((prev) => prev.map((x, j) => (j === i ? next : x)))
                  }
                  onRemove={() => setCriteria((prev) => prev.filter((_, j) => j !== i))}
                />
              ))}
            </div>

            {criteriaError && <p className="mt-2 px-1 text-xs text-danger">{criteriaError}</p>}
          </div>

          <Input
            type="datetime-local"
            label="Closes (optional)"
            value={deadline}
            hint="Leave blank to close it by hand. Otherwise it closes itself, once."
            onChange={(e) => setDeadline(e.target.value)}
          />

          <Button className="w-full" disabled={!canCreate} onClick={() => setConfirm(true)}>
            Open evaluation
          </Button>
        </div>
      </Sheet>

      <ConfirmDialog
        open={confirm}
        title="Open this evaluation?"
        message={
          targets.narrowed
            ? `Members of ${chosenGroups.map(groupLabel).join(', ')} get a notification straight away. Nobody else in ${pickedNames.join(', ')} will see it.`
            : `Students in ${pickedNames.join(', ') || 'the chosen sections'} get a notification straight away.`
        }
        detail="Once anyone submits, the criteria and who rates whom are locked. The title, instructions and deadline can still change."
        confirmLabel="Open it"
        busy={busy}
        onConfirm={() => void create()}
        onClose={() => setConfirm(false)}
      />
    </>
  )
}

function GroupPicker({
  state,
  unpicked,
  onToggle,
  onSetAll,
  onRetry,
}: {
  state: SectionGroups | undefined
  unpicked: Set<string>
  onToggle: (groupId: string) => void
  onSetAll: (ticked: boolean) => void
  onRetry: () => void
}) {
  if (!state || state.status === 'loading') {
    return <p className="pb-2.5 pl-7.5 text-xs text-muted">Loading groups…</p>
  }
  if (state.status === 'error') {
    return (
      <div className="flex items-center gap-3 pb-2.5 pl-7.5">
        <p className="min-w-0 flex-1 text-xs text-danger">Couldn't load this section's groups.</p>
        <Button size="sm" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      </div>
    )
  }
  if (state.groups.length === 0) {
    return (
      <p className="pb-2.5 pl-7.5 text-xs text-muted">
        No groups in this section yet, so everyone here is skipped. Build them in the Groups tab.
      </p>
    )
  }

  const allTicked = state.groups.every((g) => !unpicked.has(g.id))

  return (
    <div className="pb-2.5 pl-7.5">
      <div className="mb-1 flex items-center justify-between gap-3">
        <span className="text-xs text-muted">Groups taking part</span>
        <button
          type="button"
          onClick={() => onSetAll(!allTicked)}
          className="shrink-0 text-xs font-medium text-accent"
        >
          {allTicked ? 'Clear all' : 'Tick all'}
        </button>
      </div>
      <ul>
        {state.groups.map((g) => (
          <li key={g.id}>
            <label className="flex cursor-pointer items-center gap-3 py-1.5">
              <input
                type="checkbox"
                checked={!unpicked.has(g.id)}
                onChange={() => onToggle(g.id)}
                className="h-4.5 w-4.5 shrink-0 rounded accent-[var(--color-accent-solid)]"
              />
              <span className="min-w-0 flex-1 truncate text-sm">{g.name}</span>
              <span className="shrink-0 text-xs text-muted">
                {g.memberCount < 2
                  ? g.memberCount === 0
                    ? 'Empty'
                    : 'No one to rate'
                  : `${g.memberCount} members`}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  )
}

function CriterionEditor({
  criterion,
  canRemove,
  onChange,
  onRemove,
}: {
  criterion: DraftCriterion
  canRemove: boolean
  onChange: (next: DraftCriterion) => void
  onRemove: () => void
}) {
  const [custom, setCustom] = useState(false)

  const presetKey = useMemo(() => {
    const found = SCALE_PRESETS.find(
      (p) => JSON.stringify(p.scale) === JSON.stringify(criterion.scale),
    )
    return found?.key ?? ''
  }, [criterion.scale])

  const err = scaleError(criterion.scale)

  return (
    <Card pad="tight">
      <div className="flex items-start gap-2">
        <Input
          wrapperClassName="min-w-0 flex-1"
          label="Criterion"
          value={criterion.label}
          placeholder="e.g. Contribution to the work"
          maxLength={PEER_CRITERION_LABEL_MAX + 10}
          onChange={(e) => onChange({ ...criterion, label: e.target.value })}
        />
        {canRemove && (
          <IconButton
            label={`Remove ${criterion.label || 'this criterion'}`}
            variant="danger"
            size="sm"
            className="mt-6"
            onClick={onRemove}
            icon={<TrashIcon className="h-4 w-4" />}
          />
        )}
      </div>

      <div className="mt-3">
        <Select
          label="Rating scale"
          value={custom ? 'custom' : presetKey || 'custom'}
          onChange={(e) => {
            if (e.target.value === 'custom') {
              setCustom(true)
              return
            }
            const p = SCALE_PRESETS.find((x) => x.key === e.target.value)
            if (p) {
              setCustom(false)
              onChange({ ...criterion, scale: p.scale })
            }
          }}
        >
          {SCALE_PRESETS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.name}
            </option>
          ))}
          <option value="custom">Custom…</option>
        </Select>
      </div>

      {(custom || presetKey === '') && (
        <div className="mt-3 space-y-2">
          {criterion.scale.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                type="number"
                aria-label="Value"
                wrapperClassName="w-20 shrink-0"
                value={String(opt.value)}
                onChange={(e) =>
                  onChange({
                    ...criterion,
                    scale: criterion.scale.map((o, j) =>
                      j === i ? { ...o, value: Number(e.target.value) } : o,
                    ),
                  })
                }
              />
              <Input
                aria-label="Label"
                wrapperClassName="min-w-0 flex-1"
                value={opt.label}
                placeholder="Label"
                onChange={(e) =>
                  onChange({
                    ...criterion,
                    scale: criterion.scale.map((o, j) =>
                      j === i ? { ...o, label: e.target.value } : o,
                    ),
                  })
                }
              />
              {criterion.scale.length > 2 && (
                <IconButton
                  label={`Remove option ${opt.value}`}
                  variant="danger"
                  size="sm"
                  onClick={() =>
                    onChange({
                      ...criterion,
                      scale: criterion.scale.filter((_, j) => j !== i),
                    })
                  }
                  icon={<TrashIcon className="h-4 w-4" />}
                />
              )}
            </div>
          ))}

          <Button
            size="sm"
            variant="outline"
            icon={<PlusIcon className="h-4 w-4" />}
            disabled={criterion.scale.length >= 10}
            onClick={() =>
              onChange({
                ...criterion,
                scale: [
                  ...criterion.scale,
                  {
                    value: (criterion.scale[criterion.scale.length - 1]?.value ?? 0) + 1,
                    label: '',
                  },
                ],
              })
            }
          >
            Add option
          </Button>

          {err && <p className="px-1 text-xs text-danger">{err}</p>}
        </div>
      )}
    </Card>
  )
}
