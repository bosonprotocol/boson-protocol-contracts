// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.22;

import { IERC1271 } from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import { IERC721Receiver } from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

contract ContractWallet is IERC1271 {
    error UnknownValidity();

    enum Validity {
        Valid,
        Invalid,
        Revert
    }

    enum RevertReason {
        CustomError,
        ErrorString,
        ArbitraryBytes,
        DivisionByZero,
        OutOfBounds,
        ReturnTooShort,
        ReturnTooLong,
        PollutedData
    }

    Validity private validity;
    RevertReason private revertReason;

    function setValidity(Validity _validity) external {
        validity = _validity;
    }

    function setRevertReason(RevertReason _revertReason) external {
        revertReason = _revertReason;
    }

    /**
     * @notice Different possible reutrns, depending on the validity state
     */
    function isValidSignature(bytes32, bytes calldata) public view override returns (bytes4) {
        // Validate signatures
        if (validity == Validity.Valid) {
            return IERC1271.isValidSignature.selector;
        } else if (validity == Validity.Invalid) {
            return 0xfffffffa;
        }

        // Revert with different reasons
        if (revertReason == RevertReason.CustomError) {
            revert UnknownValidity();
        } else if (revertReason == RevertReason.ErrorString) {
            revert("Error string");
        } else if (revertReason == RevertReason.ArbitraryBytes) {
            assembly {
                mstore(0, 0xdeadbeefdeadbeef000000000000000000000000000000000000000000000000)
                revert(0, 16)
            }
        } else if (revertReason == RevertReason.DivisionByZero) {
            uint256 a = 0; // division by zero
            uint256 b = 1 / a;
        } else if (revertReason == RevertReason.OutOfBounds) {
            uint256[] memory arr = new uint256[](1);
            arr[1] = 1; // out of bounds
        } else if (revertReason == RevertReason.ReturnTooShort) {
            assembly {
                return(0, 1)
            }
        } else if (revertReason == RevertReason.ReturnTooLong) {
            assembly {
                mstore(0, 0x1626ba7e00000000000000000000000000000000000000000000000000000000) //  IERC1271.isValidSignature.selector
                return(0, 33)
            }
        } else if (revertReason == RevertReason.PollutedData) {
            assembly {
                mstore(0, 0x1626ba7e000000000000000abcde000000000000000000000000000000000000) //  IERC1271.isValidSignature.selector with some other data
                return(0, 32)
            }
        }
    }
}

contract ContractWalletWithReceive is ContractWallet, IERC721Receiver {
    error NotAcceptingMoney();

    event FundsReceived(address indexed sender, uint256 value);
    event PhygitalReceived(address tokenContract, uint256 tokenId);

    bool private acceptingMoney = true;

    function setAcceptingMoney(bool _acceptingMoney) external {
        acceptingMoney = _acceptingMoney;
    }

    receive() external payable {
        if (!acceptingMoney) {
            revert NotAcceptingMoney();
        }

        emit FundsReceived(msg.sender, msg.value);
    }

    function onERC721Received(address, address, uint256 tokenId, bytes calldata) external override returns (bytes4) {
        if (!acceptingMoney) {
            revert NotAcceptingMoney();
        }

        emit PhygitalReceived(msg.sender, tokenId);

        return IERC721Receiver.onERC721Received.selector;
    }
}
