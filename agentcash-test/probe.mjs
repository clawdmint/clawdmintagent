import { checkEndpointSchema } from '@agentcash/discovery';

const url = process.argv[2] || 'https://clawdmint.xyz/api/x402/register';
const noBody = await checkEndpointSchema({ url, probe: true });
console.log(JSON.stringify(noBody, null, 2));
