// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/IERC721ERC1155.sol";
import "../interfaces/ITokenApprovalChecker.sol";

contract TokenApprovalChecker is ITokenApprovalChecker{

    /**
     * @notice Check if spender is approved to transfer the tokens.
     *
     * @param _tokenAddress - the address of the seller's twin token contract.
     * @param _operator - the seller's operator address.
     * @param _spender - the treasuryAddress of protocol.
     * @return _approved - the approve status.
     */
    function isSpenderApproved(
        address _tokenAddress,
        address _operator,
        address _spender
    ) external view returns (bool _approved){
        try IERC20(_tokenAddress).allowance(
            _operator,
            _spender
        ) returns(uint256 _allowance) {
            if (_allowance > 0) {_approved = true; }
        } catch {
            _approved = IERC721ERC1155(_tokenAddress).isApprovedForAll(
                _operator,
                _spender
            );
        }
    }
}
