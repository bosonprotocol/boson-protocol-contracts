// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import {IBosonFundsHandler} from "../../interfaces/handlers/IBosonFundsHandler.sol";
import {DiamondLib} from "../../diamond/DiamondLib.sol";
import {ProtocolBase} from "../bases/ProtocolBase.sol";
import {ProtocolLib} from "../libs/ProtocolLib.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

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
     * - it receives some native currency (e.g. ETH), but token address is not zero
     * - it receives some native currency (e.g. ETH), and the amount does not match msg.value
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
            require(_tokenAddress == address(0), NATIVE_WRONG_ADDRESS);
            require(msg.value == _amount, NATIVE_WRONG_AMOUNT);
        } else {
            // transfer tokens from the caller
            try ERC20(_tokenAddress).transferFrom(msg.sender, address(this), _amount)  {
            } catch (bytes memory error) {
                string memory reason = error.length == 0 ? TOKEN_TRANSFER_FAILED : string(error);
                revert(reason);
            }
        }

        ProtocolLib.ProtocolStorage storage ps = protocolStorage();

        // if the current amount of token is 0, the token address must be added to the token list
        if (ps.availableFunds[_sellerId][_tokenAddress] == 0) {
            ps.tokenList[_sellerId].push(_tokenAddress);
        }

        // update the available funds
        ps.availableFunds[_sellerId][_tokenAddress] += _amount;

        emit FundsDeposited(_sellerId, msg.sender, _tokenAddress, _amount);              
    }
    
    /**
     * @notice For a given seller or buyer id it returns the information about the funds that can use as a sellerDeposit and/or be withdrawn
     *
     * @param _entityId - seller or buyer id to check
     * @return availableFunds - list of token addresses, token names and amount that can be used as a seller deposit or be withdrawn
     */
    function getAvailableFunds(uint256 _entityId) external view override returns (Funds[] memory availableFunds) {
        // get list of token addresses for the entity
        address[] memory tokenList = protocolStorage().tokenList[_entityId];
        availableFunds = new Funds[](tokenList.length);

        for (uint i = 0; i < tokenList.length; i++) {
            address tokenAddress = tokenList[i];
            string memory tokenName;
            
            if (tokenAddress == address(0)) {
                // it tokenAddress is 0, it represents the native currency
                tokenName = NATIVE_CURRENCY;
            } else {
                // try to get token name
                try ERC20(tokenAddress).name() returns (string memory name) {
                    tokenName = name;
                } catch {
                    tokenName = TOKEN_NAME_UNSPECIFIED;
                }
            }

            // retrieve available amount from the stroage
            uint availableAmount = protocolStorage().availableFunds[_entityId][tokenAddress];

            // add entry to the return variable
            availableFunds[i] = Funds(tokenAddress, tokenName, availableAmount);
        }
    }
}