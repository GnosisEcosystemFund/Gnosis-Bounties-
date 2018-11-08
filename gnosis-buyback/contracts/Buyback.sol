pragma solidity ^0.4.21;

import "@gnosis.pm/util-contracts/contracts/Token.sol";
import "@gnosis.pm/dx-contracts/contracts/DutchExchange.sol";
import "@gnosis.pm/dx-contracts/contracts/Oracle/PriceOracleInterface.sol";

contract BuyBack {

    address owner;
    
    // SellToken the token that is sold
    address sellToken;
    address buyToken;
    address burnAddress;
    address dutchXAddress;

    // mapping of the sell token to 
    mapping (address => uint) balances;

    // This is a mapping of auction id to amount
    uint[] auctionIndexes;
    mapping(uint => uint) public auction;

    // mapping of a auction id to wether
    // we currently participating in an auction for
    // the auction id
    mapping(uint => bool) public isProcessing;

    // BuyToken the token that is bought
    DutchExchange public dx;
    bool shouldBurnToken;


    modifier onlyOwner () {
        require(msg.sender == owner);
        _;
    }

    event Withdraw(
        address indexed sellToken,
        address indexed buyToken,
        uint balance,
        uint auctionIndex
    );

    event Deposit(
        address indexed tokenAddress,
        uint amount
    );

    event ModifyAuction(
        uint auctionIndex,
        uint amount
    );

    event ModifyBurnAddress(
        address burnAddress
    );

    event ModifySellToken(
        address newSellToken
    );

    event Burn (
        address indexed tokenAddress,
        address burnAddress,
        uint amount
    );
    
    event DeleteAuction(
        uint auctionIndex,
        uint amount
    );

    event PostSellOrder(
        address buyToken,
        address sellToken,
        uint auctionIndex,
        uint amount,
        uint newSellerBalance
    );
       
    /**
     * @notice Buyback
     * @param _buyToken Address of the security token
     * @param _sellToken Address of the polytoken
     * @param _burn Should burn the token after buy back success
     * @param _auctionIndexes Auction index the to participate 
     * @param _auctionAmounts Auction amount to fill in auction index
     */
    function BuyBack(
        address _dx, 
        address _buyToken, 
        address _sellToken, 
        address _burnAddress, 
        bool _burn, 
        uint[] _auctionIndexes, 
        uint[] _auctionAmounts
        ) public {

        require(address(_dx) != address(0));
        require(address(_buyToken) != address(0));
        require(address(_sellToken) != address(0));
        require(_auctionIndexes.length == _auctionAmounts.length);

        dx = DutchExchange(_dx);
        dutchXAddress = _dx;
        sellToken = _sellToken;
        buyToken = _buyToken;
        shouldBurnToken = _burn;
        auctionIndexes = _auctionIndexes;
        owner = msg.sender;
        burnAddress = _burnAddress;
        
        // map the auction ids to the auction amount
        for(uint i = 0; i < _auctionIndexes.length; i++){
            require(_auctionAmounts[i] > 0);
            auction[_auctionIndexes[i]] = _auctionAmounts[i];
        }
    }
    
    /**
     * @notice modifyAuctionsMulti modify the amount for multiple auction index
     * @param _auctionIndexes Auction index the to participate 
     * @param _auctionAmounts Auction amount to fill in auction index
     */
    function modifyAuctionsMulti(uint[] _auctionIndexes, uint[] _auctionAmounts) external onlyOwner  {
        require(_auctionIndexes.length > 0);
        require(_auctionIndexes.length == _auctionAmounts.length);

        for(uint i = 0; i < _auctionIndexes.length; i++){
            modifyAuction(_auctionIndexes[i], _auctionAmounts[i]);
        }
    }

    function modifySellToken(address _sellToken) public onlyOwner{
        require(address(_sellToken) != address(0));
        sellToken = _sellToken;
        emit ModifySellToken(sellToken);
    }

    /**
     * @notice getAuctions fetch all the available auctions
     */    
    function getAuctionIndexes() public view returns (uint[]){
        return auctionIndexes;
    }

    /**
     * @notice getAuctionAmount amount to pariticipate in an auction index
     * @param _auctionIndex Auction index
     */  
    function getAuctionAmount(uint _auctionIndex) public view returns( uint ) {
        return auction[_auctionIndex];
    }

    /**
     * @notice modifyAuctions modify the amount for an auction index
     * @param _auctionIndex Auction index the to participate 
     * @param _auctionAmount Auction amount to fill in auction index
     */
    function modifyAuction(uint _auctionIndex, uint _auctionAmount) public onlyOwner {
        require(_auctionAmount > 0);

        auction[_auctionIndex] = _auctionAmount;
        emit ModifyAuction(_auctionIndex, _auctionAmount);
    }
    
    /**
     * @notice deleteAuction
     * @param _index Auction index the to participate 
     */
    function deleteAuction(uint _index) public onlyOwner {
        require(_index < auctionIndexes.length);

        uint auctionIndex = auctionIndexes[_index];

        require(isProcessing[auctionIndex] == false);

        if(auctionIndexes.length == 1){
            delete auctionIndexes[0];
        } else {
            for (uint i = _index; i < auctionIndexes.length-1; i++){
                auctionIndexes[i] = auctionIndexes[i+1];
            }
            auctionIndexes.length--;
        }

        uint amount = auction[auctionIndex];
        delete auction[auctionIndex];
        emit DeleteAuction(auctionIndex, amount);
    }
    
    
    /**
     * @notice deleteAuctions delete an Auction
     * @param _indexes indexes of the auction in array
     */
    function deleteAuctionMulti(uint[] _indexes) public onlyOwner {
        require(_indexes.length > 0);

        for(uint i = 0; i < _indexes.length; i++) {
            deleteAuction(_indexes[i]); 
        }
    }
    
    /**
     * @notice modifyBurn should burn the bought tokens
     * @param _burn to either burn or not burn i.e. True or false
     */
    function modifyBurn(bool _burn) public onlyOwner returns(bool) {
        shouldBurnToken = _burn;
    }
    
    /**
     * @notice getBurnAddress
     */
    function getBurnAddress() public view onlyOwner returns(address) {
        return burnAddress;
    }

    /**
     * @notice modifyBurnAddress modify address burnt tokens should be sent to
     * @param _burnAddress burn address
     */
    function modifyBurnAddress(address _burnAddress) public onlyOwner {
        burnAddress = _burnAddress;
        emit ModifyBurnAddress(_burnAddress);
    }

    /**
     * @notice updateDutchExchange
     */
    function updateDutchExchange(DutchExchange _dx) external onlyOwner {
        dx = _dx;
    }

    /**
     * @notice getSellBalance
     */
    function getSellTokenBalance() public view returns (uint) {
        return balances[sellToken];
    }

    /**
     * @notice deposit
     * @param _token Address of the deposited token 
     * @param _amount Amount of tokens deposited 10^18
     */
    function deposit(address _token, uint _amount) public onlyOwner returns (uint) {
        require(_amount > 0);
        require(_token == sellToken);
        require(Token(_token).transferFrom(msg.sender, this, _amount));
        
        balances[_token] += _amount;
        emit Deposit(_token, _amount);
        return _amount;
    }

    /**
     * @notice approve dutchx contract
     */
    function approveDutchX(uint amount) internal {
        require(Token(sellToken).approve(dutchXAddress, amount));
    }

    /**
    * @notice depositDutchx depsoit to dutchx contract
    */
    function depositDutchx(uint amount) internal {
        uint balance = dx.deposit(sellToken, amount);
        require(balance >= amount);
    }

    /**
     * @notice postOrder approve trading
     */
    function postOrder() public {
        // uint newBuyerBalance;

        for( uint i = 0; i < auctionIndexes.length; i++ ) {
            uint amount = auction[auctionIndexes[i]];
            
            require( balances[sellToken] >=  amount);
            approveDutchX(amount);
            depositDutchx(amount);

            // (, newBuyerBalance) = dx.postSellOrder(sellToken, buyToken, auctionIndexes[i], amount);
            balances[sellToken] -= amount;

            // emit PostSellOrder(buyToken, sellToken, balances[sellToken], amount, newBuyerBalance);
            emit PostSellOrder(buyToken, sellToken, balances[sellToken], amount, 0);
        }
    }

    /**
     * @notice approve trading
     */
    function claim() public {
        uint balance;
        for(uint i = 0; i < auctionIndexes.length; i++) {
            (balance, ) = dx.claimSellerFunds(sellToken, buyToken, this, auctionIndexes[i]);
            if(shouldBurnToken == true){
                if( burnAddress != address(0) ){
                    burnTokensWithAddress(buyToken, burnAddress, balance);
                }
                burnTokens(buyToken, balance);
            }
            emit Withdraw(sellToken, buyToken, balance, auctionIndexes[i]);
        }
    }

    /**
     * @notice burnTokens
     * @param _token Address of the  token
     * @param _amount Amount of tokens to burn
     */
    function burnTokens(address _token, uint _amount) internal {
        // transfer the tokens to address(0)
        require(_amount > 0);
        require(Token(_token).transferFrom(this, address(0), _amount));
        emit Burn(
            _token,
            address(0),
            _amount
        );
    }

    /**
     * @notice burnTokensWithAddress
     * @param _token Address of the  token
     * @param _burnAddress Address to send burn tokens
     * @param _amount Amount of tokens to burn
     */
    function burnTokensWithAddress(address _token, address _burnAddress, uint _amount) internal {
        // transfer the tokens to address(0)
        require(_amount > 0);
        require(Token(_token).transferFrom(this, _burnAddress, _amount));
        emit Burn(
            _token,
            _burnAddress,
            _amount
        );
    }
}
