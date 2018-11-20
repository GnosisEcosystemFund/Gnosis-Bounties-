# DutchX Token Buyback Implementation

What is a token buybacks? In traditional finance it relates to share repurchases. Similarly, here a buyback is when a projects (or actually anyone) would like to commit to buying a specific token [let’s call it SpecificToken] to reduce the available number of tokens in the market.

### How it Works

The smart contract has customizable parameters to enable projects to easily perform the token buyback through the DutchX. It allows the specification of the the following parameters:

        address _userAddress,
        address _buyToken,
        address _sellToken, 
        address _burnAddress, 
        bool _burn, 
        uint[] _auctionIndexes, 
        uint[] _auctionAmounts,
        uint _timeInterval

[-] ERC20 Token used as sellToken (deposited into the auction)
[-] ERC20 Token that is bought back (buyToken)
[-] Specific auction(s) (by index) the buy back should take place (the amount of auctions should be modifiable)
[-] How much sell funds are committed in which auction index (amounts should be modifiable and not necessarily the same amounts through each auction).
[-] Burn possibility to the receipt token (once it’s claimed and withdrawn) (Optional).
[-] Burn Address ( Optional) but highly recommended to include how the smart contract is triggered to perform the needed transaction
[-] Auction Indices & amounts to pariticipate
[-] Minimum Time interval between executing token buybacks (Optional) 
[-] Includes a possibilty for any party to trigger this function (anyone who has an incentive may then do so and will have to spend the gas). Gives Ether to the one who pokes to compensate for gas cost spent.


## Install
### Install requirements with npm:
```sh
npm install
```

### Run all tests (requires Node version >=7 for async/await):
```sh
$ truffle compile
$ truffle test
```

## How it Works

