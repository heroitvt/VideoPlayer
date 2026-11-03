import React, { useState, useRef, useEffect } from 'react';
import { Calendar as CalendarIcon, Clock, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatVietnamTime } from '@signage/shared';

interface SchedulePickerProps {
  label: string;
  value: string;
  placeholder: string;
  onChange: (val: string) => void;
  isExpiry?: boolean;
}

const DAYS_VI = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

export function SchedulePicker({ label, value, placeholder, onChange, isExpiry }: SchedulePickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const parsedDate = value ? new Date(value) : new Date();
  const validDate = isNaN(parsedDate.getTime()) ? new Date() : parsedDate;

  const [viewYear, setViewYear] = useState(validDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(validDate.getMonth());
  const [hour, setHour] = useState(value ? validDate.getHours() : isExpiry ? 23 : 8);
  const [minute, setMinute] = useState(value ? validDate.getMinutes() : isExpiry ? 59 : 0);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const applyDate = (year: number, month: number, day: number, h: number, m: number) => {
    const d = new Date(year, month, day, h, m, 0, 0);
    onChange(d.toISOString());
  };

  const handleSelectDay = (day: number) => {
    applyDate(viewYear, viewMonth, day, hour, minute);
    setOpen(false);
  };

  const handleTimeChange = (newH: number, newM: number) => {
    setHour(newH);
    setMinute(newM);
    if (value) {
      const cur = new Date(value);
      applyDate(cur.getFullYear(), cur.getMonth(), cur.getDate(), newH, newM);
    } else {
      const now = new Date();
      applyDate(now.getFullYear(), now.getMonth(), now.getDate(), newH, newM);
    }
  };

  const setRelativeDays = (daysAhead: number, h: number, m: number) => {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    d.setHours(h, m, 0, 0);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setHour(h);
    setMinute(m);
    onChange(d.toISOString());
    setOpen(false);
  };

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const selectedDay =
    value && validDate.getFullYear() === viewYear && validDate.getMonth() === viewMonth
      ? validDate.getDate()
      : null;

  return (
    <div ref={containerRef} className="relative space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-300 font-medium flex items-center gap-1.5">
          <CalendarIcon className="w-3.5 h-3.5 text-sky-400" />
          {label}
        </span>
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="text-slate-400 hover:text-red-400 flex items-center gap-0.5"
          >
            <X className="w-3 h-3" />
            <span>Xóa</span>
          </button>
        )}
      </div>

      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between bg-slate-900 border border-slate-700 hover:border-sky-500 rounded-lg px-3 py-2 text-left transition"
      >
        <span className={value ? 'text-sky-300 font-medium text-xs' : 'text-slate-500 italic text-xs'}>
          {value ? formatVietnamTime(value) : placeholder}
        </span>
        <CalendarIcon className="w-4 h-4 text-sky-400 shrink-0 ml-2" />
      </button>

      {/* Popover Calendar */}
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-3 space-y-3">
          {/* Month / Year Navigation */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <button
              type="button"
              onClick={prevMonth}
              className="p-1 hover:bg-slate-800 rounded text-slate-300"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-bold text-slate-200">
              Tháng {viewMonth + 1} / {viewYear}
            </span>
            <button
              type="button"
              onClick={nextMonth}
              className="p-1 hover:bg-slate-800 rounded text-slate-300"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Days of Week Header */}
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-slate-400">
            {DAYS_VI.map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>

          {/* Calendar Day Grid */}
          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {Array.from({ length: firstDayOfMonth }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, idx) => {
              const day = idx + 1;
              const isSelected = selectedDay === day;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => handleSelectDay(day)}
                  className={`py-1.5 rounded-md font-medium transition ${
                    isSelected
                      ? 'bg-sky-600 text-white font-bold'
                      : 'text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Time Selector (Hour : Minute) */}
          <div className="flex items-center justify-between border-t border-slate-800 pt-2 text-xs">
            <span className="text-slate-400 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-sky-400" />
              Giờ (VN):
            </span>
            <div className="flex items-center gap-1">
              <select
                value={hour}
                onChange={(e) => handleTimeChange(Number(e.target.value), minute)}
                className="bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-white"
              >
                {Array.from({ length: 24 }).map((_, h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, '0')}g
                  </option>
                ))}
              </select>
              <span>:</span>
              <select
                value={minute}
                onChange={(e) => handleTimeChange(hour, Number(e.target.value))}
                className="bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-white"
              >
                {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 59].map((m) => (
                  <option key={m} value={m}>
                    {String(m).padStart(2, '0')}p
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Quick Presets */}
          <div className="flex flex-wrap gap-1 border-t border-slate-800 pt-2">
            {!isExpiry ? (
              <>
                <button
                  type="button"
                  onClick={() => setRelativeDays(0, new Date().getHours(), new Date().getMinutes())}
                  className="text-[10px] bg-slate-800 hover:bg-slate-700 text-sky-300 px-2 py-1 rounded"
                >
                  Ngay bây giờ
                </button>
                <button
                  type="button"
                  onClick={() => setRelativeDays(1, 8, 0)}
                  className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded"
                >
                  Sáng mai 08:00
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setRelativeDays(3, 23, 59)}
                  className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded"
                >
                  +3 ngày
                </button>
                <button
                  type="button"
                  onClick={() => setRelativeDays(7, 23, 59)}
                  className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded"
                >
                  +7 ngày
                </button>
                <button
                  type="button"
                  onClick={() => setRelativeDays(30, 23, 59)}
                  className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded"
                >
                  +30 ngày
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onChange('');
                    setOpen(false);
                  }}
                  className="text-[10px] bg-emerald-950 hover:bg-emerald-900 text-emerald-300 px-2 py-1 rounded"
                >
                  Vô thời hạn
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
