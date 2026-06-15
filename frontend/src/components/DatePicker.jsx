/*
 * Copyright (c) 2026 QUERIT PRIVATE LIMITED
 */

import { useState, useRef, useEffect } from 'react';
import { DayPicker } from 'react-day-picker';
import { Calendar, X } from 'lucide-react';
import 'react-day-picker/style.css';
import { cn } from '../lib/utils';

/**
 * Date range picker built on react-day-picker.
 *
 * Wire format: "YYYY-MM-DDtoYYYY-MM-DD" (e.g. "2026-01-01to2026-01-31").
 * Empty string means no selection. A partially-selected range (only `from`)
 * is held in local component state and not propagated to onChange until both
 * ends are picked.
 */
export function DatePicker({ value, onChange, placeholder = 'YYYY-MM-DD to YYYY-MM-DD', className }) {
    const [open, setOpen] = useState(false);
    const wrapRef = useRef(null);

    const externalRange = parseRange(value);
    const [draft, setDraft] = useState(externalRange);
    // Tracks how many days have been clicked in the current open session.
    // Only after the second click do we commit and close.
    const clickCountRef = useRef(0);

    // Sync external value into local draft when value changes from outside.
    useEffect(() => {
        setDraft(parseRange(value));
    }, [value]);

    useEffect(() => {
        const handler = (e) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Reset click counter whenever the popover opens.
    useEffect(() => {
        if (open) clickCountRef.current = 0;
    }, [open]);

    const handleSelect = (range, selectedDay) => {
        clickCountRef.current += 1;

        // First click: force start of range to the clicked day, clear end.
        // This guarantees a fresh range starts even if the user reopens the
        // popover on top of a previous selection.
        if (clickCountRef.current === 1) {
            setDraft({ from: selectedDay, to: undefined });
            return;
        }

        // Second (or later) click: complete the range based on existing draft.
        const start = draft?.from || selectedDay;
        let from = start;
        let to = selectedDay;
        if (from > to) {
            const tmp = from;
            from = to;
            to = tmp;
        }
        const finalRange = { from, to };
        setDraft(finalRange);
        onChange(`${formatIsoDate(from)}to${formatIsoDate(to)}`);
        setOpen(false);
    };

    const handleClear = (e) => {
        e.stopPropagation();
        setDraft(undefined);
        onChange('');
    };

    const display = formatRangeDisplay(draft) || placeholder;
    const hasValue = !!(draft && draft.from);

    return (
        <div className="relative" ref={wrapRef}>
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className={cn(
                    'flex h-10 w-full items-center justify-between gap-2 rounded-md border',
                    'border-gray-200 bg-white px-3 py-2 text-sm text-left',
                    'focus:outline-none focus:ring-2 focus:ring-blue-600',
                    className,
                )}
            >
                <span className={hasValue ? 'text-gray-900' : 'text-gray-400'}>
                    {display}
                </span>
                <span className="flex items-center gap-1 text-gray-400">
                    {hasValue && (
                        <span
                            role="button"
                            tabIndex={0}
                            onClick={handleClear}
                            className="hover:text-gray-700 cursor-pointer"
                            title="Clear"
                        >
                            <X className="w-4 h-4" />
                        </span>
                    )}
                    <Calendar className="w-4 h-4" />
                </span>
            </button>
            {open && (
                <div className="absolute z-50 mt-1 rounded-md border border-gray-200 bg-white shadow-lg p-2">
                    <DayPicker
                        mode="range"
                        selected={draft}
                        onSelect={handleSelect}
                        captionLayout="dropdown"
                        numberOfMonths={2}
                        showOutsideDays
                    />
                </div>
            )}
        </div>
    );
}

function parseIsoDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return undefined;
    const [, y, mo, d] = m;
    return new Date(parseInt(y, 10), parseInt(mo, 10) - 1, parseInt(d, 10));
}

function formatIsoDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function parseRange(value) {
    if (!value || typeof value !== 'string') return undefined;
    const parts = value.split('to');
    if (parts.length !== 2) return undefined;
    const from = parseIsoDate(parts[0]);
    const to = parseIsoDate(parts[1]);
    if (!from || !to) return undefined;
    return { from, to };
}

function formatRangeDisplay(range) {
    if (!range || !range.from) return '';
    const from = formatIsoDate(range.from);
    const to = range.to ? formatIsoDate(range.to) : '';
    return to ? `${from} to ${to}` : `${from} to ...`;
}
