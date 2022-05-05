// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import {IBosonFundsHandler} from "../../interfaces/handlers/IBosonFundsHandler.sol";
import {DiamondLib} from "../../diamond/DiamondLib.sol";
import {ProtocolBase} from "../bases/ProtocolBase.sol";
import {ProtocolLib} from "../libs/ProtocolLib.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title FundsHandlerFacet
 *
 * @notice Handles custody and withdrawal of buyer and seller funds
 */
contract FundsHandlerFacet is IBosonFundsHandler, ProtocolBase {

    /**
     * @notice Facet Initializer
     */
    function initialize()
    public
    onlyUnInitialized(type(IBosonFundsHandler).interfaceId)
    {
        DiamondLib.addSupportedInterface(type(IBosonFundsHandler).interfaceId);
    }

    /**
     * @notice Receives funds from the caller and stores it to the seller id, so they can be used during the commitToOffer
     *
     * Reverts if:
     * - seller id does not exist
     * - it receives some eth, but token address is different from the zero
     * - it receives some eth, and the amount does not match msg.value
     * - if contract at token address does not support erc20 function transferFrom
     * - if calling transferFrom on token fails for some reason (e.g. protocol is not approved to transfer)
     *
     * @param _sellerId - id of the seller that will be credited
     * @param _tokenAddress - contract address of token that is being deposited (0 for native currency)
     * @param _amount - amount to be credited
     */
    function depositFunds(uint256 _sellerId, address _tokenAddress, uint256 _amount) external payable override {
        //Check Seller exists in sellers mapping
        (bool exists, ) = fetchSeller(_sellerId);

        //Seller must exist
        require(exists, NO_SUCH_SELLER);

        if (msg.value != 0) {
            // receiving native currency
            require(_tokenAddress == address(0), ETH_WRONG_ADDRESS);
            require(msg.value == _amount, ETH_WRONG_AMOUNT);
        } else {
            // transfer tokens from the caller
            try IERC20(_tokenAddress).transferFrom(msg.sender, address(this), _amount)  {
            } catch (bytes memory error) {
                string memory reason = error.length == 0 ? TOKEN_TRANSFER_FAILED : string(error);
                revert(reason);
            }
        }

        ProtocolLib.ProtocolStorage storage ps = protocolStorage();

        // if the current amount of token is 0, the token address must be added to the token list
        if (ps.availableFunds[_sellerId][_tokenAddress] == 0) {
            ps.tokenListSeller[_sellerId].push(_tokenAddress);
        }

        // update the available funds
        ps.availableFunds[_sellerId][_tokenAddress] += _amount;

        emit FundsDeposited(_sellerId, msg.sender, _tokenAddress, _amount);              
    }
    
}