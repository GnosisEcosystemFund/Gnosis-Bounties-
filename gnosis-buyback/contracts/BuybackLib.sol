pragma solidity ^0.4.21;
import "@gnosis.pm/util-contracts/contracts/Token.sol";

library BuybackLib {
    
    /**
     * @notice burnTokens
     * @param _tokenAddress Address of the  token
     * @param _amount Amount of tokens to burn
     */
    function burnTokens(address _tokenAddress, uint _amount) internal {
        // transfer the tokens to address(0)
        require(_amount > 0);
        require(Token(_tokenAddress).transfer(address(0), _amount));
        emit Burn(
            _tokenAddress,
            address(0),
            _amount
        );
    }

    /**
     * @notice burnTokensWithAddress
     * @param _tokenAddress Address of the  token
     * @param _burnAddress Address to send burn tokens
     * @param _amount Amount of tokens to burn
     */
    function burnTokensWithAddress(
        address _tokenAddress, 
        address _burnAddress, 
        uint _amount
        ) internal {
        // transfer the tokens to address(0)
        require(_amount > 0);
        require(Token(_tokenAddress).transfer(_burnAddress, _amount));
        emit Burn(
            _tokenAddress,
            _burnAddress,
            _amount
        );
    }

    /**
     * @notice approve dutchx contract
     * @param _sellToken Address of the sell token
     * @param _amount Amount of the sell token
     */
    function approveDutchX(address _sellToken, uint _amount) internal {
        require(Token(_sellToken).approve(dx, _amount));
    }

    /**
    * @notice depositDutchx deposit to dutchx contract
     * @param _sellToken Address of the sell token
     * @param _amount Address of the sell token
    */  
    function depositDutchx(address _sellToken, uint _amount) internal {
        uint balance = dx.deposit(_sellToken, _amount);
        require(balance >= _amount);
    }
}