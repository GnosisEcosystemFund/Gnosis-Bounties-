pragma solidity ^0.4.21;

import "@gnosis.pm/util-contracts/contracts/Token.sol";
import "@gnosis.pm/dx-contracts/contracts/DutchExchange.sol";
import "@gnosis.pm/dx-contracts/contracts/Oracle/PriceOracleInterface.sol";

contract BuyBack {

    address owner;
    DutchExchange public dx;

    // Buyback config
    struct Buyback {
        address sellToken;
        address buyToken;
        address burnAddress;
        bool shouldBurnToken;
        uint[] auctionIndexes; // This is a mapping of auction id to amount
        uint minTimeInterval; // time interval between poking in seconds
        uint lastTimeProcessed;
        bool claimedLastSellOrder;
        bool allowExternalPoke; // allow an external person to call postSellOrder
    }

    // mapping of the user address to token addresses & balance
    mapping (address => mapping(address => uint)) public balances;

    // mapping of user address to ether deposit value
    mapping(address => uint) public etherBalance;

    // mapping of user address to tip amount
    mapping(address => uint) public tips;

    // mapping of user address to auction index to ductchx index for the auction index participated in
    mapping(address => mapping(uint => uint)) public dxAuctionIndex;

    // maps user address to buyback config
    mapping(address => Buyback) public buybacks;
    
    // mapping of user address to auction index and auction amount
    mapping(address => mapping(uint => uint)) public auctionIndexWithAmount;

    // mapping of user address to auction id to whether an auction has been clamied
    mapping(address => mapping(uint => bool)) public alreadyClaimed;


    modifier onlyOwner () {
        require(msg.sender == owner);
        _;
    }

    event AddBuyBack(
        address indexed userAddress,
        address indexed sellToken,
        address indexed buyToken,
        address burnAddress,
        bool shouldBurnToken,
        uint[] auctionIndexes,
        uint[] auctionAmounts
    );

    event ClaimWithdraw(
        address indexed sellToken,
        address indexed buyToken,
        uint balance,
        uint auctionIndex
    );

    event Withdraw(
        address indexed tokenAddress,
        uint amount,
        uint balance
    );

    event Deposit(        
        address indexed userAddress,
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

    event ModifyToken(
        address indexed userAddress,
        address indexed tokenAddress
    );

    event ModifyTimeInterval(
        address indexed userAddress,
        uint timeInterval
    );

    event Burn (
        address indexed tokenAddress,
        address burnAddress,
        uint amount
    );
    
    event RemoveAuctionIndex(
        address indexed userAddress,
        uint auctionIndex,
        uint amount
    );

    event RemoveAuction(
        address indexed userAddress,
        uint[] auctionIndexes
    );

    event PostSellOrder(
        address indexed userAddress,
        address indexed buyToken,
        address indexed sellToken,
        uint auctionIndex,
        uint amount,
        uint newSellerBalance
    );

    event ModifyTip(
        address indexed userAddress,
        uint amount
    );

    event Tip(
        address indexed userAddress,
        address tippedAddress,
        uint amount
    );

    event ModifyExternalPoke(
        address indexed userAddress,
        bool allowExternalPoke
    );

    /**
     * @notice Create the buyback contract
     * @param _dx Address of the dutch exchange
     */
    function BuyBack(address _dx) public {
        require(address(_dx) != address(0));
        dx = DutchExchange(_dx);
        owner = msg.sender;
    }
       
    /**
     * @notice addBuyBack
     * @param _userAddress Address of the user 
     * @param _buyToken Address of the buy token
     * @param _sellToken Address of the sell token
     * @param _burn Burn the token after buy back success
     * @param _auctionIndexes Auction indexes the to participate 
     * @param _auctionAmounts Amounts to participate in each realtive auction index
     * @param _timeInterval Minimum time passed between buyback execution
     * @param _allowExternalPoke Allow non owners to call postSellOrder
    */
    function addBuyBack(
        address _userAddress,
        address _buyToken,
        address _sellToken, 
        address _burnAddress, 
        bool _burn, 
        uint[] _auctionIndexes, 
        uint[] _auctionAmounts,
        uint _timeInterval,
        bool _allowExternalPoke,
        uint tipAmount
        ) public {

        require(address(_userAddress) != address(0));
        require(address(_buyToken) != address(0));
        require(address(_sellToken) != address(0));
        require(_sellToken != _buyToken);
        require(_auctionIndexes.length == _auctionAmounts.length);
        require(buybacks[_userAddress].sellToken == address(0)); // ensure the user address doesn't exist
        
        // // map the auction ids to the auction amount
        for(uint i = 0; i < _auctionIndexes.length; i++){
            require(_auctionAmounts[i] > 0); // ensure the auction amount is greater than zero
            auctionIndexWithAmount[_userAddress][_auctionIndexes[i]] = _auctionAmounts[i];
        }

        Buyback memory buyback = Buyback(
            _sellToken, 
            _buyToken, 
            _burnAddress,
            _burn, 
            _auctionIndexes, 
            _timeInterval, 0, true, 
            _allowExternalPoke );

        // map user address to the buyback config
        buybacks[_userAddress] = buyback;
        
        // set tip price
        tips[_userAddress] = tipAmount; 

        emit AddBuyBack(
            _userAddress,
            _buyToken,
            _sellToken, 
            _burnAddress, 
            _burn, 
            _auctionIndexes, 
            _auctionAmounts
        );
    }

    /**
     * @notice modifyAuctionAmountMulti Modify the amount for multiple auction index
     * @param _userAddress User addresss
     * @param _auctionIndexes Auction index the to participate 
     * @param _auctionAmounts Auction amount to fill in auction index
     */
    function modifyAuctionAmountMulti(
        address _userAddress, 
        uint[] _auctionIndexes, 
        uint[] _auctionAmounts
        ) external onlyOwner  {
        require(_auctionIndexes.length > 0);
        require(_auctionIndexes.length == _auctionAmounts.length);

        for(uint i = 0; i < _auctionIndexes.length; i++){
            modifyAuctionAmount(_userAddress, _auctionIndexes[i], _auctionAmounts[i]);
        }
    }

    /**
     * @notice modifyAuctionAmount modify the amount for an auction index
     * @param _userAddress user addrese
     * @param _auctionIndex Auction index the to participate 
     * @param _auctionAmount Auction amount to fill in auction index
     */
    function modifyAuctionAmount(
        address _userAddress, 
        uint _auctionIndex, 
        uint _auctionAmount
        ) public onlyOwner {
        require(_auctionAmount > 0);
        // checks if the auction index exists
        require(auctionIndexWithAmount[_userAddress][_auctionIndex] > 0);

        auctionIndexWithAmount[_userAddress][_auctionIndex] = _auctionAmount;
        emit ModifyAuction(_auctionIndex, _auctionAmount);
    }

    /**
     * @notice modifyAuctionIndexMulti
     * @param _userAddress User addresss
     * @param _auctionIndexes Auction index the to participate 
     * @param _auctionAmounts Amount to participate in auction index
     */
    function modifyAuctionIndexMulti(
        address _userAddress, 
        uint[] _auctionIndexes, 
        uint[] _auctionAmounts
        ) external onlyOwner  {
        require(_auctionIndexes.length > 0);
        require(_auctionIndexes.length == _auctionAmounts.length);

        for(uint i = 0; i < _auctionIndexes.length; i++){
            modifyAuctionIndex(_userAddress, _auctionIndexes[i], _auctionAmounts[i]);
        }
    }

    /**
     * @notice modifyAuctionIndex
     * @param _userAddress User addresss
     * @param _auctionIndex Auction index the to participate 
     * @param _auctionAmount Amount to participate in auction index
     */
    function modifyAuctionIndex(
        address _userAddress, 
        uint _auctionIndex, 
        uint _auctionAmount
        ) public onlyOwner {
        require(_auctionAmount > 0);
        require(auctionIndexWithAmount[_userAddress][_auctionIndex] == 0);

        buybacks[_userAddress].auctionIndexes.push(_auctionIndex);
        auctionIndexWithAmount[_userAddress][_auctionIndex] = _auctionAmount;
        emit ModifyAuction(_auctionIndex, _auctionAmount);
    }

    /**
     * @notice modifySellToken
     * @param _userAddress User addresss
     * @param _sellToken Address of the sell token
     */
    function modifySellToken(address _userAddress, address _sellToken) public onlyOwner {
        require(address(_sellToken) != address(0));
        require(address(_userAddress) != address(0));
        require(_sellToken != buybacks[_userAddress].buyToken);

        buybacks[_userAddress].sellToken = _sellToken;
        emit ModifyToken(_userAddress, _sellToken);
    }

    /**
     * @notice modifyBuyToken
     * @param _userAddress User addresss
     * @param _buyToken Address of the buy token
     */
    function modifyBuyToken(address _userAddress, address _buyToken) public onlyOwner {
        require(address(_buyToken) != address(0));
        require(address(_userAddress) != address(0));
        require(_buyToken !=  buybacks[_userAddress].sellToken);

        buybacks[_userAddress].buyToken = _buyToken;
        emit ModifyToken(_userAddress, _buyToken);
    }

    /**
     * @notice modifyTimeInterval
     * @param _userAddress User addresss
     */
    function modifyTimeInterval(address _userAddress, uint _timeInterval) public onlyOwner {
        require(_timeInterval >= 0);

        buybacks[_userAddress].minTimeInterval = _timeInterval;
        emit ModifyTimeInterval(_userAddress, _timeInterval);
    }

    /**
     * @notice getAuctionIndexes
     * @param _userAddress User addresss
     */    
    function getAuctionIndexes(address _userAddress) public view returns (uint[]){
        return buybacks[_userAddress].auctionIndexes;
    }

    /**
     * @notice getAuctionAmount amount to pariticipate in an auction index
     * @param _userAddress User addresss
     * @param _auctionIndex Auction index
     */  
    function getAuctionAmount(
        address _userAddress, 
        uint _auctionIndex
        ) public view returns( uint ) {
        return auctionIndexWithAmount[_userAddress][_auctionIndex];
    }

    /**
     * @notice removeAuctionIndex
     * @param _userAddress User addresss
     * @param _index The index in array auctionIndexes of the auctionIndex to delete
     */
    function removeAuctionIndex(address _userAddress, uint _index) public onlyOwner {
        // ensure the index is not greater than the length
        require(_index < buybacks[_userAddress].auctionIndexes.length);

        uint auctionIndex = buybacks[_userAddress].auctionIndexes[_index];

        // ensure uniqueness
        uint acIndex = dxAuctionIndex[_userAddress][auctionIndex];

        // ensure not currently participating in an auction
        require(alreadyClaimed[_userAddress][acIndex] == false);

        if(buybacks[_userAddress].auctionIndexes.length == 1){
            delete buybacks[_userAddress].auctionIndexes[0];
        } else {
            uint length = buybacks[_userAddress].auctionIndexes.length;
            for (uint i = _index; i < length-1; i++){
                buybacks[_userAddress].auctionIndexes[i] = buybacks[_userAddress].auctionIndexes[i+1];
            }
            buybacks[_userAddress].auctionIndexes.length--;
        }

        uint amount = auctionIndexWithAmount[_userAddress][auctionIndex];
        delete auctionIndexWithAmount[_userAddress][auctionIndex];
        emit RemoveAuctionIndex(_userAddress, auctionIndex, amount);
    }
    
    
    /**
     * @notice removeAuctionIndexMulti
     * @param _userAddress User addresss
     * @param _indexes indexes of the auction in array
     */
    function removeAuctionIndexMulti(address _userAddress, uint[] _indexes) public onlyOwner {
        require(_indexes.length > 0);

        for(uint i = 0; i < _indexes.length; i++) {
            removeAuctionIndex(_userAddress, _indexes[i]); 
        }
    }

    /**
     * @notice removeBuyBack
     * @param _userAddress User addresss
     */
    function removeBuyBack(address _userAddress) public onlyOwner {
        require(buybacks[_userAddress].auctionIndexes.length > 0);

        Buyback memory userBuyback = buybacks[_userAddress];

        // remove all auction indexes 
        uint[] memory auctionIndexes = userBuyback.auctionIndexes;
        address sellToken = userBuyback.sellToken;
        address buyToken = userBuyback.buyToken;

        require(balances[_userAddress][sellToken] == 0); // ensure all withdrawal is made
        require(balances[_userAddress][buyToken] == 0); // ensure all withdrawal is made

        delete balances[_userAddress][sellToken];
        delete balances[_userAddress][buyToken];

        for(uint i = 0; i < auctionIndexes.length; i++){
            delete auctionIndexWithAmount[_userAddress][auctionIndexes[i]];
            delete dxAuctionIndex[_userAddress][auctionIndexes[i]];
            delete alreadyClaimed[_userAddress][auctionIndexes[i]];
        }

        delete buybacks[_userAddress];

        emit RemoveAuction(_userAddress, auctionIndexes);
    }
    
    /**
     * @notice modifyBurn should burn the bought tokens
     * @param _userAddress User addresss
     * @param _burn to either burn or not burn i.e. True or false
     */
    function modifyBurn(address _userAddress, bool _burn) public onlyOwner returns(bool) {
        buybacks[_userAddress].shouldBurnToken = _burn;
    }
    
    /**
     * @notice getBurnAddress
     * @param _userAddress User addresss
     */
    function getBurnAddress(address _userAddress) public view returns(address) {
        return buybacks[_userAddress].burnAddress;
    }

    /**
     * @notice modifyBurnAddress modify address burnt tokens should be sent to
     * @param _userAddress User addresss
     * @param _burnAddress burn address
     */
    function modifyBurnAddress(address _userAddress, address _burnAddress) public onlyOwner {
        buybacks[_userAddress].burnAddress = _burnAddress;
        emit ModifyBurnAddress(_burnAddress);
    }

    /**
     * @notice updateDutchExchange
     */
    function updateDutchExchange(DutchExchange _dx) external onlyOwner {
        dx = _dx;
    }

    /**
     * @notice getSellTokenBalance Get the sellToken balance e.g WETH 
     * @param _userAddress User addresss
     */
    function getSellTokenBalance(address _userAddress) public view returns (uint) {
        address sellToken = buybacks[_userAddress].sellToken;
        return balances[_userAddress][sellToken];
    }

    /**
     * @notice getTokenBalance get the balance of a token for a user
     * @param _userAddress User addresss
     * @param _tokenAddress User addresss
     */
    function getTokenBalance(
        address _userAddress, 
        address _tokenAddress
        ) public view returns (uint) {
        return balances[_userAddress][_tokenAddress];
    }

    /**
     * @notice depositSellToken
     * @param _userAddress Address of the deposited token 
     * @param _amount Amount of tokens deposited 10^18
     */
    function depositSellToken(address _userAddress, uint _amount) public returns (uint) {
        require(_amount > 0);
        require(buybacks[_userAddress].sellToken != address(0));

        address sellToken = buybacks[_userAddress].sellToken;
        require(Token(sellToken).transferFrom(msg.sender, this, _amount));
        
        balances[_userAddress][sellToken] += _amount;
        emit Deposit(_userAddress, _userAddress, _amount);
        return _amount;
    }

    /**
     * @notice checkAllowExternalPoke check if non owner is allowed to poke
     * @param _userAddress User addresss
     */
    function checkAllowExternalPoke(
        address _userAddress, 
        address _sender
        ) internal view returns (bool) {
        if(buybacks[_userAddress].allowExternalPoke == false){
            require(_sender == owner);
        }
        return true;
    }

    /**
     * @notice postSellOrder approve trading
     * @param _userAddress User addresss
     */
    function postSellOrder(address _userAddress) public {
        require(isTimePassed(_userAddress)); // ensure the min time has passed
        // ensure the previous order has been claimed 
        // to prevent overwriting the ductchx Ids
        require(claimedLastOrder(_userAddress)); 
        require(checkAllowExternalPoke(_userAddress, msg.sender)); // check if non owner is allowed
        require(buybacks[_userAddress].auctionIndexes.length > 0); // ensure user exists
        
        Buyback memory userBuyback = buybacks[_userAddress];

        uint newBuyerBalance;
        uint dxIndex;
        uint amount;

        uint[] memory auctionIndexes = userBuyback.auctionIndexes;
        address sellToken = userBuyback.sellToken;
        address buyToken = userBuyback.buyToken;
        
        for( uint i = 0; i < auctionIndexes.length; i++ ) {
            amount = auctionIndexWithAmount[_userAddress][auctionIndexes[i]]; // get the auction amount for that index
            
            require(balances[_userAddress][sellToken] >=  amount); // check if the user as enough balance

            approveDutchX(sellToken, amount);
            depositDutchx(sellToken, amount);

            (dxIndex, newBuyerBalance) = dx.postSellOrder(sellToken, buyToken, auctionIndexes[i], amount);

            // maps the auction index to the auction index from dx auction
            dxAuctionIndex[_userAddress][auctionIndexes[i]] = dxIndex;
            balances[_userAddress][sellToken] -= amount;
        }

        buybacks[_userAddress].lastTimeProcessed = now;
        buybacks[_userAddress].claimedLastSellOrder = false;
        
        // tip the user that poked the postSellOrder function
        tip(_userAddress, msg.sender);

        emit PostSellOrder(_userAddress, buyToken, sellToken, balances[_userAddress][sellToken], amount, dxIndex);
    }


    /**
     * @notice isTimePassed approve trading
     * @param _userAddress User addresss
     */
    function isTimePassed(address _userAddress) internal view returns(bool) {
        uint minTimeInterval = buybacks[_userAddress].minTimeInterval;
        uint lastTimeProcessed = buybacks[_userAddress].lastTimeProcessed;
        uint difference = now - lastTimeProcessed;
        return difference >= minTimeInterval;
    }

    /**
     * @notice isTimePassed approve trading
     * @param _userAddress User addresss
     */
    function claimedLastOrder(address _userAddress) internal view returns(bool) {
        return buybacks[_userAddress].claimedLastSellOrder;
    }

    /**
     * @notice approve trading
     * @param _userAddress User addresss
     */
    function claim(address _userAddress) external {
        require(buybacks[_userAddress].auctionIndexes.length > 0); // ensure user exists
                
        Buyback memory userBuyback = buybacks[_userAddress];

        uint[] memory auctionIndexes = userBuyback.auctionIndexes;
        address sellToken = userBuyback.sellToken;
        address buyToken = userBuyback.buyToken;
        bool shouldBurnToken = userBuyback.shouldBurnToken;
        address burnAddress = userBuyback.burnAddress;

        uint balance;

        for(uint i = 0; i < auctionIndexes.length; i++) {
            // Get the dx auction index for a user auction index
            // necessary in cases where user auction index is 0
            uint acIndex = dxAuctionIndex[_userAddress][auctionIndexes[i]];

            if(alreadyClaimed[_userAddress][acIndex]){
                continue;
            }
            // claim funds from dutchx
            (balance, ) = dx.claimSellerFunds(sellToken, buyToken, this, acIndex);
            
            // withdraw funds from dutchx
            uint newBal = dx.withdraw(buyToken, balance);

            // set user claimed funds in index
            alreadyClaimed[_userAddress][acIndex] = true;

            if(shouldBurnToken){ // check if should burn tokens
                if( burnAddress != address(0) ){
                    burnTokensWithAddress(buyToken, burnAddress, balance);
                } else {
                    burnTokens(buyToken, balance);
                }
            } else { // update user balance
                balances[_userAddress][buyToken] += balance; 
            }
            
            emit ClaimWithdraw(sellToken, buyToken, balance, newBal);
        }
        // set to true claimed sell order
        buybacks[_userAddress].claimedLastSellOrder = true;
    }

     /**
     * @notice withdraw
     * @param _userAddress User addresss
     * @param _tokenAddress Contract address of token to withdraw
     * @param _toAddress Address to send token to
     * @param _amount Amount of tokens to withdraw
     */
    function withdraw(
        address _userAddress, 
        address _tokenAddress, 
        address _toAddress, 
        uint _amount
        ) external {
        require(_amount > 0);
        require(buybacks[_userAddress].auctionIndexes.length > 0); // ensure user exists
        require(balances[_userAddress][_tokenAddress] >= _amount);     

        balances[_userAddress][_tokenAddress] -= _amount;
        require(Token(_tokenAddress).transfer(_toAddress, _amount));
        emit Withdraw(_tokenAddress, _amount, balances[_userAddress][_tokenAddress]);
    }

    /**
     * @notice tip the user that pokes the postSellOrder function
     * @param _userAddress Address of user
     */
    function tip(address _userAddress, address _sender) internal returns(bool){
        uint amount = tips[_userAddress];
        uint balance = getEtherBalance(_userAddress);
        bool result = false;
        if(balance > amount && amount > 0){
            etherBalance[_userAddress] -= amount;
            result = _sender.send(amount);
            emit Tip(_userAddress, _sender, amount);
        }
        return result;
    }

    /**
     * @notice receive ether for compensation
     */
    function() external payable {
        address userAddress = msg.sender;
        etherBalance[userAddress] += msg.value;
    }

    /**
     * @notice getEtherBalance
     */
    function getEtherBalance(address _userAddress) public view returns(uint) {
        return etherBalance[_userAddress];
    }

    /**
     * @notice modifyExternalPoke
     * @param _userAddress Address of user
     * @param _allowExternalPoke bool externalPoke
     */
    function modifyExternalPoke(address _userAddress, bool _allowExternalPoke) public onlyOwner {
        buybacks[_userAddress].allowExternalPoke = _allowExternalPoke;
        emit ModifyExternalPoke(_userAddress, _allowExternalPoke);
    }

    /**
     * @notice receive ether for compensation
     * Can set tip to zero if you don't want to tip
     */
    function modifyTip(address _userAddress, uint _amount) public onlyOwner {
        tips[_userAddress] = _amount;
        emit ModifyTip(_userAddress, _amount);
    }
}
