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


### Steps
- . Deploy the contract
- . Add buyback confiugration via the `addBuyBack` function. This allows you specify the auctionIndexes & amounts to participate in auctions. An optional time interval between executing buybacks. 
    - *_userAddress* This is the address of the user that owns the buyBack config
    - *_buyToken*
    - *_sellToken* 
    - *_burnAddress*
    - *_burn* 
    - *_auctionIndexes*
    - *_auctionAmounts*
    - *_timeInterval*
    - *_allowExternalPoke*
    - *tipAmount*



### Functions

#### addBuyback
```js
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
)
```



### Example Use Case