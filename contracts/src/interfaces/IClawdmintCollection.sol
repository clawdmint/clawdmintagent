// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IClawdmintCollection
 * @notice Interface for Clawdmint NFT Collection contracts
 */
interface IClawdmintCollection {
    // ═══════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════

    event Minted(address indexed minter, uint256 indexed startTokenId, uint256 quantity);
    event MetadataFrozen();
    event BaseURIUpdated(string oldURI, string newURI);
    event FundsWithdrawn(address indexed to, uint256 amount, uint256 platformFee);

    // ═══════════════════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════════════════

    error MintNotStarted();
    error SoldOut();
    error ExceedsMaxSupply();
    error InsufficientPayment();
    error InvalidQuantity();
    error MetadataIsFrozen();
    error WithdrawFailed();
    error NotAuthorized();

    // ═══════════════════════════════════════════════════════════════════════
    // FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════

    function publicMint(uint256 quantity) external payable;
    function withdraw() external;
    function setBaseURI(string calldata newBaseURI) external;
    function freezeMetadata() external;
    
    // View functions
    function agent() external view returns (address);
    function maxSupply() external view returns (uint256);
    function mintPrice() external view returns (uint256);
    function totalMinted() external view returns (uint256);
    function payoutAddress() external view returns (address);
    function metadataFrozen() external view returns (bool);
}
