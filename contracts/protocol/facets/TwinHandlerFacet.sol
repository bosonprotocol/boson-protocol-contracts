// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import { IBosonTwinHandler } from "../../interfaces/IBosonTwinHandler.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";
import { ProtocolBase } from "../ProtocolBase.sol";
import { ProtocolLib } from "../ProtocolLib.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../interfaces/ITwinToken.sol";
import "./OfferHandlerFacet.sol";

/**
 * @title TwinHandlerFacet
 *
 * @notice Manages digital twinning associated with exchanges within the protocol
 */
contract TwinHandlerFacet is IBosonTwinHandler, ProtocolBase {

    /**
     * @notice Facet Initializer
     */
    function initialize()
    public
    onlyUnInitialized(type(IBosonTwinHandler).interfaceId)
    {
        DiamondLib.addSupportedInterface(type(IBosonTwinHandler).interfaceId);
    }

    /**
     * @notice Creates a Twin.
     *
     * Emits a TwinCreated event if successful.
     *
     * Reverts if:
     * - Not approved to transfer the seller's token
     *
     * @param _twin - the fully populated struct with twin id set to 0x0
     * @param _sellerOperator - placeholder for seller's operator address. TODO: Remove when Create seller is implemented.
     */
    function createTwin(
        Twin memory _twin,
        address _sellerOperator
    )
    external
    override
    {
        // Protocol must be approved to transfer seller’s tokens
        // Seller storage seller = ProtocolLib.getSeller(_twin.sellerId);
        require(isProtocolApproved(_twin.tokenAddress, _sellerOperator, address(this)), NO_TRANSFER_APPROVED); // TODO replace _sellerOperator with seller.operator

        // Get the next twinId and increment the counter
        uint256 twinId = protocolCounters().nextTwinId++;

        // modify incoming struct so event value represents true state
        _twin.id = twinId;

        // Get storage location for twin
        (,Twin storage twin) = fetchTwin(_twin.id);

        // Set twin props individually since memory structs can't be copied to storage
        twin.id = twinId;
        twin.sellerId = _twin.sellerId;
        twin.supplyAvailable = _twin.supplyAvailable;
        twin.supplyIds = _twin.supplyIds;
        twin.tokenId = _twin.tokenId;
        twin.tokenAddress = _twin.tokenAddress;

        // Notify watchers of state change
        emit TwinCreated(twinId, _twin.sellerId, _twin);
    }

    /**
     * @notice Check if protocol is approved to transfer the tokens.
     *
     * @param _tokenAddress - the address of the seller's twin token contract.
     * @param _operator - the seller's operator address.
     * @param _protocol - the protocol address.
     * @return _approved - the approve status.
     */
    function isProtocolApproved(
        address _tokenAddress,
        address _operator,
        address _protocol
    ) internal view returns (bool _approved){
        require(_tokenAddress != address(0), UNSUPPORTED_TOKEN);

        try IERC20(_tokenAddress).allowance(
            _operator,
            _protocol
        ) returns(uint256 _allowance) {
            if (_allowance > 0) {_approved = true; }
        } catch {
            try ITwinToken(_tokenAddress).isApprovedForAll(_operator, _protocol) returns (bool _isApproved) {
                _approved = _isApproved;
            } catch {
                revert(UNSUPPORTED_TOKEN);
            }
        }
    }

    /**
     * @notice Gets the details about a given twin.
     *
     * @param _twinId - the id of the twin to check
     * @return exists - the twin was found
     * @return twin - the twin details. See {BosonTypes.Twin}
     */
    function getTwin(uint256 _twinId)
    external
    view
    returns(bool exists, Twin memory twin) {
        return fetchTwin(_twinId);
    }

    /**
     * @notice Creates a Bundle.
     *
     * Emits a BundleCreated event if successful.
     *
     * Reverts if:
     *
     * - seller does not match caller
     * - any of offers belongs to different seller
     * - any of offers does not exist
     * - offer exists in a different bundle
     * - any of twins belongs to different seller
     * - any of twins does not exist
     *
     * @param _bundle - the fully populated struct with bundle id set to 0x0
     */
    function createBundle(
        Bundle memory _bundle
    )
    external
    override
    {

        // TODO: check seller ID matches msg.sender

        // limit maximum number of offers to avoid running into block gas limit in a loop
        require(_bundle.offerIds.length <= protocolStorage().maxOffersPerGroup, TOO_MANY_OFFERS);

        // Get the next bundle and increment the counter
        uint256 bundleId = protocolCounters().nextBundleId++;

        for (uint i = 0; i < _bundle.offerIds.length; i++) {
            // make sure all offers exist and belong to the seller
            getValidOffer(_bundle.offerIds[i]);

            // Add to bundleByOffer mapping
            require(protocolStorage().bundleByOffer[_bundle.offerIds[i]] == 0, OFFER_MUST_BE_UNIQUE);
            protocolStorage().bundleByOffer[_bundle.offerIds[i]] = bundleId;
        }

        for (uint i = 0; i < _bundle.twinIds.length; i++) {
            // make sure all twins exist and belong to the seller
            getValidTwin(_bundle.twinIds[i]);
        }

        // Get storage location for bundle
        (,Bundle storage bundle) = fetchBundle(bundleId);

        // Set group props individually since memory structs can't be copied to storage
        bundle.id = bundleId;
        bundle.sellerId = _bundle.sellerId;
        bundle.offerIds = _bundle.offerIds;
        bundle.twinIds = _bundle.twinIds;

        // modify incoming struct so event value represents true state
        _bundle.id = bundleId;

        // Notify watchers of state change
        emit BundleCreated(bundleId, _bundle.sellerId, _bundle);
    }

    /**
     * @notice Gets twin from protocol storage, makes sure it exist.
     *
     * Reverts if:
     * - Twin does not exist
     * - Caller is not the seller (TODO)
     *
     *  @param _twinId - the id of the twin to check
     */
    function getValidTwin(uint256 _twinId) internal view returns (Twin storage twin){

        bool exists;
        Seller storage seller;

        // Get twin
        (exists, twin) = fetchTwin(_twinId);

        // Twin must already exist
        require(exists, NO_SUCH_TWIN);

        // Get seller, we assume seller exists if twin exists
        (,seller) = fetchSeller(twin.sellerId);

        // Caller must be seller's operator address
        //require(seller.operator == msg.sender, NOT_OPERATOR); // TODO add back when AccountHandler is working

    }

    /**
     * @notice Gets the details about a given bundle.
     *
     * @param _bundleId - the id of the bundle to check
     * @return exists - the offer was found
     * @return bundle - the offer details. See {BosonTypes.Bundle}
     */
    function getBundle(uint256 _bundleId)
    external
    view
    returns(bool exists, Bundle memory bundle) {
        return fetchBundle(_bundleId);
    }
}
