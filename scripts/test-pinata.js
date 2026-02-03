// ═══════════════════════════════════════════════════════════════════════════════
// PINATA CONNECTION TEST
// ═══════════════════════════════════════════════════════════════════════════════

require("dotenv").config();

async function testPinata() {
  console.log("🔍 Testing Pinata connection...\n");

  const jwt = process.env.PINATA_JWT;

  if (!jwt) {
    console.error("❌ PINATA_JWT not found in .env");
    process.exit(1);
  }

  try {
    // Test 1: Verify JWT with Pinata API
    console.log("Test 1: Authenticating with Pinata...");
    const authResponse = await fetch(
      "https://api.pinata.cloud/data/testAuthentication",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${jwt}`,
        },
      }
    );

    if (!authResponse.ok) {
      throw new Error(`Auth failed: ${authResponse.status} ${authResponse.statusText}`);
    }

    const authData = await authResponse.json();
    console.log("✅ Authentication successful!");
    console.log(`   Message: ${authData.message}\n`);

    // Test 2: Upload a small test JSON file
    console.log("Test 2: Uploading test file to IPFS...");
    
    const testData = {
      name: "Clawdmint Test",
      description: "Test upload from Clawdmint platform",
      timestamp: new Date().toISOString(),
      platform: "Base Mainnet",
    };

    const formData = new FormData();
    const blob = new Blob([JSON.stringify(testData, null, 2)], {
      type: "application/json",
    });
    formData.append("file", blob, "test.json");

    const uploadResponse = await fetch(
      "https://api.pinata.cloud/pinning/pinFileToIPFS",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
        },
        body: formData,
      }
    );

    if (!uploadResponse.ok) {
      const error = await uploadResponse.text();
      throw new Error(`Upload failed: ${uploadResponse.status} - ${error}`);
    }

    const uploadData = await uploadResponse.json();
    console.log("✅ Upload successful!");
    console.log(`   IPFS Hash: ${uploadData.IpfsHash}`);
    console.log(`   URL: https://gateway.pinata.cloud/ipfs/${uploadData.IpfsHash}\n`);

    console.log("🎉 All Pinata tests passed!");
    console.log("✅ Ready for production deployment!\n");
  } catch (error) {
    console.error("❌ Pinata test failed:");
    console.error(error.message);
    process.exit(1);
  }
}

testPinata();
