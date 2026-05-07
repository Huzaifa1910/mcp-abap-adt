import { McpError, ErrorCode } from '../lib/utils';
import { makeAdtRequest, return_error, getBaseUrl } from '../lib/utils';
import { getConfig } from '../index';

/**
 * Create a new transport request (CTS) on the SAP system via ADT.
 *
 * Endpoint: POST /sap/bc/adt/cts/transportrequests
 *
 * args:
 *   description - required, short description for the TR
 *   type        - optional, "K" (Workbench, default) or "W" (Customizing)
 *   target      - optional, transport target system (e.g. "QAS"). Empty
 *                 string lets SAP pick the configured transport layer; for
 *                 a system without a transport route, pass "LOCAL" to make
 *                 a local request (won't be released to a follow-on system).
 *   owner       - optional, defaults to the logged-in user
 *
 * Returns the new TR number (and auto-created task number) plus the raw
 * server response.
 */
export async function handleCreateTransport(args: any) {
    try {
        if (!args?.description) {
            throw new McpError(ErrorCode.InvalidParams, 'description is required');
        }

        const description = String(args.description);
        const type = String(args.type || 'K').toUpperCase();
        const target = args.target !== undefined && args.target !== null
            ? String(args.target).toUpperCase()
            : '';
        const owner = String(args.owner || getConfig().username).toUpperCase();

        if (!['K', 'W'].includes(type)) {
            throw new McpError(
                ErrorCode.InvalidParams,
                `Invalid type "${type}". Use "K" (Workbench) or "W" (Customizing).`
            );
        }

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<tm:root xmlns:tm="http://www.sap.com/cts/adt/tm" tm:useraction="newrequest">
  <tm:request tm:desc="${escapeXml(description)}" tm:type="${type}" tm:target="${escapeXml(target)}" tm:cli_dep="">
    <tm:task tm:owner="${escapeXml(owner)}"/>
  </tm:request>
</tm:root>`;

        const baseUrl = await getBaseUrl();
        const createUrl = `${baseUrl}/sap/bc/adt/cts/transportrequests`;

        const resp = await makeAdtRequest(createUrl, 'POST', 60000, xml, undefined, {
            'Content-Type': 'application/vnd.sap.adt.transportorganizer.v1+xml',
            'Accept': 'application/vnd.sap.adt.transportorganizer.v1+xml'
        });

        const body = String(resp.data || '');
        const reqMatch = body.match(/<tm:request[^>]*tm:number="([^"]+)"/);
        const taskMatch = body.match(/<tm:task[^>]*tm:number="([^"]+)"/);

        const log: string[] = [];
        log.push(`Transport request created (HTTP ${resp.status}).`);
        if (reqMatch) log.push(`Request number: ${reqMatch[1]}`);
        if (taskMatch && taskMatch[1] !== reqMatch?.[1]) {
            log.push(`Task number:    ${taskMatch[1]}`);
        }
        log.push(`Owner:          ${owner}`);
        log.push(`Type:           ${type === 'K' ? 'Workbench (K)' : 'Customizing (W)'}`);
        if (target) log.push(`Target:         ${target}`);
        log.push(`Description:    ${description}`);
        log.push('');
        log.push('Server response:');
        log.push(body);

        return {
            isError: false,
            content: [{ type: 'text', text: log.join('\n') }]
        };
    } catch (error) {
        return return_error(error);
    }
}

function escapeXml(s: string): string {
    return s.replace(/[<>&"']/g, c => ({
        '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;'
    } as Record<string, string>)[c]);
}
