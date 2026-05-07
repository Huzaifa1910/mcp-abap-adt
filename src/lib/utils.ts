import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import axios, { AxiosError, AxiosInstance } from 'axios';
import { Agent } from 'https';
import { AxiosResponse } from 'axios';
import { getConfig, SapConfig } from '../index'; // getConfig needs to be exported from index.ts

export { McpError, ErrorCode, AxiosResponse };

export function return_response(response: AxiosResponse) {
    return {
        isError: false,
        content: [{
            type: 'text',
            text: response.data
        }]
    };
}
export function return_error(error: any) {
    return {
        isError: true,
        content: [{
            type: 'text',
            text: `Error: ${error instanceof AxiosError ? String(error.response?.data)
                : error instanceof Error ? error.message
                    : String(error)}`
        }]
    };
}

let axiosInstance: AxiosInstance | null = null;
export function createAxiosInstance() {
    if (!axiosInstance) {
        axiosInstance = axios.create({
            httpsAgent: new Agent({
                rejectUnauthorized: false // Allow self-signed certificates
            })
        });
    }
    return axiosInstance;
}

/**
 * Drop cached CSRF + session cookies so the next write op fetches a fresh
 * stateless session. ADT stateful sessions stick to one app server until
 * cleared, which can manifest as "Service cannot be reached" 503 pages on
 * subsequent calls. Call this between create handlers if needed.
 */
export function resetSession() {
    csrfToken = null;
    cookies = null;
}

/**
 * Best-effort hard session end: hits SAP's logoff endpoint with our cookies,
 * which terminates the stateful session on the server side and releases any
 * enqueue locks held by that session. Always followed by resetSession().
 */
export async function endSapSession(): Promise<void> {
    if (!cookies) {
        // Nothing to log off
        return;
    }
    try {
        const baseUrl = await getBaseUrl();
        await createAxiosInstance()({
            method: 'POST',
            url: `${baseUrl}/sap/public/bc/icf/logoff`,
            headers: { Cookie: cookies },
            timeout: 10000,
            // Don't fail the calling op if logoff itself errors.
            validateStatus: () => true
        });
    } catch { /* ignore */ }
    resetSession();
}

// Cleanup function for tests
export function cleanup() {
    if (axiosInstance) {
        // Clear any interceptors
        const reqInterceptor = axiosInstance.interceptors.request.use((config) => config);
        const resInterceptor = axiosInstance.interceptors.response.use((response) => response);
        axiosInstance.interceptors.request.eject(reqInterceptor);
        axiosInstance.interceptors.response.eject(resInterceptor);
    }
    axiosInstance = null;
    config = undefined;
    csrfToken = null;
    cookies = null;
}

let config: SapConfig | undefined;
let csrfToken: string | null = null;
let cookies: string | null = null; // Variable to store cookies

export async function getBaseUrl() {
    if (!config) {
        config = getConfig();
    }
    const { url } = config;
    try {
        const urlObj = new URL(url);
        const baseUrl = Buffer.from(`${urlObj.origin}`);
        return baseUrl;
    } catch (error) {
        const errorMessage = `Invalid URL in configuration: ${error instanceof Error ? error.message : error}`;
        throw new Error(errorMessage);
    }
}

export async function getAuthHeaders() {
    if (!config) {
        config = getConfig();
    }
    const { username, password, client } = config;
    const auth = Buffer.from(`${username}:${password}`).toString('base64'); // Create Basic Auth string
    return {
        'Authorization': `Basic ${auth}`, // Basic Authentication header
        'X-SAP-Client': client            // SAP client header
    };
}

async function fetchCsrfToken(url: string): Promise<string> {
    try {
        const response = await createAxiosInstance()({
            method: 'GET',
            url,
            headers: {
                ...(await getAuthHeaders()),
                'x-csrf-token': 'fetch'
            }
        });

        const token = response.headers['x-csrf-token'];
        if (!token) {
            throw new Error('No CSRF token in response headers');
        }

        // Extract and store cookies
        if (response.headers['set-cookie']) {
            cookies = response.headers['set-cookie'].join('; ');
        }

        return token;
    } catch (error) {
        // Even if the request fails, try to get token from error response
        if (error instanceof AxiosError && error.response?.headers['x-csrf-token']) {
            const token = error.response.headers['x-csrf-token'];
            if (token) {
                 // Extract and store cookies from the error response as well
                if (error.response.headers['set-cookie']) {
                    cookies = error.response.headers['set-cookie'].join('; ');
                }
                return token;
            }
        }
        // If we couldn't get token from error response either, throw the original error
        throw new Error(`Failed to fetch CSRF token: ${error instanceof Error ? error.message : String(error)}`);
    }
}

export async function makeAdtRequest(
    url: string,
    method: string,
    timeout: number,
    data?: any,
    params?: any,
    extraHeaders?: Record<string, string>
) {
    const writeMethods = ['POST', 'PUT', 'DELETE'];
    if (writeMethods.includes(method) && !csrfToken) {
        try {
            csrfToken = await fetchCsrfToken(url);
        } catch (error) {
            throw new Error('CSRF token is required for write requests but could not be fetched');
        }
    }

    const requestHeaders: Record<string, string> = {
        ...(await getAuthHeaders()),
        ...(extraHeaders || {})
    };

    if (writeMethods.includes(method) && csrfToken) {
        requestHeaders['x-csrf-token'] = csrfToken;
    }

    if (cookies) {
        requestHeaders['Cookie'] = cookies;
    }

    const config: any = {
        method,
        url,
        headers: requestHeaders,
        timeout,
        params: params
    };

    if (data !== undefined) {
        config.data = data;
    }

    try {
        const response = await createAxiosInstance()(config);
        // capture session cookies returned by stateful calls
        if (response.headers['set-cookie']) {
            cookies = response.headers['set-cookie'].join('; ');
        }
        return response;
    } catch (error) {
        if (error instanceof AxiosError && error.response?.status === 403 &&
            String(error.response.data || '').includes('CSRF')) {
            csrfToken = await fetchCsrfToken(url);
            config.headers['x-csrf-token'] = csrfToken;
            return await createAxiosInstance()(config);
        }
        throw error;
    }
}

// ---------------------------------------------------------------------------
// ADT write helpers: lock, unlock, activate
// ---------------------------------------------------------------------------

/**
 * Lock an ADT object for modification. Returns the lock handle.
 * On "currently editing" conflicts, attempts a best-effort release-and-retry
 * for locks owned by the current user (e.g. orphaned from a crashed session).
 */
export async function lockObject(objectUri: string): Promise<string> {
    return lockObjectImpl(objectUri, 0);
}

async function lockObjectImpl(objectUri: string, attempt: number): Promise<string> {
    const baseUrl = await getBaseUrl();
    const url = `${baseUrl}${objectUri}?_action=LOCK&accessMode=MODIFY`;
    try {
        const response = await makeAdtRequest(url, 'POST', 30000, '', undefined, {
            'X-sap-adt-sessiontype': 'stateful',
            'Accept': 'application/vnd.sap.as+xml; dataname=com.sap.adt.lock.Result, application/xml'
        });
        const body = String(response.data || '');
        const m = body.match(/<LOCK_HANDLE>([^<]+)<\/LOCK_HANDLE>/);
        if (!m) {
            throw new Error(`Could not extract lock handle. Response: ${body.slice(0, 500)}`);
        }
        return m[1];
    } catch (err) {
        const body = err instanceof AxiosError
            ? String(err.response?.data || '')
            : '';
        // If our own user is "currently editing" and we have no live session,
        // attempt a best-effort release (no-op for foreign sessions) then retry
        // once. Stuck locks survive ~30 mins until SAP enqueue auto-clears.
        const ownStaleLock = /currently editing/i.test(body) && attempt === 0;
        if (ownStaleLock) {
            try { await tryReleaseObjectLocks(objectUri); } catch { /* ignore */ }
            resetSession();
            return lockObjectImpl(objectUri, attempt + 1);
        }
        throw err;
    }
}

/**
 * Best-effort lock release for stuck locks. POSTs ?_action=UNLOCK without a
 * lockHandle, which SAP accepts as a session-scoped release. Foreign-session
 * locks survive this and require SM12 admin or ENQUEUE timeout (~30 min).
 */
export async function tryReleaseObjectLocks(objectUri: string): Promise<{
    status: number;
    body: string;
}> {
    const baseUrl = await getBaseUrl();
    const url = `${baseUrl}${objectUri}?_action=UNLOCK`;
    try {
        const resp = await makeAdtRequest(url, 'POST', 30000, '', undefined, {
            'X-sap-adt-sessiontype': 'stateful'
        });
        return { status: resp.status, body: String(resp.data || '') };
    } finally {
        // Stateful UNLOCK leaves cookies pinned to one app server; clear them
        // so subsequent calls re-route freely.
        resetSession();
    }
}

/**
 * Release a previously acquired lock and reset session cookies so the
 * next call doesn't get sticky-routed to the same app server.
 */
export async function unlockObject(objectUri: string, lockHandle: string): Promise<void> {
    const baseUrl = await getBaseUrl();
    const url = `${baseUrl}${objectUri}?_action=UNLOCK&lockHandle=${encodeURIComponent(lockHandle)}`;
    try {
        await makeAdtRequest(url, 'POST', 30000, '', undefined, {
            'X-sap-adt-sessiontype': 'stateful'
        });
    } finally {
        resetSession();
    }
}

/**
 * Activate a single ADT object. Returns axios response (errors and warnings
 * are reported in the body, not via HTTP status, so callers should inspect).
 */
export async function activateObject(objectUri: string, objectName: string): Promise<AxiosResponse> {
    const baseUrl = await getBaseUrl();
    const url = `${baseUrl}/sap/bc/adt/activation?method=activate&preauditRequested=true`;
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">
  <adtcore:objectReference adtcore:uri="${objectUri}" adtcore:name="${objectName}"/>
</adtcore:objectReferences>`;
    try {
        return await makeAdtRequest(url, 'POST', 60000, body, undefined, {
            'Content-Type': 'application/xml',
            'Accept': 'application/xml'
        });
    } finally {
        // Drop any sticky session cookies set during activation so subsequent
        // calls re-establish a clean stateless session.
        resetSession();
    }
}

/**
 * Lock + PUT source + unlock for any ADT main-source object.
 * objectUri example: /sap/bc/adt/programs/programs/ZTEST
 */
export async function writeObjectSource(
    objectUri: string,
    sourceCode: string
): Promise<void> {
    const lockHandle = await lockObject(objectUri);
    try {
        const baseUrl = await getBaseUrl();
        const sourceUrl = `${baseUrl}${objectUri}/source/main?lockHandle=${encodeURIComponent(lockHandle)}`;
        await makeAdtRequest(sourceUrl, 'PUT', 60000, sourceCode, undefined, {
            'Content-Type': 'text/plain; charset=utf-8',
            'X-sap-adt-sessiontype': 'stateful'
        });
    } finally {
        await unlockObject(objectUri, lockHandle);
    }
}
