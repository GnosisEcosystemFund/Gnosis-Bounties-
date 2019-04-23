pragma solidity ^0.5.2;

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
        address userAddress;
        address sellToken;
        address buyToken;
        address burnAddress;
        bool shouldBurnToken;
        uint[] auctionIndexes; // This is a mapping of auction id to amount
        uint tipAmount;
        uint expires; // time when buyback expires if not invoked
        bool hasExecutedBuyback;
        bool claimedSellOrder;

    }

    Buyback[] public buybacks;
    mapping(address => uint[]) public userBuybacks;

    // maps user address to token address to total buyback amount
    // helps to ensure that if you have multiple buybacks you can fulfil them
    mapping(address => mapping(address => uint)) public userBuybackAmountTotal;

    // maps user address to total buyback tips
    mapping(address => uint) public userTipAmountTotal;

    // mapping of the user address to token addresses & balance
    mapping (address => mapping(address => uint)) public balances;

    // mapping of user address to ether deposit value
    mapping(address => uint) public etherBalance;

    // mapping of buyback id to auction index to ductchx index for the auction index participated in
    mapping(uint => mapping(uint => uint)) public dxAuctionIndex;
    // mapping of buyback id to auction id to whether an auction has been clamied
    mapping(uint => mapping(uint => bool)) internal alreadyClaimed;

    // mapping of buyback id to auction index and auction amount
    mapping(uint => mapping(uint => uint)) public auctionIndexWithAmount;


    modifier onlyOwner () {
        require(msg.sender == owner);
        _;
    }

    /**
     * @notice Create the buyback contract
     * @param _dx Address of the dutch exchange
     */
    constructor(address _dx) public {
        require(address(_dx) != address(0), "Invalid address");
        dx = DutchExchange(_dx);
        owner = msg.sender;
    }

    /**
     * @notice addBuyBack
    */
    function addBuyBack(
        address _buyToken,
        address _sellToken, 
        address _burnAddress, 
        bool _burn, 
        uint[] memory _auctionIndexes, 
        uint[] memory _auctionAmounts,
        uint _tipAmount,
        uint _expires
        ) public {
        address _userAddress = msg.sender;

        require(hasEnoughDeposit(_auctionAmounts, _sellToken, _userAddress), "user does not have enough deposit to create buyback");
        require(hasEnoughTippingDeposit(_userAddress, _tipAmount), "user does not have enough tip balance");
        require(address(_userAddress) != address(0), "Invalid user address");
        require(address(_buyToken) != address(0), "Invalid buy token address");
        require(address(_sellToken) != address(0), "Invalid sell token address");
        require(_sellToken != _buyToken, "Invalid buy and sell token address");
        require(_auctionIndexes.length == _auctionAmounts.length, "Invalid auction index length");
        require(_expires >= (block.timestamp + 30 days), "minimum expiry time is one month");
        
        uint buybackId = buybacks.length;

        uint total = 0;
        // // map the auction ids to the auction amount
        for(uint i = 0; i < _auctionIndexes.length; i++){
            require(_auctionAmounts[i] > 0, "Auction amount less than 0"); // ensure the auction amount is greater than zero
            total = total.add(_auctionAmounts[i]);
            auctionIndexWithAmount[buybackId][_auctionIndexes[i]] = _auctionAmounts[i];
        }

        Buyback memory buyback = Buyback(
            _userAddress,
            _sellToken, 
            _buyToken, 
            _burnAddress,
            _burn, 
            _auctionIndexes, 
            _tipAmount,
            _expires,
            false,
            false
        );

        // map buyback id to the buyback config
        buybacks.push(buyback);
        // store buyback id for user
        userBuybacks[_userAddress].push(buybackId);

        // increase amount of tips and 
        userBuybackAmountTotal[_userAddress][_sellToken] = userBuybackAmountTotal[_userAddress][_sellToken].add(total);
        userTipAmountTotal[_userAddress] = userTipAmountTotal[_userAddress].add(_tipAmount);

        emit AddBuyBack(
            buybackId,
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
     * @notice postSellOrder approve trading
     * @param _buybackId buyback id
     */
    function postSellOrder(uint _buybackId) public {
        Buyback storage userBuyback = buybacks[_buybackId];

        uint[] memory auctionIndexes = userBuyback.auctionIndexes;
        address userAddress = userBuyback.userAddress;
        address sellToken = userBuyback.sellToken;
        uint tipAmount = userBuyback.tipAmount;

        require(auctionIndexes.length > 0, "buyback doesn't exist");
        // ensure buyback has not  been executed
        require(userBuyback.hasExecutedBuyback == false, "buyback has been executed");
        // check if buyback has expired
        require(isTimePassed(userBuyback.expires), "buyback has expired");
        require(hasEnoughBalance(_buybackId, auctionIndexes, userAddress, sellToken), "user does not have enough balance to post sell order");
        require(hasEnoughTippingBalance(userAddress, tipAmount), "user does not have enough tipping balance");


        uint newBuyerBalance;
        uint dxIndex;
        uint totalAmount = 0;

        address buyToken = userBuyback.buyToken;        
        uint userSellTokenBalance = balances[userAddress][sellToken];

        for( uint i = 0; i < auctionIndexes.length; i++ ) {
            // get the auction amount for that index
            uint amount = auctionIndexWithAmount[_buybackId][auctionIndexes[i]]; 
            totalAmount = totalAmount.add(amount);

            // check if the user as enough balance
            require(userSellTokenBalance >= amount, "user does not have enough balance"); 

            approveDutchX(sellToken, amount);
            depositDutchx(sellToken, amount);

            (dxIndex, newBuyerBalance) = dx.postSellOrder(sellToken, buyToken, auctionIndexes[i], amount);

            // maps the auction index to the auction index from dx auction
            dxAuctionIndex[_buybackId][auctionIndexes[i]] = dxIndex;
            userSellTokenBalance = userSellTokenBalance.sub(amount);

            balances[userAddress][sellToken] = userSellTokenBalance;
        }

        // tip the user that poked the postSellOrder function
        tip(userAddress, tipAmount, msg.sender);
        // set user executed buyback true
        userBuyback.hasExecutedBuyback = true;

        userBuybackAmountTotal[userAddress][sellToken] = userBuybackAmountTotal[userAddress][sellToken].sub(totalAmount);
        userTipAmountTotal[userAddress] = userTipAmountTotal[userAddress].sub(tipAmount);

        emit PostSellOrder(
            _buybackId,
            userAddress,
            buyToken, 
            sellToken, 
            userSellTokenBalance
        );
 
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

        require(Token(_tokenAddress).transferFrom(msg.sender, address(this), _amount));
        
        balances[_userAddress][_tokenAddress] = balances[_userAddress][_tokenAddress].add(_amount);
        emit Deposit(_userAddress, _tokenAddress, _amount);
    }

    /**
     * @notice approve trading
     */
    function claim(uint _buybackId) external {
        Buyback storage userBuyback = buybacks[_buybackId];
        uint[] memory auctionIndexes = buybacks[_buybackId].auctionIndexes;
        address userAddress = userBuyback.userAddress;
        // ensure user exists
        require(auctionIndexes.length > 0, "user does not exist"); 

        address sellToken = userBuyback.sellToken;
        address buyToken = userBuyback.buyToken;
        bool shouldBurnToken = userBuyback.shouldBurnToken;
        address burnAddress = userBuyback.burnAddress;

        uint balance;

        for(uint i = 0; i < auctionIndexes.length; i++) {
            // Get the dx auction index for a user auction index
            // necessary in cases where user auction index is 0
            uint acIndex = dxAuctionIndex[_buybackId][auctionIndexes[i]];

            if(alreadyClaimed[_buybackId][acIndex]){
                continue;
            }

            // claim funds from dutchx
            (balance, ) = dx.claimSellerFunds(sellToken, buyToken, address(this), acIndex);
            // withdraw funds from dutchx
            uint newBal = dx.withdraw(buyToken, balance);
            // set user claimed funds in index
            alreadyClaimed[_buybackId][acIndex] = true;

            if(shouldBurnToken){ // check if should burn tokens
                burnTokens(buyToken, burnAddress, balance);
            } else { // update user balance
                balances[userAddress][buyToken] = newBal.add(balances[userAddress][buyToken]); 
            }

            userBuyback.claimedSellOrder = true;
            
            emit ClaimWithdraw(userAddress, sellToken, buyToken, balance, acIndex);
        }
    }

    /**
     * @notice isTimePassed
     */
    function isTimePassed(uint _expires) internal view returns(bool) {
        return _expires > block.timestamp;
    }

    /**
     * @notice hasEnoughBalance
     */
    function hasEnoughBalance(
        uint _buybackId, 
        uint[] memory _auctionIndexes, 
        address _userAddress, 
        address _sellToken
    ) internal view returns(bool) {        
       
        uint total = 0;
        for( uint i = 0; i < _auctionIndexes.length; i++ ) {
            total = auctionIndexWithAmount[_buybackId][_auctionIndexes[i]].add(total);
        }

        return total <= balances[_userAddress][_sellToken];
    }

    function hasEnoughTippingBalance(address _userAddress, uint _tipAmount) internal view returns (bool) {
        return etherBalance[_userAddress] >= _tipAmount;
    }

    /**
     * @notice tip the user that pokes the postSellOrder function
     */
    function tip(
        address _userAddress, 
        uint _tipAmount,
        address payable _sender
    ) internal {
        uint balance = etherBalance[_userAddress];
        if(balance > _tipAmount && _tipAmount > 0){
            balance = balance.sub(_tipAmount);
            etherBalance[_userAddress] = balance;
            _sender.transfer(_tipAmount);
            emit Tip(_userAddress, _sender, _tipAmount);
        }
    }

    /**
     * @notice burnTokens
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
        // current user auction total
        uint userAuctionTotal = userBuybackAmountTotal[_userAddress][_tokenAddress];
        require(_amount <= userBalance, "amount exceeds available balance");
        // user isn't allowed to withdraw amount that affects
        // the buyback
        require(userAuctionTotal.add(_amount) <= userBalance, "user not allowed to withdraw balance affecting buyback");
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
        address payable _toAddress, 
        uint _amount
        ) external {

        address userAddress = msg.sender;
        uint userBalance = etherBalance[userAddress];
        // current tip auction total
        uint userTipTotal = userTipAmountTotal[userAddress];
        
        require(_amount > 0, "withdrawal amount is not greater than zero");
        require(userTipTotal.add(_amount) <= userBalance, "user balance is less than available withdrawal amount");
        // withdrawing ether does not affect the current buybacks

        userBalance = userBalance.sub(_amount);
        etherBalance[userAddress] = userBalance; // set new balance
        _toAddress.transfer(_amount);
        emit WithdrawEther(userAddress, _amount, userBalance);
    }

    /**
     * @notice removeBuyBack
     * Allows releasing expired buyback funds
     */
    function releaseBuyBackFund(uint _buybackId) public {
        address userAddress = msg.sender;
        Buyback memory userBuyback = buybacks[_buybackId];

        require(userBuyback.userAddress == userAddress, "only owner can release buyback fund");
        require(userBuyback.hasExecutedBuyback == false, "can only release funds of unexecuted buyback");
        require(userBuyback.auctionIndexes.length > 0, "user does not exist");
        
        if(userBuyback.expires < block.timestamp) {
            uint[] memory auctionIndexes = userBuyback.auctionIndexes;
            address sellToken = userBuyback.sellToken;
            address buyToken = userBuyback.buyToken;

            uint total = 0;
            for(uint i = 0; i < auctionIndexes.length; i++){
                total = total.add(auctionIndexWithAmount[_buybackId][auctionIndexes[i]]);
                delete auctionIndexWithAmount[_buybackId][auctionIndexes[i]];
                delete dxAuctionIndex[_buybackId][auctionIndexes[i]];
                delete alreadyClaimed[_buybackId][auctionIndexes[i]];
            }
            
            userBuybackAmountTotal[userAddress][sellToken] = userBuybackAmountTotal[userAddress][sellToken].sub(total);
            userTipAmountTotal[userAddress] = userTipAmountTotal[userAddress].sub(userBuyback.tipAmount);

            emit ReleaseBuyBackFund(userAddress, _buybackId, total);
        } else {
            revert("can not release unexpired buyback funds");
        }
    }

    function hasEnoughDeposit(
        uint[] memory _amounts, 
        address _tokenAddress, 
        address _userAddress
    ) internal view returns (bool) {
        uint total = 0;
        for( uint i = 0; i < _amounts.length; i++ ) {
            total = _amounts[i].add(total);
        }

        // add existing unfulfilled buyback amounts to ensure user
        // has enough balance to fulfill them all
        return (total.add(userBuybackAmountTotal[_userAddress][_tokenAddress])) <= balances[_userAddress][_tokenAddress];
    }

    /**
     * @notice hasEnoughTippingBalance
     */
    function hasEnoughTippingDeposit(address _userAddress, uint _tipAmount) internal view returns(bool){
        uint ethBalance = etherBalance[_userAddress];
        uint tippingAmount = _tipAmount.add(userTipAmountTotal[_userAddress]);
        return ethBalance >= tippingAmount;
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
     * @notice approve dutchx contract
     * @param _sellToken Address of the sell token
     * @param _amount Amount of the sell token
     */
    function approveDutchX(address _sellToken, uint _amount) internal {
        require(Token(_sellToken).approve(address(dx), _amount), "failed to approve token");
    }

    /**
    * @notice depositDutchx deposit to dutchx contract
     * @param _sellToken Address of the sell token
     * @param _amount Address of the sell token
    */  
    function depositDutchx(address _sellToken, uint _amount) internal {
        uint balance = dx.deposit(_sellToken, _amount);
        require(balance >= _amount, "failed to deposit token");
    }
    
    event AddBuyBack(
        uint buybackId,
        address indexed userAddress,
        address sellToken,
        address buyToken,
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

    event Burn (
        address indexed tokenAddress,
        address burnAddress,
        uint amount
    );

    event ReleaseBuyBackFund(
        address indexed userAddress,
        uint buybackId,
        uint totalAmountReleased
    );

    event PostSellOrder(
        uint buybackId,
        address indexed userAddress,
        address indexed buyToken,
        address indexed sellToken,
        uint newSellerBalance
    );

    event Tip(
        address indexed userAddress,
        address tippedAddress,
        uint amount
    );
}
