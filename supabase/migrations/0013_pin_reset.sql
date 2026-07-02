-- ============================================================================
-- ClassPoint · 0013 · PIN reset (instructor-issued reset code)
-- Run after 0012.
--
-- Students log in with a synthetic email + PIN, so there is no inbox to send a
-- Supabase reset link to. Instead the instructor issues a one-time, expiring
-- reset code from the roster; the student redeems it on the /reset page and the
-- `reset-pin` Edge Function (service role) sets the new PIN. Mirrors the
-- existing claim-token flow.
-- ============================================================================

alter table public.student_secrets
  add column if not exists reset_token      text,
  add column if not exists reset_expires_at timestamptz;

-- Fast, collision-safe lookup by an outstanding reset code.
create unique index if not exists student_secrets_reset_token_idx
  on public.student_secrets (reset_token) where reset_token is not null;

-- Instructor: issue a fresh reset code for a claimed student.
-- Only meaningful once claimed — an unclaimed student uses their claim token,
-- so there is no account/PIN to reset yet.
create or replace function public.reset_student_pin(p_student_id uuid)
returns table (reset_token text, reset_expires_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token   text;
  v_expires timestamptz := now() + interval '24 hours';
  v_claimed timestamptz;
  v_user    uuid;
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can reset a PIN.';
  end if;

  select ss.claimed_at, s.user_id
    into v_claimed, v_user
    from public.student_secrets ss
    join public.students s on s.id = ss.student_id
   where ss.student_id = p_student_id;

  if not found then
    raise exception 'Student not found.';
  end if;
  if v_claimed is null or v_user is null then
    raise exception 'This student has not claimed their account yet — share their claim token instead.';
  end if;

  v_token := public.cp_generate_token();

  update public.student_secrets
     set reset_token = v_token,
         reset_expires_at = v_expires
   where student_id = p_student_id;

  return query select v_token, v_expires;
end;
$$;

grant execute on function public.reset_student_pin(uuid) to authenticated;
