// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { IBosonAccountHandler } from "../interfaces/handlers/IBosonAccountHandler.sol";
import { IBosonMetaTransactionsHandler } from "../interfaces/handlers/IBosonMetaTransactionsHandler.sol";
import { BosonTypes } from "../domain/BosonTypes.sol";
import { MockNativeMetaTransaction } from "./MockNativeMetaTransaction.sol";

/**
 * @title Foreign20
 *
 * @notice Mock ERC-(20) NFT for Unit Testing
 */
contract Foreign20 is ERC20Pausable, MockNativeMetaTransaction {
    string public constant TOKEN_NAME = "Foreign20";
    string public constant TOKEN_SYMBOL = "20Test";
    string public constant ERC712_VERSION = "1";

    constructor() ERC20(TOKEN_NAME, TOKEN_SYMBOL) {
        _initializeEIP712(TOKEN_NAME, ERC712_VERSION);
    }

    // This is to support Native meta transactions
    // never use msg.sender directly, use _msgSender() instead
    function _msgSender() internal view override returns (address sender) {
        if (msg.sender == address(this)) {
            bytes memory array = msg.data;
            uint256 index = msg.data.length;
            assembly {
                // Load the 32 bytes word from memory with the address on the lower 20 bytes, and mask those.
                sender := and(mload(add(array, index)), 0xffffffffffffffffffffffffffffffffffffffff)
            }
        } else {
            sender = msg.sender;
        }
        return sender;
    }

    /**
     * Mints some tokens
     * @param _account - address that gets the tokens
     * @param _amount - amount to mint
     */
    function mint(address _account, uint256 _amount) public {
        _mint(_account, _amount);
    }

    /**
     * Pauses the token transfers
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

    function _beforeTokenTransfer(address from, address to, uint256 amount) internal virtual override {
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
    bytes private signature;
    address private attacker;

    constructor() {
        owner = msg.sender;
    }

    function setProtocolAddress(address _newProtocolAddress) external {
        protocolAddress = _newProtocolAddress;
    }

    function setMetaTxBytes(address _attacker, bytes calldata _metaTxBytes, bytes calldata _signature) external {
        metaTxBytes = _metaTxBytes;
        signature = _signature;
        attacker = _attacker;
    }

    function _afterTokenTransfer(address from, address to, uint256 amount) internal virtual override {
        super._beforeTokenTransfer(from, to, amount);

        // When funds are transferred from protocol, reenter
        if (to == protocolAddress) {
            // this is for demonstration purposes only,
            IBosonMetaTransactionsHandler(msg.sender).executeMetaTransaction(
                attacker,
                "getNextExchangeId()",
                metaTxBytes,
                0,
                signature
            );
        }
    }
}

/**
 * @title Foreign20 that consumes all gas when name called
 *
 *
 * @notice Mock ERC-(20) for Unit Testing
 */
contract Foreign20MaliciousName is Foreign20 {
    function name() public pure override returns (string memory) {
        // name consumes all gas
        unchecked {
            uint256 i = 0;
            while (true) {
                i++;
            }
        }
        return "nothing";
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
    function _afterTokenTransfer(address from, address to, uint256 amount) internal virtual override {
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
 * @title Foreign20 that return false when transfer is called
 *
 *
 * @notice Mock ERC-(20) for Unit Testing
 */
contract Foreign20TransferReturnFalse is Foreign20 {
    function transfer(address, uint256) public virtual override returns (bool) {
        return false;
    }
}

/**
 * @title Foreign20 that return false when transferFrom is called
 *
 *
 * @notice Mock ERC-(20) for Unit Testing
 */
contract Foreign20TransferFromReturnFalse is Foreign20 {
    function transferFrom(address, address, uint256) public virtual override returns (bool) {
        return false;
    }
}

/*
 * @title Foreign20 that consumes all gas when transfer is called
 *
 * @notice Mock ERC-(20) for Unit Testing
 */
contract Foreign20GasTheft is Foreign20 {
    function transferFrom(address, address, uint256) public virtual override returns (bool) {
        while (true) {
            // consume all gas
        }
        return false;
    }
}

/*
 * @title Foreign20 that returns an absurdly long return data
 *
 * @notice Mock ERC-(20) for Unit Testing
 */
contract Foreign20ReturnBomb is Foreign20 {
    function transferFrom(address, address, uint256) public virtual override returns (bool) {
        assembly {
            revert(0, 3000000)
            // This is carefully chosen. If it's too low, not enough gas is consumed and contract that call it does not run out of gas.
            // If it's too high, then this contract runs out of gas before the return data is returned.
        }
    }
}

/*
 * @title Foreign20 that succeeds, but the data cannot be decoded into a boolean
 *
 * @notice Mock ERC-(20) for Unit Testing
 */
contract Foreign20MalformedReturn is Foreign20 {
    enum AttackType {
        ReturnTooShort,
        ReturnTooLong,
        ReturnInvalid
    }

    AttackType public attackType;

    function setAttackType(AttackType _attackType) external {
        attackType = _attackType;
    }

    function transferFrom(address, address, uint256) public virtual override returns (bool) {
        if (attackType == AttackType.ReturnTooShort) {
            assembly {
                return(0, 31) // return too short data
            }
        } else if (attackType == AttackType.ReturnTooLong) {
            assembly {
                return(0, 33) // return too long data
            }
        } else if (attackType == AttackType.ReturnInvalid) {
            assembly {
                return(0x40, 32) // return a value that is not 0 or 1
            }
        }
    }
}
