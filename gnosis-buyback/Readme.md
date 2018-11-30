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

### Example Use Case



