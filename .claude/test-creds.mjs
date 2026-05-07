import axios from 'axios';
import { Agent } from 'https';

const httpsAgent = new Agent({ rejectUnauthorized: false });

async function test(label, baseUrl, user, pass, client) {
  const url = `${baseUrl.replace(/\/$/, '')}/sap/bc/adt/discovery`;
  const auth = Buffer.from(`${user}:${pass}`).toString('base64');
  try {
    const r = await axios.get(url, {
      headers: { Authorization: `Basic ${auth}`, 'X-SAP-Client': client },
      httpsAgent,
      timeout: 25000,
      validateStatus: () => true,
    });
    const sapReason = r.headers['sap-login-failed-reason'] || r.headers['sap-login-failed'] || '';
    console.log(`[${label}] ${baseUrl} user=${user} client=${client} -> HTTP ${r.status}${sapReason ? ' | ' + sapReason : ''}`);
  } catch (e) {
    console.log(`[${label}] ${baseUrl} user=${user} client=${client} -> ERROR ${e.message}`);
  }
}

await test('SOURCE', 'https://saprouter.tallymarkscloud.com:4448/', 'TMC.AI01', 'Tmc@1234', '600');
await test('TARGET', 'https://saprouter.tallymarkscloud.com:4452/', 'TMC.AI',   'Tmc@1234', '701');
