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
  type PeerGroup,
  type PeerScaleOption,
} from '@/lib/types'
import { useInstructor } from './InstructorLayout'

interface DraftCriterion {
  /** Client-side only, so React keys survive a reorder. Never sent. */
  key: string
  label: string
  scale: PeerScaleOption[]
}

/**
 * One section's groups, fetched the first time that section is ticked. The
 * lib's shape widened to the full group, which the picker needs for names.
 */
interface SectionGroups extends SectionGroupState {
  groups: PeerGroup[]
}

let seq = 0
function newCriterion(): DraftCriterion {
  seq += 1
  return { key: `c${seq}`, label: '', scale: SCALE_PRESETS[0].scale }
}

/**
 * Create an evaluation.
 *
 * ── CREATE IS OPEN IS NOTIFY ───────────────────────────────────────────────
 * There is no draft state: criteria and sections arrive with the evaluation in
 * one RPC, so there is never a window where a student can open one and find it
 * empty. That also means creating it pushes a notification, and a push cannot
 * be recalled — hence the ConfirmDialog, and hence it names the sections rather
 * than saying "your students".
 *
 * ── EDITING IS DELIBERATELY NOT HERE ───────────────────────────────────────
 * `update_peer_evaluation` locks criteria and scope the moment anyone submits,
 * and the title/instructions/deadline that stay editable are edited from the
 * evaluation's own screen where the submission count is visible. A composer
 * that sometimes refuses half its own fields is a worse explanation of that
 * rule than the screen that shows why.
 */
export function PeerComposer({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
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

  /**
   * Groups per ticked section, and the ones the instructor UNticked.
   *
   * The inverse set is deliberate. Groups appear pre-ticked (the instructor's
   * call), so storing what was REMOVED means a section whose groups arrive a
   * moment later is ticked by default with no effect to reconcile it — and
   * "nothing unticked" is exactly the signal to send no group list at all.
   */
  const [groupsBySection, setGroupsBySection] = useState<Record<string, SectionGroups>>({})
  const [unpicked, setUnpicked] = useState<Set<string>>(new Set())
  const requested = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!open) return
    // Groups can change between opens (the Groups tab is one tap away), so a
    // reopened composer fetches them fresh rather than trusting the last copy.
    requested.current = new Set()
    setGroupsBySection({})
    setUnpicked(new Set())
    setSubjectId(subjects[0]?.id ?? '')
    setTitle('')
    setInstructions('')
    setScope('group')
    setPicked(new Set())
    setCriteria([newCriterion()])
    setDeadline('')
  }, [open, subjects])

  /**
   * Only sections that actually take the chosen subject.
   *
   * The RPC refuses the others anyway, so offering them would be an error
   * message where a shorter list would do.
   */
  const eligible = useMemo(
    () => sections.filter((s) => (sectionSubjects[s.id] ?? []).includes(subjectId)),
    [sections, sectionSubjects, subjectId],
  )

  // Picking a different subject can strip a section's eligibility, and a
  // silently-still-ticked invisible section is how you send an evaluation to a
  // class you did not mean to.
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
    } catch {
      setGroupsBySection((prev) => ({ ...prev, [sectionId]: { status: 'error', groups: [] } }))
    }
  }, [])

  // Fetched lazily, the first time a section is ticked while scope is groups.
  // A ref rather than state tracks what was asked for, so a tick that re-renders
  // before the answer lands does not fire the same request twice.
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

  /**
   * What the evaluation will actually be aimed at. The rule lives in
   * `lib/peer-audience.ts` and is pinned by its test, because getting it wrong
   * sends an evaluation to the wrong students with nothing on screen to show it.
   */
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

  // The chosen groups as full objects, for the confirm dialog's wording.
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

  // Two sections can each have a "Team Alpha", so the section is named beside
  // the group whenever more than one section is in play.
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
        // datetime-local gives a string with no zone. `new Date()` reads it in
        // the device's zone, which is Manila for the one person using this
        // screen, and toISOString then sends a real instant.
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
      <Sheet open={open} onClose={onClose} title="New peer evaluation">
        <div className="space-y-4">
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

/**
 * The groups inside one ticked section (0052).
 *
 * Every group starts ticked, so leaving this alone aims the evaluation at the
 * whole section's teams exactly as before. Unticking narrows it, and the members
 * of an unticked group never see the evaluation at all (the instructor's call).
 *
 * The member count is shown because a group of one has nobody to rate: ticking
 * it reaches that student with a form that can only say so.
 */
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
        {/* The fast path for "just one team out of eight": clear, then tick it. */}
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

/**
 * One criterion: a label, a preset picker, and the rows the preset filled in.
 *
 * The presets are not a separate concept — picking one just fills the editor,
 * and every row stays editable afterwards. So the database knows nothing about
 * presets and adding one costs a line in `peer-scale.ts`.
 */
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

  // Which preset, if any, this scale currently matches. Compared by value so a
  // scale that was edited back to a preset's exact shape stops reading as
  // custom.
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
                  // One above the current top, which is the only value that
                  // cannot break the ascending rule the moment it appears.
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
