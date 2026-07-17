/**
 * Playful one-liner shown under each badge's real description on its detail
 * sheet. Roast-y inside-joke tone (the user's pick). Kept in code, not the DB,
 * so copy can iterate without a migration.
 *
 * Secret badges only show their flavor once unlocked (see AchievementDetailSheet).
 * A code with no entry here simply shows no flavor line — safe to leave gaps.
 */
export const ACHIEVEMENT_FLAVOR: Record<string, string> = {
  // Points
  first_steps: 'Everyone starts at zero. Look at you go.',
  point_collector: 'Gotta collect ’em all, apparently.',
  point_master: 'Okay okay, we see you.',
  recitation_regular: 'Hand permanently raised.',
  point_legend: 'Touch grass. Respectfully.',

  // Attendance
  checked_in: 'You found the QR code. Genius.',
  on_time: 'Being early is a personality trait now.',
  reliable: 'Never absent, never a problem.',
  streak_starter: 'A streak is just a habit with a scoreboard.',
  iron_attendance: 'The chair has your shape memorized.',

  // Growth
  leveling_up: 'Ding! You are now slightly better.',
  halfway_hero: 'Halfway there, fully insufferable about it.',
  top_ten: 'Officially somebody.',
  podium_finish: 'Close enough to smell first place.',
  peak_performer: 'Nobody above you. Must be lonely.',

  // Social
  picture_perfect: 'A face for the leaderboard.',
  open_book: 'We know your whole personality now.',
  show_and_tell: 'Three photos? This is a whole exhibit.',
  getting_noticed: 'People are watching. No pressure.',
  profile_icon: 'You have fans. Actual fans.',

  // Fun / secret
  curious_classmate: 'Nosy. But in a data-driven way.',
  early_bird: 'The worm never stood a chance.',
  clean_slate: 'A whole month, zero crimes. Suspicious.',
  comeback_kid: 'Down bad, then up good.',
  the_collector: 'You did NOT have to do all that.',

  // Recognition (instructor-granted)
  helping_hand: 'Certified good egg.',
  most_improved: 'From “who?” to “oh, them.”',
  rising_star: 'The glow-up is real.',
  team_player: 'Carries the group project energy.',
  class_mvp: 'The instructor’s favorite (don’t tell the others).',

  // Spending (0021)
  big_spender: 'Points are meant to be spent. Allegedly.',
  high_roller: 'Easy come, easy go.',
  town_crier: 'You said something and the whole class saw it.',
  window_shopper: 'Added to cart. Removed from cart. Classic.',
}
