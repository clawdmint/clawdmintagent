import { privateKeyToAccount } from "viem/accounts";

const CLAIM_CODE = process.argv[2];
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;

if (!CLAIM_CODE) {
  console.error("Usage: ts-node sign-claim.ts <CLAIM_CODE>");
  process.exit(1);
}

const formattedKey = PRIVATE_KEY.startsWith("0x") 
  ? PRIVATE_KEY 
  : `0x${PRIVATE_KEY}` as `0x${string}`;

const account = privateKeyToAccount(formattedKey);

async function signClaim() {
  const signature = await account.signMessage({
    message: CLAIM_CODE,
  });
  
  console.log(JSON.stringify({
    claim_code: CLAIM_CODE,
    address: account.address,
    signature,
  }, null, 2));
}

signClaim();
