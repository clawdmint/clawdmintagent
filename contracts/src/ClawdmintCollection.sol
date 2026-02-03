// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {IClawdmintCollection} from "./interfaces/IClawdmintCollection.sol";

/**
 * @title ClawdmintCollection
 * @notice ERC-721 NFT collection deployed by verified AI agents through Clawdmint
 * @dev Implements EIP-2981 royalties, gas-optimized minting, and platform fee distribution
 * 
 * Security features:
 * - ReentrancyGuard on mint and withdraw
 * - Immutable deploy-time parameters
 * - Explicit msg.sender checks (no tx.origin)
 * - Custom errors for gas efficiency
 */
contract ClawdmintCollection is ERC721, ERC2981, ReentrancyGuard, IClawdmintCollection {
    using Strings for uint256;

    // ═══════════════════════════════════════════════════════════════════════
    // IMMUTABLE STATE
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice The AI agent that deployed this collection
    address public immutable override agent;

    /// @notice Maximum number of tokens that can be minted
    uint256 public immutable override maxSupply;

    /// @notice Price per token in wei
    uint256 public immutable override mintPrice;

    /// @notice Address that receives mint revenue (minus platform fee)
    address public immutable override payoutAddress;

    /// @notice Platform fee in basis points (e.g., 250 = 2.5%)
    uint16 public immutable platformFeeBps;

    /// @notice Platform treasury address
    address public immutable platformTreasury;

    // ═══════════════════════════════════════════════════════════════════════
    // MUTABLE STATE
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice Base URI for token metadata
    string private _baseTokenURI;

    /// @notice Counter for token IDs (starts at 1)
    uint256 private _tokenIdCounter;

    /// @notice Whether metadata can still be updated
    bool public override metadataFrozen;

    // ═══════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Deploys a new NFT collection
     * @param _agent The AI agent deploying this collection
     * @param _name Collection name
     * @param _symbol Collection symbol
     * @param _baseURI Base URI for token metadata
     * @param _maxSupply Maximum supply
     * @param _mintPrice Price per mint in wei
     * @param _payoutAddress Address to receive mint revenue
     * @param _royaltyBps Royalty percentage in basis points
     * @param _platformFeeBps Platform fee in basis points
     * @param _platformTreasury Platform treasury address
     */
    constructor(
        address _agent,
        string memory _name,
        string memory _symbol,
        string memory _baseURI,
        uint256 _maxSupply,
        uint256 _mintPrice,
        address _payoutAddress,
        uint96 _royaltyBps,
        uint16 _platformFeeBps,
        address _platformTreasury
    ) ERC721(_name, _symbol) {
        agent = _agent;
        maxSupply = _maxSupply;
        mintPrice = _mintPrice;
        payoutAddress = _payoutAddress;
        platformFeeBps = _platformFeeBps;
        platformTreasury = _platformTreasury;
        _baseTokenURI = _baseURI;
        _tokenIdCounter = 0;

        // Set default royalty for EIP-2981
        _setDefaultRoyalty(_payoutAddress, _royaltyBps);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // EXTERNAL FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Mint NFTs to the caller
     * @param quantity Number of tokens to mint
     * @dev Anyone can mint. Payment must be exact. Uses CEI pattern.
     */
    function publicMint(uint256 quantity) external payable override nonReentrant {
        // Checks
        if (quantity == 0) revert InvalidQuantity();
        if (_tokenIdCounter + quantity > maxSupply) revert ExceedsMaxSupply();
        if (msg.value != mintPrice * quantity) revert InsufficientPayment();

        // Effects
        uint256 startTokenId = _tokenIdCounter + 1;
        _tokenIdCounter += quantity;

        // Interactions
        for (uint256 i = 0; i < quantity;) {
            _safeMint(msg.sender, startTokenId + i);
            unchecked { ++i; }
        }

        emit Minted(msg.sender, startTokenId, quantity);
    }

    /**
     * @notice Withdraw collected funds, splitting between payout address and platform
     * @dev Can be called by agent or payout address. Uses CEI pattern.
     */
    function withdraw() external override nonReentrant {
        if (msg.sender != agent && msg.sender != payoutAddress) {
            revert NotAuthorized();
        }

        uint256 balance = address(this).balance;
        if (balance == 0) revert WithdrawFailed();

        // Calculate platform fee
        uint256 platformFee = (balance * platformFeeBps) / 10000;
        uint256 payoutAmount = balance - platformFee;

        // Transfer to platform treasury
        if (platformFee > 0) {
            (bool treasurySuccess,) = platformTreasury.call{value: platformFee}("");
            if (!treasurySuccess) revert WithdrawFailed();
        }

        // Transfer to payout address
        (bool payoutSuccess,) = payoutAddress.call{value: payoutAmount}("");
        if (!payoutSuccess) revert WithdrawFailed();

        emit FundsWithdrawn(payoutAddress, payoutAmount, platformFee);
    }

    /**
     * @notice Update the base URI for metadata
     * @param newBaseURI New base URI
     * @dev Only callable by agent before metadata is frozen
     */
    function setBaseURI(string calldata newBaseURI) external override {
        if (msg.sender != agent) revert NotAuthorized();
        if (metadataFrozen) revert MetadataIsFrozen();

        string memory oldURI = _baseTokenURI;
        _baseTokenURI = newBaseURI;

        emit BaseURIUpdated(oldURI, newBaseURI);
    }

    /**
     * @notice Permanently freeze metadata (irreversible)
     * @dev Only callable by agent
     */
    function freezeMetadata() external override {
        if (msg.sender != agent) revert NotAuthorized();
        
        metadataFrozen = true;
        emit MetadataFrozen();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Get total number of tokens minted
     */
    function totalMinted() external view override returns (uint256) {
        return _tokenIdCounter;
    }

    /**
     * @notice Get remaining supply available to mint
     */
    function remainingSupply() external view returns (uint256) {
        return maxSupply - _tokenIdCounter;
    }

    /**
     * @notice Check if the collection is sold out
     */
    function isSoldOut() external view returns (bool) {
        return _tokenIdCounter >= maxSupply;
    }

    /**
     * @notice Get the token URI for a given token ID
     * @param tokenId The token ID
     */
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        
        string memory baseURI = _baseTokenURI;
        return bytes(baseURI).length > 0 
            ? string(abi.encodePacked(baseURI, tokenId.toString(), ".json"))
            : "";
    }

    /**
     * @notice Get contract-level metadata URI
     */
    function contractURI() external view returns (string memory) {
        return string(abi.encodePacked(_baseTokenURI, "collection.json"));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // INTERFACE SUPPORT
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Check interface support (ERC-721, ERC-2981, ERC-165)
     */
    function supportsInterface(bytes4 interfaceId) 
        public 
        view 
        override(ERC721, ERC2981) 
        returns (bool) 
    {
        return super.supportsInterface(interfaceId);
    }
}
