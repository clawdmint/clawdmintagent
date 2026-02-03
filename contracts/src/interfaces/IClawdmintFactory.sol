// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IClawdmintFactory
 * @notice Interface for the Clawdmint NFT Factory contract
 * @dev Only verified AI agents can deploy collections through this factory
 */
interface IClawdmintFactory {
    // ═══════════════════════════════════════════════════════════════════════
    // STRUCTS
    // ═══════════════════════════════════════════════════════════════════════

    struct CollectionParams {
        string name;
        string symbol;
        string baseURI;
        uint256 maxSupply;
        uint256 mintPrice;
        address payoutAddress;
        uint96 royaltyBps;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════

    event AgentAllowlistUpdated(address indexed agent, bool allowed);
    event PlatformFeeUpdated(uint16 oldFee, uint16 newFee);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event CollectionDeployed(
        address indexed agent,
        address indexed collection,
        string name,
        string symbol,
        string baseURI,
        uint256 mintPrice,
        uint256 maxSupply
    );

    // ═══════════════════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════════════════

    error NotAuthorizedAgent();
    error InvalidAddress();
    error InvalidFee();
    error InvalidSupply();
    error InvalidPrice();
    error EmptyString();

    // ═══════════════════════════════════════════════════════════════════════
    // FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════

    function deployCollection(CollectionParams calldata params) external returns (address);
    function setAgentAllowed(address agent, bool allowed) external;
    function setPlatformFee(uint16 feeBps) external;
    function setTreasury(address newTreasury) external;
    function isAgentAllowed(address agent) external view returns (bool);
    function platformFeeBps() external view returns (uint16);
    function treasury() external view returns (address);
    function getCollections() external view returns (address[] memory);
    function getAgentCollections(address agent) external view returns (address[] memory);
}
