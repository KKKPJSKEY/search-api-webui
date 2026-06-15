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
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
 * THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 */

import { useState } from 'react';
import { ExternalLink, ChevronDown, ChevronUp, Clock, Star, TrendingUp } from 'lucide-react';
import { Card } from './Card';
import { cn } from '../lib/utils';

/**
 * Check if a string is a valid URL
 * @param {string} str - String to check
 * @returns {boolean} True if string is a valid URL
 */
function isUrl(str) {
    if (typeof str !== 'string') return false;
    try {
        const url = new URL(str);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

/**
 * Truncate URL for display (show first 60 chars + ...)
 * @param {string} url - URL to truncate
 * @returns {string} Truncated URL string
 */
function truncateUrl(url) {
    if (url.length <= 60) return url;
    return url.substring(0, 60) + '...';
}

/**
 * Format page age as relative time if within 1 day, otherwise show date in YYYY-MM-DD format.
 * @param {string} dateStr - UTC date string from backend
 * @returns {string | null} Formatted time string, or null if parsing fails
 */
function formatPageAge(dateStr) {
    if (!dateStr) return null;
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return null;

        const now = new Date();
        const diffMs = now - date;
        const diffHours = diffMs / (1000 * 60 * 60);

        // Show relative time if within 1 day
        if (diffHours < 24) {
            if (diffHours < 1) {
                const diffMinutes = Math.floor(diffMs / (1000 * 60));
                if (diffMinutes < 1) {
                    return 'Just now';
                }
                return `${diffMinutes}m ago`;
            }
            const hours = Math.floor(diffHours);
            return `${hours}h ago`;
        }

        // Show date in YYYY-MM-DD format for older items
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    } catch {
        return null;
    }
}

/**
 * Render nested JSON value with proper formatting
 * @param {*} value - Value to render
 * @param {string} key - Key name
 * @returns {JSX.Element} Rendered value
 */
function renderNestedValue(value, key, maxChunks = null) {
    // Handle null/undefined
    if (value === null || value === undefined) {
        return <span className="text-gray-400">null</span>;
    }

    // Handle arrays
    if (Array.isArray(value)) {
        // Special handling for image arrays
        if (key === 'images' && value.length > 0 && value[0].url) {
            return (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 mt-2">
                    {value.map((img, idx) => (
                        <a
                            key={idx}
                            href={img.url.startsWith('http') ? img.url : `https://${img.url}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block"
                        >
                            <img
                                src={img.url.startsWith('http') ? img.url : `https://${img.url}`}
                                alt={`Image ${idx + 1}`}
                                className="h-16 sm:h-20 w-full object-cover rounded border border-gray-200 hover:border-blue-400 transition-colors"
                                loading="lazy"
                            />
                        </a>
                    ))}
                </div>
            );
        }
        // For other arrays, show as comma-separated list
        return <span>{value.map(v => JSON.stringify(v)).join(', ')}</span>;
    }

    // Handle objects
    if (typeof value === 'object') {
        return (
            <div className="ml-4 mt-1 space-y-1 text-xs border-l-2 border-gray-200 pl-3">
                {Object.entries(value).map(([k, v]) => (
                    <div key={k}>
                        <span className="font-semibold text-gray-600">{k}:</span>{' '}
                        {renderNestedValue(v, k, maxChunks)}
                    </div>
                ))}
            </div>
        );
    }

    // Handle thumbnail_url as image
    if (typeof value === 'string' && key === 'thumbnail_url' && isUrl(value)) {
        return (
            <a
                href={value.startsWith('http') ? value : `https://${value}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block mt-2"
            >
                <img
                    src={value.startsWith('http') ? value : `https://${value}`}
                    alt="Thumbnail"
                    className="h-16 sm:h-20 w-auto max-w-full object-cover rounded border border-gray-200 hover:border-blue-400 transition-colors"
                    loading="lazy"
                />
            </a>
        );
    }

    // Handle URLs
    if (typeof value === 'string' && isUrl(value)) {
        return (
            <a
                href={value.startsWith('http') ? value : `https://${value}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
            >
                {truncateUrl(value)}
            </a>
        );
    }

    // Handle strings containing the `[...]` chunk separator → numbered blocks
    if (typeof value === 'string' && value.includes('[...]')) {
        let chunks = value.split('[...]').map(s => s.trim()).filter(Boolean);
        if (chunks.length > 1) {
            // Cap by maxChunks (e.g. user-selected chunksPerDoc); drop extras silently.
            if (Number.isFinite(maxChunks) && maxChunks > 0 && chunks.length > maxChunks) {
                chunks = chunks.slice(0, maxChunks);
            }
            return (
                <div className="ml-2 mt-1 space-y-2">
                    {chunks.map((chunk, idx) => (
                        <div
                            key={idx}
                            className="border-l-2 border-indigo-300 pl-3 py-1 bg-indigo-50/40 rounded-r whitespace-pre-wrap"
                        >
                            <span className="text-xs font-bold text-indigo-700 mr-1">{idx + 1}.</span>
                            {chunk}
                        </div>
                    ))}
                </div>
            );
        }
    }

    // Handle primitive values
    return <span>{String(value)}</span>;
}

/**
 * Split a snippet string by the literal `[...]` delimiter into chunks.
 * Returns an array of trimmed non-empty chunks. If only one chunk exists,
 * caller can render inline; multiple chunks should render as numbered blocks.
 */
function splitSnippetChunks(str) {
    if (typeof str !== 'string' || !str) return [];
    return str
        .split('[...]')
        .map(s => s.trim())
        .filter(s => s.length > 0);
}

export function ResultItem({ item, compact = false, watermark = null, maxChunks = null }) {
    const [expanded, setExpanded] = useState(false);

    // Handle snippet: can be string or object
    const snippetData = item.snippet || '';
    const isJsonSnippet = typeof snippetData === 'object' && snippetData !== null;

    // For string snippets, split by `[...]` separator into chunks (querit chunksPerDoc>1)
    let stringChunks = !isJsonSnippet ? splitSnippetChunks(snippetData) : [];
    if (Number.isFinite(maxChunks) && maxChunks > 0 && stringChunks.length > maxChunks) {
        stringChunks = stringChunks.slice(0, maxChunks);
    }
    const hasMultipleChunks = stringChunks.length > 1;

    // Convert snippet to display string
    let displayString = '';
    if (isJsonSnippet) {
        // Convert JSON to formatted string
        displayString = Object.entries(snippetData)
            .map(([key, value]) => `${key}: ${value}`)
            .join('\n');
    } else {
        displayString = snippetData;
    }

    // Truncation logic based on character count and screen size
    const LIMIT = compact ? 160 : 240;
    const shouldTruncate = displayString.length > LIMIT;

    const displayPageAge = formatPageAge(item.page_age);

    const toggleExpand = () => {
        setExpanded(!expanded);
    };

    // Check if running in Android WebView environment
    const openInAndroidApp = navigator.userAgent.includes('SearchAPIWebUI-Android');

    // Handle link click to open in external browser (Android only)
    const handleLinkClick = async (e) => {
        e.preventDefault();
        const url = item.url;

        try {
            // Add timeout control (5 seconds)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const response = await fetch('/api/browser-open', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({url}),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const error = await response.json();
                console.error('[ResultItem] API failed:', error);
                alert('Failed to open external browser');
                return;
            }

            console.log('[ResultItem] Successfully opened in external browser');

        } catch (error) {
            if (error.name === 'AbortError') {
                console.error('[ResultItem] Request timeout');
                alert('Request timeout');
            } else {
                console.error('[ResultItem] Error calling API:', error);
                alert('Network error');
            }
            // Don't fallback - WebView can't open external links via window.open
        }
    };

    return (
        <Card
            className={cn(
                'hover:shadow-lg transition-all duration-300 border-l-4 border-l-blue-500 relative overflow-hidden',
                'hover:border-l-indigo-600 hover:scale-[1.01]',
                compact ? 'p-3 sm:p-4' : 'p-4 sm:p-5'
            )}
        >
            {/* Watermark Background - Repeated Pattern */}
            {watermark && (
                <div className="absolute inset-0 pointer-events-none select-none opacity-[0.03] overflow-hidden flex items-start justify-end pr-2 sm:pr-4 pt-2">
                    <div className="flex flex-col gap-2 sm:gap-4 transform rotate-12">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="text-2xl sm:text-3xl md:text-4xl font-black tracking-wider whitespace-nowrap">
                                {watermark}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Content */}
            <div className="group relative z-10">
                <a
                    href={item.url}
                    title={item.url}
                    {...(openInAndroidApp
                        ? { onClick: handleLinkClick }
                        : { target: '_blank', rel: 'noopener noreferrer' }
                    )}
                    className="flex items-start justify-between gap-2"
                >
                    <h3 className={cn(
                        "font-medium text-blue-600 group-hover:text-indigo-600 transition-colors duration-200 break-words",
                        compact ? "text-xs sm:text-sm" : "text-sm sm:text-base"
                    )}>
                        {item.title || 'Untitled'}
                    </h3>
                    <ExternalLink
                        className={cn(
                            'opacity-0 group-hover:opacity-50 transition-opacity mt-0.5 sm:mt-1 flex-shrink-0',
                            compact ? "w-3 h-3" : "w-3.5 h-3.5 sm:w-4 sm:h-4"
                        )}
                    />
                </a>
                <div className="text-xs mt-1 mb-2">
                    {displayPageAge ? (
                        <div className="flex items-center gap-1 sm:gap-1.5 text-green-700 flex-wrap">
                            <span className="truncate text-xs">{displayPageAge}</span>
                            <span className="text-green-700">|</span>
                            {item.site_icon && (
                                <img src={item.site_icon} alt="" className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                            )}
                            <span className="truncate max-w-[200px] sm:max-w-full text-xs">{item.site_name || item.url}</span>
                        </div>
                    ) : (
                        <span className="truncate max-w-full text-green-700 inline-flex items-center gap-1 sm:gap-1.5 text-xs">
                            {item.site_icon && (
                                <img src={item.site_icon} alt="" className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                            )}
                            {item.site_name || item.url}
                        </span>
                    )}
                </div>

                <div className={cn(
                    "text-gray-700 leading-relaxed whitespace-pre-wrap",
                    compact ? "text-xs" : "text-xs sm:text-sm"
                )}>
                    {shouldTruncate && !expanded ? (
                        isJsonSnippet ? (
                            // For JSON snippets, render with bold keys even when truncated
                            <div className="space-y-1">
                                {(() => {
                                    let charCount = 0;
                                    const entries = Object.entries(snippetData);
                                    const renderedEntries = [];

                                    for (const [key, value] of entries) {
                                        // Format value for display
                                        let displayValue;
                                        if (Array.isArray(value)) {
                                            const allPrimitive = value.every(
                                                v => v === null || ['string', 'number', 'boolean'].includes(typeof v)
                                            );
                                            displayValue = allPrimitive
                                                ? value.join(', ')
                                                : `[${value.length} items]`;
                                        } else if (value && typeof value === 'object') {
                                            displayValue = '{...}';
                                        } else {
                                            displayValue = String(value);
                                        }
                                        const entryText = `${key}: ${displayValue}\n`;

                                        if (charCount + entryText.length > LIMIT) {
                                            // Truncate this entry
                                            const remaining = LIMIT - charCount;
                                            if (remaining > key.length + 2) {
                                                // Show at least the key and partial value
                                                const valueChars = remaining - key.length - 2;
                                                const truncatedValue = displayValue.substring(0, valueChars);
                                                renderedEntries.push(
                                                    <div key={key} className="whitespace-pre-wrap">
                                                        <span className="font-semibold">{key}:</span>{' '}
                                                        {truncatedValue}
                                                        <span>... </span>
                                                        <button
                                                            onClick={toggleExpand}
                                                            className="text-blue-600 hover:text-blue-800 font-medium inline-flex items-center gap-0.5 text-xs"
                                                        >
                                                            Expand <ChevronDown className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                );
                                            }
                                            break;
                                        }
                                        charCount += entryText.length;
                                        renderedEntries.push(
                                            <div key={key} className="whitespace-pre-wrap">
                                                <span className="font-semibold">{key}:</span> {displayValue}
                                            </div>
                                        );
                                    }
                                    return renderedEntries;
                                })()}
                            </div>
                        ) : (
                            // For plain text snippets, simple truncation
                            <>
                                {hasMultipleChunks ? (
                                    <div className="space-y-2">
                                        {(() => {
                                            const blocks = [];
                                            let charCount = 0;
                                            for (let i = 0; i < stringChunks.length; i++) {
                                                const chunk = stringChunks[i];
                                                if (charCount >= LIMIT) break;
                                                const remaining = LIMIT - charCount;
                                                const text = chunk.length > remaining
                                                    ? chunk.substring(0, remaining) + '...'
                                                    : chunk;
                                                charCount += chunk.length;
                                                blocks.push(
                                                    <div
                                                        key={i}
                                                        className="border-l-2 border-indigo-300 pl-3 py-1 bg-indigo-50/40 rounded-r whitespace-pre-wrap"
                                                    >
                                                        <span className="text-xs font-bold text-indigo-700 mr-1">{i + 1}.</span>
                                                        {text}
                                                    </div>
                                                );
                                            }
                                            blocks.push(
                                                <button
                                                    key="expand"
                                                    onClick={toggleExpand}
                                                    className="text-blue-600 hover:text-blue-800 font-medium inline-flex items-center gap-0.5 text-xs"
                                                >
                                                    Expand <ChevronDown className="w-3 h-3" />
                                                </button>
                                            );
                                            return blocks;
                                        })()}
                                    </div>
                                ) : (
                                    <>
                                        {displayString.substring(0, LIMIT)}
                                        <span>... </span>
                                        <button
                                            onClick={toggleExpand}
                                            className="text-blue-600 hover:text-blue-800 font-medium inline-flex items-center gap-0.5 text-xs"
                                        >
                                            Expand <ChevronDown className="w-3 h-3" />
                                        </button>
                                    </>
                                )}
                            </>
                        )
                    ) : (
                        <>
                            {isJsonSnippet ? (
                                <div className="space-y-2">
                                    {Object.entries(snippetData).map(([key, value]) => (
                                        <div key={key} className="whitespace-pre-wrap">
                                            <span className="font-semibold">{key}:</span>{' '}
                                            {renderNestedValue(value, key, maxChunks)}
                                        </div>
                                    ))}
                                </div>
                            ) : hasMultipleChunks ? (
                                <div className="space-y-2">
                                    {stringChunks.map((chunk, i) => (
                                        <div
                                            key={i}
                                            className="border-l-2 border-indigo-300 pl-3 py-1 bg-indigo-50/40 rounded-r whitespace-pre-wrap"
                                        >
                                            <span className="text-xs font-bold text-indigo-700 mr-1">{i + 1}.</span>
                                            {chunk}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                displayString
                            )}
                            {shouldTruncate && (
                                <button
                                    onClick={toggleExpand}
                                    className="ml-2 text-blue-600 hover:text-blue-800 font-medium inline-flex items-center gap-0.5 text-xs"
                                >
                                    Collapse <ChevronUp className="w-3 h-3" />
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>
        </Card>
    );
}
