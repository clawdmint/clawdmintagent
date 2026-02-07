// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title ClawdNames
 * @notice On-chain .clawd name service on Base — permanent, transferable ERC-721 names
 * @dev Each name is a unique NFT. Names are lowercase alphanumeric + hyphens.
 *      Pricing is length-based: shorter names cost more.
 *      Revenue goes to the treasury address.
 */
contract ClawdNames is ERC721Enumerable, Ownable, ReentrancyGuard {
    using Strings for uint256;

    // ═══════════════════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════════════════

    error NameTooShort();
    error NameTooLong();
    error NameInvalidChars();
    error NameAlreadyTaken();
    error InsufficientPayment();
    error WithdrawFailed();
    error NameNotFound();
    error NotNameOwner();
    error ZeroAddress();

    // ═══════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════

    event NameRegistered(
        uint256 indexed tokenId,
        string name,
        address indexed owner,
        uint256 price
    );

    event PrimaryNameSet(
        address indexed owner,
        uint256 indexed tokenId,
        string name
    );

    event PriceUpdated(uint8 indexed tier, uint256 newPrice);

    // ═══════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════

    uint8 public constant MIN_NAME_LENGTH = 3;
    uint8 public constant MAX_NAME_LENGTH = 32;
    string public constant NAME_SUFFIX = ".clawd";

    // ═══════════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice Treasury address for receiving registration fees
    address public treasury;

    /// @notice Counter for token IDs
    uint256 private _nextTokenId;

    /// @notice Pricing tiers: tier index → price in wei
    /// tier 0 = 3 chars, tier 1 = 4 chars, tier 2 = 5+ chars
    mapping(uint8 => uint256) public tierPrice;

    /// @notice Name hash → token ID (0 means unregistered)
    mapping(bytes32 => uint256) public nameToTokenId;

    /// @notice Token ID → registered name string
    mapping(uint256 => string) public tokenIdToName;

    /// @notice Address → primary name token ID (0 means no primary)
    mapping(address => uint256) public primaryName;

    /// @notice Base URI for metadata
    string private _baseTokenURI;

    // ═══════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════

    constructor(
        address _treasury,
        address _owner
    ) ERC721("Clawd Names", "CLAWD") Ownable(_owner) {
        if (_treasury == address(0)) revert ZeroAddress();

        treasury = _treasury;
        _nextTokenId = 1; // Start from 1 (0 = unregistered sentinel)

        // Default pricing (in ETH)
        tierPrice[0] = 0.01 ether;   // 3 chars — premium
        tierPrice[1] = 0.005 ether;  // 4 chars
        tierPrice[2] = 0.001 ether;  // 5+ chars
    }

    // ═══════════════════════════════════════════════════════════════════════
    // REGISTRATION
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Register a .clawd name
     * @param name The name to register (without .clawd suffix, e.g. "clawdmint")
     */
    function register(string calldata name) external payable nonReentrant {
        // Validate and normalize
        string memory normalized = _validateAndNormalize(name);
        bytes32 nameHash = keccak256(bytes(normalized));

        // Check availability
        if (nameToTokenId[nameHash] != 0) revert NameAlreadyTaken();

        // Check payment
        uint256 price = getPrice(normalized);
        if (msg.value < price) revert InsufficientPayment();

        // Mint
        uint256 tokenId = _nextTokenId++;
        nameToTokenId[nameHash] = tokenId;
        tokenIdToName[tokenId] = normalized;

        _safeMint(msg.sender, tokenId);

        // Auto-set as primary if user has no primary name
        if (primaryName[msg.sender] == 0) {
            primaryName[msg.sender] = tokenId;
            emit PrimaryNameSet(msg.sender, tokenId, normalized);
        }

        // Send fee to treasury
        (bool sent, ) = treasury.call{value: price}("");
        if (!sent) revert WithdrawFailed();

        // Refund excess
        if (msg.value > price) {
            (bool refunded, ) = msg.sender.call{value: msg.value - price}("");
            if (!refunded) revert WithdrawFailed();
        }

        emit NameRegistered(tokenId, normalized, msg.sender, price);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PRIMARY NAME MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Set your primary .clawd name (must own the token)
     * @param tokenId The token ID of the name to set as primary
     */
    function setPrimaryName(uint256 tokenId) external {
        if (ownerOf(tokenId) != msg.sender) revert NotNameOwner();
        primaryName[msg.sender] = tokenId;
        emit PrimaryNameSet(msg.sender, tokenId, tokenIdToName[tokenId]);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // RESOLUTION (READ FUNCTIONS)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Resolve a name to its owner address
     * @param name The name (without .clawd suffix)
     * @return The owner address (address(0) if unregistered)
     */
    function resolve(string calldata name) external view returns (address) {
        bytes32 nameHash = keccak256(bytes(_toLower(name)));
        uint256 tokenId = nameToTokenId[nameHash];
        if (tokenId == 0) return address(0);
        return ownerOf(tokenId);
    }

    /**
     * @notice Reverse-resolve an address to their primary .clawd name
     * @param addr The address to look up
     * @return The primary name string (empty if none)
     */
    function reverseResolve(address addr) external view returns (string memory) {
        uint256 tokenId = primaryName[addr];
        if (tokenId == 0) return "";
        // Verify still owns it (could have transferred)
        if (ownerOf(tokenId) != addr) return "";
        return tokenIdToName[tokenId];
    }

    /**
     * @notice Check if a name is available for registration
     * @param name The name to check (without .clawd suffix)
     * @return True if available
     */
    function isAvailable(string calldata name) external view returns (bool) {
        bytes32 nameHash = keccak256(bytes(_toLower(name)));
        return nameToTokenId[nameHash] == 0;
    }

    /**
     * @notice Get the registration price for a name
     * @param name The name (without .clawd suffix)
     * @return Price in wei
     */
    function getPrice(string memory name) public view returns (uint256) {
        uint256 len = bytes(name).length;
        if (len <= 3) return tierPrice[0];
        if (len == 4) return tierPrice[1];
        return tierPrice[2];
    }

    /**
     * @notice Get full name with .clawd suffix for a token
     * @param tokenId The token ID
     * @return Full name string (e.g. "clawdmint.clawd")
     */
    function fullName(uint256 tokenId) external view returns (string memory) {
        string memory name = tokenIdToName[tokenId];
        if (bytes(name).length == 0) revert NameNotFound();
        return string(abi.encodePacked(name, NAME_SUFFIX));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // METADATA
    // ═══════════════════════════════════════════════════════════════════════

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        string memory name = tokenIdToName[tokenId];

        // On-chain SVG metadata
        string memory svg = _generateSVG(name);
        string memory json = string(
            abi.encodePacked(
                '{"name":"',
                name,
                '.clawd","description":"A .clawd name on Base","image":"data:image/svg+xml;base64,',
                _base64Encode(bytes(svg)),
                '","attributes":[{"trait_type":"Length","value":"',
                bytes(name).length.toString(),
                '"},{"trait_type":"Suffix","value":".clawd"}]}'
            )
        );

        return string(abi.encodePacked("data:application/json;base64,", _base64Encode(bytes(json))));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ADMIN
    // ═══════════════════════════════════════════════════════════════════════

    function setTierPrice(uint8 tier, uint256 price) external onlyOwner {
        tierPrice[tier] = price;
        emit PriceUpdated(tier, price);
    }

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        treasury = newTreasury;
    }

    function setBaseURI(string calldata uri) external onlyOwner {
        _baseTokenURI = uri;
    }

    /// @notice Emergency withdraw (in case ETH gets stuck)
    function emergencyWithdraw() external onlyOwner {
        (bool sent, ) = treasury.call{value: address(this).balance}("");
        if (!sent) revert WithdrawFailed();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // OVERRIDES (clear primary on transfer)
    // ═══════════════════════════════════════════════════════════════════════

    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override returns (address) {
        address from = super._update(to, tokenId, auth);

        // Clear primary name of sender if this was their primary
        if (from != address(0) && primaryName[from] == tokenId) {
            primaryName[from] = 0;
        }

        // Auto-set primary for receiver if they don't have one
        if (to != address(0) && primaryName[to] == 0) {
            primaryName[to] = tokenId;
            emit PrimaryNameSet(to, tokenId, tokenIdToName[tokenId]);
        }

        return from;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // INTERNAL
    // ═══════════════════════════════════════════════════════════════════════

    function _validateAndNormalize(string calldata name) internal pure returns (string memory) {
        bytes memory b = bytes(name);
        uint256 len = b.length;

        if (len < MIN_NAME_LENGTH) revert NameTooShort();
        if (len > MAX_NAME_LENGTH) revert NameTooLong();

        bytes memory result = new bytes(len);

        for (uint256 i = 0; i < len; i++) {
            bytes1 c = b[i];

            // Lowercase letters
            if (c >= 0x61 && c <= 0x7A) {
                result[i] = c;
            }
            // Uppercase → lowercase
            else if (c >= 0x41 && c <= 0x5A) {
                result[i] = bytes1(uint8(c) + 32);
            }
            // Digits
            else if (c >= 0x30 && c <= 0x39) {
                result[i] = c;
            }
            // Hyphen (not first or last)
            else if (c == 0x2D) {
                if (i == 0 || i == len - 1) revert NameInvalidChars();
                result[i] = c;
            }
            else {
                revert NameInvalidChars();
            }
        }

        return string(result);
    }

    function _toLower(string calldata name) internal pure returns (string memory) {
        bytes memory b = bytes(name);
        bytes memory result = new bytes(b.length);
        for (uint256 i = 0; i < b.length; i++) {
            bytes1 c = b[i];
            if (c >= 0x41 && c <= 0x5A) {
                result[i] = bytes1(uint8(c) + 32);
            } else {
                result[i] = c;
            }
        }
        return string(result);
    }

    function _generateSVG(string memory name) internal pure returns (string memory) {
        return string(
            abi.encodePacked(
                '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 500 500">',
                '<defs><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">',
                '<stop offset="0%" style="stop-color:#0f172a"/>',
                '<stop offset="50%" style="stop-color:#0e1629"/>',
                '<stop offset="100%" style="stop-color:#020617"/>',
                '</linearGradient>',
                '<linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">',
                '<stop offset="0%" style="stop-color:#06b6d4"/>',
                '<stop offset="100%" style="stop-color:#8b5cf6"/>',
                '</linearGradient></defs>',
                '<rect width="500" height="500" fill="url(#bg)" rx="20"/>',
                '<rect x="20" y="20" width="460" height="460" rx="12" fill="none" stroke="url(#accent)" stroke-width="1" opacity="0.3"/>',
                '<text x="250" y="220" font-family="monospace" font-size="36" font-weight="bold" fill="url(#accent)" text-anchor="middle">',
                name,
                '</text>',
                '<text x="250" y="270" font-family="monospace" font-size="24" fill="#64748b" text-anchor="middle">.clawd</text>',
                '<text x="250" y="440" font-family="sans-serif" font-size="14" fill="#334155" text-anchor="middle">Clawd Names on Base</text>',
                '</svg>'
            )
        );
    }

    // Base64 encoding (on-chain)
    function _base64Encode(bytes memory data) internal pure returns (string memory) {
        bytes memory TABLE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        uint256 len = data.length;
        if (len == 0) return "";

        uint256 encodedLen = 4 * ((len + 2) / 3);
        bytes memory result = new bytes(encodedLen);

        uint256 i;
        uint256 j;

        for (i = 0; i < len; ) {
            uint256 a = uint256(uint8(data[i++]));
            uint256 b = i < len ? uint256(uint8(data[i++])) : 0;
            uint256 c = i < len ? uint256(uint8(data[i++])) : 0;

            uint256 triple = (a << 16) | (b << 8) | c;

            result[j++] = TABLE[(triple >> 18) & 0x3F];
            result[j++] = TABLE[(triple >> 12) & 0x3F];
            result[j++] = TABLE[(triple >> 6) & 0x3F];
            result[j++] = TABLE[triple & 0x3F];
        }

        // Padding
        uint256 mod = len % 3;
        if (mod == 1) {
            result[encodedLen - 1] = "=";
            result[encodedLen - 2] = "=";
        } else if (mod == 2) {
            result[encodedLen - 1] = "=";
        }

        return string(result);
    }
}
