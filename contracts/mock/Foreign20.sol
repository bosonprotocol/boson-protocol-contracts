// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { IBosonAccountHandler } from "../interfaces/handlers/IBosonAccountHandler.sol";
import { IBosonMetaTransactionsHandler } from "../interfaces/handlers/IBosonMetaTransactionsHandler.sol";
import { BosonTypes } from "../domain/BosonTypes.sol";

/**
 * @title Foreign20
 *
 * @notice Mock ERC-(20) NFT for Unit Testing
 */
contract Foreign20 is ERC20Pausable {
    string public constant TOKEN_NAME = "Foreign20";
    string public constant TOKEN_SYMBOL = "20Test";

    constructor() ERC20(TOKEN_NAME, TOKEN_SYMBOL) {}

    /**
     * Mint some tokens
     * @param _account - address that gets the tokens
     * @param _amount - amount to mint
     */
    function mint(address _account, uint256 _amount) public {
        _mint(_account, _amount);
    }

    /**
     * Pause the token transfers
     */
    function pause() public {
        _pause();
    }

    /**
     * Deletes the contract code
     */
    function destruct() public {
        selfdestruct(payable(msg.sender));
    }
}

/**
 * @title Foreign20 that fails when name() is called
 *
 * We need other ERC20 methods such as approve, transferFrom etc, so it's easier to just override the function that we don't want to succeed
 *
 * @notice Mock ERC-(20) NFT for Unit Testing
 */
contract Foreign20NoName is Foreign20 {
    function name() public pure override returns (string memory) {
        // simulate the contract without "name" implementation.
        revert();
    }
}

/**
 * @title Foreign20 that reenters into protocol
 *
 *
 * @notice Mock ERC-(20) NFT for Unit Testing
 */
contract Foreign20Malicious is Foreign20 {
    address private protocolAddress;
    address private owner;

    constructor() {
        owner = msg.sender;
    }

    function setProtocolAddress(address _newProtocolAddress) external {
        protocolAddress = _newProtocolAddress;
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual override {
        super._beforeTokenTransfer(from, to, amount);

        // When funds are transferred from protocol, reenter
        if (from == protocolAddress) {
            // this is for demonstration purposes only, therefore id "3" is hardcoded
            IBosonAccountHandler(msg.sender).updateBuyer(BosonTypes.Buyer(3, payable(owner), true));
        }
    }
}

/**
 * @title Foreign20 that reenters into protocol
 *
 *
 * @notice Mock ERC-(20) for Unit Testing
 */
contract Foreign20Malicious2 is Foreign20 {
    address private protocolAddress;
    address private owner;
    bytes private metaTxBytes;
    bytes32 private sigR;
    bytes32 private sigS;
    uint8 private sigV;
    address private attacker;

    constructor() {
        owner = msg.sender;
    }

    function setProtocolAddress(address _newProtocolAddress) external {
        protocolAddress = _newProtocolAddress;
    }

    function setMetaTxBytes(
        address _attacker,
        bytes calldata _metaTxBytes,
        bytes32 _sigR,
        bytes32 _sigS,
        uint8 _sigV
    ) external {
        metaTxBytes = _metaTxBytes;
        sigR = _sigR;
        sigS = _sigS;
        sigV = _sigV;
        attacker = _attacker;
    }

    function _afterTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual override {
        super._beforeTokenTransfer(from, to, amount);

        // When funds are transferred from protocol, reenter
        if (to == protocolAddress) {
            // this is for demonstration purposes only,
            IBosonMetaTransactionsHandler(msg.sender).executeMetaTransaction(
                attacker,
                "getNextExchangeId()",
                metaTxBytes,
                0,
                sigR,
                sigS,
                sigV
            );
        }
    }
}

/**
 * @title Foreign20 that takes a fee during the transfer
 *
 *
 * @notice Mock ERC-(20) for Unit Testing
 */
contract Foreign20WithFee is Foreign20 {
    uint256 private fee = 3;

    /**
     * @dev See {ERC20-_beforeTokenTransfer}.
     *
     * Burn part of the transferred value
     *
     */
    function _afterTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual override {
        if (to != address(0) && from != address(0)) {
            uint256 _fee = (amount * fee) / 100;
            _burn(to, _fee);
        }
        super._afterTokenTransfer(from, to, amount);
    }

    function setFee(uint256 _newFee) external {
        fee = _newFee;
    }
}

/**
 * @title Foreign20 that return false when transferFrom or transfer is called
 *
 *
 * @notice Mock ERC-(20) for Unit Testing
 */
contract Foreign20TransferReturnFalse is Foreign20 {
    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) public virtual override returns (bool) {
        super.transferFrom(from, to, amount);
        return false;
    }

    function transfer(address recipient, uint256 amount) public virtual override returns (bool) {
        super.transfer(recipient, amount);
        return false;
    }
}
