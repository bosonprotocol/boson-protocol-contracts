// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

/**
 * @title BosonToken
 *
 * @notice Mock Boson Token contract for Unit Testing
 */
contract BosonToken {
    mapping(address => uint256) internal balances;
    mapping(address => mapping(address => uint256)) internal allowances;

    event Approval(address indexed owner, address indexed spender, uint256 value);

    /**
     * @notice Sets the balance for a mock holder address.
     *
     * @param _holder - the address of the holder
     * @param _balance - the balance for the holder
     */
    function setHolderBalance(address _holder, uint256 _balance) external {
        balances[_holder] = _balance;
    }

    /**
     * @notice The faux ERC-20 balanceOf implementation
     *
     * @return the address's balance
     */
    function balanceOf(address _holder) external view returns (uint256) {
        return balances[_holder];
    }

    /**
     * @notice The faux ERC-20 allowance implementation
     *
     * @return the spender's allowance for this owner
     */
    function allowance(address _owner, address _spender) public view returns (uint256) {
        return allowances[_owner][_spender];
    }

    /**
     * @notice The faux ERC-20 approve implementation
     *
     * @return true if the caller was successfully approved
     */
    function approve(address spender, uint256 amount) public virtual returns (bool) {
        address owner = msg.sender;
        _approve(owner, spender, amount);
        return true;
    }

    /**
     * @notice The faux ERC-20 _approve implementation
     */
    function _approve(
        address _owner,
        address _spender,
        uint256 _amount
    ) internal virtual {
        allowances[_owner][_spender] = _amount;
        emit Approval(_owner, _spender, _amount);
    }

    receive() external payable {}
}
