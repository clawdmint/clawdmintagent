// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {ClawdmintFactory} from "../src/ClawdmintFactory.sol";
import {ClawdmintCollection} from "../src/ClawdmintCollection.sol";
import {IClawdmintFactory} from "../src/interfaces/IClawdmintFactory.sol";
import {IClawdmintCollection} from "../src/interfaces/IClawdmintCollection.sol";

contract ClawdmintFactoryTest is Test {
    ClawdmintFactory public factory;
    
    address public owner = makeAddr("owner");
    address public treasury = makeAddr("treasury");
    address public agent = makeAddr("agent");
    address public unauthorizedUser = makeAddr("unauthorized");
    address public minter = makeAddr("minter");
    
    uint16 public constant PLATFORM_FEE_BPS = 250; // 2.5%
    
    event AgentAllowlistUpdated(address indexed agent, bool allowed);
    event CollectionDeployed(
        address indexed agent,
        address indexed collection,
        string name,
        string symbol,
        string baseURI,
        uint256 mintPrice,
        uint256 maxSupply
    );

    function setUp() public {
        vm.prank(owner);
        factory = new ClawdmintFactory(treasury, PLATFORM_FEE_BPS, owner);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DEPLOYMENT TESTS
    // ═══════════════════════════════════════════════════════════════════════

    function test_FactoryDeployment() public view {
        assertEq(factory.owner(), owner);
        assertEq(factory.treasury(), treasury);
        assertEq(factory.platformFeeBps(), PLATFORM_FEE_BPS);
        assertEq(factory.totalCollections(), 0);
    }

    function test_RevertWhen_ZeroTreasury() public {
        vm.expectRevert(IClawdmintFactory.InvalidAddress.selector);
        new ClawdmintFactory(address(0), PLATFORM_FEE_BPS, owner);
    }

    function test_RevertWhen_FeeTooHigh() public {
        vm.expectRevert(IClawdmintFactory.InvalidFee.selector);
        new ClawdmintFactory(treasury, 1001, owner); // > 10%
    }

    // ═══════════════════════════════════════════════════════════════════════
    // AGENT ALLOWLIST TESTS
    // ═══════════════════════════════════════════════════════════════════════

    function test_SetAgentAllowed() public {
        vm.prank(owner);
        vm.expectEmit(true, false, false, true);
        emit AgentAllowlistUpdated(agent, true);
        factory.setAgentAllowed(agent, true);
        
        assertTrue(factory.isAgentAllowed(agent));
    }

    function test_RemoveAgentFromAllowlist() public {
        vm.startPrank(owner);
        factory.setAgentAllowed(agent, true);
        factory.setAgentAllowed(agent, false);
        vm.stopPrank();
        
        assertFalse(factory.isAgentAllowed(agent));
    }

    function test_RevertWhen_NonOwnerSetsAgent() public {
        vm.prank(unauthorizedUser);
        vm.expectRevert();
        factory.setAgentAllowed(agent, true);
    }

    function test_RevertWhen_ZeroAddressAgent() public {
        vm.prank(owner);
        vm.expectRevert(IClawdmintFactory.InvalidAddress.selector);
        factory.setAgentAllowed(address(0), true);
    }

    function test_BatchSetAgents() public {
        address[] memory agents = new address[](3);
        agents[0] = makeAddr("agent1");
        agents[1] = makeAddr("agent2");
        agents[2] = makeAddr("agent3");
        
        bool[] memory allowed = new bool[](3);
        allowed[0] = true;
        allowed[1] = true;
        allowed[2] = true;
        
        vm.prank(owner);
        factory.setAgentsAllowed(agents, allowed);
        
        assertTrue(factory.isAgentAllowed(agents[0]));
        assertTrue(factory.isAgentAllowed(agents[1]));
        assertTrue(factory.isAgentAllowed(agents[2]));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // COLLECTION DEPLOYMENT TESTS
    // ═══════════════════════════════════════════════════════════════════════

    function test_DeployCollection() public {
        // Add agent to allowlist
        vm.prank(owner);
        factory.setAgentAllowed(agent, true);
        
        // Deploy collection as agent
        IClawdmintFactory.CollectionParams memory params = IClawdmintFactory.CollectionParams({
            name: "Test Collection",
            symbol: "TEST",
            baseURI: "ipfs://QmTest/",
            maxSupply: 1000,
            mintPrice: 0.01 ether,
            payoutAddress: agent,
            royaltyBps: 500 // 5%
        });
        
        vm.prank(agent);
        address collection = factory.deployCollection(params);
        
        // Verify collection deployment
        assertNotEq(collection, address(0));
        assertEq(factory.totalCollections(), 1);
        assertEq(factory.getCollectionAt(0), collection);
        
        // Verify collection state
        ClawdmintCollection nft = ClawdmintCollection(collection);
        assertEq(nft.agent(), agent);
        assertEq(nft.name(), "Test Collection");
        assertEq(nft.symbol(), "TEST");
        assertEq(nft.maxSupply(), 1000);
        assertEq(nft.mintPrice(), 0.01 ether);
        assertEq(nft.payoutAddress(), agent);
    }

    function test_RevertWhen_UnauthorizedDeploy() public {
        IClawdmintFactory.CollectionParams memory params = IClawdmintFactory.CollectionParams({
            name: "Test",
            symbol: "TEST",
            baseURI: "ipfs://test/",
            maxSupply: 100,
            mintPrice: 0.01 ether,
            payoutAddress: unauthorizedUser,
            royaltyBps: 500
        });
        
        // CRITICAL TEST: Unauthorized user cannot deploy
        vm.prank(unauthorizedUser);
        vm.expectRevert(IClawdmintFactory.NotAuthorizedAgent.selector);
        factory.deployCollection(params);
    }

    function test_RevertWhen_EmptyName() public {
        vm.prank(owner);
        factory.setAgentAllowed(agent, true);
        
        IClawdmintFactory.CollectionParams memory params = IClawdmintFactory.CollectionParams({
            name: "",
            symbol: "TEST",
            baseURI: "ipfs://test/",
            maxSupply: 100,
            mintPrice: 0.01 ether,
            payoutAddress: agent,
            royaltyBps: 500
        });
        
        vm.prank(agent);
        vm.expectRevert(IClawdmintFactory.EmptyString.selector);
        factory.deployCollection(params);
    }

    function test_RevertWhen_ZeroSupply() public {
        vm.prank(owner);
        factory.setAgentAllowed(agent, true);
        
        IClawdmintFactory.CollectionParams memory params = IClawdmintFactory.CollectionParams({
            name: "Test",
            symbol: "TEST",
            baseURI: "ipfs://test/",
            maxSupply: 0,
            mintPrice: 0.01 ether,
            payoutAddress: agent,
            royaltyBps: 500
        });
        
        vm.prank(agent);
        vm.expectRevert(IClawdmintFactory.InvalidSupply.selector);
        factory.deployCollection(params);
    }

    function test_AgentCollectionsTracking() public {
        vm.prank(owner);
        factory.setAgentAllowed(agent, true);
        
        // Deploy two collections
        IClawdmintFactory.CollectionParams memory params1 = IClawdmintFactory.CollectionParams({
            name: "Collection 1",
            symbol: "COL1",
            baseURI: "ipfs://col1/",
            maxSupply: 100,
            mintPrice: 0.01 ether,
            payoutAddress: agent,
            royaltyBps: 500
        });
        
        IClawdmintFactory.CollectionParams memory params2 = IClawdmintFactory.CollectionParams({
            name: "Collection 2",
            symbol: "COL2",
            baseURI: "ipfs://col2/",
            maxSupply: 200,
            mintPrice: 0.02 ether,
            payoutAddress: agent,
            royaltyBps: 500
        });
        
        vm.startPrank(agent);
        factory.deployCollection(params1);
        factory.deployCollection(params2);
        vm.stopPrank();
        
        address[] memory agentCollections = factory.getAgentCollections(agent);
        assertEq(agentCollections.length, 2);
    }
}

contract ClawdmintCollectionTest is Test {
    ClawdmintFactory public factory;
    ClawdmintCollection public collection;
    
    address public owner = makeAddr("owner");
    address public treasury = makeAddr("treasury");
    address public agent = makeAddr("agent");
    address public minter = makeAddr("minter");
    
    uint256 public constant MINT_PRICE = 0.01 ether;
    uint256 public constant MAX_SUPPLY = 100;
    uint16 public constant PLATFORM_FEE_BPS = 250;

    function setUp() public {
        // Deploy factory
        vm.prank(owner);
        factory = new ClawdmintFactory(treasury, PLATFORM_FEE_BPS, owner);
        
        // Add agent to allowlist
        vm.prank(owner);
        factory.setAgentAllowed(agent, true);
        
        // Deploy collection
        IClawdmintFactory.CollectionParams memory params = IClawdmintFactory.CollectionParams({
            name: "Test NFT",
            symbol: "TNFT",
            baseURI: "ipfs://QmTestBaseURI/",
            maxSupply: MAX_SUPPLY,
            mintPrice: MINT_PRICE,
            payoutAddress: agent,
            royaltyBps: 500
        });
        
        vm.prank(agent);
        address collectionAddr = factory.deployCollection(params);
        collection = ClawdmintCollection(collectionAddr);
        
        // Fund minter
        vm.deal(minter, 10 ether);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // MINTING TESTS
    // ═══════════════════════════════════════════════════════════════════════

    function test_PublicMint() public {
        vm.prank(minter);
        collection.publicMint{value: MINT_PRICE}(1);
        
        assertEq(collection.totalMinted(), 1);
        assertEq(collection.balanceOf(minter), 1);
        assertEq(collection.ownerOf(1), minter);
    }

    function test_MintMultiple() public {
        vm.prank(minter);
        collection.publicMint{value: MINT_PRICE * 5}(5);
        
        assertEq(collection.totalMinted(), 5);
        assertEq(collection.balanceOf(minter), 5);
    }

    function test_RevertWhen_InsufficientPayment() public {
        vm.prank(minter);
        vm.expectRevert(IClawdmintCollection.InsufficientPayment.selector);
        collection.publicMint{value: MINT_PRICE - 1}(1);
    }

    function test_RevertWhen_Overpayment() public {
        vm.prank(minter);
        vm.expectRevert(IClawdmintCollection.InsufficientPayment.selector);
        collection.publicMint{value: MINT_PRICE + 1}(1);
    }

    function test_RevertWhen_ZeroQuantity() public {
        vm.prank(minter);
        vm.expectRevert(IClawdmintCollection.InvalidQuantity.selector);
        collection.publicMint{value: 0}(0);
    }

    function test_RevertWhen_ExceedsMaxSupply() public {
        // Mint all but one
        for (uint256 i = 0; i < MAX_SUPPLY - 1; i++) {
            vm.prank(minter);
            collection.publicMint{value: MINT_PRICE}(1);
        }
        
        // Try to mint 2 more (should fail)
        vm.prank(minter);
        vm.expectRevert(IClawdmintCollection.ExceedsMaxSupply.selector);
        collection.publicMint{value: MINT_PRICE * 2}(2);
    }

    function test_SoldOut() public {
        // Mint all
        vm.startPrank(minter);
        collection.publicMint{value: MINT_PRICE * MAX_SUPPLY}(MAX_SUPPLY);
        vm.stopPrank();
        
        assertTrue(collection.isSoldOut());
        assertEq(collection.remainingSupply(), 0);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // WITHDRAWAL TESTS
    // ═══════════════════════════════════════════════════════════════════════

    function test_Withdraw() public {
        // Mint some tokens
        vm.prank(minter);
        collection.publicMint{value: MINT_PRICE * 10}(10);
        
        uint256 totalRevenue = MINT_PRICE * 10;
        uint256 expectedPlatformFee = (totalRevenue * PLATFORM_FEE_BPS) / 10000;
        uint256 expectedPayout = totalRevenue - expectedPlatformFee;
        
        uint256 treasuryBalanceBefore = treasury.balance;
        uint256 agentBalanceBefore = agent.balance;
        
        vm.prank(agent);
        collection.withdraw();
        
        assertEq(treasury.balance - treasuryBalanceBefore, expectedPlatformFee);
        assertEq(agent.balance - agentBalanceBefore, expectedPayout);
        assertEq(address(collection).balance, 0);
    }

    function test_RevertWhen_UnauthorizedWithdraw() public {
        vm.prank(minter);
        collection.publicMint{value: MINT_PRICE}(1);
        
        vm.prank(minter);
        vm.expectRevert(IClawdmintCollection.NotAuthorized.selector);
        collection.withdraw();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // METADATA TESTS
    // ═══════════════════════════════════════════════════════════════════════

    function test_TokenURI() public {
        vm.prank(minter);
        collection.publicMint{value: MINT_PRICE}(1);
        
        assertEq(collection.tokenURI(1), "ipfs://QmTestBaseURI/1.json");
    }

    function test_ContractURI() public view {
        assertEq(collection.contractURI(), "ipfs://QmTestBaseURI/collection.json");
    }

    function test_SetBaseURI() public {
        vm.prank(agent);
        collection.setBaseURI("ipfs://NewURI/");
        
        vm.prank(minter);
        collection.publicMint{value: MINT_PRICE}(1);
        
        assertEq(collection.tokenURI(1), "ipfs://NewURI/1.json");
    }

    function test_FreezeMetadata() public {
        vm.prank(agent);
        collection.freezeMetadata();
        
        assertTrue(collection.metadataFrozen());
        
        vm.prank(agent);
        vm.expectRevert(IClawdmintCollection.MetadataIsFrozen.selector);
        collection.setBaseURI("ipfs://ShouldFail/");
    }

    function test_RevertWhen_NonAgentSetsURI() public {
        vm.prank(minter);
        vm.expectRevert(IClawdmintCollection.NotAuthorized.selector);
        collection.setBaseURI("ipfs://Hacked/");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ROYALTY TESTS (EIP-2981)
    // ═══════════════════════════════════════════════════════════════════════

    function test_RoyaltyInfo() public view {
        uint256 salePrice = 1 ether;
        (address receiver, uint256 royaltyAmount) = collection.royaltyInfo(1, salePrice);
        
        assertEq(receiver, agent);
        assertEq(royaltyAmount, (salePrice * 500) / 10000); // 5%
    }

    function test_SupportsInterface() public view {
        // ERC-721
        assertTrue(collection.supportsInterface(0x80ac58cd));
        // ERC-2981 (Royalties)
        assertTrue(collection.supportsInterface(0x2a55205a));
        // ERC-165
        assertTrue(collection.supportsInterface(0x01ffc9a7));
    }
}
