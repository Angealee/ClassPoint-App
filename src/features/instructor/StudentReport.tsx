import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getStudent, listMyAttendance } from '@/lib/api'
import { getLevelProgress } from '@/lib/leveling'
import { TERM_START, groupByWeek, weekLabel } from '@/lib/term'
import type { InstructorStudentDetail, MyAttendanceEntry } from '@/lib/types'

const NEUTRAL = new Set(['excused', 'irregular'])

const longDate = (iso: string | Date) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
const clock = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '—'
const STATUS_LABEL: Record<string, string> = {
  present: 'Present',
  late: 'Late',
  absent: 'Absent',
  excused: 'Excused',
  irregular: 'Irregular',
}

/**
 * A formal, printable attendance record. A DEDICATED route OUTSIDE the app
 * shell so there's no nav/theme to fight: hardcoded light styles (dark mode
 * can't leak), a screen-only toolbar, and the browser's own print → paper/PDF.
 */
export function StudentReport() {
  const { studentId = '' } = useParams()
  const navigate = useNavigate()
  const [student, setStudent] = useState<InstructorStudentDetail | null>(null)
  const [attendance, setAttendance] = useState<MyAttendanceEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    Promise.all([getStudent(studentId), listMyAttendance(studentId)])
      .then(([s, att]) => {
        if (cancelled) return
        setStudent(s)
        // Oldest-first for a paper register.
        setAttendance([...att].sort((a, b) => a.startedAt.localeCompare(b.startedAt)))
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [studentId])

  const stats = useMemo(() => {
    const c = { present: 0, late: 0, absent: 0, excused: 0, irregular: 0, counted: 0 }
    for (const a of attendance) {
      c[a.status]++
      if (!NEUTRAL.has(a.status)) c.counted++
    }
    const rate = c.counted ? Math.round(((c.present + c.late) / c.counted) * 100) : null
    return { ...c, rate }
  }, [attendance])

  const weeks = useMemo(() => {
    // groupByWeek is newest-first; reverse for oldest-first paper order.
    return [...groupByWeek(attendance, (a) => a.startedAt)].reverse()
  }, [attendance])

  if (loading) {
    return <div style={{ padding: 40, fontFamily: 'sans-serif', color: '#555' }}>Loading…</div>
  }
  if (!student) {
    return (
      <div style={{ padding: 40, fontFamily: 'sans-serif' }}>
        That student no longer exists.{' '}
        <button onClick={() => navigate(-1)} style={{ textDecoration: 'underline' }}>
          Back
        </button>
      </div>
    )
  }

  const level = getLevelProgress(student.lifetimePoints).level

  return (
    <>
      {/* Screen-only toolbar (hidden when printing). */}
      <div className="report-toolbar">
        <button type="button" onClick={() => navigate(-1)} className="report-btn report-btn-ghost">
          ← Back
        </button>
        <button type="button" onClick={() => window.print()} className="report-btn report-btn-primary">
          Print
        </button>
      </div>

      {/* Hardcoded light styles — theme-independent, print-safe. */}
      <style>{`
        .report-toolbar {
          display: flex; justify-content: space-between; gap: 8px;
          padding: 12px 16px; max-width: 800px; margin: 0 auto;
        }
        .report-btn { height: 40px; padding: 0 20px; border-radius: 10px; font-size: 14px; font-weight: 500; cursor: pointer; border: none; }
        .report-btn-primary { background: #e11d2a; color: #fff; }
        .report-btn-ghost { background: transparent; color: #333; border: 1px solid #ccc; }
        .report-page {
          max-width: 800px; margin: 0 auto; padding: 32px 40px;
          background: #fff; color: #111; font-family: Inter, Arial, sans-serif;
        }
        .report-page h1 { font-size: 22px; font-weight: 800; margin: 0; }
        .report-muted { color: #555; }
        .report-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .report-table th, .report-table td { border: 1px solid #ddd; padding: 5px 8px; text-align: left; }
        .report-table th { background: #f4f4f5; font-weight: 600; }
        .report-week { break-inside: avoid; margin-top: 14px; }
        .report-week h3 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: #666; margin: 0 0 4px; }
        @media print {
          .report-toolbar { display: none !important; }
          .report-page { max-width: none; margin: 0; padding: 0; }
          thead { display: table-header-group; }
          @page { size: A4; margin: 14mm; }
        }
      `}</style>

      <div className="report-page">
        {/* Header — "Attendance Record — {Section}" (per the chosen title). */}
        <div style={{ borderBottom: '2px solid #111', paddingBottom: 12, marginBottom: 16 }}>
          <h1>Attendance Record — {student.sectionName}</h1>
          <p style={{ margin: '2px 0 0', fontSize: 12, fontWeight: 600, color: '#444' }}>
            DCT — College of Computer Studies
          </p>
          <p style={{ margin: '8px 0 0', fontSize: 15, fontWeight: 600 }}>{student.fullName}</p>
          <p className="report-muted" style={{ margin: '2px 0 0', fontSize: 12 }}>
            Term beginning {longDate(TERM_START)} · Generated {longDate(new Date())}
          </p>
        </div>

        {/* Summary band */}
        <div
          style={{
            display: 'flex',
            gap: 20,
            flexWrap: 'wrap',
            fontSize: 13,
            marginBottom: 6,
            padding: '10px 14px',
            background: '#fafafa',
            border: '1px solid #eee',
            borderRadius: 8,
          }}
        >
          <span>
            <strong>{stats.counted}</strong> sessions counted
          </span>
          <span>Present <strong>{stats.present}</strong></span>
          <span>Late <strong>{stats.late}</strong></span>
          <span>Absent <strong>{stats.absent}</strong></span>
          {stats.excused > 0 && <span>Excused <strong>{stats.excused}</strong></span>}
          <span>
            Attendance rate <strong>{stats.rate === null ? '—' : `${stats.rate}%`}</strong>
          </span>
          <span className="report-muted">
            Points {student.lifetimePoints} · Level {level}
          </span>
        </div>

        {/* Register, by week */}
        {attendance.length === 0 ? (
          <p className="report-muted" style={{ fontSize: 13 }}>No sessions recorded this term.</p>
        ) : (
          weeks.map((w) => (
            <div key={w.week} className="report-week">
              <h3>{weekLabel(w.week)}</h3>
              <table className="report-table">
                <thead>
                  <tr>
                    <th style={{ width: 90 }}>Date</th>
                    <th>Topic</th>
                    <th style={{ width: 90 }}>Status</th>
                    <th style={{ width: 90 }}>Checked in</th>
                  </tr>
                </thead>
                <tbody>
                  {[...w.items]
                    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
                    .map((a) => (
                      <tr key={a.recordId}>
                        <td>{shortDate(a.startedAt)}</td>
                        <td>{a.topic || '—'}</td>
                        <td>{STATUS_LABEL[a.status] ?? a.status}</td>
                        <td>{clock(a.scannedAt)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ))
        )}

        {/* Footer — signature block */}
        <div style={{ marginTop: 36, display: 'flex', gap: 48, fontSize: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ borderTop: '1px solid #111', paddingTop: 4 }}>Instructor signature · Date</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ borderTop: '1px solid #111', paddingTop: 4 }}>
              Parent / Guardian signature · Date
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
