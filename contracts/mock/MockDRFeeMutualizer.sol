// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.9;
import { IDRFeeMutualizer } from "../interfaces/clients/IDRFeeMutualizer.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title MockDRFeeMutualizer
 * @notice Mock contract for testing purposes
 *
 */
contract MockDRFeeMutualizer is IDRFeeMutualizer {
    enum Mode {
        Revert,
        Decline,
        SendLess
    }

    Mode private mode;

    /**
     * @notice set the desired outcome of `requestDRFee` function
     */
    function setMode(Mode _mode) external {
        mode = _mode;
    }

    /**
     * @notice Mock function that always returns true.
     *
     */
    function isSellerCovered(address, address, uint256, address, bytes calldata) external pure returns (bool) {
        return true;
    }

    /**
     * @notice Mock function that does not return expected value
     * It either reverts, or returns false, or returns less than expected
     */
    function requestDRFee(
        address,
        address _token,
        uint256 _feeAmount,
        bytes calldata
    ) external returns (bool isCovered, uint256 uuid) {
        if (mode == Mode.Revert) {
            revert("MockDRFeeMutualizer: revert");
        } else if (mode == Mode.Decline) {
            return (false, 0);
        } else if (mode == Mode.SendLess) {
            if (_token == address(0)) {
                payable(msg.sender).transfer(_feeAmount - 1);
            } else {
                IERC20(_token).transfer(msg.sender, _feeAmount - 1);
            }
            return (true, 1);
        }
    }

    /**
     * @notice Mock function that does not accept payment from the protocol.
     */
    function returnDRFee(uint256 _uuid, uint256 _feeAmount, bytes calldata _context) external payable {
        revert("MockDRFeeMutualizer: revert");
    }

    receive() external payable {}
}
