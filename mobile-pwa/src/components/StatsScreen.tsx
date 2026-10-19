import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Flame,
  Clock,
  Calendar,
  Target,
  TrendingUp,
  BookOpen,
  Award,
  ChevronRight,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { calculateReadingStats, type ReadingStatsSummary, type BookStat } from '../services/statsService';
import { saveSettings } from '../services/db';
import type { ReaderSettings } from '../types';

interface StatsScreenProps {
  settings: ReaderSettings;
  onUpdateSettings: (newSettings: Partial<ReaderSettings>) => void;
  onClose: () => void;
}

export const StatsScreen: React.FC<StatsScreenProps> = ({
  settings,
  onUpdateSettings,
  onClose,
}) => {
  const [stats, setStats] = useState<ReadingStatsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'books'>('overview');
  const [goalInput, setGoalInput] = useState(settings.dailyGoalMinutes || 15);

  const loadData = useCallback(async () => {
    try {
      const summary = await calculateReadingStats();
      setStats(summary);
    } catch (err) {
      console.error('Failed to calculate reading stats:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleUpdateGoal = async (minutes: number) => {
    const valid = Math.max(1, Math.min(240, minutes));
    setGoalInput(valid);
    onUpdateSettings({ dailyGoalMinutes: valid });
    await saveSettings({ dailyGoalMinutes: valid });
    // Recalculate stats with new goal
    const updated = await calculateReadingStats();
    setStats(updated);
  };

  // Determine maximum minutes for bar chart scaling
  const maxBarMinutes = Math.max(
    settings.dailyGoalMinutes || 15,
    ...(stats?.last7Days.map((d) => d.minutes) || [15])
  ) * 1.15; // 15% headroom

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/75 backdrop-blur-md animate-fade-in">
      <div
        className="w-full max-w-2xl max-h-[92vh] flex flex-col rounded-2xl bg-[#18181b] border border-white/10 shadow-2xl overflow-hidden text-zinc-100"
        role="dialog"
        aria-modal="true"
        aria-label="Reading Statistics"
      >
        {/* Top Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-[#202024]/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold tracking-wide text-white">Reading Stats & Insights</h2>
              <p className="text-xs text-zinc-400">Track your daily pace, streak, and book completion</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Close stats"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-white/10 px-5 pt-2 gap-2 bg-[#1a1a1e]">
          <button
            onClick={() => setActiveTab('overview')}
            className={`pb-2.5 px-3 text-xs font-medium border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'overview'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            Overview & 7-Day Chart
          </button>
          <button
            onClick={() => setActiveTab('books')}
            className={`pb-2.5 px-3 text-xs font-medium border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'books'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Book Estimates ({stats?.bookStats.length || 0})
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3 text-zinc-400">
              <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm">Calculating your reading stats...</p>
            </div>
          ) : stats ? (
            <>
              {activeTab === 'overview' ? (
                <>
                  {/* Top 3 Cards Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Today's Reading Card */}
                    <div className="bg-gradient-to-br from-indigo-950/40 to-zinc-900 border border-indigo-500/20 rounded-xl p-4 flex flex-col justify-between relative overflow-hidden">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-indigo-300 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-indigo-400" />
                          Today's Reading
                        </span>
                        {stats.todayMinutes >= stats.dailyGoalMinutes && (
                          <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-semibold px-1.5 py-0.5 rounded-full flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Met
                          </span>
                        )}
                      </div>
                      <div className="my-1">
                        <div className="text-2xl font-bold tracking-tight text-white flex items-baseline gap-1">
                          {stats.todayMinutes}
                          <span className="text-xs font-normal text-zinc-400">min</span>
                        </div>
                        <div className="text-[11px] text-zinc-400 mt-0.5">
                          Goal: {stats.dailyGoalMinutes} min ({stats.todayGoalPercent}%)
                        </div>
                      </div>
                      {/* Mini Goal Progress Bar */}
                      <div className="w-full bg-zinc-800 rounded-full h-1.5 mt-2 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            stats.todayGoalPercent >= 100
                              ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                              : 'bg-gradient-to-r from-indigo-500 to-purple-500'
                          }`}
                          style={{ width: `${Math.min(100, stats.todayGoalPercent)}%` }}
                        />
                      </div>
                    </div>

                    {/* Streak Card */}
                    <div className="bg-gradient-to-br from-amber-950/30 to-zinc-900 border border-amber-500/20 rounded-xl p-4 flex flex-col justify-between">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-amber-300 flex items-center gap-1.5">
                          <Flame className="w-3.5 h-3.5 text-amber-400 fill-amber-400/30" />
                          Current Streak
                        </span>
                        {stats.currentStreakDays > 0 && (
                          <span className="text-[10px] bg-amber-500/20 text-amber-300 font-semibold px-1.5 py-0.5 rounded-full">
                            Active 🔥
                          </span>
                        )}
                      </div>
                      <div className="my-1">
                        <div className="text-2xl font-bold tracking-tight text-white flex items-baseline gap-1">
                          {stats.currentStreakDays}
                          <span className="text-xs font-normal text-zinc-400">
                            {stats.currentStreakDays === 1 ? 'day' : 'days'}
                          </span>
                        </div>
                        <div className="text-[11px] text-zinc-400 mt-0.5">
                          {stats.currentStreakDays > 0
                            ? 'Keep up the daily habit!'
                            : 'Read today to start your streak!'}
                        </div>
                      </div>
                      <div className="text-[10px] text-amber-400/80 font-medium mt-2">
                        {stats.todayMinutes > 0 ? '✓ Extended today' : '• Read now to maintain'}
                      </div>
                    </div>

                    {/* 7-Day Pace Card */}
                    <div className="bg-gradient-to-br from-purple-950/30 to-zinc-900 border border-purple-500/20 rounded-xl p-4 flex flex-col justify-between">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-purple-300 flex items-center gap-1.5">
                          <TrendingUp className="w-3.5 h-3.5 text-purple-400" />
                          7-Day Pace
                        </span>
                      </div>
                      <div className="my-1">
                        <div className="text-2xl font-bold tracking-tight text-white flex items-baseline gap-1">
                          {stats.dailyPaceMinutes}
                          <span className="text-xs font-normal text-zinc-400">min/day</span>
                        </div>
                        <div className="text-[11px] text-zinc-400 mt-0.5">
                          {stats.last7DaysTotalMinutes} min total this week
                        </div>
                      </div>
                      <div className="text-[10px] text-purple-400/80 font-medium mt-2">
                        Used to estimate completion dates
                      </div>
                    </div>
                  </div>

                  {/* 7-Day Bar Chart */}
                  <div className="bg-[#202024]/70 border border-white/10 rounded-xl p-4 sm:p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
                          <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                          Last 7 Days Activity
                        </h3>
                        <p className="text-[11px] text-zinc-400">Daily minutes read & goal completion</p>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-zinc-400">
                        <span className="flex items-center gap-1">
                          <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500 inline-block" /> Read
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" /> Goal met
                        </span>
                      </div>
                    </div>

                    {/* Chart Container */}
                    <div className="relative pt-6 pb-2">
                      {/* Goal Reference Line */}
                      {maxBarMinutes > 0 && (
                        <div
                          className="absolute left-0 right-0 border-b border-dashed border-indigo-400/40 z-10 pointer-events-none flex items-center justify-end"
                          style={{
                            bottom: `${Math.min(95, Math.max(10, ((settings.dailyGoalMinutes || 15) / maxBarMinutes) * 160))}px`,
                          }}
                        >
                          <span className="text-[9px] font-semibold text-indigo-300 bg-[#202024] px-1.5 py-0.5 rounded border border-indigo-500/30 mr-1 shadow-sm">
                            Goal: {settings.dailyGoalMinutes}m
                          </span>
                        </div>
                      )}

                      {/* Bars row */}
                      <div className="flex items-end justify-between gap-2 sm:gap-4 h-44 px-1">
                        {stats.last7Days.map((day) => {
                          const heightPct = Math.min(100, Math.max(day.minutes > 0 ? 6 : 2, (day.minutes / maxBarMinutes) * 100));
                          const isGoalMet = day.minutes >= (settings.dailyGoalMinutes || 15);

                          return (
                            <div key={day.date} className="flex-1 flex flex-col items-center h-full justify-end group">
                              {/* Hover / static label above bar */}
                              <div className="text-[10px] font-medium text-zinc-300 mb-1 transition-opacity">
                                {day.minutes > 0 ? `${day.minutes}m` : '0m'}
                              </div>

                              {/* The visual bar */}
                              <div className="w-full max-w-[36px] bg-zinc-800/80 rounded-t-lg relative flex items-end overflow-hidden h-36">
                                <div
                                  className={`w-full rounded-t-lg transition-all duration-500 ${
                                    day.isToday
                                      ? isGoalMet
                                        ? 'bg-gradient-to-t from-teal-600 to-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.3)]'
                                        : 'bg-gradient-to-t from-indigo-600 to-indigo-400 shadow-[0_0_12px_rgba(99,102,241,0.3)]'
                                      : isGoalMet
                                      ? 'bg-gradient-to-t from-emerald-600 to-emerald-400'
                                      : day.minutes > 0
                                      ? 'bg-gradient-to-t from-indigo-700 to-indigo-500'
                                      : 'bg-transparent'
                                  }`}
                                  style={{ height: `${heightPct}%` }}
                                />
                              </div>

                              {/* Bottom weekday label */}
                              <div className="mt-2 text-center">
                                <div
                                  className={`text-[11px] font-medium ${
                                    day.isToday ? 'text-indigo-400 font-bold' : 'text-zinc-400'
                                  }`}
                                >
                                  {day.isToday ? 'Today' : day.label}
                                </div>
                                <div className="text-[9px] text-zinc-400">{day.fullDate}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Daily Goal Setting Section */}
                  <div className="bg-[#202024]/70 border border-white/10 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                        <Target className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-white">Daily Reading Goal</div>
                        <div className="text-[11px] text-zinc-400">
                          Target reading time per day. Shows progress ring in the top bar.
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {[10, 15, 20, 30, 45, 60].map((min) => (
                        <button
                          key={min}
                          onClick={() => handleUpdateGoal(min)}
                          className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-all ${
                            (settings.dailyGoalMinutes || 15) === min
                              ? 'bg-indigo-600 text-white font-semibold shadow-md shadow-indigo-600/30'
                              : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white'
                          }`}
                        >
                          {min}m
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                /* Books Tab: Minutes per book & Estimated finish date */
                <div className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <p className="text-xs text-zinc-400">
                      Estimated finish dates are calculated based on your 7-day pace (
                      <span className="text-indigo-400 font-semibold">
                        {stats.dailyPaceMinutes >= 2
                          ? `${stats.dailyPaceMinutes} min/day`
                          : `${settings.dailyGoalMinutes || 15} min/day default goal`}
                      </span>
                      ) and your reading speed.
                    </p>
                  </div>

                  {stats.bookStats.length === 0 ? (
                    <div className="py-12 text-center text-zinc-400 text-xs">
                      No books in your library yet. Add books to start tracking reading pace!
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {stats.bookStats.map((b) => (
                        <div
                          key={b.bookId}
                          className="bg-[#202024]/80 border border-white/10 rounded-xl p-3.5 hover:border-white/20 transition-all flex flex-col gap-2.5"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                                  {b.format}
                                </span>
                                <h4 className="text-sm font-semibold text-white truncate">{b.bookTitle}</h4>
                              </div>
                              {b.author && (
                                <p className="text-xs text-zinc-400 mt-0.5 truncate">{b.author}</p>
                              )}
                            </div>

                            {/* Reading Minutes Badge */}
                            <div className="text-right shrink-0">
                              <div className="text-sm font-bold text-indigo-300 flex items-center gap-1 justify-end">
                                <Clock className="w-3.5 h-3.5 text-indigo-400" />
                                {b.minutes} <span className="text-xs font-normal text-zinc-400">min</span>
                              </div>
                              <div className="text-[10px] text-zinc-400">{b.percentage}% read</div>
                            </div>
                          </div>

                          {/* Progress bar */}
                          <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="bg-indigo-500 h-full rounded-full transition-all"
                              style={{ width: `${Math.min(100, Math.max(0, b.percentage))}%` }}
                            />
                          </div>

                          {/* Estimated finish date info */}
                          <div className="flex items-center justify-between text-xs pt-0.5">
                            <div className="flex items-center gap-1.5 text-zinc-400">
                              <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                              <span>Estimated finish:</span>
                              <span
                                className={`font-medium ${
                                  b.percentage >= 100
                                    ? 'text-emerald-400'
                                    : b.estimatedDays && b.estimatedDays <= 3
                                    ? 'text-amber-400'
                                    : 'text-zinc-200'
                                }`}
                              >
                                {b.estimatedFinishText}
                              </span>
                            </div>
                            {b.pageCount > 0 && (
                              <span className="text-[11px] text-zinc-400">
                                {b.pageCount} pages
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="py-12 text-center text-zinc-400 text-xs">
              Unable to load statistics.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/10 bg-[#202024]/80 flex items-center justify-between text-xs text-zinc-400">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>Reading timer automatically pauses after 60s of inactivity.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
