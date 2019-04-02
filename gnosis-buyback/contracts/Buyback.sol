pragma solidity ^0.4.21;

import "@gnosis.pm/util-contracts/contracts/Token.sol";
import "@gnosis.pm/dx-contracts/contracts/DutchExchange.sol";
import "@gnosis.pm/dx-contracts/contracts/Oracle/PriceOracleInterface.sol";
import "./SafeMath.sol";

contract BuyBack {
    using SafeMath for uint;

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
    mapping(address => mapping(uint => bool)) internal alreadyClaimed;

    modifier onlyOwner () {
        require(msg.sender == owner);
        _;
    }

    modifier userExists () {
        require(buybacks[msg.sender].sellToken != address(0));
        _;
    }

    /**
     * @notice Create the buyback contract
     * @param _dx Address of the dutch exchange
     */
    function BuyBack(address _dx) public {
        require(address(_dx) != address(0), "Invalid address");
        dx = DutchExchange(_dx);
        owner = msg.sender;
    }

    function hasEnoughDeposit(
        uint[] _amounts, 
        address _tokenAddress, 
        address _userAddress
    ) internal view returns (bool) {
        uint total = 0;
        for( uint i = 0; i < _amounts.length; i++ ) {
            total = _amounts[i].add(total);
        }

        return total <= balances[_userAddress][_tokenAddress];
    }
       
    /**
     * @notice addBuyBack
     * @param _buyToken Address of the buy token
     * @param _sellToken Address of the sell token
     * @param _burn Burn the token after buy back success
     * @param _auctionIndexes Auction indexes the to participate 
     * @param _auctionAmounts Amounts to participate in each realtive auction index
     * @param _timeInterval Minimum time passed between buyback execution
     * @param _allowExternalPoke Allow non owners to call postSellOrder
    */
    function addBuyBack(
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
        address _userAddress = msg.sender;

        require(hasEnoughDeposit(_auctionAmounts, _sellToken, _userAddress), "user does not have enough deposit to create buyback");
        require(address(_userAddress) != address(0), "Invalid user address");
        require(address(_buyToken) != address(0), "Invalid buy token address");
        require(address(_sellToken) != address(0), "Invalid sell token address");
        require(_sellToken != _buyToken, "Invalid buy and sell token address");
        require(_auctionIndexes.length == _auctionAmounts.length, "Invalid auction index length");
        require(buybacks[_userAddress].sellToken == address(0), "User already exists");
        

        // // map the auction ids to the auction amount
        for(uint i = 0; i < _auctionIndexes.length; i++){
            require(_auctionAmounts[i] > 0, "Auction amount less than 0"); // ensure the auction amount is greater than zero
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
     * @param _auctionIndexes Auction index the to participate 
     * @param _auctionAmounts Auction amount to fill in auction index
     */
    function modifyAuctionAmountMulti(
        uint[] _auctionIndexes, 
        uint[] _auctionAmounts
        ) external userExists() {

        require(_auctionIndexes.length > 0);
        require (
            _auctionIndexes.length == _auctionAmounts.length, 
            "Invalid auction index and amount length"
        );

        for(uint i = 0; i < _auctionIndexes.length; i++){
            modifyAuctionAmount(_auctionIndexes[i], _auctionAmounts[i]);
        }
    }

    /**
     * @notice modifyAuctionAmount modify the amount for an auction index
     * @param _auctionIndex Auction index the to participate 
     * @param _auctionAmount Auction amount to fill in auction index
     */
    function modifyAuctionAmount(
        uint _auctionIndex, 
        uint _auctionAmount
        ) public userExists() {
        address _userAddress = msg.sender;
        address sellToken    = buybacks[_userAddress].sellToken;
        uint userBalance     = balances[_userAddress][sellToken];

        require(_auctionAmount > 0, "Auction amount is not greater than zero");
        // checks if the auction index exists
        require(auctionIndexWithAmount[_userAddress][_auctionIndex] > 0, "Auction index doesn't exist");

        uint currentAmount = auctionIndexWithAmount[_userAddress][_auctionIndex];
        uint userAuctionAmountTotal = getAuctionAmountTotal(_userAddress);
        // ensure that the user has enough balance to increase amount of auction index
        uint auctionTotal = userAuctionAmountTotal.sub(currentAmount);
        require(auctionTotal.add(_auctionAmount) <= userBalance, "User does not have enough balance");

        auctionIndexWithAmount[_userAddress][_auctionIndex] = _auctionAmount;
        emit ModifyAuction(_userAddress, _auctionIndex, _auctionAmount);
    }

    function getAuctionAmountTotal(address _userAddress) internal view returns(uint) {
        uint[] storage auctionIndexes = buybacks[_userAddress].auctionIndexes;
        uint total = 0;

        for(uint i = 0; i < auctionIndexes.length; i++){
            uint auctionAmount = auctionIndexWithAmount[_userAddress][auctionIndexes[i]];
            total = total.add(auctionAmount);
        }

        return total;
    }
    
    /**
     * @notice modifyTimeInterval
     */
    function modifyTimeInterval(
        uint _timeInterval
    ) public userExists() {
        require(_timeInterval >= 0);

        address _userAddress = msg.sender;

        buybacks[_userAddress].minTimeInterval = _timeInterval;
        emit ModifyTimeInterval(_userAddress, _timeInterval);
    }

    /**
     * @notice modifyBurn should burn the bought tokens
     * @param _burn to either burn or not burn i.e. True or false
     */
    function modifyBurn(bool _burn) public userExists() returns(bool) {
        address _userAddress = msg.sender;
        buybacks[_userAddress].shouldBurnToken = _burn;
        emit ModifyBurn(_userAddress, _burn);
    }

    /**
     * @notice modifyBurnAddress modify address burnt tokens should be sent to
     * @param _burnAddress burn address
     */
    function modifyBurnAddress(address _burnAddress) public userExists() {
        address _userAddress = msg.sender;
        buybacks[_userAddress].burnAddress = _burnAddress;
        emit ModifyBurnAddress(_userAddress, _burnAddress);
    }

    /**
     * @notice getAuctionIndexes
     */    
    function getAuctionIndexes() public view returns (uint[]){
        return buybacks[msg.sender].auctionIndexes;
    }

    /**
     * @notice getAuctionAmount amount to pariticipate in an auction index
     * @param _auctionIndex Auction index
     */  
    function getAuctionAmount(
        uint _auctionIndex
        ) public view returns( uint ) {
        return auctionIndexWithAmount[msg.sender][_auctionIndex];
    }

    /**
     * @notice getBurnAddress
     */
    function getBurnAddress() public view returns(address) {
        return buybacks[msg.sender].burnAddress;
    }

    /**
     * @notice getSellTokenBalance Get the sellToken balance e.g WETH 
     */
    function getSellTokenBalance() public view returns (uint) {
        address sellToken = buybacks[msg.sender].sellToken;
        return balances[msg.sender][sellToken];
    }

    /**
     * @notice getTokenBalance get the balance of a token for a user
     * @param _tokenAddress User addresss
     */
    function getTokenBalance(
        address _tokenAddress
        ) public view returns (uint) {
        return balances[msg.sender][_tokenAddress];
    }

    /**
     * @notice removeBuyBack
     */
    function removeBuyBack() public userExists() {
        address _userAddress = msg.sender;

        Buyback memory userBuyback = buybacks[_userAddress];

        // remove all auction indexes 
        uint[] memory auctionIndexes = userBuyback.auctionIndexes;
        address sellToken = userBuyback.sellToken;
        address buyToken = userBuyback.buyToken;

        for(uint i = 0; i < auctionIndexes.length; i++){
            delete auctionIndexWithAmount[_userAddress][auctionIndexes[i]];
            delete dxAuctionIndex[_userAddress][auctionIndexes[i]];
            delete alreadyClaimed[_userAddress][auctionIndexes[i]];
        }

        delete buybacks[_userAddress];

        emit RemoveAuction(_userAddress, auctionIndexes);
    }

    /**
     * @notice updateDutchExchange
     */
    function updateDutchExchange(DutchExchange _dx) external onlyOwner {
        dx = _dx;
    }

    /**
     * @notice depositSellToken
     * @param _amount Amount of tokens deposited 10^18
     */
    function depositSellToken( uint _amount, address _tokenAddress) public {
        address _userAddress = msg.sender;

        require(_amount > 0, "Amount not greater than 0");

        require(Token(_tokenAddress).transferFrom(msg.sender, this, _amount));
        
        balances[_userAddress][_tokenAddress] = balances[_userAddress][_tokenAddress].add(_amount);
        emit Deposit(_userAddress, _tokenAddress, _amount);
    }

    /**
     * @notice checkAllowExternalPoke check if non owner is allowed to poke
     * @param _userAddress User address
     * @param _sender Sender addresss
     */
    function checkAllowExternalPoke(
        address _userAddress, 
        address _sender
    ) internal view returns (bool) {
        if(buybacks[_userAddress].allowExternalPoke == false){
            require(_sender == owner, "external user poke is not allowed");
        }
        return true;
    }

    /**
     * @notice hasEnoughBalance
     * @param _userAddress User addresss
     */
    function hasEnoughBalance(address _userAddress) internal view returns(bool) {        
        Buyback memory userBuyback = buybacks[_userAddress];
        uint[] memory auctionIndexes = userBuyback.auctionIndexes;

        address sellToken = userBuyback.sellToken;
        
        uint total = 0;
        for( uint i = 0; i < auctionIndexes.length; i++ ) {
            total = auctionIndexWithAmount[_userAddress][auctionIndexes[i]].add(total);
        }

        return total <= balances[_userAddress][sellToken];
    }

    /**
     * @notice hasEnoughTippingBalance
     * @param _userAddress User addresss
     */
    function hasEnoughTippingBalance(address _userAddress) internal view returns(bool){
        uint tippingAmount = tips[_userAddress];
        uint ethBalance = etherBalance[_userAddress];
        return ethBalance >= tippingAmount;
    }

    /**
     * @notice postSellOrder approve trading
     * @param _userAddress User addresss
     */
    function postSellOrder(address _userAddress) public {

        require(isTimePassed(_userAddress), "minimum time elapsed has not been exceeded");
        // ensure the previous order has been claimed 
        // to prevent overwriting the ductchx Ids
        require(claimedLastOrder(_userAddress), "previous order has not been claimed"); 
        require(checkAllowExternalPoke(_userAddress, msg.sender),  "external user poke is not allowed");
        require(buybacks[_userAddress].auctionIndexes.length > 0, "user doesn't exist");
        require(hasEnoughBalance(_userAddress), "user does not have enough balance to post sell order");
        require(hasEnoughTippingBalance(_userAddress), "user does not have enough tipping balance");

        Buyback storage userBuyback = buybacks[_userAddress];

        uint newBuyerBalance;
        uint dxIndex;
        uint amount;

        uint[] memory auctionIndexes = userBuyback.auctionIndexes;
        address sellToken = userBuyback.sellToken;
        address buyToken = userBuyback.buyToken;
        
        uint userSellTokenBalance = balances[_userAddress][sellToken];

        for( uint i = 0; i < auctionIndexes.length; i++ ) {
            // get the auction amount for that index
            amount = auctionIndexWithAmount[_userAddress][auctionIndexes[i]]; 

            // check if the user as enough balance
            require(userSellTokenBalance >=  amount, "user does not have enough balance"); 

            approveDutchX(sellToken, amount);
            depositDutchx(sellToken, amount);

            (dxIndex, newBuyerBalance) = dx.postSellOrder(sellToken, buyToken, auctionIndexes[i], amount);

            // maps the auction index to the auction index from dx auction
            dxAuctionIndex[_userAddress][auctionIndexes[i]] = dxIndex;
            userSellTokenBalance = userSellTokenBalance.sub(amount);

            balances[_userAddress][sellToken] = userSellTokenBalance;
        }

        userBuyback.lastTimeProcessed = now;
        userBuyback.claimedLastSellOrder = false; 
        // tip the user that poked the postSellOrder function
        tip(_userAddress, msg.sender);

        emit PostSellOrder(
            _userAddress, 
            buyToken, 
            sellToken, 
            userSellTokenBalance, 
            amount, 
            dxIndex
        );
    }

    /**
     * @notice claimedLastOrder
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
        // ensure user exists
        require(buybacks[_userAddress].auctionIndexes.length > 0, "user does not exist"); 
                
        Buyback storage userBuyback = buybacks[_userAddress];

        uint[] memory auctionIndexes = userBuyback.auctionIndexes;
        address sellToken            = userBuyback.sellToken;
        address buyToken             = userBuyback.buyToken;
        bool shouldBurnToken         = userBuyback.shouldBurnToken;
        address burnAddress          = userBuyback.burnAddress;

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
                burnTokens(buyToken, burnAddress, balance);
            } else { // update user balance
                balances[_userAddress][buyToken] = balance.add(balances[_userAddress][buyToken]); 
            }
            
            emit ClaimWithdraw(_userAddress, sellToken, buyToken, balance, newBal);
        }

        // set to true claimed sell order
        userBuyback.claimedLastSellOrder = true;
    }

    /**
     * @notice burnTokens
     * @param _tokenAddress Address of the  token
     * @param _amount Amount of tokens to burn
     */
    function burnTokens(address _tokenAddress, address _burnAddress, uint _amount) internal {
        // transfer the tokens to address(0)
        require(_amount > 0);
        require(Token(_tokenAddress).transfer(_burnAddress, _amount));
        emit Burn(
            _tokenAddress,
            address(0),
            _amount
        );
    }

    /**
     * @notice withdraw
     * @param _tokenAddress Contract address of token to withdraw
     * @param _toAddress Address to send token to
     * @param _amount Amount of tokens to withdraw
     */
    function withdraw(
        address _tokenAddress, 
        address _toAddress, 
        uint _amount
        ) external {
        address _userAddress = msg.sender;
        uint userBalance = balances[_userAddress][_tokenAddress];
        uint userAuctionTotal = getAuctionAmountTotal(_userAddress);
        
        // user isn't allowed to withdraw amount the affects
        // the buyback
        require(userAuctionTotal.add(_amount) <= userBalance, "user not allowed to withdraw balance");
        require(_amount > 0, "withdrawal amount is not greater than zero");


        require(userBalance >= _amount, "user balance is less than withdrawal amount");

        userBalance = userBalance.sub(_amount);
        balances[_userAddress][_tokenAddress] = userBalance; // set new balance

        require(Token(_tokenAddress).transfer(_toAddress, _amount));

        emit Withdraw(_userAddress, _tokenAddress, _amount, userBalance);
    }

    /**
     * @notice withdrawEther
     * @param _toAddress Address to send token to
     * @param _amount Amount of tokens to withdraw
     */
    function withdrawEther(
        address _toAddress, 
        uint _amount
        ) external {

        address _userAddress = msg.sender;

        require(_amount > 0, "withdrawal amount is not greater than zero");
        uint userBalance = etherBalance[_userAddress];
        require(userBalance >= _amount,  "user balance is less than withdrawal amount");

        userBalance = userBalance.sub(_amount);
        etherBalance[_userAddress] = userBalance; // set new balance
        bool result = _toAddress.send(_amount);
        emit WithdrawEther(_userAddress, _amount, userBalance);
    }

    /**
     * @notice receive ether for compensation
     */
    function() external payable {
        require(msg.value > 0); // ether deposit is greater than 0
        address userAddress = msg.sender;
        etherBalance[userAddress] = etherBalance[userAddress].add(msg.value);
    }

    /**
     * @notice modifyExternalPoke
     * @param _allowExternalPoke bool externalPoke
     */
    function modifyExternalPoke(bool _allowExternalPoke) public userExists() {
        address _userAddress = msg.sender;

        buybacks[_userAddress].allowExternalPoke = _allowExternalPoke;
        emit ModifyExternalPoke(_userAddress, _allowExternalPoke);
    }

    /**
     * @notice receive ether for compensation
     * Can set tip to zero if you don't want to tip
     */
    function modifyTipAmount(uint _amount) public userExists() {
        address _userAddress = msg.sender;

        tips[_userAddress] = _amount;
        emit ModifyTipAmount(_userAddress, _amount);
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
    
    /**
     * @notice tip the user that pokes the postSellOrder function
     * @param _userAddress Address of user
     */
    function tip(address _userAddress, address _sender) internal returns(bool){
        uint amount  = tips[_userAddress];
        uint balance = etherBalance[_userAddress];
        bool result  = false;
        if(balance > amount && amount > 0){
            balance = balance.sub(amount);
            etherBalance[_userAddress] = balance;
            result = _sender.send(amount);
            emit Tip(_userAddress, _sender, amount);
        }
        return result;
    }

    /**
     * @notice isTimePassed approve trading
     * @param _userAddress User addresss
     */
    function isTimePassed(address _userAddress) internal view returns(bool) {
        Buyback memory userBuyback = buybacks[_userAddress];

        uint minTimeInterval   = userBuyback.minTimeInterval;
        uint lastTimeProcessed = userBuyback.lastTimeProcessed;

        uint difference = now - lastTimeProcessed;
        return difference >= minTimeInterval;
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
        address indexed userAddress,
        address indexed sellToken,
        address indexed buyToken,
        uint balance,
        uint auctionIndex
    );

    event Withdraw(
        address indexed userAddress,
        address indexed tokenAddress,
        uint amount,
        uint balance
    );

    event WithdrawEther(
        address indexed userAddress,
        uint amount,
        uint balance
    );

    event Deposit(        
        address indexed userAddress,
        address indexed tokenAddress,
        uint amount
    );

    event ModifyAuction(
        address indexed userAddress,
        uint auctionIndex,
        uint amount
    );

    event ModifyBurnAddress(
        address indexed userAddress,
        address burnAddress
    );

    event ModifyBurn(
        address indexed userAddress,
        bool shouldBurnToken
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

    event ModifyTipAmount(
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
}
