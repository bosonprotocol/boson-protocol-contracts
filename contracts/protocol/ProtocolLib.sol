// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../domain/BosonTypes.sol";

/**
 * @title ProtocolLib
 *
 * @dev Provides access to the the Protocol Storage and Intializer slots for Protocol facets
 *
 * @author Cliff Hall <cliff@futurescale.com> (https://twitter.com/seaofarrows)
 */
library ProtocolLib {

    bytes32 internal constant PROTOCOL_STORAGE_POSITION = keccak256("boson.protocol.storage");
    bytes32 internal constant PROTOCOL_INITIALIZERS_POSITION = keccak256("boson.protocol.storage.initializers");

    struct ProtocolStorage {

        // Address of the Boson Protocol multi-sig wallet
        address payable multisigAddress;

        // Address of the Boson Token (ERC-20 contract)
        address payable tokenAddress;

        // Address of the Boson Protocol Voucher NFT contract (proxy)
        address voucherAddress;

        // Percentage that will be taken as a fee from the net of a Boson Protocol exchange
        uint16 feePercentage;         // 1.75% = 175, 100% = 10000

        // next offer id
        uint256 nextOfferId;

        // offer id => offer
        mapping(uint256 => BosonTypes.Offer) offers;

    }

    struct ProtocolInitializers {

        // FundsHandlerFacet initialization state
        bool cashierFacet;

        // ConfigHandlerFacet initialization state
        bool configFacet;

        // DisputeHandlerFacet initialization state
        bool disputeFacet;

        // ExchangeHandlerFacet initialization state
        bool exchangeFacet;

        // OfferHandlerFacet initialization state
        bool offerFacet;

        // TwinHandlerFacet initialization state
        bool twinningFacet;

    }

    function protocolStorage() internal pure returns (ProtocolStorage storage ps) {
        bytes32 position = PROTOCOL_STORAGE_POSITION;
        assembly {
            ps.slot := position
        }
    }

    function protocolInitializers() internal pure returns (ProtocolInitializers storage pi) {
        bytes32 position = PROTOCOL_INITIALIZERS_POSITION;
        assembly {
            pi.slot := position
        }
    }

    /**
     * @notice Gets the details about a given offer
     *
     * @param _offerId - the id of the offer to check
     * @return offer - the offer details. See {BosonTypes.Offer}
     */
    function getOffer(uint256 _offerId)
    internal
    view
    returns(BosonTypes.Offer storage offer) {
        offer = protocolStorage().offers[_offerId];
    }

}