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
- Includes a possibilty for any party to trigger sell order and gives ether to the one who pokes to compensate for gas cost spent.

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
The buyback contract has the following MAJOR operations:

<table>
<tr>
<th>Function</th>
<th>Description</th>
</tr>
<tr>
<td>
<pre>
<code> 
addBuyBack(
        address _buyToken,
        address _sellToken, 
        address _burnAddress, 
        bool _burn, 
        uint[] memory _auctionIndexes, 
        uint[] memory _auctionAmounts,
        uint _tipAmount,
        uint _expires
)
</code>
</pre>
</td>
<td>
Add a buyback configuration
You can specify the buytoken e.g. LPT and the sellToken e.g. WETH,
it also allows to set whether the buytoken should be burnt `bool _burn` or not.<br />

Specify the auction & amount to participate in via the auctionIndexes <em>uint[] auctionIndexes</em> and <em>uint[] auctionAmounts</em>. e.g To participate
in the latest auction for LPT token and buy 10 WETH worth of LPT token,
<em>[0]</em> and <em>[10]</em> for auctionIndex & amount respectively.
<em>tipAmount</em> allows you to tip some ether to the address that invokes the <em>postSellOrder</em> function.<br />
<em>expires</em> This is time for an unexecuted buyback to expire and the funds released back to the creator. The minimum time is one month.

</td>
</tr>
<tr>
<td>
<pre>
<code>
depositSellToken(uint _amount)
</code>
</pre>
</td>
<td>
Deposit an amount of the ERC20 sellToken into the buyback contract. e.g. WETH
</td>
</tr>
<tr>
<td>
<pre>
<code>
postSellOrder(address _userAddress)
</code>
</pre>
</td>
<td>
Participate in the dutchx auction for using the provided
auction indexes & amounts.
</td>
</tr>
<tr>
<td>
<pre>
<code>
claim(address _userAddress)
</code>
</pre>
</td>
<td>
Claim the buyToken bought in the dutchx auction from the dutchX contract. If the buyback contract
has been configured to burn the buyToken, its burns by sending the claimed buyToken to `0x0` address or a
configured burnAddress.
</td>
</tr>
<tr>
<td>
<pre>
<code>
withdraw(
       address _tokenAddress, 
       address _toAddress, 
       uint _amount 
)
</code>
</pre>
</td>
<td>
Withdraw an amount of tokens e.g. WETH by providing the _tokenAddress, amount and destination address (_toAddress)
</td>
</tr>
<tr>
<td>
<pre>
<code>
withdrawEther(
       address _toAddress, 
       uint _amount 
)
</code>
</pre>
</td>
<td>
Withdraw an ether despist
</td>
</tr>
<tr>
<td>
<pre>
<code>
releaseBuyBackFund(uint _buybackId)
</code>
</pre>
</td>
<td>
Release funds of an expired unexecuted buyback.
</td>
</tr>
</table>


### Tutorial
- Deploy the contract
```bash
$ truffle migrate
```
- Add buyback confiugration via the `addBuyBack` function. This allows you specify the auctionIndexes & amounts to participate in auctions. For example you can specify add a buyback configuration for a user with address `0x1`, with buy token OST & sell token WETH.

```javascript
const Buyback = artifacts.require("Buyback")
const TokenGNO = artifacts.require('TokenGNO') // sample ERC20 Token contracts
const EtherToken = artifacts.require("EtherToken") // sample ERC20 Token contracts

// expiry date in 30 days if not executed
let now = new Date()
now = now.setDate(now.getDate() + 30)

const tx = await buyBack.addBuyBack(
       tokenGNO.address, 
       etherToken.address, 
       BurnAddress,
       true, 
       [ 0, 1 ], 
       [ toWei(1), toWei(1) ], 
       toWei(0.01),
       now,
       {from: InitAccount});     
```

- PostSellOrder

```javascript
const tx = await buyBack.postSellOrder(buybackId, {from: InitAccount});

```

- Claim & Withdraw

```javascript
// claim the buyToken from the dutchX auction
const tx = await buyBack.claim(buybackId, {from: InitAccount})

// withdraw the claimed tokens to an address
const withdraw = await buyBack.withdraw(
       etherToken.address,
       WithdrawalAddress,
       40e18,
       {from: InitAccount})
```

### Example Use Cases

#### Control Available Tokens

A project would take part as the seller in an auction, most commonly WETH (but could be any ERC20 such as DAI). 
The auction the project would take part in is to buy back their SpecificToken would be WETH-SpecificToken (e.g. WETH as sellToken and SpecificToken as the BidToken).
The project would pre-submit a WETH (or other ERC20) as the sellVolume to a smart contract, which executes the buybacks on its own. i.e. via the `depositSellToken` function.

They decide to participate in the latest auction by setting auction index to `[0]` and buy 20 WETH worth of SpecificToken.
The project can decide to withdraw the bought tokens from the buyback contract via the `withdraw` function.

The project is using the buyback contract to control the volume of tokens available on the market

#### Burn Tokens

A project would take part as the seller in an auction, most commonly WETH (but could be any ERC20 such as DAI). 
The auction the project would take part in is to buy back their SpecificToken would be WETH-SpecificToken (e.g. WETH as sellToken and SpecificToken as the BidToken).
The project would pre-submit a WETH (or other ERC20) as the sellVolume to a smart contract, which executes the buybacks on its own. i.e. via the `depositSellToken` function.

This project doesn't allows external people to invoke the `postSellOrder` function by setting `allowExternalPoke` to `False`.

The project sets address `0x111` as the burn address where the buytoken gotten after a successful dutchX auction to be sent.