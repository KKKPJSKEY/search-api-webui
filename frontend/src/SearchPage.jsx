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

import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    Search,
    Settings,
    Loader2,
    ChevronDown,
    Clock,
    Zap,
    Database,
    AlertCircle,
    CheckCircle2,
    XCircle,
    Swords,
    X,
    History,
    Braces,
} from 'lucide-react';
import { Button } from './components/Button';
import { Input } from './components/Input';
import { Card } from './components/Card';
import { Badge } from './components/Badge';
import { ResultItem } from './components/ResultItem';
import { cn } from './lib/utils';
import { addToEngineHistory } from './utils/engineHistory';

/**
 * Build the initial advanced JSON for a provider by merging payload/params and advanced_payload/advanced_params.
 * - {query} and {api_key} are stripped (not user-editable in this panel)
 * - {limit} is resolved to the actual configured limit value so the user can adjust it
 * - For POST providers: static payload fields + advanced_payload are included
 * - For GET providers: static params fields + advanced_params are included
 */
function buildAdvancedJson(provider) {
    if (!provider) return {};
    const details = provider.details || {};
    const method = (details.method || 'GET').toUpperCase();
    const limit = parseInt(provider.user_settings?.limit ?? '10', 10) || 10;

    const SKIP_PLACEHOLDERS = new Set(['{query}', '{api_key}']);
    const LIMIT_PLACEHOLDER_RE = /^\{limit\}$/i;

    const filterTemplate = (obj) => {
        if (typeof obj === 'string') {
            const trimmed = obj.trim();
            if (SKIP_PLACEHOLDERS.has(trimmed)) return null;
            if (LIMIT_PLACEHOLDER_RE.test(trimmed)) return limit;
            return obj;
        }
        if (Array.isArray(obj)) {
            const arr = obj.map(filterTemplate).filter(v => v !== null);
            return arr;
        }
        if (obj !== null && typeof obj === 'object') {
            const filtered = {};
            for (const [k, v] of Object.entries(obj)) {
                const result = filterTemplate(v);
                if (result !== null) filtered[k] = result;
            }
            return filtered;
        }
        return obj;
    };

    if (method === 'GET') {
        const params = filterTemplate(details.params || {});
        const advanced = details.advanced_params_tpl || {};
        return Object.fromEntries(
            Object.entries(advanced).map(([k, v]) => [k, k in params ? params[k] : v])
        );
    } else {
        const payload = filterTemplate(details.payload || {});
        const advanced = details.advanced_payload_tpl || {};
        return Object.fromEntries(
            Object.entries(advanced).map(([k, v]) => [k, k in payload ? payload[k] : v])
        );
    }
}

function SearchPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const inputRef = useRef(null);
    const jsonEditorRef = useRef(null);
    const skipTemplateLoadRef = useRef(false);

    // State Management
    const [providers, setProviders] = useState([]);
    const [selectedProvider, setSelectedProvider] = useState('');
    const [hasKey, setHasKey] = useState(false);

    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [metrics, setMetrics] = useState(null);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);
    const [error, setError] = useState(null);
    const [statusMessage, setStatusMessage] = useState('');

    // Advanced search state
    const [advancedMode, setAdvancedMode] = useState(false);
    const [advancedJson, setAdvancedJson] = useState('{}');
    const [jsonError, setJsonError] = useState(null);

    // Search history state
    const [searchHistory, setSearchHistory] = useState([]);
    const [showHistory, setShowHistory] = useState(false);
    const [inputPosition, setInputPosition] = useState({ top: 0, left: 0, width: 0 });

    // Initial Load
    useEffect(() => {
        fetch('/api/providers')
            .then((res) => res.json())
            .then((data) => {
                setProviders(data);
                // Check if there's a provider parameter in URL
                const providerFromUrl = searchParams.get('provider');
                if (providerFromUrl && data.find(p => p.name === providerFromUrl)) {
                    setSelectedProvider(providerFromUrl);
                } else if (data.length > 0) {
                    setSelectedProvider(data[0].name);
                }
            })
            .catch(console.error);
    }, [searchParams]);

    // Monitor selection to update Key status
    useEffect(() => {
        if (selectedProvider && providers.length > 0) {
            const p = providers.find((item) => item.name === selectedProvider);
            setHasKey(p ? p.has_key : false);
        }
    }, [selectedProvider, providers]);

    // When provider changes in advanced mode, refresh the JSON template
    useEffect(() => {
        if (advancedMode && providers.length > 0) {
            if (skipTemplateLoadRef.current) {
                skipTemplateLoadRef.current = false;
                return;
            }
            const p = providers.find((item) => item.name === selectedProvider);
            if (p) {
                setAdvancedJson(JSON.stringify(buildAdvancedJson(p), null, 2));
                setJsonError(null);
            }
        }
    }, [selectedProvider, advancedMode, providers]);

    // Auto-resize textarea to fit content whenever advancedJson changes or advanced mode is toggled
    useEffect(() => {
        if (!advancedMode) return;
        const el = jsonEditorRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
    }, [advancedJson, advancedMode]);

    // Load search history on mount
    useEffect(() => {
        fetchSearchHistory().then(setSearchHistory);
    }, []);

    // Close history dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            const isClickOnInput = e.target.closest('input') || e.target.closest('textarea');
            const isClickOnHistory = e.target.closest('.history-dropdown');
            if (showHistory && !isClickOnInput && !isClickOnHistory) {
                setShowHistory(false);
            }
        };

        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, [showHistory]);

    const handleConfigClick = () => {
        navigate(`/config?provider=${selectedProvider}`);
    };

    const handleArenaClick = () => {
        navigate(`/arena?current=${selectedProvider}`);
    };

    const handleProviderChange = (e) => {
        const newProvider = e.target.value;
        setSelectedProvider(newProvider);
        addToEngineHistory(newProvider);
    };

    const handleAdvancedToggle = () => {
        if (!advancedMode) {
            // Entering advanced mode: load template for current provider
            const p = providers.find((item) => item.name === selectedProvider);
            if (p) {
                setAdvancedJson(JSON.stringify(buildAdvancedJson(p), null, 2));
                setJsonError(null);
            }
        }
        setAdvancedMode((prev) => !prev);
        setShowHistory(false);
    };

    const handleJsonChange = (e) => {
        const value = e.target.value;
        setAdvancedJson(value);
        try {
            JSON.parse(value);
            setJsonError(null);
        } catch {
            setJsonError('Invalid JSON');
        }
    };

    const handleQueryChange = async (e) => {
        const value = e.target.value;
        setQuery(value);
        updateInputPosition();

        if (value.trim()) {
            const filtered = await fetchSearchHistory(value.trim());
            setSearchHistory(filtered);
            if (filtered.length > 0) {
                setShowHistory(true);
            }
        } else {
            setSearchHistory(await fetchSearchHistory());
            if (searchHistory.length > 0) {
                setShowHistory(true);
            }
        }
    };

    const handleQueryFocus = async () => {
        updateInputPosition();

        if (!query.trim() && searchHistory.length === 0) {
            const history = await fetchSearchHistory();
            setSearchHistory(history);
        }

        if (searchHistory.length > 0) {
            setShowHistory(true);
        }
    };

    const updateInputPosition = () => {
        const el = advancedMode ? jsonEditorRef.current : inputRef.current;
        if (el) {
            const rect = el.getBoundingClientRect();
            setInputPosition({
                top: rect.bottom + window.scrollY,
                left: rect.left + window.scrollX,
                width: rect.width
            });
        }
    };

    const handleHistorySelect = (item) => {
        setQuery(item.query);
        if (item.advanced && item.extra_json) {
            // Restore advanced mode with saved extra_json, skip template override
            skipTemplateLoadRef.current = true;
            setAdvancedMode(true);
            setAdvancedJson(JSON.stringify(item.extra_json, null, 2));
            setJsonError(null);
        }
        setShowHistory(false);
        // Trigger search immediately when selecting from history
        inputRef.current?.form?.requestSubmit();
    };

    // Search history API functions
    const fetchSearchHistory = async (prefix = '') => {
        const url = prefix ? `/api/search-history?prefix=${encodeURIComponent(prefix)}` : '/api/search-history';
        const response = await fetch(url);
        if (response.ok) {
            return await response.json();
        }
        return [];
    };

    const addSearchHistory = async (q, advanced, extraJson) => {
        const body = { query: q };
        if (advanced) {
            body.advanced = true;
            body.extra_json = extraJson;
        }
        await fetch('/api/search-history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    };

    const handleClearHistory = async () => {
        await fetch('/api/search-history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: null }),
        });
        setSearchHistory([]);
        setShowHistory(false);
    };

    const handleSearch = async (e) => {
        e.preventDefault();
        if (!query.trim()) return;

        // Validate JSON in advanced mode before submitting
        let parsedExtra = null;
        if (advancedMode) {
            try {
                parsedExtra = JSON.parse(advancedJson);
            } catch {
                setJsonError('Invalid JSON — please fix before searching');
                return;
            }
        }

        // Save to search history
        await addSearchHistory(query.trim(), advancedMode, parsedExtra);
        setSearchHistory(await fetchSearchHistory());
        setShowHistory(false);

        setLoading(true);
        setSearched(true);
        setResults([]);
        setMetrics(null);
        setError(null);
        setStatusMessage('');

        try {
            const body = {
                query: query,
                provider: selectedProvider,
                stream: true,
            };
            if (advancedMode && parsedExtra) {
                body.extra_json = parsedExtra;
            }

            const res = await fetch('/api/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            // Check if response is SSE
            const contentType = res.headers.get('content-type');
            if (contentType && contentType.includes('text/event-stream')) {
                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const data = JSON.parse(line.slice(6));

                            if (data.type === 'status') {
                                setStatusMessage(data.message);
                            } else if (data.type === 'result') {
                                if (data.data.error) {
                                    setError(data.data.error);
                                } else {
                                    setResults(data.data.results || []);
                                    setMetrics(data.data.metrics);
                                }
                            }
                        }
                    }
                }
            } else {
                // Fallback to non-streaming JSON response
                const data = await res.json();
                if (data.error) {
                    setError(data.error);
                } else {
                    setResults(data.results || []);
                    setMetrics(data.metrics);
                }
            }
        } catch (err) {
            setError('Network request failed. Please check the backend service.');
        } finally {
            setLoading(false);
            setStatusMessage('');
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 p-3 sm:p-4 md:p-6">
            <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6 md:space-y-8">
                <div className="text-center space-y-2">
                    <h1
                        className={cn(
                            'text-2xl sm:text-3xl md:text-4xl font-bold bg-gradient-to-r',
                            'from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent',
                            'drop-shadow-sm'
                        )}
                    >
                        Search API WebUI
                    </h1>
                </div>

                {/* Search History Dropdown - fixed position based on input location */}
                {(() => {
                    if (!showHistory || searchHistory.length === 0) return null;
                    return (
                    <div
                        className="history-dropdown fixed z-[100]"
                        style={{
                            top: inputPosition.top,
                            left: inputPosition.left,
                            width: inputPosition.width
                        }}
                    >
                        <div className="bg-white border border-gray-200 rounded-md shadow-lg overflow-hidden">
                            <div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50">
                                <span className="text-xs text-gray-500 flex items-center gap-1">
                                    <History className="w-3 h-3" />
                                    Recent searches
                                </span>
                                <button
                                    type="button"
                                    onClick={handleClearHistory}
                                    className="text-xs text-gray-500 hover:text-red-600"
                                >
                                    Clear
                                </button>
                            </div>
                            {searchHistory.map((item, idx) => (
                                <button
                                    key={idx}
                                    type="button"
                                    onClick={() => handleHistorySelect(item)}
                                    className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
                                >
                                    {item.advanced ? (
                                        <Braces className="w-3 h-3 text-indigo-400 flex-shrink-0" />
                                    ) : (
                                        <Clock className="w-3 h-3 text-gray-400 flex-shrink-0" />
                                    )}
                                    <span className="truncate flex-1">{item.query}</span>
                                    {item.advanced && (
                                        <span className="text-[10px] font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 rounded px-1 flex-shrink-0">
                                            advanced
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                    );
                })()}

                {/* Control Panel */}
                <Card className="p-4 sm:p-5 md:p-6 shadow-lg hover:shadow-xl transition-shadow duration-300 border-0 ring-1 ring-gray-200/50 backdrop-blur-sm overflow-visible">
                    <form onSubmit={handleSearch} className="space-y-4 sm:space-y-5 md:space-y-6">

                        {/* Top Row: Engine Selection & Status/Config */}
                        <div className="flex flex-col sm:flex-col md:flex-row justify-between items-stretch sm:items-stretch md:items-center gap-3 sm:gap-4">
                            {/* Left: Engine Selector */}
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full md:w-auto">
                                <label className="text-sm font-medium text-gray-700 sm:whitespace-nowrap">
                                    Engine
                                </label>
                                <div className="relative w-full sm:flex-1 md:w-64">
                                    <select
                                        className={cn(
                                            'flex h-10 sm:h-11 md:h-12 w-full items-center',
                                            'justify-between rounded-md border',
                                            'border-gray-200 bg-white px-3 py-2',
                                            'text-sm ring-offset-background',
                                            'placeholder:text-gray-500',
                                            'focus:outline-none focus:ring-2',
                                            'focus:ring-blue-600',
                                            'disabled:cursor-not-allowed',
                                            'disabled:opacity-50',
                                            'appearance-none'
                                        )}
                                        value={selectedProvider}
                                        onChange={handleProviderChange}
                                    >
                                        {providers.map((p) => (
                                            <option key={p.name} value={p.name}>
                                                {p.name}
                                            </option>
                                        ))}
                                    </select>
                                    <ChevronDown
                                        className={cn(
                                            'absolute right-3 top-2.5 sm:top-3 md:top-3.5 h-4 w-4',
                                            'opacity-50 pointer-events-none'
                                        )}
                                    />
                                </div>
                            </div>

                            {/* Right: Status Pill + Arena + Config Button */}
                            <div className="flex items-center justify-between sm:justify-center md:justify-end gap-2 sm:gap-3 w-full md:w-auto">
                                {/* Status Pill */}
                                <div
                                    className={cn(
                                        'flex items-center gap-1 sm:gap-1.5 text-xs font-medium',
                                        'px-2 sm:px-2.5 md:px-3 py-1 sm:py-1.5 rounded-full border-2',
                                        'flex-shrink-0 shadow-sm transition-all duration-200',
                                        hasKey
                                            ? 'bg-emerald-100 text-emerald-700 border-emerald-300 shadow-emerald-200/50'
                                            : 'bg-rose-100 text-rose-700 border-rose-300 shadow-rose-200/50'
                                    )}
                                >
                                    {hasKey ? (
                                        <CheckCircle2 className="w-3 sm:w-3.5 h-3 sm:h-3.5 text-green-600" />
                                    ) : (
                                        <XCircle className="w-3 sm:w-3.5 h-3 sm:h-3.5 text-red-600" />
                                    )}
                                    <span className="hidden sm:inline">{hasKey ? 'Ready' : 'No API Key'}</span>
                                    <span className="sm:hidden">{hasKey ? 'OK' : 'No Key'}</span>
                                </div>

                                {/* Arena Button */}
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    onClick={handleArenaClick}
                                    title="Enter SearchAPIWebUI Arena"
                                    className="h-8 w-8 sm:h-9 sm:w-9 border-2 border-purple-300 bg-purple-50 text-purple-700 hover:bg-purple-100 hover:border-purple-400 hover:scale-105 transition-transform duration-200 flex-shrink-0 shadow-sm"
                                >
                                    <Swords className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                </Button>

                                {/* Config Button */}
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    onClick={handleConfigClick}
                                    title="Configure Provider"
                                    className="h-8 w-8 sm:h-9 sm:w-9 border-gray-200 hover:bg-gray-100 hover:text-gray-900 flex-shrink-0"
                                >
                                    <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-600" />
                                </Button>
                            </div>
                        </div>

                        {/* Bottom Row: Search Input & Action */}
                        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-stretch sm:items-start">
                            <div className="w-full flex-1 space-y-2 relative">
                                {advancedMode ? (
                                    /* Advanced JSON editor */
                                    <div className="relative">
                                        {/* Query input row inside advanced mode */}
                                        <div className="flex items-center gap-2 mb-2">
                                            <Input
                                                ref={inputRef}
                                                className="h-10 sm:h-11 text-base flex-1"
                                                placeholder="Enter your search query..."
                                                value={query}
                                                onChange={handleQueryChange}
                                                onFocus={handleQueryFocus}
                                            />
                                            <button
                                                type="button"
                                                onClick={handleAdvancedToggle}
                                                title="Exit advanced search"
                                                className="flex-shrink-0 h-10 sm:h-11 w-10 sm:w-11 flex items-center justify-center rounded-md border-2 border-indigo-400 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                        {/* JSON editor area */}
                                        <div className="relative">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-xs font-medium text-indigo-600 flex items-center gap-1">
                                                    <Braces className="w-3 h-3" />
                                                    Advanced Search
                                                </span>
                                                {jsonError && (
                                                    <span className="text-xs text-red-500 flex items-center gap-1">
                                                        <AlertCircle className="w-3 h-3" />
                                                        {jsonError}
                                                    </span>
                                                )}
                                            </div>
                                            <textarea
                                                ref={jsonEditorRef}
                                                className={cn(
                                                    'w-full rounded-md border px-3 py-2 text-sm font-mono',
                                                    'overflow-hidden focus:outline-none focus:ring-2',
                                                    jsonError
                                                        ? 'border-red-300 focus:ring-red-400'
                                                        : 'border-indigo-200 focus:ring-indigo-400',
                                                    'bg-white'
                                                )}
                                                value={advancedJson}
                                                onChange={handleJsonChange}
                                                spellCheck={false}
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    /* Normal query input with advanced toggle */
                                    <div className="relative flex items-center">
                                        <Input
                                            ref={inputRef}
                                            className="h-10 sm:h-11 md:h-12 text-base sm:text-lg pr-10"
                                            placeholder="Enter your search query..."
                                            value={query}
                                            onChange={handleQueryChange}
                                            onFocus={handleQueryFocus}
                                        />
                                        {/* Advanced search toggle button inside input */}
                                        <button
                                            type="button"
                                            onClick={handleAdvancedToggle}
                                            title="Advanced search (JSON parameters)"
                                            className={cn(
                                                'absolute right-2 top-1/2 -translate-y-1/2',
                                                'w-7 h-7 flex items-center justify-center rounded',
                                                'text-gray-400 hover:text-indigo-600 hover:bg-indigo-50',
                                                'transition-colors'
                                            )}
                                        >
                                            <Braces className="w-4 h-4" />
                                        </button>
                                    </div>
                                )}
                            </div>

                            <Button
                                type="submit"
                                size="lg"
                                className={cn(
                                    'px-6 sm:px-8 flex-shrink-0 w-full sm:w-auto',
                                    'bg-gradient-to-r from-blue-600 to-indigo-600',
                                    'hover:from-blue-700 hover:to-indigo-700',
                                    'shadow-md hover:shadow-lg transform hover:-translate-y-0.5 transition-all duration-200',
                                    advancedMode
                                        ? 'h-10 sm:h-11 self-start'
                                        : 'h-10 sm:h-11 md:h-12'
                                )}
                                disabled={loading || (advancedMode && !!jsonError)}
                            >
                                {loading ? (
                                    <Loader2 className="w-4 sm:w-5 h-4 sm:h-5 animate-spin mr-2" />
                                ) : (
                                    <Search className="w-4 sm:w-5 h-4 sm:h-5 mr-2" />
                                )}
                                {loading ? (statusMessage || 'Searching...') : 'Search'}
                            </Button>
                        </div>
                    </form>
                </Card>

                {/* Error Display */}
                {error && (
                    <div
                        className={cn(
                            'bg-red-50 border border-red-200 rounded-lg p-4',
                            'flex items-center gap-3 text-red-800'
                        )}
                    >
                        <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                        <p>{error}</p>
                    </div>
                )}

                {/* Results Area */}
                {searched && !loading && !error && (
                    <div
                        className={cn(
                            'space-y-4 sm:space-y-5 md:space-y-6 animate-in fade-in',
                            'slide-in-from-bottom-4 duration-500'
                        )}
                    >
                        {/* Metrics Header */}
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b pb-3 gap-3">
                            <h2 className="text-base sm:text-lg font-semibold text-gray-800">
                                Results
                                <span className="text-gray-400 font-normal text-xs sm:text-sm ml-2">
                                    Found {results.length} items
                                </span>
                            </h2>
                            {metrics && (
                                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                                    <Badge
                                        variant="outline"
                                        className="gap-1 text-gray-500 text-xs"
                                        title="Total client latency"
                                    >
                                        <Clock className="w-3 h-3" />
                                        <span className="hidden sm:inline">Latency: </span>{metrics.latency_ms}ms
                                    </Badge>
                                    {metrics.server_latency_ms !== null && (
                                        <Badge
                                            variant="outline"
                                            className="gap-1 text-blue-500 text-xs"
                                            title="Server processing latency"
                                        >
                                            <Zap className="w-3 h-3" />
                                            <span className="hidden lg:inline">Server: </span>{metrics.server_latency_ms}ms
                                        </Badge>
                                    )}
                                    <Badge
                                        variant="outline"
                                        className="gap-1 text-gray-500 text-xs"
                                        title="Response size in bytes"
                                    >
                                        <Database className="w-3 h-3" />
                                        <span className="hidden sm:inline">Size: </span>{metrics.size_bytes} B
                                    </Badge>
                                </div>
                            )}
                        </div>

                        {/* Result List */}
                        {results.length > 0 ? (
                            <div className="grid gap-3 sm:gap-4">
                                {results.map((item, idx) => (
                                    <ResultItem key={item.url || idx} item={item} watermark={selectedProvider} />
                                ))}
                            </div>
                        ) : (
                            <div
                                className={cn(
                                    'text-center py-8 sm:py-10 md:py-12 bg-white rounded-lg',
                                    'border border-dashed border-gray-300'
                                )}
                            >
                                <Search className="w-10 h-10 sm:w-12 sm:h-12 text-gray-300 mx-auto mb-3" />
                                <p className="text-sm sm:text-base text-gray-500">No results found.</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export default SearchPage;
