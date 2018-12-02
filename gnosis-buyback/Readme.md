# DutchX Token Buyback Implementation

What is a token buybacks? In traditional finance it relates to share repurchases. Similarly, here a buyback is when a projects (or actually anyone) would like to commit to buying a specific token [let’s call it SpecificToken] to reduce the available number of tokens in the market.

### How it Works

The smart contract has customizable parameters to enable projects to easily perform the token buyback through the DutchX. It allows the specification of the the following parameters:

- ERC20 Token used as sellToken (deposited into the auction)
- ERC20 Token that is bought back (buyToken)
- Specific auction(s) (by index) with amount where the buy back should take place (the amount of auctions is modifiable)
- How much sell funds are committed in which auction index (amounts are modifiable and not necessarily the same amounts through each auction).
- Burn possibility to the receipt token (once it’s claimed and withdrawn) (Optional).
- Burn Address (Optional) address to send burnt tokens to
- Minimum Time interval between executing token buybacks (Optional) 
- Includes a possibilty for any party to trigger sell order and gives ether to the one who pokes to compensate for gas cost spent. (amount of ether tipped also modifiable)

## Install
### Install requirements with npm:
```sh
npm install
```

### Run all tests (requires Node version >=7 for async/await):
```sh
$ npm test
```

## BuyBack Contract
The buyback contract has the folowing operations:

<table>
<tr>
<th>Function</th>
<th>Description</th>
</tr>
<tr>
<td>
<code>
 addBuyBack(                                      
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
  ) 
</code>
</td>
<td>
Add a buyback configuration for a `_userAddress` e.g. 0x1 
You can specify the buytoken e.g. LPT and the sellToken e.g. WETH 
It also allows to set whether the buytoken should be burnt `bool _burn` or not.
 Specify the auction & amount to participate in via the auctionIndexes 
 `uint[] auctionIndexes` and `uint[] auctionAmounts`. e.g To participate
 in the latest auction for LPT token and buy 10 WETH worth, 
 `[0]` and `[10]` for auctionIndex & amount respectively.        
 Time interval enables you to set min time passed before a sell order can  be made. In cases where   
 `_allowExternalPoke` enables non owners of the buyback to invoke the `postSellOrder`
</td>
</tr>
</table>

Function                                          | Description
--------------------------------------------------|-------------------------------------------------------------------------------------
 addBuyBack(                                      | Add a buyback configuration for a `_userAddress` e.g. 0x1 \
        address _userAddress,                     | You can specify the buytoken e.g. LPT and the sellToken e.g. WETH \
        address _buyToken,                        | It also allows to set whether the buytoken should be burnt `bool _burn` \
        address _sellToken,                       | or not.                                                                 \
        address _burnAddress,                     | Specify the auction & amount to participate in via the auctionIndexes   \
        bool _burn,                               | `uint[] auctionIndexes` and `uint[] auctionAmounts`. e.g To participate \
        uint[] _auctionIndexes,                   | in the latest auction for LPT token and buy 10 WETH worth,              \
        uint[] _auctionAmounts,                   | `[0]` and `[10]` for auctionIndex & amount respectively.                \
        uint _timeInterval,                       | Time interval enables you to set min time passed before a sell order can \
        bool _allowExternalPoke,                  | be made. In cases where                                                  \
        uint tipAmount                            | `_allowExternalPoke` enables non owners of the buyback to invoke the `postSellOrder` \
  )                                               | function and execute a buyback. In this case a time interval can be useful. \
                                                  | You can also specify a tip amount to the user that invokes `postSellOrder` if \
                                                  | `_allowExternalPoke` is `True` to cover gas cost.                              \
-------------------------------------------------------|-------------------------------------------------------------------------------------
 depositSellToken(address _userAddress, uint _amount)  | Deposit the amount of the ERC20 sellToken into the buyback contract.
--------------------------------------------------|-------------------------------------------------------------------------------------
 postSellOrder(address _userAddress)             |                                                                                     |
-------------------------------------------------|-------------------------------------------------------------------------------------|
 claim(address _userAddress)                      | Claim the bought tokens from the dutchx auction. It burns the claimed tokens if     |
                                                  | configured                                                                          |
--------------------------------------------------|-------------------------------------------------------------------------------------|
| withdraw(                                        | Withdraw an amount of tokens by providing the `_tokenAddress` & `_userAddress`      |
|        address _userAddress,                     |                                                                                     |
|        address _tokenAddress,                    |                                                                                     |
|        address _toAddress,                       |                                                                                     |
|        uint _amount                              |                                                                                     |
| )                                                |                                                                                     |
|--------------------------------------------------|-------------------------------------------------------------------------------------|
| modifyAuctionAmountMulti(                        | Modify multiple auction amounts                                                     |
|        address _userAddress,                     |                                                                                     |
|        uint[] _auctionIndexes,                   |                                                                                     |
|        uint[] _auctionAmounts                    |                                                                                     |
| )                                                |                                                                                     |
|--------------------------------------------------|-------------------------------------------------------------------------------------|
| modifyAuctionAmount(                             | Modify auction amounts                                                              |
|        address _userAddress,                     |                                                                                     |
|        uint _auctionIndex,                       |                                                                                     |
|        uint _auctionAmount                       |                                                                                     |
| )                                                |                                                                                     |
|--------------------------------------------------|-------------------------------------------------------------------------------------|
| modifyAuctionIndexMulti(                         | Add new auction indexes with their amounts respectively for a                       |
|        address _userAddress,                     | `_userAddress`                                                                      |
|        uint[] _auctionIndexes,                   |                                                                                     |
|        uint[] _auctionAmounts                    |                                                                                     |
| )                                                |                                                                                     |
|--------------------------------------------------|-------------------------------------------------------------------------------------|
| modifyAuctionIndex(                              | Add new auction index with their amounts respectively for a `_userAddress`          |
|        address _userAddress,                     |                                                                                     |
|        uint _auctionIndex,                       |                                                                                     |
|        uint _auctionAmount                       |                                                                                     |
| )                                                |                                                                                     |
| modifySellToken(                                 |                                                                                     |
|        address _userAddress,                     |                                                                                     |
|        address _sellToken                        |                                                                                     |
| )                                                |                                                                                     |
|--------------------------------------------------|-------------------------------------------------------------------------------------|
| modifyBuyToken(                                  | Modify the token that should be bought via the dutchx auction                       |
|        address _userAddress,                     |                                                                                     |
|        address _buyToken                         |                                                                                     |
| )                                                |                                                                                     |
---------------------------------------------------|-------------------------------------------------------------------------------------|
 modifyTimeInterval(                               | Modify the time interval between sell orders.                                       |
        address _userAddress,                      |                                                                                     |
        uint _timeInterval                         |                                                                                     |
 )                                                 |                                                                                     |
|--------------------------------------------------|-------------------------------------------------------------------------------------|
| modifyTip(address _userAddress, uint _amount)    | Modify the amount tipped for a non owner invoking the `postSellOrder` function      |
|--------------------------------------------------|-------------------------------------------------------------------------------------|
| modifyBurn(address _userAddress, bool _burn)     | Modify wether the contract should burn the buytoken from the dutchx auction         |
|--------------------------------------------------|-------------------------------------------------------------------------------------|
| modifyBurnAddress(                               | Modify the address the tokens should be burnt to, default is `0x0`                  |
|        address _userAddress,                     |                                                                                     |
|        address _burnAddress                      |                                                                                     |
| )                                                |                                                                                     |
|--------------------------------------------------|-------------------------------------------------------------------------------------|
| modifyExternalPoke(                              | Set whether an external user is allowed to invoke the `postSellOrder` function      |
        address _userAddress,                      |                                                                                     |
        bool _allowExternalPoke                    |                                                                                     |
 )                                                 |                                                                                     |
|--------------------------------------------------|-------------------------------------------------------------------------------------|
| getAuctionIndexes(address _userAddress)          | Get the auction indexes for a `_userAddress`                                        |
|--------------------------------------------------|-------------------------------------------------------------------------------------|
| getAuctionAmount(                                | Get the auction amount for a `_userAdddress` & `_auctionIndex`                      |
|        address _userAddress,                     |                                                                                     |
|        uint _auctionIndex                        |                                                                                     |
| )                                                |                                                                                     |
|--------------------------------------------------|-------------------------------------------------------------------------------------|
| getBurnAddress(address _userAddress)             | Get the burn address                                                                |
|--------------------------------------------------|-------------------------------------------------------------------------------------|
| getSellTokenBalance(address _userAddress)        | Get the sellToken balance e.g WETH                                                  |
|--------------------------------------------------|-------------------------------------------------------------------------------------|
| getTokenBalance(                                 | Get balance for a `_userAddress` by providing the tokenAddress                      |
|        address _userAddress,                     |                                                                                     |
|        address _tokenAddress                     |                                                                                     |
| )                                                |                                                                                     |
|--------------------------------------------------|-------------------------------------------------------------------------------------|
| getEtherBalance(address _userAddress)            | Get the ether balance for a `_userAddress`                                          |
|--------------------------------------------------|-------------------------------------------------------------------------------------|
| removeAuctionIndex(                              | Delete a auction index from the list of auctions                                    |
        address _userAddress,                      |                                                                                     |
        uint _index                                |                                                                                     |
 )                                                 |                                                                                     |
|--------------------------------------------------|-------------------------------------------------------------------------------------|
| removeAuctionIndexMulti(                         | Remove multiple auction indexes                                                     |
        address _userAddress,                      |                                                                                     |
        uint[] _indexes                            |                                                                                     |
 )                                                 |                                                                                     |
|--------------------------------------------------|-------------------------------------------------------------------------------------|
| removeBuyBack(address _userAddress)              | Remove buyback configuration for a `_userAddress`

### Tutorial
- Deploy the contract

- Add buyback confiugration via the `addBuyBack` function. This allows you specify the auctionIndexes & amounts to participate in auctions. An optional time interval between executing buybacks. For example you can specify add a buyback configuration for a user with address `0x1`, with buy token OST & sell token WETH.
To prevent having to manually specify the lastest auction you can use `0` and then specify the amount of WETH tokens you want to sell, let's say 100. 
Also the contract allows you to specfiy the 

- PostSellOrder

- Claim & Withdraw


### Example Use Case

#### Case 1
A project would take part as the seller in an auction, most commonly WETH (but could be any ERC20 such as DAI). The auction the project would take part with to buy back their SpecificToken would be WETH-SpecificToken (e.g. WETH as sellToken and SpecificToken as the BidToken).
The project would pre-submit a WETH (or other ERC20) as the sellVolume to a smart contract, which executes the buybacks on its own.

The project allows external people to poke the `postSellOrder` function by setting `allowExternalPoke` to `True`.
Albeit 
#### Case 2