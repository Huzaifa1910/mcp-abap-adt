import { McpError, ErrorCode } from '../lib/utils';
import {
    makeAdtRequest,
    return_error,
    getBaseUrl,
    activateObject,
    writeObjectSource
} from '../lib/utils';

/**
 * Create an ABAP global class via ADT.
 *
 * args:
 *   class_name  - required, e.g. "ZCL_HCM_EMPLOYEE"
 *   description - required, short description
 *   source_code - optional, full ABAP class source. Default: minimal skeleton.
 *   package     - optional, default "$TMP".
 *   transport   - optional, required for non-$TMP.
 *   activate    - optional, default true.
 */
export async function handleCreateClass(args: any) {
    try {
        if (!args?.class_name) {
            throw new McpError(ErrorCode.InvalidParams, 'class_name is required');
        }
        if (!args?.description) {
            throw new McpError(ErrorCode.InvalidParams, 'description is required');
        }

        const name = String(args.class_name).toUpperCase();
        const description = String(args.description);
        const pkg = String(args.package || '$TMP').toUpperCase();
        const transport = args.transport ? String(args.transport) : '';
        const sourceCode = typeof args.source_code === 'string' && args.source_code.length > 0
            ? args.source_code
            : `CLASS ${name.toLowerCase()} DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
  PROTECTED SECTION.
  PRIVATE SECTION.
ENDCLASS.

CLASS ${name.toLowerCase()} IMPLEMENTATION.
ENDCLASS.`;
        const doActivate = args.activate !== false;

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<class:abapClass xmlns:class="http://www.sap.com/adt/oo/classes"
                 xmlns:adtcore="http://www.sap.com/adt/core"
                 adtcore:type="CLAS/OC"
                 adtcore:name="${name}"
                 adtcore:description="${escapeXml(description)}"
                 class:final="true"
                 class:visibility="public">
  <adtcore:packageRef adtcore:name="${pkg}"/>
  <class:include adtcore:name="${name}" class:includeType="main"/>
</class:abapClass>`;

        const baseUrl = await getBaseUrl();
        const createUrl = `${baseUrl}/sap/bc/adt/oo/classes`
            + (transport ? `?corrNr=${encodeURIComponent(transport)}` : '');

        const createResp = await makeAdtRequest(createUrl, 'POST', 60000, xml, undefined, {
            'Content-Type': 'application/vnd.sap.adt.oo.classes.v3+xml',
            'Accept': 'application/vnd.sap.adt.oo.classes.v3+xml'
        });

        const objectUri = `/sap/bc/adt/oo/classes/${encodeURIComponent(name.toLowerCase())}`;
        const log: string[] = [];
        log.push(`Class ${name} created (HTTP ${createResp.status}).`);

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
