import type { Book, BookFormat, ReadingProgress, ReadingSession } from '../types';
import { getAllBooks, getAllProgress, getAllSessions, getSettings } from './db';

export interface DayBarData {
  date: string; // 'YYYY-MM-DD'
  label: string; // 'Mon', 'Tue', etc.
  fullDate: string; // formatted e.g. 'Oct 19'
  minutes: number;
  seconds: number;
  isToday: boolean;
  reachedGoal: boolean;
  percentageOfGoal: number;
}

export interface BookStat {
  bookId: string;
  bookTitle: string;
  author: string;
  format: BookFormat;
  minutes: number;
  percentage: number;
  pageCount: number;
  estimatedFinishText: string;
  estimatedDays: number | null;
}

export interface ReadingStatsSummary {
  todayMinutes: number;
  todaySeconds: number;
  dailyGoalMinutes: number;
  todayGoalPercent: number;
  currentStreakDays: number;
  last7Days: DayBarData[];
  last7DaysTotalMinutes: number;
  dailyPaceMinutes: number;
  bookStats: BookStat[];
}

function toLocalDateStr(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatFinishDate(days: number): string {
  if (days <= 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  const target = new Date();
  target.setDate(target.getDate() + days);
  const monthDay = target.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `In ${days} days (${monthDay})`;
}

export async function calculateReadingStats(): Promise<ReadingStatsSummary> {
  const [sessions, books, allProgress, settings] = await Promise.all([
    getAllSessions(),
    getAllBooks(),
    getAllProgress(),
    getSettings(),
  ]);

  const dailyGoalMinutes = settings.dailyGoalMinutes || 15;
  const now = new Date();
  const todayStr = toLocalDateStr(now);

  // Group sessions by local date string
  const sessionsByDate = new Map<string, number>();
  const sessionsByBook = new Map<string, number>();

  for (const s of sessions) {
    if (!s.seconds || s.seconds <= 0) continue;
    try {
      const sDate = new Date(s.start);
      const dStr = toLocalDateStr(sDate);
      sessionsByDate.set(dStr, (sessionsByDate.get(dStr) || 0) + s.seconds);
    } catch (_) {
      // Ignore invalid date
    }

    if (s.book_id) {
      sessionsByBook.set(s.book_id, (sessionsByBook.get(s.book_id) || 0) + s.seconds);
    }
  }

  // 1. Today's reading time
  const todaySeconds = sessionsByDate.get(todayStr) || 0;
  const todayMinutes = Math.round((todaySeconds / 60) * 10) / 10;
  const todayGoalPercent = Math.min(100, Math.round((todayMinutes / dailyGoalMinutes) * 100));

  // 2. Current streak in days
  let currentStreakDays = 0;
  const hasReadToday = (sessionsByDate.get(todayStr) || 0) > 0;

  if (hasReadToday) {
    currentStreakDays = 1;
    let checkDate = new Date(now);
    while (true) {
      checkDate.setDate(checkDate.getDate() - 1);
      const prevStr = toLocalDateStr(checkDate);
      if ((sessionsByDate.get(prevStr) || 0) > 0) {
        currentStreakDays++;
      } else {
        break;
      }
    }
  } else {
    // Check if streak was maintained through yesterday
    let checkDate = new Date(now);
    checkDate.setDate(checkDate.getDate() - 1);
    const yesterdayStr = toLocalDateStr(checkDate);
    if ((sessionsByDate.get(yesterdayStr) || 0) > 0) {
      currentStreakDays = 1;
      while (true) {
        checkDate.setDate(checkDate.getDate() - 1);
        const prevStr = toLocalDateStr(checkDate);
        if ((sessionsByDate.get(prevStr) || 0) > 0) {
          currentStreakDays++;
        } else {
          break;
        }
      }
    } else {
      currentStreakDays = 0;
    }
  }

  // 3. Last 7 days as bar chart
  const last7Days: DayBarData[] = [];
  let last7DaysTotalSeconds = 0;

  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = toLocalDateStr(d);
    const daySec = sessionsByDate.get(dateStr) || 0;
    last7DaysTotalSeconds += daySec;
    const dayMin = Math.round((daySec / 60) * 10) / 10;
    const isToday = i === 0;
    const reachedGoal = dayMin >= dailyGoalMinutes;
    const percentageOfGoal = Math.min(100, Math.round((dayMin / dailyGoalMinutes) * 100));

    last7Days.push({
      date: dateStr,
      label: d.toLocaleDateString(undefined, { weekday: 'short' }),
      fullDate: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      minutes: dayMin,
      seconds: daySec,
      isToday,
      reachedGoal,
      percentageOfGoal,
    });
  }

  const last7DaysTotalMinutes = Math.round((last7DaysTotalSeconds / 60) * 10) / 10;
  // Daily pace based on last 7 days average (seconds per day)
  const last7DaysDailyPaceSeconds = last7DaysTotalSeconds / 7;
  const dailyPaceMinutes = Math.round((last7DaysDailyPaceSeconds / 60) * 10) / 10;

  // Effective daily pace for estimation (use last 7 days pace if >= 2 mins, else fallback to dailyGoal)
  const effectiveDailyPaceSeconds = last7DaysDailyPaceSeconds >= 120 
    ? last7DaysDailyPaceSeconds 
    : dailyGoalMinutes * 60;

  // 4 & 5. Minutes per book and Estimated finish date per book
  const progressMap = new Map<string, ReadingProgress>();
  for (const p of allProgress) {
    progressMap.set(p.bookId, p);
  }

  const bookStats: BookStat[] = books.map((b) => {
    const bookSeconds = sessionsByBook.get(b.id) || 0;
    const minutes = Math.round((bookSeconds / 60) * 10) / 10;
    const prog = progressMap.get(b.id);
    const percentage = prog ? Math.round(prog.percentage || 0) : 0;

    let estimatedFinishText = '—';
    let estimatedDays: number | null = null;

    if (percentage >= 100) {
      estimatedFinishText = 'Completed';
      estimatedDays = 0;
    } else {
      // Calculate remaining reading time
      let remainingSecondsNeeded = 0;

      if (percentage > 0 && bookSeconds >= 60) {
        // User has reading history on this book
        const totalEstimatedBookSeconds = (bookSeconds / (percentage / 100));
        remainingSecondsNeeded = Math.max(0, totalEstimatedBookSeconds - bookSeconds);
      } else {
        // Estimate based on page count (average 1.5 minutes / 90s per page)
        const pages = b.pageCount && b.pageCount > 0 ? b.pageCount : 150;
        const remainingPages = Math.max(1, Math.round(pages * (1 - percentage / 100)));
        remainingSecondsNeeded = remainingPages * 90;
      }

      if (remainingSecondsNeeded > 0) {
        const days = Math.max(1, Math.ceil(remainingSecondsNeeded / effectiveDailyPaceSeconds));
        estimatedDays = days;
        estimatedFinishText = formatFinishDate(days);
      }
    }

    return {
      bookId: b.id,
      bookTitle: b.title,
      author: b.author,
      format: b.format,
      minutes,
      percentage,
      pageCount: b.pageCount || 0,
      estimatedFinishText,
      estimatedDays,
    };
  });

  // Sort books: books with reading time first, then by percentage
  bookStats.sort((a, b) => b.minutes - a.minutes || b.percentage - a.percentage);

  return {
    todayMinutes,
    todaySeconds,
    dailyGoalMinutes,
    todayGoalPercent,
    currentStreakDays,
    last7Days,
    last7DaysTotalMinutes,
    dailyPaceMinutes,
    bookStats,
  };
}
