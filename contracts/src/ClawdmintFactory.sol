// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IClawdmintFactory} from "./interfaces/IClawdmintFactory.sol";
import {ClawdmintCollection} from "./ClawdmintCollection.sol";

/**
 * @title ClawdmintFactory
 * @notice Factory contract for deploying NFT collections on Clawdmint
 * @dev Only verified AI agents on the allowlist can deploy collections
 * 
 * CRITICAL SECURITY:
 * - On-chain allowlist is the authoritative source for deployment permissions
 * - Backend authorization is supplementary, not sufficient
 * - Uses Ownable2Step for secure ownership transfers
 * - No tx.origin usage - explicit msg.sender checks only
 * - Custom errors for gas efficiency
 */
contract ClawdmintFactory is Ownable2Step, IClawdmintFactory {
    // ═══════════════════════════════════════════════════════════════════════
    // STATE VARIABLES
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice Platform fee in basis points (e.g., 250 = 2.5%)
    uint16 public override platformFeeBps;

    /// @notice Platform treasury address for fee collection
    address public override treasury;

    /// @notice Mapping of agent addresses to their allowlist status
    mapping(address => bool) private _agentAllowlist;

    /// @notice Array of all deployed collection addresses
    address[] private _allCollections;

    /// @notice Mapping of agent address to their deployed collections
    mapping(address => address[]) private _agentCollections;

    /// @notice Maximum allowed platform fee (10%)
    uint16 private constant MAX_PLATFORM_FEE = 1000;

    // ═══════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Deploy the factory contract
     * @param _treasury Platform treasury address
     * @param _platformFeeBps Initial platform fee in basis points
     * @param _owner Contract owner (can be multisig)
     */
    constructor(
        address _treasury,
        uint16 _platformFeeBps,
        address _owner
    ) Ownable(_owner) {
        if (_treasury == address(0)) revert InvalidAddress();
        if (_platformFeeBps > MAX_PLATFORM_FEE) revert InvalidFee();

        treasury = _treasury;
        platformFeeBps = _platformFeeBps;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // AGENT MANAGEMENT (OWNER ONLY)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Add or remove an agent from the allowlist
     * @param agent The agent address to update
     * @param allowed Whether the agent is allowed to deploy
     * @dev Only callable by owner. This is the authoritative permission source.
     */
    function setAgentAllowed(address agent, bool allowed) external override onlyOwner {
        if (agent == address(0)) revert InvalidAddress();
        
        _agentAllowlist[agent] = allowed;
        emit AgentAllowlistUpdated(agent, allowed);
    }

    /**
     * @notice Batch update multiple agents on the allowlist
     * @param agents Array of agent addresses
     * @param allowed Array of allowed statuses
     */
    function setAgentsAllowed(address[] calldata agents, bool[] calldata allowed) external onlyOwner {
        if (agents.length != allowed.length) revert InvalidAddress();
        
        for (uint256 i = 0; i < agents.length;) {
            if (agents[i] == address(0)) revert InvalidAddress();
            _agentAllowlist[agents[i]] = allowed[i];
            emit AgentAllowlistUpdated(agents[i], allowed[i]);
            unchecked { ++i; }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PLATFORM CONFIGURATION (OWNER ONLY)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Update the platform fee
     * @param feeBps New fee in basis points (max 10%)
     */
    function setPlatformFee(uint16 feeBps) external override onlyOwner {
        if (feeBps > MAX_PLATFORM_FEE) revert InvalidFee();
        
        uint16 oldFee = platformFeeBps;
        platformFeeBps = feeBps;
        
        emit PlatformFeeUpdated(oldFee, feeBps);
    }

    /**
     * @notice Update the treasury address
     * @param newTreasury New treasury address
     */
    function setTreasury(address newTreasury) external override onlyOwner {
        if (newTreasury == address(0)) revert InvalidAddress();
        
        address oldTreasury = treasury;
        treasury = newTreasury;
        
        emit TreasuryUpdated(oldTreasury, newTreasury);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // COLLECTION DEPLOYMENT (VERIFIED AGENTS ONLY)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Deploy a new NFT collection
     * @param params Collection parameters
     * @return collection Address of the deployed collection
     * @dev ONLY callable by verified agents on the allowlist.
     *      This is enforced on-chain and cannot be bypassed.
     */
    function deployCollection(CollectionParams calldata params) 
        external 
        override 
        returns (address collection) 
    {
        // CRITICAL: On-chain agent verification - THE authoritative check
        if (!_agentAllowlist[msg.sender]) revert NotAuthorizedAgent();

        // Validate parameters
        if (bytes(params.name).length == 0) revert EmptyString();
        if (bytes(params.symbol).length == 0) revert EmptyString();
        if (bytes(params.baseURI).length == 0) revert EmptyString();
        if (params.maxSupply == 0) revert InvalidSupply();
        if (params.payoutAddress == address(0)) revert InvalidAddress();

        // Deploy the collection
        collection = address(new ClawdmintCollection(
            msg.sender,                 // agent
            params.name,
            params.symbol,
            params.baseURI,
            params.maxSupply,
            params.mintPrice,
            params.payoutAddress,
            params.royaltyBps,
            platformFeeBps,
            treasury
        ));

        // Track the deployment
        _allCollections.push(collection);
        _agentCollections[msg.sender].push(collection);

        emit CollectionDeployed(
            msg.sender,
            collection,
            params.name,
            params.symbol,
            params.baseURI,
            params.mintPrice,
            params.maxSupply
        );
    }

    // ═══════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Check if an agent is on the allowlist
     * @param agent The agent address to check
     */
    function isAgentAllowed(address agent) external view override returns (bool) {
        return _agentAllowlist[agent];
    }

    /**
     * @notice Get all deployed collections
     */
    function getCollections() external view override returns (address[] memory) {
        return _allCollections;
    }

    /**
     * @notice Get collections deployed by a specific agent
     * @param agent The agent address
     */
    function getAgentCollections(address agent) external view override returns (address[] memory) {
        return _agentCollections[agent];
    }

    /**
     * @notice Get the total number of deployed collections
     */
    function totalCollections() external view returns (uint256) {
        return _allCollections.length;
    }

    /**
     * @notice Get a collection by index
     * @param index The index in the collections array
     */
    function getCollectionAt(uint256 index) external view returns (address) {
        return _allCollections[index];
    }
}
