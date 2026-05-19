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

import { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, Save, X } from 'lucide-react';
import { Button } from './Button';
import { Input } from './Input';

const GET_DEFAULTS = {
    headers: {},
    params: { q: '{query}', count: '{limit}' },
    payload: {},
};

const POST_DEFAULTS = {
    headers: { 'Content-Type': 'application/json' },
    params: {},
    payload: { query: '{query}', count: '{limit}' },
};

const DEFAULT_RESPONSE_MAPPING = {
    root_path: '@',
    fields: { url: 'url', title: 'title' },
};

function JsonTextarea({ label, value, onChange, placeholder, helpText }) {
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!value.trim()) {
            setError(null);
            return;
        }
        try {
            JSON.parse(value);
            setError(null);
        } catch (e) {
            setError(e.message);
        }
    }, [value]);

    const hasError = !!error;

    return (
        <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-600">{label}</label>
            <textarea
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                rows={3}
                className={`w-full rounded-md border px-3 py-2 text-sm font-mono bg-white
                    focus:outline-none focus:ring-2 focus:ring-offset-1
                    ${hasError
                        ? 'border-red-300 focus:ring-red-400'
                        : 'border-gray-200 focus:ring-blue-600'
                    }`}
            />
            {hasError && <p className="text-xs text-red-500">Invalid JSON: {error}</p>}
            {helpText && !hasError && <p className="text-xs text-gray-500">{helpText}</p>}
        </div>
    );
}

function CollapsibleSection({ title, icon, defaultOpen = true, children }) {
    const [open, setOpen] = useState(defaultOpen);
    const Icon = open ? ChevronDown : ChevronRight;

    return (
        <div className="space-y-3">
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className="flex items-center gap-2 text-sm font-semibold text-gray-900 hover:text-gray-700"
            >
                <Icon className="w-4 h-4" />
                {icon && <span className="w-4 h-4">{icon}</span>}
                {title}
            </button>
            {open && <div className="pl-6 space-y-3">{children}</div>}
        </div>
    );
}

export default function CustomProviderForm({ initialValues, onSave, onCancel, isEdit }) {
    const [name, setName] = useState('');
    const [url, setUrl] = useState('');
    const [method, setMethod] = useState('GET');
    const [headers, setHeaders] = useState('{}');
    const [params, setParams] = useState('{}');
    const [payload, setPayload] = useState('{}');
    const [advancedParamsTpl, setAdvancedParamsTpl] = useState('{}');
    const [advancedPayloadTpl, setAdvancedPayloadTpl] = useState('{}');
    const [responseRootPath, setResponseRootPath] = useState('@');
    const [responseServerLatencyPath, setResponseServerLatencyPath] = useState('');
    const [responseFields, setResponseFields] = useState('{}');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    // Populate form from initialValues when editing
    useEffect(() => {
        if (initialValues) {
            setName(initialValues.name || '');
            setUrl(initialValues.url || '');
            setMethod((initialValues.method || 'GET').toUpperCase());
            setHeaders(JSON.stringify(initialValues.headers || {}, null, 2));
            setParams(JSON.stringify(initialValues.params || {}, null, 2));
            setPayload(JSON.stringify(initialValues.payload || {}, null, 2));
            setAdvancedParamsTpl(JSON.stringify(initialValues.advanced_params_tpl || {}, null, 2));
            setAdvancedPayloadTpl(JSON.stringify(initialValues.advanced_payload_tpl || {}, null, 2));

            const rm = initialValues.response_mapping || DEFAULT_RESPONSE_MAPPING;
            setResponseRootPath(rm.root_path || '@');
            setResponseServerLatencyPath(rm.server_latency_path || '');
            setResponseFields(JSON.stringify(rm.fields || DEFAULT_RESPONSE_MAPPING.fields, null, 2));
        }
    }, [initialValues]);

    // Update defaults when method changes (only if creating, not editing)
    const handleMethodChange = (newMethod) => {
        setMethod(newMethod);
        if (!isEdit) {
            const defaults = newMethod === 'POST' ? POST_DEFAULTS : GET_DEFAULTS;
            setHeaders(JSON.stringify(defaults.headers, null, 2));
            setParams(JSON.stringify(defaults.params, null, 2));
            setPayload(JSON.stringify(defaults.payload, null, 2));
        }
    };

    const parseJson = (str) => {
        const trimmed = str.trim();
        if (!trimmed) return {};
        return JSON.parse(trimmed);
    };

    const validate = () => {
        if (!name.trim()) return 'Provider name is required';
        if (!/^[a-zA-Z0-9_-]+$/.test(name.trim())) return 'Name can only contain letters, numbers, underscores, and hyphens';
        if (!url.trim()) return 'API URL is required';
        if (!url.trim().startsWith('http://') && !url.trim().startsWith('https://')) return 'URL must start with http:// or https://';

        // Validate JSON fields
        try { parseJson(headers); } catch { return 'Headers must be valid JSON'; }
        try { parseJson(params); } catch { return 'Params must be valid JSON'; }
        try { parseJson(payload); } catch { return 'Payload must be valid JSON'; }
        try { parseJson(advancedParamsTpl); } catch { return 'Advanced Params Template must be valid JSON'; }
        try { parseJson(advancedPayloadTpl); } catch { return 'Advanced Payload Template must be valid JSON'; }
        try { parseJson(responseFields); } catch { return 'Response Field Mapping must be valid JSON'; }

        return null;
    };

    const handleSubmit = async () => {
        const validationError = validate();
        if (validationError) {
            setError(validationError);
            return;
        }

        setSaving(true);
        setError(null);

        const providerData = {
            name: name.trim(),
            url: url.trim(),
            method,
            headers: parseJson(headers),
            params: parseJson(params),
            payload: parseJson(payload),
            response_mapping: {
                root_path: responseRootPath.trim() || '@',
                fields: parseJson(responseFields),
                ...(responseServerLatencyPath.trim() && { server_latency_path: responseServerLatencyPath.trim() }),
            },
        };

        if (Object.keys(parseJson(advancedParamsTpl)).length > 0) {
            providerData.advanced_params_tpl = parseJson(advancedParamsTpl);
        }
        if (Object.keys(parseJson(advancedPayloadTpl)).length > 0) {
            providerData.advanced_payload_tpl = parseJson(advancedPayloadTpl);
        }

        try {
            await onSave(providerData);
        } catch (e) {
            setError(e.message || 'Failed to save provider');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Required Section */}
            <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-900">Basic Information</h3>
                <div className="space-y-3">
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-gray-600">Provider Name</label>
                        <Input
                            placeholder="my_search_api"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            disabled={isEdit}
                            className="font-mono"
                        />
                        <p className="text-xs text-gray-500">Letters, numbers, underscores, and hyphens only</p>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-gray-600">API URL</label>
                        <Input
                            placeholder="https://api.example.com/v1/search"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            className="font-mono text-sm"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-gray-600">HTTP Method</label>
                        <select
                            value={method}
                            onChange={(e) => handleMethodChange(e.target.value)}
                            className="flex h-10 w-full items-center justify-between
                                rounded-md border border-gray-200 bg-white px-3 py-2
                                text-sm focus:outline-none focus:ring-2
                                focus:ring-blue-600"
                        >
                            <option value="GET">GET</option>
                            <option value="POST">POST</option>
                        </select>
                    </div>
                </div>
            </div>

            <div className="border-t border-gray-100"></div>

            {/* Request Configuration */}
            <CollapsibleSection title="Request Configuration" defaultOpen={true}>
                <JsonTextarea
                    label="Headers"
                    value={headers}
                    onChange={setHeaders}
                    placeholder={'{"Authorization": "Bearer {api_key}"}'}
                    helpText='Use {api_key} placeholder for the API key'
                />
                <JsonTextarea
                    label={method === 'GET' ? 'Query Parameters' : 'Query Parameters (usually empty for POST)'}
                    value={params}
                    onChange={setParams}
                    placeholder={'{"q": "{query}", "count": "{limit}"}'}
                    helpText='Use {query} and {limit} placeholders'
                />
                <JsonTextarea
                    label={method === 'POST' ? 'Request Body (Payload)' : 'Request Body (usually empty for GET)'}
                    value={payload}
                    onChange={setPayload}
                    placeholder={'{"query": "{query}", "count": "{limit}"}'}
                    helpText='Use {query} and {limit} placeholders'
                />
            </CollapsibleSection>

            <div className="border-t border-gray-100"></div>

            {/* Advanced Templates */}
            <CollapsibleSection title="Advanced Search Templates" defaultOpen={false}>
                {method === 'GET' && (
                    <JsonTextarea
                        label="Advanced Params Template"
                        value={advancedParamsTpl}
                        onChange={setAdvancedParamsTpl}
                        placeholder="{}"
                        helpText="Merged into params when advanced search is used"
                    />
                )}
                {method === 'POST' && (
                    <JsonTextarea
                        label="Advanced Payload Template"
                        value={advancedPayloadTpl}
                        onChange={setAdvancedPayloadTpl}
                        placeholder="{}"
                        helpText="Merged into payload when advanced search is used"
                    />
                )}
            </CollapsibleSection>

            <div className="border-t border-gray-100"></div>

            {/* Response Mapping */}
            <CollapsibleSection title="Response Mapping" defaultOpen={false}>
                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-600">Root Path (JMESPath)</label>
                    <Input
                        placeholder="@"
                        value={responseRootPath}
                        onChange={(e) => setResponseRootPath(e.target.value)}
                        className="font-mono text-sm"
                    />
                    <p className="text-xs text-gray-500">JMESPath to the result array. Use "@" for top-level, e.g. "data.results"</p>
                </div>
                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-600">Server Latency Path (Optional)</label>
                    <Input
                        placeholder="meta.took"
                        value={responseServerLatencyPath}
                        onChange={(e) => setResponseServerLatencyPath(e.target.value)}
                        className="font-mono text-sm"
                    />
                </div>
                <JsonTextarea
                    label="Field Mapping"
                    value={responseFields}
                    onChange={setResponseFields}
                    placeholder={'{"url": "link", "title": "headline"}'}
                    helpText='Map standard fields (url, title, snippet, site_name, site_icon, page_age) to JSON response fields'
                />
            </CollapsibleSection>

            {/* Error Message */}
            {error && (
                <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 text-sm text-red-700">
                    {error}
                </div>
            )}

            {/* Actions */}
            <div className="pt-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <Button onClick={handleSubmit} disabled={saving}>
                    <Save className="w-4 h-4 mr-2" />
                    {saving ? 'Saving...' : isEdit ? 'Update Provider' : 'Create Provider'}
                </Button>
                <Button variant="outline" onClick={onCancel} disabled={saving}>
                    <X className="w-4 h-4 mr-2" />
                    Cancel
                </Button>
            </div>
        </div>
    );
}
