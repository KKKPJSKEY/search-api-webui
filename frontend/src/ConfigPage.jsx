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
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Key, Save, Server, Code, Trash2, Settings2, AlertCircle, CheckCircle2, PlusCircle, Pencil, ExternalLink } from 'lucide-react';
import { Button } from './components/Button';
import { Input } from './components/Input';
import { Card } from './components/Card';
import { Badge } from './components/Badge';
import CustomProviderForm from './components/CustomProviderForm';

function ConfigPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [providers, setProviders] = useState([]);
    const [selectedName, setSelectedName] = useState('');
    const [mode, setMode] = useState('configure'); // 'configure' | 'add-custom' | 'edit-custom'

    // Config States
    const [hasKey, setHasKey] = useState(false);
    const [apiKey, setApiKey] = useState('');

    // Advanced Settings
    const [apiUrl, setApiUrl] = useState('');
    const [limit, setLimit] = useState('10');
    const [useProxy, setUseProxy] = useState(false);
    const [proxyUrl, setProxyUrl] = useState('');
    const [skipWarmup, setSkipWarmup] = useState(false);
    const [queritVersion, setQueritVersion] = useState('abroad');

    const [currentDetails, setCurrentDetails] = useState(null);
    const [currentIsCustom, setCurrentIsCustom] = useState(false);
    const [saving, setSaving] = useState(false);
    const [loadError, setLoadError] = useState(false);
    const [saveStatus, setSaveStatus] = useState(null); // { type: 'success'|'error', text: string }

    // Auto-clear save status after 4 seconds
    useEffect(() => {
        if (!saveStatus) return;
        const timer = setTimeout(() => setSaveStatus(null), 4000);
        return () => clearTimeout(timer);
    }, [saveStatus]);

    // Initial Load
    useEffect(() => {
        fetchProviders();
    }, []);

    const fetchProviders = () => {
        setLoadError(false);
        fetch('/api/providers')
            .then(res => res.json())
            .then(data => {
                setProviders(data);
                // Check if there's a provider parameter in URL
                const providerFromUrl = searchParams.get('provider');
                if (providerFromUrl && data.find(p => p.name === providerFromUrl)) {
                    // If URL has a valid provider parameter, select it
                    selectProvider(providerFromUrl, data);
                } else if (data.length > 0 && !selectedName) {
                    // Otherwise, select the first one if no selection yet
                    selectProvider(data[0].name, data);
                } else if (selectedName) {
                    // Refresh current selection status
                    const p = data.find(x => x.name === selectedName);
                    if (p) {
                        updateLocalState(p);
                    }
                }
            })
            .catch(() => setLoadError(true));
    };

    const selectProvider = (name, list = providers) => {
        setSelectedName(name);
        setMode('configure');
        const p = list.find(x => x.name === name);
        updateLocalState(p);
    };

    const updateLocalState = (p) => {
        if (p) {
            setCurrentDetails(p.details);
            setHasKey(p.has_key);
            setCurrentIsCustom(p.is_custom || false);

            // If backend returns previously saved user settings, populate them
            if (p.user_settings) {
                setApiUrl(p.user_settings.api_url || '');
                setLimit(p.user_settings.limit || '10');
                setUseProxy(p.user_settings.use_proxy || false);
                setProxyUrl(p.user_settings.proxy_url || '');
                setSkipWarmup(p.user_settings.skip_warmup || false);
                setQueritVersion(p.user_settings.querit_version || 'abroad');
            } else {
                // Reset to defaults if no config exists
                setApiUrl('');
                setLimit('10');
                setUseProxy(false);
                setProxyUrl('');
                setSkipWarmup(false);
                setQueritVersion('abroad');
            }

            // Always clear API key input when switching/refreshing for security
            setApiKey('');
        }
    };

    const handleProviderChange = (e) => {
        selectProvider(e.target.value);
    };

    const handleDeleteKey = async () => {
        if (!confirm('Are you sure you want to remove the API Key?')) {
            return;
        }

        setSaving(true);
        try {
            // Sending empty key implies deletion
            await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    provider: selectedName,
                    api_key: '', // Empty string to trigger delete in backend
                    api_url: apiUrl,
                    limit: limit,
                    use_proxy: useProxy,
                    proxy_url: proxyUrl,
                    skip_warmup: skipWarmup,
                    querit_version: queritVersion
                })
            });
            setSaveStatus({ type: 'success', text: 'API Key removed successfully.' });
            fetchProviders();
        } catch (e) {
            setSaveStatus({ type: 'error', text: 'Failed to remove API Key. Please try again.' });
        } finally {
            setSaving(false);
        }
    };

    const handleSave = async () => {
        // Validation: If no key stored and input is empty, warn user
        if (!hasKey && !apiKey.trim()) {
            alert('Please enter an API Key.');
            return;
        }

        setSaving(true);
        try {
            const payload = {
                provider: selectedName,
                api_key: apiKey,
                api_url: apiUrl,
                limit: limit,
                use_proxy: useProxy,
                proxy_url: proxyUrl,
                skip_warmup: skipWarmup,
                querit_version: queritVersion
            };

            // If hasKey is true but apiKey is empty, allow updating only advanced settings
            // The backend will preserve the existing API key
            if (hasKey && !apiKey) {
                delete payload.api_key;
            }

            await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            setSaveStatus({ type: 'success', text: `Configuration for ${selectedName} saved.` });
            setApiKey(''); // Clear input for security
            fetchProviders(); // Refresh status
        } catch (e) {
            setSaveStatus({ type: 'error', text: 'Save failed. Please check your connection and try again.' });
        } finally {
            setSaving(false);
        }
    };

    // Custom Provider CRUD handlers
    const handleCreateCustomProvider = async (providerData) => {
        const res = await fetch('/api/custom-providers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(providerData),
        });
        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.error || 'Failed to create provider');
        }
        setSaveStatus({ type: 'success', text: `Custom provider "${providerData.name}" created.` });
        setMode('configure');
        // Select the newly created provider after refresh
        const newName = providerData.name;
        fetchProviders();
        setSelectedName(newName);
        // Fetch and update local state for the new provider
        fetch('/api/providers')
            .then(r => r.json())
            .then(providers => {
                const p = providers.find(x => x.name === newName);
                if (p) updateLocalState(p);
            });
    };

    const handleUpdateCustomProvider = async (providerData) => {
        const { name, ...updateData } = providerData;
        const res = await fetch(`/api/custom-providers/${name}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateData),
        });
        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.error || 'Failed to update provider');
        }
        setSaveStatus({ type: 'success', text: `Custom provider "${name}" updated.` });
        setMode('configure');
        fetchProviders();
    };

    const handleDeleteCustomProvider = async () => {
        if (!confirm(`Are you sure you want to delete the custom provider "${selectedName}"? This cannot be undone.`)) {
            return;
        }

        setSaving(true);
        try {
            const res = await fetch(`/api/custom-providers/${selectedName}`, { method: 'DELETE' });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Failed to delete provider');
            }
            setSaveStatus({ type: 'success', text: `Custom provider "${selectedName}" deleted.` });
            setSelectedName('');
            setCurrentDetails(null);
            setCurrentIsCustom(false);
            fetchProviders();
        } catch (e) {
            setSaveStatus({ type: 'error', text: e.message });
        } finally {
            setSaving(false);
        }
    };

    const handleCancelCustomForm = () => {
        setMode('configure');
    };

    // Get current selected provider object
    const selectedProvider = providers.find(p => p.name === selectedName);

    return (
        <div className="min-h-screen bg-gray-50 p-3 sm:p-4 md:p-6">
            <div className="max-w-2xl mx-auto">
                <Button
                    variant="ghost"
                    className="mb-4 sm:mb-6 pl-0 text-gray-500 hover:text-gray-900"
                    onClick={() => navigate(`/?provider=${selectedName}`)}
                >
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back to Search
                </Button>

                {/* Backend unavailable banner */}
                {loadError && (
                    <div className="mb-4 sm:mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-center justify-between gap-3 text-red-800">
                        <div className="flex items-center gap-3">
                            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                            <p className="text-sm">Cannot connect to the backend service. Make sure it is running.</p>
                        </div>
                        <button
                            onClick={() => fetchProviders()}
                            className="text-sm font-medium text-red-700 hover:text-red-900 underline whitespace-nowrap flex-shrink-0"
                        >
                            Retry
                        </button>
                    </div>
                )}

                <div className="space-y-4 sm:space-y-6">
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                            Configuration
                        </h1>
                        <p className="text-sm sm:text-base text-gray-500 mt-2">
                            Manage API keys and advanced settings for search providers.
                        </p>
                    </div>

                    <Card className="p-4 sm:p-5 md:p-6 space-y-6 sm:space-y-8">
                        {/* Provider Selection */}
                        <div className="space-y-3">
                            <label className="text-sm font-medium flex items-center gap-2 text-gray-700">
                                <Server className="w-4 h-4" />
                                Select Provider
                            </label>
                            <div className="flex items-center gap-2">
                                <select
                                    value={selectedName}
                                    onChange={handleProviderChange}
                                    className="flex h-10 flex-1 items-center justify-between
                                        rounded-md border border-gray-200 bg-white px-3 py-2
                                        text-sm focus:outline-none focus:ring-2
                                        focus:ring-blue-600"
                                >
                                    {providers.map(p => (
                                        <option key={p.name} value={p.name}>
                                            {p.name}{p.is_custom ? ' (Custom)' : ''}
                                        </option>
                                    ))}
                                </select>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setMode('add-custom')}
                                    className="whitespace-nowrap"
                                    title="Add Custom Provider"
                                >
                                    <PlusCircle className="w-4 h-4 sm:mr-1" />
                                    <span className="hidden sm:inline">Add</span>
                                </Button>
                            </div>
                        </div>

                        {/* Custom provider action buttons (Edit/Delete) */}
                        {mode === 'configure' && currentIsCustom && selectedName && (
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setMode('edit-custom')}
                                >
                                    <Pencil className="w-4 h-4 mr-1" />
                                    Edit Provider
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleDeleteCustomProvider}
                                    disabled={saving}
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                                >
                                    <Trash2 className="w-4 h-4 mr-1" />
                                    Delete
                                </Button>
                            </div>
                        )}

                        {/* Mode: Add Custom Provider */}
                        {mode === 'add-custom' && (
                            <>
                                <div className="border-t border-gray-100 my-4"></div>
                                <h3 className="text-sm font-semibold text-gray-900">Add Custom Provider</h3>
                                <CustomProviderForm
                                    initialValues={null}
                                    onSave={handleCreateCustomProvider}
                                    onCancel={handleCancelCustomForm}
                                    isEdit={false}
                                />
                            </>
                        )}

                        {/* Mode: Edit Custom Provider */}
                        {mode === 'edit-custom' && selectedProvider && (
                            <>
                                <div className="border-t border-gray-100 my-4"></div>
                                <h3 className="text-sm font-semibold text-gray-900">Edit Custom Provider: {selectedName}</h3>
                                <CustomProviderForm
                                    initialValues={{ name: selectedName, ...selectedProvider.details }}
                                    onSave={handleUpdateCustomProvider}
                                    onCancel={handleCancelCustomForm}
                                    isEdit={true}
                                />
                            </>
                        )}

                        {/* Mode: Configure existing provider (API key + advanced settings) */}
                        {mode === 'configure' && (
                            <>
                                <div className="border-t border-gray-100 my-4"></div>

                                {/* API Key Section */}
                                <div className="space-y-3">
                                    <label className="text-sm font-medium flex items-center gap-2 text-gray-700">
                                        <Key className="w-4 h-4" />
                                        API Key
                                        {selectedProvider?.api_key_url && (
                                            <a
                                                href={selectedProvider.api_key_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1 text-xs font-normal text-blue-600 hover:text-blue-800 hover:underline ml-1"
                                            >
                                                Get Your API Key
                                                <ExternalLink className="w-3 h-3" />
                                            </a>
                                        )}
                                    </label>

                                    {hasKey ? (
                                        <div
                                            className="flex items-center justify-between bg-green-50 border
                                                border-green-200 rounded-md px-3 py-2"
                                        >
                                            <div className="flex items-center gap-2 text-green-800 font-mono text-sm">
                                                <span>********************</span>
                                                <Badge className="bg-green-200 text-green-800 hover:bg-green-300 border-0">
                                                    Configured
                                                </Badge>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={handleDeleteKey}
                                                className="text-red-600 hover:text-red-700 hover:bg-red-50 h-8"
                                            >
                                                <Trash2 className="w-4 h-4 mr-1" /> Remove
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className="text-sm text-gray-500 mb-2">
                                            No API key configured. Please enter one below.
                                        </div>
                                    )}

                                    {/* Input for New/Update Key */}
                                    <Input
                                        type="password"
                                        placeholder={hasKey
                                            ? 'Enter API Key to update...'
                                            : `Enter API Key for ${selectedName}`}
                                        value={apiKey}
                                        onChange={(e) => setApiKey(e.target.value)}
                                        className="font-mono"
                                    />
                                </div>

                                <div className="border-t border-gray-100 my-4"></div>

                                {/* Advanced Settings */}
                                <div className="space-y-4">
                                    <h3 className="text-sm font-semibold flex items-center gap-2 text-gray-900">
                                        <Settings2 className="w-4 h-4" />
                                        Advanced Settings
                                    </h3>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-2 col-span-2">
                                            <label className="text-xs font-medium text-gray-600">
                                                API Base URL (Optional)
                                            </label>
                                            <Input
                                                placeholder="https://api.example.com/v1/search"
                                                value={apiUrl}
                                                onChange={(e) => setApiUrl(e.target.value)}
                                                className="font-mono text-sm"
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-xs font-medium text-gray-600">
                                                Result Limit
                                            </label>
                                            <Input
                                                type="number"
                                                placeholder="10"
                                                value={limit}
                                                onChange={(e) => setLimit(e.target.value)}
                                            />
                                        </div>
                                    </div>

                                    {/* Proxy Settings */}
                                    <div className="space-y-3 pt-4 border-t border-gray-100">
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                id="use-proxy"
                                                checked={useProxy}
                                                onChange={(e) => setUseProxy(e.target.checked)}
                                                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                            />
                                            <label htmlFor="use-proxy" className="text-sm font-medium text-gray-700">
                                                Use Proxy
                                            </label>
                                        </div>

                                        {useProxy && (
                                            <div className="space-y-2 pl-6">
                                                <label className="text-xs font-medium text-gray-600">
                                                    Proxy URL
                                                </label>
                                                <Input
                                                    placeholder="http://proxy.example.com:8080"
                                                    value={proxyUrl}
                                                    onChange={(e) => setProxyUrl(e.target.value)}
                                                    className="font-mono text-sm"
                                                />
                                                <p className="text-xs text-gray-500">
                                                    Example: http://127.0.0.1:8891
                                                </p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Connection Warmup Settings */}
                                    <div className="space-y-3 pt-4 border-t border-gray-100">
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                id="skip-warmup"
                                                checked={skipWarmup}
                                                onChange={(e) => setSkipWarmup(e.target.checked)}
                                                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                            />
                                            <label htmlFor="skip-warmup" className="text-sm font-medium text-gray-700">
                                                Skip Connection Warmup
                                            </label>
                                        </div>
                                        <p className="text-xs text-gray-500 pl-6">
                                            Disable pre-connection HEAD request. Enable this if using proxy or experiencing timeout issues.
                                        </p>
                                    </div>

                                    {/* Querit Version Settings */}
                                    {selectedName === 'querit' && (
                                        <div className="space-y-3 pt-4 border-t border-gray-100">
                                            <label className="text-xs font-medium text-gray-600">
                                                Querit Version
                                            </label>
                                            <select
                                                value={queritVersion}
                                                onChange={(e) => setQueritVersion(e.target.value)}
                                                className="flex h-10 w-full items-center justify-between rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                                            >
                                                <option value="abroad">Abroad</option>
                                                <option value="domestic">Domestic</option>
                                                <option value="all">All</option>
                                            </select>
                                        </div>
                                    )}
                                </div>

                                {/* Save Action */}
                                <div className="pt-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                                    <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
                                        <Save className="w-4 h-4 mr-2" />
                                        <span className="hidden sm:inline">{saving ? 'Saving Configuration...' : 'Save Configuration'}</span>
                                        <span className="sm:hidden">{saving ? 'Saving...' : 'Save'}</span>
                                    </Button>
                                    {saveStatus && (
                                        <div className={`flex items-center gap-2 text-sm ${saveStatus.type === 'success' ? 'text-emerald-700' : 'text-red-700'}`}>
                                            {saveStatus.type === 'success'
                                                ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                                                : <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                            }
                                            <span>{saveStatus.text}</span>
                                        </div>
                                    )}
                                </div>

                                {/* Technical Details (Read-only) */}
                                <div className="border-t pt-4 sm:pt-6 mt-4 sm:mt-6">
                                    <div className="flex items-center justify-between mb-3 sm:mb-4">
                                        <h3 className="text-sm font-semibold flex items-center gap-2 text-gray-900">
                                            <Code className="w-4 h-4" />
                                            <span className="hidden sm:inline">Provider Specs (Read-only)</span>
                                            <span className="sm:hidden">Provider Specs</span>
                                        </h3>
                                        {currentIsCustom && (
                                            <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-200 border-0 text-xs">
                                                Custom
                                            </Badge>
                                        )}
                                    </div>

                                    <div className="bg-gray-900 rounded-lg p-3 sm:p-4 overflow-x-auto shadow-inner">
                                        {currentDetails ? (
                                            <pre className="text-xs leading-relaxed text-gray-300 font-mono">
                                                {JSON.stringify(currentDetails, null, 2)}
                                            </pre>
                                        ) : (
                                            <p className="text-gray-500 text-xs sm:text-sm">No details available</p>
                                        )}
                                    </div>
                                </div>
                            </>
                        )}
                    </Card>
                </div>
            </div>
        </div>
    );
}

export default ConfigPage;
