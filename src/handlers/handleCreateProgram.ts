import { McpError, ErrorCode } from '../lib/utils';
import {
    makeAdtRequest,
    return_error,
    getBaseUrl,
    activateObject,
    writeObjectSource
} from '../lib/utils';

/**
 * Create an ABAP executable program via ADT.
 *
 * args:
 *   program_name - required, e.g. "ZHELLO"
 *   description  - required, short description
 *   source_code  - optional, full ABAP source. Default: minimal REPORT skeleton.
 *   package      - optional, default "$TMP" (local).
 *   transport    - optional, required when package is not $TMP.
 *   activate     - optional, default true.
 */
export async function handleCreateProgram(args: any) {
    try {
        if (!args?.program_name) {
            throw new McpError(ErrorCode.InvalidParams, 'program_name is required');
        }
        if (!args?.description) {
            throw new McpError(ErrorCode.InvalidParams, 'description is required');
        }

        const name = String(args.program_name).toUpperCase();
        const description = String(args.description);
        const pkg = String(args.package || '$TMP').toUpperCase();
        const transport = args.transport ? String(args.transport) : '';
        const sourceCode = typeof args.source_code === 'string' && args.source_code.length > 0
            ? args.source_code
            : `REPORT ${name}.\n\nWRITE: / 'Hello from ${name}'.\n`;
        const doActivate = args.activate !== false;

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<program:abapProgram xmlns:program="http://www.sap.com/adt/programs/programs"
                     xmlns:adtcore="http://www.sap.com/adt/core"
                     adtcore:type="PROG/P"
                     adtcore:name="${name}"
                     adtcore:description="${escapeXml(description)}">
  <adtcore:packageRef adtcore:name="${pkg}"/>
</program:abapProgram>`;

        const baseUrl = await getBaseUrl();
        const createUrl = `${baseUrl}/sap/bc/adt/programs/programs`
            + (transport ? `?corrNr=${encodeURIComponent(transport)}` : '');

        const createResp = await makeAdtRequest(createUrl, 'POST', 60000, xml, undefined, {
            'Content-Type': 'application/vnd.sap.adt.programs.programs.v2+xml',
            'Accept': 'application/vnd.sap.adt.programs.programs.v2+xml'
        });

        const objectUri = `/sap/bc/adt/programs/programs/${encodeURIComponent(name.toLowerCase())}`;
        const log: string[] = [];
        log.push(`Program ${name} created (HTTP ${createResp.status}).`);

        // Push source code
        await writeObjectSource(objectUri, sourceCode);
        log.push('Source code uploaded.');

        if (doActivate) {
            const actResp = await activateObject(objectUri, name);
            const actBody = String(actResp.data || '');
            log.push(`Activation HTTP ${actResp.status}.`);
            if (actBody.trim()) log.push(`Activation messages:\n${actBody}`);
        }

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
