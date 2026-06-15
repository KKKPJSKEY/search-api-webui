/*
 * Copyright (c) 2026 QUERIT PRIVATE LIMITED
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to
 * deal in the Software without restriction, including without limitation the
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
 * sell copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 */

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, X, Plus } from 'lucide-react';
import { Input } from './Input';
import { DatePicker } from './DatePicker';
import { cn } from '../lib/utils';

export const QUERIT_GEO_OPTIONS = [
    'argentina', 'australia', 'brazil', 'canada', 'colombia', 'france',
    'germany', 'india', 'indonesia', 'japan', 'mexico', 'nigeria',
    'philippines', 'south korea', 'spain', 'united kingdom', 'united states',
];

export const QUERIT_LANGUAGE_OPTIONS = [
    'english', 'japanese', 'korean', 'german', 'french', 'spanish', 'portuguese',
];

/**
 * Build a default querit advanced payload object.
 */
export function defaultQueritAdvancedPayload(limit = 5) {
    return {
        count: limit,
        chunksPerDoc: 1,
        filters: {
            sites: { include: [], exclude: [] },
            timeRange: { date: '' },
            geo: { countries: { include: [] } },
            languages: { include: [] },
        },
    };
}

/**
 * Normalize an arbitrary object into the querit advanced payload shape,
 * preserving any user-provided values where present.
 */
export function normalizeQueritPayload(obj) {
    const base = defaultQueritAdvancedPayload();
    if (!obj || typeof obj !== 'object') return base;
    const filters = (obj.filters && typeof obj.filters === 'object') ? obj.filters : {};
    const sites = (filters.sites && typeof filters.sites === 'object') ? filters.sites : {};
    const timeRange = (filters.timeRange && typeof filters.timeRange === 'object') ? filters.timeRange : {};
    const geo = (filters.geo && typeof filters.geo === 'object') ? filters.geo : {};
    const geoCountries = (geo.countries && typeof geo.countries === 'object') ? geo.countries : {};
    const languages = (filters.languages && typeof filters.languages === 'object') ? filters.languages : {};

    return {
        count: typeof obj.count === 'number' ? obj.count : base.count,
        chunksPerDoc: typeof obj.chunksPerDoc === 'number' ? obj.chunksPerDoc : base.chunksPerDoc,
        filters: {
            sites: {
                include: Array.isArray(sites.include) ? sites.include : [],
                exclude: Array.isArray(sites.exclude) ? sites.exclude : [],
            },
            timeRange: {
                date: typeof timeRange.date === 'string' ? timeRange.date : '',
            },
            geo: {
                countries: {
                    include: Array.isArray(geoCountries.include) ? geoCountries.include : [],
                },
            },
            languages: {
                include: Array.isArray(languages.include) ? languages.include : [],
            },
        },
    };
}

function ListInput({ label, value, onChange, placeholder = 'Add item...' }) {
    const [draft, setDraft] = useState('');
    const items = Array.isArray(value) ? value : [];

    const add = () => {
        const trimmed = draft.trim();
        if (trimmed && !items.includes(trimmed)) {
            onChange([...items, trimmed]);
        }
        setDraft('');
    };

    return (
        <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">{label}</label>
            <div className="flex gap-1">
                <Input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
                    placeholder={placeholder}
                    className="flex-1"
                />
                <button
                    type="button"
                    onClick={add}
                    className="flex items-center justify-center w-8 h-10 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-gray-600"
                >
                    <Plus className="w-4 h-4" />
                </button>
            </div>
            {items.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                    {items.map((item) => (
                        <span
                            key={item}
                            className="inline-flex items-center gap-1 rounded bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs px-1.5 py-0.5"
                        >
                            {item}
                            <span
                                role="button"
                                tabIndex={0}
                                onClick={() => onChange(items.filter((v) => v !== item))}
                                className="hover:text-indigo-900 cursor-pointer"
                            >
                                <X className="w-3 h-3" />
                            </span>
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}

function MultiSelect({ label, options, value, onChange, placeholder = 'Select...' }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        const handler = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const selected = Array.isArray(value) ? value : [];
    const toggle = (opt) => {
        if (selected.includes(opt)) {
            onChange(selected.filter((v) => v !== opt));
        } else {
            onChange([...selected, opt]);
        }
    };
    const removeOne = (opt, e) => {
        e.stopPropagation();
        onChange(selected.filter((v) => v !== opt));
    };

    return (
        <div className="space-y-1" ref={ref}>
            <label className="text-xs font-medium text-gray-600">{label}</label>
            <div className="relative">
                <button
                    type="button"
                    onClick={() => setOpen((o) => !o)}
                    className={cn(
                        'flex w-full min-h-10 items-center justify-between gap-2 rounded-md border',
                        'border-gray-200 bg-white px-3 py-1.5 text-sm text-left',
                        'focus:outline-none focus:ring-2 focus:ring-blue-600',
                    )}
                >
                    <div className="flex flex-wrap gap-1 flex-1">
                        {selected.length === 0 ? (
                            <span className="text-gray-400">{placeholder}</span>
                        ) : (
                            selected.map((s) => (
                                <span
                                    key={s}
                                    className="inline-flex items-center gap-1 rounded bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs px-1.5 py-0.5"
                                >
                                    {s}
                                    <span
                                        role="button"
                                        tabIndex={0}
                                        onClick={(e) => removeOne(s, e)}
                                        className="hover:text-indigo-900 cursor-pointer"
                                    >
                                        <X className="w-3 h-3" />
                                    </span>
                                </span>
                            ))
                        )}
                    </div>
                    <ChevronDown className="w-4 h-4 opacity-50 flex-shrink-0" />
                </button>
                {open && (
                    <div className="absolute z-50 mt-1 w-full max-h-56 overflow-auto rounded-md border border-gray-200 bg-white shadow-lg">
                        {options.map((opt) => {
                            const isChecked = selected.includes(opt);
                            return (
                                <label
                                    key={opt}
                                    className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 cursor-pointer"
                                >
                                    <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={() => toggle(opt)}
                                        className="rounded border-gray-300"
                                    />
                                    <span className="capitalize">{opt}</span>
                                </label>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

export function QueritAdvancedForm({ value, onChange }) {
    const v = normalizeQueritPayload(value);

    const update = (patch) => onChange({ ...v, ...patch });
    const updateFilters = (patch) =>
        onChange({ ...v, filters: { ...v.filters, ...patch } });

    return (
        <div className="relative z-30 space-y-3 rounded-md border border-indigo-200 bg-white p-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                        <label className="text-xs font-medium text-gray-600">Count</label>
                        <Input
                            type="number"
                            min={1}
                            value={v.count}
                            onChange={(e) => {
                                const n = parseInt(e.target.value, 10);
                                update({ count: Number.isFinite(n) ? n : 0 });
                            }}
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-medium text-gray-600">Chunks Per Doc</label>
                        <Input
                            type="number"
                            min={1}
                            max={3}
                            value={v.chunksPerDoc}
                            onChange={(e) => {
                                const n = parseInt(e.target.value, 10);
                                let next = Number.isFinite(n) ? n : 0;
                                if (next > 3) next = 3;
                                if (next < 0) next = 0;
                                update({ chunksPerDoc: next });
                            }}
                        />
                    </div>
                </div>
                <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-600">Time Range (Date)</label>
                    <DatePicker
                        value={v.filters.timeRange.date || ''}
                        onChange={(d) => updateFilters({ timeRange: { date: d } })}
                    />
                </div>
                <MultiSelect
                    label="Geo (Countries)"
                    options={QUERIT_GEO_OPTIONS}
                    value={v.filters.geo.countries.include}
                    onChange={(arr) =>
                        updateFilters({
                            geo: { countries: { include: arr } },
                        })
                    }
                    placeholder="Select countries..."
                />
                <MultiSelect
                    label="Languages"
                    options={QUERIT_LANGUAGE_OPTIONS}
                    value={v.filters.languages.include}
                    onChange={(arr) =>
                        updateFilters({ languages: { include: arr } })
                    }
                    placeholder="Select languages..."
                />
                <ListInput
                    label="Sites Include"
                    value={v.filters.sites.include}
                    onChange={(arr) =>
                        updateFilters({ sites: { ...v.filters.sites, include: arr } })
                    }
                    placeholder="e.g. example.com"
                />
                <ListInput
                    label="Sites Exclude"
                    value={v.filters.sites.exclude}
                    onChange={(arr) =>
                        updateFilters({ sites: { ...v.filters.sites, exclude: arr } })
                    }
                    placeholder="e.g. spam.com"
                />
            </div>
        </div>
    );
}
