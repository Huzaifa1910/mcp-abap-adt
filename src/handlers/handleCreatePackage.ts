import { McpError, ErrorCode } from '../lib/utils';
import { makeAdtRequest, return_error, getBaseUrl, activateObject } from '../lib/utils';
import { getConfig } from '../index';

/**
 * Create an ABAP package via ADT.
 *
 * args:
 *   package_name      - required. For $TMP-rooted packages name MUST start
 *                       with $, # or T. Z* names need a non-$TMP super.
 *   description       - required, short description
 *   super_package     - optional, default "$TMP"
 *   software_component- optional. Auto-set to LOCAL when super is $TMP/#/T,
 *                       else defaults to HOME.
 *   transport         - optional, transport request (required for SC != LOCAL)
 *   activate          - optional, default true
 */
export async function handleCreatePackage(args: any) {
    try {
        if (!args?.package_name) {
            throw new McpError(ErrorCode.InvalidParams, 'package_name is required');
        }
        if (!args?.description) {
            throw new McpError(ErrorCode.InvalidParams, 'description is required');
        }

        const name = String(args.package_name).toUpperCase();
        const description = String(args.description);
        const superPackage = String(args.super_package || '$TMP').toUpperCase();
        const isLocal = /^[\$#T]/.test(superPackage);
        const softwareComponent = String(
            args.software_component || (isLocal ? 'LOCAL' : 'HOME')
        ).toUpperCase();
        const transport = args.transport ? String(args.transport) : '';
        const doActivate = args.activate !== false;
        const responsible = getConfig().username.toUpperCase();

        if (isLocal && !/^[\$#T]/.test(name)) {
            throw new McpError(
                ErrorCode.InvalidParams,
                `Package "${name}" cannot be assigned to ${superPackage}: ` +
                `local packages require a name starting with $, # or T.`
            );
        }

        // Schema requires: superPackage, applicationComponent, transport
        // (with softwareComponent + transportLayer), translation, useAccesses,
        // packageInterfaces, subPackages — even for local packages.
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<pak:package xmlns:pak="http://www.sap.com/adt/packages"
             xmlns:adtcore="http://www.sap.com/adt/core"
             adtcore:type="DEVC/K"
             adtcore:name="${name}"
             adtcore:description="${escapeXml(description)}"
             adtcore:responsible="${escapeXml(responsible)}"
             adtcore:masterLanguage="EN">
  <pak:attributes pak:packageType="development"/>
  <pak:superPackage adtcore:name="${superPackage}"/>
  <pak:applicationComponent pak:name=""/>
  <pak:transport>
    <pak:softwareComponent pak:name="${softwareComponent}"/>
    <pak:transportLayer pak:name=""/>
  </pak:transport>
  <pak:translation pak:textsTranslated="false"/>
  <pak:useAccesses/>
  <pak:packageInterfaces/>
  <pak:subPackages/>
</pak:package>`;

        const baseUrl = await getBaseUrl();
        const createUrl = `${baseUrl}/sap/bc/adt/packages`
            + (transport ? `?corrNr=${encodeURIComponent(transport)}` : '');

        const createResp = await makeAdtRequest(createUrl, 'POST', 60000, xml, undefined, {
            'Content-Type': 'application/vnd.sap.adt.packages.v2+xml',
            'Accept': 'application/vnd.sap.adt.packages.v2+xml'
        });

        const objectUri = `/sap/bc/adt/packages/${encodeURIComponent(name.toLowerCase())}`;
        const log: string[] = [];
        log.push(`Package ${name} created (HTTP ${createResp.status}).`);

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
